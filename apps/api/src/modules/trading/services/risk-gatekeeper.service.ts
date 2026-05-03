import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { RiskCheckResult, OrderCommand } from '../events/order.events';
import * as ccxt from 'ccxt';

/**
 * Risk Gatekeeper Service — Pre-Trade Risk Validation
 *
 * Enforces ALL risk rules BEFORE an order reaches the exchange.
 * If ANY check fails, the order is immediately rejected with a clear reason.
 *
 * Checks are executed in order (fail-fast):
 * ┌───────────────────────────────────────────────────────────────────┐
 * │ 1. enforceStopLoss          — Stop-loss is MANDATORY            │
 * │ 2. checkSufficientBalance   — User has enough funds             │
 * │ 3. checkPositionSizeLimit   — Position doesn't exceed max size  │
 * │ 4. checkDailyDrawdownLimit  — Daily losses within allowed range │
 * │ 5. checkCircuitBreakers     — No trading halt on the asset      │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT: Risk parameters are now loaded from the Setting table
 * in the database (synced with admin dashboard) with env var fallbacks.
 * This means admin settings changes are applied in real-time.
 */
@Injectable()
export class RiskGatekeeperService {
  private readonly logger = new Logger(RiskGatekeeperService.name);

  // ── Configurable Risk Parameters (loaded from DB with env fallback) ──
  private maxPositionSizePercent: number;
  private maxOpenPositions: number;
  private maxDailyLossPercent: number;
  private minOrderSizeUSD: number;
  private maxOrderSizeUSD: number;
  private stopLossDefault: number;
  private circuitBreakerThresholdPercent: number;

  // ── Circuit Breaker State (in-memory, per symbol) ──
  // FIX: Added progressive cooldown with exponential backoff.
  // - Base cooldown: 60 seconds (was 15 min fixed — too long for first trigger, too short conceptually)
  // - Each consecutive trigger doubles the cooldown: 60s → 120s → 240s → 480s → 960s → 1800s
  // - Max cooldown: 30 minutes (1,800,000ms)
  // - On cooldown expiry without re-trigger, level resets to 0
  private readonly CB_BASE_COOLDOWN_MS = 60_000; // 60 seconds base cooldown
  private readonly CB_MAX_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes max cooldown
  private readonly circuitBreakerState: Map<string, {
    triggered: boolean;
    until: Date;
    level: number; // Progressive cooldown level
    triggeredAt: Date; // When the circuit breaker was first triggered
    consecutiveTriggers: number; // Number of consecutive triggers
  }> = new Map();

  // ── Last DB sync timestamp ──
  private lastSettingsSync = 0;
  private readonly SETTINGS_SYNC_INTERVAL = 30000; // Re-sync every 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly exchangeService: ExchangeService,
  ) {
    // Initialize with env var defaults — will be overwritten by DB settings
    this.maxPositionSizePercent = parseFloat(
      this.configService.get('RISK_MAX_POSITION_PERCENT', '20'),
    );
    this.maxOpenPositions = parseInt(
      this.configService.get('RISK_MAX_OPEN_POSITIONS', '10'),
      10,
    );
    this.maxDailyLossPercent = parseFloat(
      this.configService.get('RISK_MAX_DAILY_LOSS_PERCENT', '5'),
    );
    this.minOrderSizeUSD = parseFloat(
      this.configService.get('RISK_MIN_ORDER_SIZE', '10'),
    );
    this.maxOrderSizeUSD = parseFloat(
      this.configService.get('RISK_MAX_ORDER_SIZE', '50000'),
    );
    this.stopLossDefault = parseFloat(
      this.configService.get('RISK_STOP_LOSS_DEFAULT', '2'),
    );
    this.circuitBreakerThresholdPercent = parseFloat(
      this.configService.get('RISK_CIRCUIT_BREAKER_THRESHOLD', '10'),
    );

    // Load settings from DB on startup
    this.syncSettingsFromDB();

    this.logger.log('🛡️ Risk Gatekeeper initialized — pre-trade validation active (with DB sync)');
  }

  /**
   * Sync risk parameters from the admin Setting table.
   * This is the bridge that connects admin dashboard changes
   * to the live risk gatekeeper. Called periodically and before each validation.
   */
  private async syncSettingsFromDB(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsSync < this.SETTINGS_SYNC_INTERVAL) {
      return; // Skip if synced recently
    }
    this.lastSettingsSync = now;

    try {
      const settings = await this.prisma.setting.findMany();
      const settingsMap: Record<string, any> = {};
      for (const s of settings) {
        try {
          settingsMap[s.key] = JSON.parse(s.value);
        } catch {
          settingsMap[s.key] = s.value;
        }
      }

      // Apply riskConfig from admin DB
      const riskConfig = settingsMap.riskConfig;
      if (riskConfig) {
        if (riskConfig.maxDrawdown) this.maxDailyLossPercent = parseFloat(riskConfig.maxDrawdown);
        if (riskConfig.maxOpenPositions) this.maxOpenPositions = parseInt(riskConfig.maxOpenPositions, 10);
        if (riskConfig.stopLossDefault) this.stopLossDefault = parseFloat(riskConfig.stopLossDefault);
        if (riskConfig.leverageLimit) this.circuitBreakerThresholdPercent = parseFloat(riskConfig.leverageLimit);
      }

      // Apply botConfig from admin DB
      const botConfig = settingsMap.botConfig;
      if (botConfig) {
        if (botConfig.maxPositionSize) this.maxOrderSizeUSD = parseFloat(botConfig.maxPositionSize);
      }

      this.logger.debug('🛡️ Risk parameters synced from DB');
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to sync settings from DB: ${error.message} — using env defaults`);
    }
  }

  /**
   * Run ALL risk checks for an order command
   * Returns the result of the FIRST failed check, or success if all pass
   */
  async validateOrder(command: OrderCommand): Promise<RiskCheckResult> {
    // Sync settings from DB before each validation (rate-limited internally)
    await this.syncSettingsFromDB();

    this.logger.debug(
      `🛡️ Validating order: ${command.side} ${command.quantity} ${command.symbol} (key: ${command.idempotencyKey})`,
    );

    // Check 1: Stop-loss enforcement (MANDATORY)
    const slCheck = this.enforceStopLoss(command);
    if (!slCheck.allowed) return slCheck;

    // Check 2: Sufficient balance
    const balanceCheck = await this.checkSufficientBalance(command);
    if (!balanceCheck.allowed) return balanceCheck;

    // Check 3: Position size limit
    const sizeCheck = await this.checkPositionSizeLimit(command);
    if (!sizeCheck.allowed) return sizeCheck;

    // Check 4: Daily drawdown limit
    const drawdownCheck = await this.checkDailyDrawdownLimit(command.userId);
    if (!drawdownCheck.allowed) return drawdownCheck;

    // Check 5: Circuit breakers
    const circuitCheck = await this.checkCircuitBreakers(command.symbol);
    if (!circuitCheck.allowed) return circuitCheck;

    // All checks passed — calculate risk score
    const riskScore = await this._calculateRiskScore(command);

    this.logger.debug(
      `🛡️ Order validated: ${command.symbol} (risk score: ${riskScore})`,
    );

    return {
      allowed: true,
      riskScore,
    };
  }

  /**
   * CHECK 1: Enforce Stop-Loss — MANDATORY
   *
   * Every order MUST have a stop-loss. No exceptions.
   * This is the #1 safety rule of the Roua platform.
   */
  enforceStopLoss(command: OrderCommand): RiskCheckResult {
    if (!command.stopLoss || command.stopLoss <= 0) {
      this.logger.warn(`🛡️ ORDER REJECTED: No stop-loss for ${command.symbol}`);

      return {
        allowed: false,
        reason: 'وقف الخسارة إجباري. لا يمكن تقديم أمر بدون وقف خسارة — هذا القانون الأول في منصة رؤى.',
        failedCheck: 'STOPLOSS_ENFORCEMENT',
      };
    }

    // Validate stop-loss direction
    if (command.side === 'BUY' && command.stopLoss >= (command.price || 0)) {
      return {
        allowed: false,
        reason: 'وقف الخسارة لأمر الشراء يجب أن يكون أقل من سعر الدخول.',
        failedCheck: 'STOPLOGIC_ENFORCEMENT',
      };
    }

    if (command.side === 'SELL' && command.stopLoss <= (command.price || 0) && command.price) {
      return {
        allowed: false,
        reason: 'وقف الخسارة لأمر البيع يجب أن يكون أعلى من سعر الدخول.',
        failedCheck: 'STOPLOGIC_ENFORCEMENT',
      };
    }

    return { allowed: true };
  }

  /**
   * CHECK 2: Sufficient Balance
   *
   * Verifies that the user has enough funds on the linked exchange
   * to execute the order. Uses the exchange adapter to fetch real balance.
   */
  async checkSufficientBalance(command: OrderCommand): Promise<RiskCheckResult> {
    try {
      // Fetch the credential
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: command.exchangeCredentialId },
      });

      if (!credential) {
        return {
          allowed: false,
          reason: 'بيانات الاعتماد غير موجودة.',
          failedCheck: 'BALANCE_CHECK',
        };
      }

      if (!credential.isValid) {
        return {
          allowed: false,
          reason: 'بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API.',
          failedCheck: 'BALANCE_CHECK',
        };
      }

      // Check permissions
      const permissions = JSON.parse(credential.permissions || '["read"]');
      if (!permissions.includes('trade')) {
        return {
          allowed: false,
          reason: 'مفتاح API لا يملك صلاحية التداول — أضف مفتاحاً بصلاحية trade.',
          failedCheck: 'BALANCE_CHECK',
        };
      }

      // Try to get current price for order value estimation
      let currentPrice = command.price;
      if (!currentPrice) {
        try {
          const quote = await this.exchangeService.getQuote(command.symbol);
          currentPrice = quote.price;
        } catch {
          // FAIL-CLOSED: Cannot verify balance without price — reject to protect capital
          this.logger.error(`Cannot fetch price for ${command.symbol} — rejecting order to protect capital`);
          return {
            allowed: false,
            reason: 'لا يمكن التحقق من سعر الصفقة — تم رفض الطلب لحماية رأس المال.',
            failedCheck: 'BALANCE_CHECK',
          };
        }
      }

      const orderValue = command.quantity * (currentPrice || 0);

      // Minimum order size check
      if (orderValue < this.minOrderSizeUSD) {
        return {
          allowed: false,
          reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) أقل من الحد الأدنى (${this.minOrderSizeUSD} USD).`,
          failedCheck: 'BALANCE_CHECK',
        };
      }

      // Maximum order size check
      if (orderValue > this.maxOrderSizeUSD) {
        return {
          allowed: false,
          reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) تتجاوز الحد الأقصى (${this.maxOrderSizeUSD} USD).`,
          failedCheck: 'BALANCE_CHECK',
        };
      }

      // Try to verify actual balance via CCXT
      try {
        const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id);
        const ExchangeClass = (ccxt as any)[credential.exchange];
        if (ExchangeClass) {
          const exchange = new ExchangeClass({
            apiKey,
            secret: apiSecret,
            enableRateLimit: true,
          });

          const balance = await exchange.fetchBalance();
          const quoteCurrency = command.symbol.split('/').pop() || 'USDT';
          const availableBalance = balance[quoteCurrency]?.free || 0;

          if (command.side === 'BUY' && availableBalance < orderValue) {
            return {
              allowed: false,
              reason: `رصيد غير كافي. المتاح: ${availableBalance.toFixed(2)} ${quoteCurrency}، المطلوب: ${orderValue.toFixed(2)} ${quoteCurrency}.`,
              failedCheck: 'BALANCE_CHECK',
            };
          }
        } else {
          // FAIL-CLOSED: Exchange not supported in CCXT — cannot verify balance
          this.logger.error(`Exchange "${credential.exchange}" not found in CCXT — rejecting order to protect capital`);
          return {
            allowed: false,
            reason: `لا يمكن التحقق من الرصيد للبورصة "${credential.exchange}" — تم رفض الطلب لحماية رأس المال.`,
            failedCheck: 'BALANCE_CHECK',
          };
        }
      } catch (error: any) {
        // FAIL-CLOSED: Balance verification failed — reject to protect capital
        this.logger.error(`Balance verification failed for ${command.symbol}: ${error.message} — rejecting order`);
        return {
          allowed: false,
          reason: 'فشل التحقق من الرصيد — تم رفض الطلب لحماية رأس المال.',
          failedCheck: 'BALANCE_CHECK',
        };
      }

      return { allowed: true };
    } catch (error: any) {
      // FAIL-CLOSED: Any unexpected error — reject to protect capital
      this.logger.error(`Balance check error: ${error.message} — rejecting order`);
      return {
        allowed: false,
        reason: 'فشل فحص الرصيد — تم رفض الطلب لحماية رأس المال.',
        failedCheck: 'BALANCE_CHECK',
      };
    }
  }

  /**
   * CHECK 3: Position Size Limit
   *
   * Ensures that the position size doesn't exceed the maximum
   * allowed percentage of the user's total portfolio.
   */
  async checkPositionSizeLimit(command: OrderCommand): Promise<RiskCheckResult> {
    try {
      // Count open positions
      const openPositions = await this.prisma.position.count({
        where: { userId: command.userId, status: 'OPEN' },
      });

      if (openPositions >= this.maxOpenPositions) {
        return {
          allowed: false,
          reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions}). أغلق بعض المراكز أولاً.`,
          failedCheck: 'POSITION_SIZE_LIMIT',
        };
      }

      // Check position size as % of portfolio
      let currentPrice = command.price;
      if (!currentPrice) {
        try {
          const quote = await this.exchangeService.getQuote(command.symbol);
          currentPrice = quote.price;
        } catch {
          return { allowed: false, reason: 'Price unavailable — cannot verify position size limit', failedCheck: 'POSITION_SIZE_LIMIT' };
        }
      }

      const orderValue = command.quantity * (currentPrice || 0);
      const portfolioValue = await this._estimatePortfolioValue(command.userId);

      if (portfolioValue > 0) {
        const positionPercent = (orderValue / portfolioValue) * 100;
        if (positionPercent > this.maxPositionSizePercent) {
          return {
            allowed: false,
            reason: `حجم المركز (${positionPercent.toFixed(1)}% من المحفظة) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%). قلل الكمية.`,
            failedCheck: 'POSITION_SIZE_LIMIT',
          };
        }
      }

      return { allowed: true };
    } catch (error: any) {
      this.logger.error(`Position size check error: ${error.message}`);
      return { allowed: false, reason: 'Cannot verify position size limit', failedCheck: 'POSITION_SIZE_LIMIT' };
    }
  }

  /**
   * CHECK 4: Daily Drawdown Limit
   *
   * Ensures that the cumulative daily losses don't exceed
   * the maximum allowed percentage of the portfolio.
   * This prevents revenge trading and catastrophic losses.
   */
  async checkDailyDrawdownLimit(userId: string): Promise<RiskCheckResult> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Calculate today's realized losses from closed trades
      const todayTrades = await this.prisma.trade.findMany({
        where: {
          userId,
          executedAt: { gte: todayStart },
          type: { in: ['EXIT', 'PARTIAL_EXIT'] },
        },
      });

      const dailyPnL = todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);

      if (dailyPnL < 0) {
        const portfolioValue = await this._estimatePortfolioValue(userId);
        if (portfolioValue > 0) {
          const lossPercent = (Math.abs(dailyPnL) / portfolioValue) * 100;
          if (lossPercent >= this.maxDailyLossPercent) {
            return {
              allowed: false,
              reason: `خسائرك اليومية (${lossPercent.toFixed(1)}%) تجاوزت الحد الأقصى (${this.maxDailyLossPercent}%). توقف عن التداول ليومك — حماية رأس المال أولوية.`,
              failedCheck: 'DAILY_DRAWDOWN',
            };
          }
        }
      }

      return { allowed: true };
    } catch (error: any) {
      this.logger.error(`Daily drawdown check error: ${error.message}`);
      return { allowed: false, reason: 'Cannot verify daily drawdown limit', failedCheck: 'DAILY_DRAWDOWN' };
    }
  }

  /**
   * CHECK 5: Circuit Breakers
   *
   * Checks if there's a trading halt on the asset due to extreme volatility.
   * When an asset moves more than the threshold in a short period,
   * trading is temporarily suspended for that symbol.
   */
  async checkCircuitBreakers(symbol: string): Promise<RiskCheckResult> {
    // Check in-memory circuit breaker state
    const state = this.circuitBreakerState.get(symbol);
    if (state && state.triggered && state.until > new Date()) {
      const remainingMs = state.until.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      const remainingSec = Math.ceil(remainingMs / 1000);

      // FIX: Show more precise time (seconds when < 1 minute, minutes otherwise)
      const timeStr = remainingMs < 60000
        ? `${remainingSec} ثانية`
        : `${remainingMin} دقيقة`;

      return {
        allowed: false,
        reason: `تداول ${symbol} متوقف مؤقتاً بسبب تقلب شديد (مستوى ${state.level}). يُستأنف بعد ${timeStr}.`,
        failedCheck: 'CIRCUIT_BREAKER',
      };
    }

    // FIX: If cooldown has expired, check if we should reset the level
    // If the market has calmed down (below threshold), reset the progressive level
    if (state && state.triggered && state.until <= new Date()) {
      // Cooldown expired — check if the extreme volatility has subsided
      try {
        const quote = await this.exchangeService.getQuote(symbol);
        if (quote && Math.abs(quote.changePercent) <= this.circuitBreakerThresholdPercent) {
          // Market has calmed — reset the circuit breaker completely
          this.circuitBreakerState.delete(symbol);
          this.logger.log(`🟢 Circuit breaker RESET for ${symbol} — volatility subsided (${quote.changePercent.toFixed(1)}%)`);
        } else {
          // Still volatile — extend cooldown with next exponential level
          const newLevel = state.level + 1;
          const cooldownMs = Math.min(
            this.CB_BASE_COOLDOWN_MS * Math.pow(2, newLevel - 1),
            this.CB_MAX_COOLDOWN_MS,
          );
          const newUntil = new Date(Date.now() + cooldownMs);

          this.circuitBreakerState.set(symbol, {
            triggered: true,
            until: newUntil,
            level: newLevel,
            triggeredAt: state.triggeredAt,
            consecutiveTriggers: state.consecutiveTriggers + 1,
          });

          this.logger.warn(
            `🔴 Circuit breaker RE-TRIGGERED for ${symbol}: still volatile (${quote?.changePercent?.toFixed(1)}%) — level ${newLevel}, cooldown ${Math.round(cooldownMs / 1000)}s`,
          );

          return {
            allowed: false,
            reason: `تقلب شديد مستمر في ${symbol} (مستوى ${newLevel}). التداول متوقف لمدة ${Math.round(cooldownMs / 60000)} دقيقة حمايةً لك.`,
            failedCheck: 'CIRCUIT_BREAKER',
          };
        }
      } catch {
        // Can't verify — reset cautiously (allow trading)
        this.circuitBreakerState.delete(symbol);
      }
    }

    // Try to detect extreme volatility from live data
    try {
      const quote = await this.exchangeService.getQuote(symbol);
      if (quote && Math.abs(quote.changePercent) > this.circuitBreakerThresholdPercent) {
        // FIX: Progressive cooldown with exponential backoff
        // Determine level: check if there's a recent expired state to build upon
        const previousState = this.circuitBreakerState.get(symbol);
        const level = previousState ? previousState.level + 1 : 1;
        const consecutiveTriggers = previousState ? previousState.consecutiveTriggers + 1 : 1;

        const cooldownMs = Math.min(
          this.CB_BASE_COOLDOWN_MS * Math.pow(2, level - 1),
          this.CB_MAX_COOLDOWN_MS,
        );
        const until = new Date(Date.now() + cooldownMs);

        this.circuitBreakerState.set(symbol, {
          triggered: true,
          until,
          level,
          triggeredAt: new Date(),
          consecutiveTriggers,
        });

        const cooldownSec = Math.round(cooldownMs / 1000);
        const cooldownMin = Math.round(cooldownMs / 60000);
        const cooldownStr = cooldownMs < 60000
          ? `${cooldownSec} ثانية`
          : `${cooldownMin} دقيقة`;

        this.logger.warn(
          `🔴 Circuit breaker triggered for ${symbol}: ${quote.changePercent.toFixed(1)}% move (level ${level}, cooldown ${cooldownSec}s)`,
        );

        return {
          allowed: false,
          reason: `تقلب شديد في ${symbol} (${quote.changePercent.toFixed(1)}%). التداول متوقف مؤقتاً لمدة ${cooldownStr} حمايةً لك (مستوى ${level}).`,
          failedCheck: 'CIRCUIT_BREAKER',
        };
      }
    } catch {
      // Can't check — allow
    }

    return { allowed: true };
  }

  /**
   * Get current risk parameters for display
   */
  getRiskParameters() {
    return {
      maxPositionSizePercent: this.maxPositionSizePercent,
      maxOpenPositions: this.maxOpenPositions,
      maxDailyLossPercent: this.maxDailyLossPercent,
      minOrderSizeUSD: this.minOrderSizeUSD,
      maxOrderSizeUSD: this.maxOrderSizeUSD,
      stopLossDefault: this.stopLossDefault,
      circuitBreakerThresholdPercent: this.circuitBreakerThresholdPercent,
    };
  }

  // ── Private Helpers ──

  private async _estimatePortfolioValue(userId: string): Promise<number> {
    const portfolios = await this.prisma.portfolio.aggregate({
      where: { userId },
      _sum: { totalValue: true },
    });

    const manualValue = Number(portfolios._sum.totalValue || 0);

    const openPositions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
    });

    const positionsValue = openPositions.reduce((sum, p) => {
      return sum + Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice));
    }, 0);

    return manualValue + positionsValue;
  }

  private async _calculateRiskScore(command: OrderCommand): Promise<number> {
    let score = 0;

    const portfolioValue = await this._estimatePortfolioValue(command.userId);
    let currentPrice = command.price || 0;
    if (!currentPrice) {
      try {
        const quote = await this.exchangeService.getQuote(command.symbol);
        currentPrice = quote.price;
      } catch {
        // ignore
      }
    }

    const orderValue = command.quantity * (currentPrice || 0);

    // Position size contribution (0-30)
    if (portfolioValue > 0) {
      score += Math.min(30, (orderValue / portfolioValue) * 100 * 1.5);
    }

    // Open positions contribution (0-30)
    const openPositions = await this.prisma.position.count({
      where: { userId: command.userId, status: 'OPEN' },
    });
    score += Math.min(30, openPositions * 3);

    // Daily loss contribution (0-40)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTrades = await this.prisma.trade.findMany({
      where: {
        userId: command.userId,
        executedAt: { gte: todayStart },
        type: { in: ['EXIT', 'PARTIAL_EXIT'] },
      },
    });
    const dailyPnL = todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    if (dailyPnL < 0 && portfolioValue > 0) {
      score += Math.min(40, (Math.abs(dailyPnL) / portfolioValue) * 100 * 8);
    }

    return Math.min(100, Math.round(score));
  }
}
