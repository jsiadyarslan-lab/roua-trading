import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  getSymbolMetadata,
  calculatePositionSizeFromRisk,
  lotsToUnits,
  unitsToLots,
  roundLotSize,
  calculateMargin,
  calculateNotionalValue,
  AssetClass,
} from './services/symbol-metadata';

/**
 * Risk Manager Service — Position Sizing and Risk Controls
 * 
 * Features:
 * - Maximum position size limits (percentage of portfolio)
 * - Maximum number of open positions per user
 * - Maximum daily loss limits
 * - Position size calculation based on risk percentage
 * - Stop-loss enforcement
 *
 * IMPORTANT: Risk parameters are now loaded from the Setting table
 * in the database (synced with admin dashboard) with env var fallbacks.
 * This means admin settings changes are applied in real-time.
 */
@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);

  // ── Risk Parameters (loaded from DB with env fallback) ──
  private maxPositionSizePercent: number;  // Max % of portfolio per position
  private maxOpenPositions: number;         // Max concurrent open positions
  private maxDailyLossPercent: number;      // Max daily loss as % of portfolio
  private defaultStopLossPercent: number;   // Default SL distance
  private defaultTakeProfitPercent: number; // Default TP distance
  private minOrderSize: number;             // Minimum order size in USD

  // ── Last DB sync timestamp ──
  private lastSettingsSync = 0;
  private readonly SETTINGS_SYNC_INTERVAL = 30000; // 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
    this.defaultStopLossPercent = parseFloat(
      this.configService.get('RISK_DEFAULT_STOP_LOSS', '3'),
    );
    this.defaultTakeProfitPercent = parseFloat(
      this.configService.get('RISK_DEFAULT_TAKE_PROFIT', '6'),
    );
    this.minOrderSize = parseFloat(
      this.configService.get('RISK_MIN_ORDER_SIZE', '10'),
    );

    // Load settings from DB on startup
    // FIX: Added .catch() to prevent unhandled promise rejection from constructor
    this.syncSettingsFromDB().catch((err) => this.logger.warn(`syncSettingsFromDB failed at startup: ${err?.message || err}`));

    this.logger.log('🛡️ Risk Manager initialized — protecting your capital (with DB sync)');
  }

  /**
   * Sync risk parameters from the admin Setting table.
   * This is the bridge that connects admin dashboard changes
   * to the live risk manager.
   */
  private async syncSettingsFromDB(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsSync < this.SETTINGS_SYNC_INTERVAL) {
      return; // Skip if synced recently
    }
    this.lastSettingsSync = now;

    // SUSTAINABLE FIX: Skip if DB not available to avoid leaking connection pools
    if (!this.prisma?.isAvailable?.()) {
      return; // Will retry on next sync interval
    }

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
        if (riskConfig.maxOpenPositions) {
          let val = parseInt(riskConfig.maxOpenPositions, 10);
          // V144: Auto-migrate stale riskConfig.maxOpenPositions (same fix as RiskGatekeeper)
          if (val <= 5) {
            val = parseInt(this.configService.get('RISK_MAX_OPEN_POSITIONS', '20'), 10);
            this.logger.warn(`🛡️ V144: Auto-upgrading RiskManager.maxOpenPositions from ${riskConfig.maxOpenPositions} to ${val} (stale old default)`);
            this.prisma.setting.upsert({
              where: { key: 'riskConfig' },
              update: { value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(val) }) },
              create: { key: 'riskConfig', value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(val) }) },
            }).catch(() => {});
          }
          this.maxOpenPositions = val;
        }
        if (riskConfig.stopLossDefault) this.defaultStopLossPercent = parseFloat(riskConfig.stopLossDefault);
        if (riskConfig.takeProfitDefault) this.defaultTakeProfitPercent = parseFloat(riskConfig.takeProfitDefault);
        if (riskConfig.riskPerTrade) this.maxPositionSizePercent = parseFloat(riskConfig.riskPerTrade) * 5; // Scale risk per trade to position size

      }

      this.logger.debug('🛡️ Risk parameters synced from DB');
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to sync settings from DB: ${error.message} — using env defaults`);
    }
  }

  /**
   * Check if an order is allowed based on risk rules
   *
   * FIX: Added optional `exchangeName` parameter for paper-trading detection.
   * Previously, this method had NO paper-trading bypass — unlike RiskGatekeeperService
   * which was already fixed. This caused ALL paper-trading orders to be rejected with
   * "حجم المركز (100.0%) يتجاوز الحد الأقصى (5%)" because:
   * 1. _estimatePortfolioValue() returned 0 or only open position value for paper users
   * 2. Portfolio table is empty for paper-trading users → manualValue = 0
   * 3. With only 1 open position worth $5000, and a new order for $5000,
   *    positionPercent = 5000/5000 * 100 = 100.0%
   * 4. maxPositionSizePercent = 5% (from riskConfig.riskPerTrade * 5)
   *
   * The order flow was: SmartExecutor → OrderDispatcher → RiskGatekeeper (PASSED) →
   * TradingService.placeOrder() → RiskManager.checkOrderRisk() (REJECTED!)
   * RiskGatekeeper bypassed paper-trading, but RiskManager didn't.
   */
  async checkOrderRisk(
    userId: string,
    symbol: string,
    side: string,
    quantity: number,
    price: number,
    exchangeName?: string,
    exchangeCredentialId?: string,  // V124: Added for testnet detection
  ): Promise<{ allowed: boolean; reason?: string; riskScore?: number }> {
    // Sync settings from DB before each check (rate-limited internally)
    await this.syncSettingsFromDB();

    // ── V124: Simulated Trading Detection (Paper + Testnet) ──
    // FIX: Determine if this is a simulated order (paper OR testnet).
    // If so, skip position size percentage and daily loss limit checks —
    // only enforce position count. Both paper and testnet use virtual funds;
    // blocking them for "position too large" or "daily drawdown" defeats the
    // purpose and was the root cause of ALL trades being rejected.
    //
    // V124 FIX: Previously only checked _isTestExchange(exchangeName), which
    // MISSED Binance Testnet credentials stored as exchange='binance' with testnet=true.
    // Now also checks the credential's testnet flag.
    let isSimulated = this._isTestExchange(exchangeName || '');

    // V124: Also check if the credential has testnet=true flag
    if (!isSimulated && exchangeCredentialId) {
      try {
        const cred = await this.prisma.exchangeCredential.findUnique({
          where: { id: exchangeCredentialId },
          select: { testnet: true, exchange: true },
        });
        if (cred && cred.testnet === true) {
          isSimulated = true;
          this.logger.debug(`🛡️ RiskManager: Testnet credential detected (${cred.exchange}, testnet=true) — treating as simulated`);
        }
      } catch { /* non-critical */ }
    }

    // If exchange name wasn't provided, check user's credentials
    if (!isSimulated) {
      // V124: Also exclude testnet credentials from "real" check
      const realCredential = await this.prisma.exchangeCredential.findFirst({
        where: { userId, isValid: true, exchange: { not: 'paper-trading' }, testnet: { not: true } },
      });
      const hasOnlySimulatedCredentials = !realCredential;
      if (hasOnlySimulatedCredentials) {
        // User only has simulated credentials (paper/testnet) — treat as simulated
        this.logger.debug(`🛡️ RiskManager: User ${userId} has only simulated credentials — bypassing value limits`);
      }
      if (hasOnlySimulatedCredentials) {
        // V180 FIX: Simulated trading must ALSO check position size %.
        // Previously bypassed completely → positions of 86% of portfolio.
        const openPositions = await this.prisma.position.count({
          where: { userId, status: 'OPEN' },
        });
        if (openPositions >= this.maxOpenPositions) {
          return {
            allowed: false,
            reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions})`,
          };
        }
        // V180+FIX: Position size % check for simulated-only users.
        // NO guard condition — must ALWAYS check. If portfolioValue is unknown,
        // use default $10,000 to prevent unbounded positions.
        const simPortfolioValue = await this._estimatePortfolioValue(userId, true) || 10000;
        const simOrderValue = (quantity || 0) * (price || 0);
        if (simOrderValue > 0) {
          const simPositionPercent = (simOrderValue / simPortfolioValue) * 100;
          if (simPositionPercent > this.maxPositionSizePercent) {
            return {
              allowed: false,
              reason: `حجم المركز (${simPositionPercent.toFixed(1)}% من المحفظة) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%)`,
            };
          }
        }
        return { allowed: true, riskScore: 10 };
      }
    }

    if (isSimulated) {
      // V180 FIX: Paper trading must ALSO check position size %.
      // Previously bypassed completely → positions of 86% of portfolio.
      const openPositions = await this.prisma.position.count({
        where: { userId, status: 'OPEN' },
      });
      if (openPositions >= this.maxOpenPositions) {
        return {
          allowed: false,
          reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions})`,
        };
      }
      // V180+FIX: Position size % check for paper trading.
      // NO guard condition — must ALWAYS check. If portfolioValue is unknown,
      // use default $10,000 to prevent unbounded positions.
      const paperPortfolioValue = await this._estimatePortfolioValue(userId, true) || 10000;
      const paperOrderValue = (quantity || 0) * (price || 0);
      if (paperOrderValue > 0) {
        const paperPositionPercent = (paperOrderValue / paperPortfolioValue) * 100;
        if (paperPositionPercent > this.maxPositionSizePercent) {
          return {
            allowed: false,
            reason: `حجم المركز (${paperPositionPercent.toFixed(1)}% من المحفظة) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%) حتى في التداول الورقي`,
          };
        }
      }
      this.logger.debug(`🛡️ Paper trading order ALLOWED by RiskManager (position count: ${openPositions}/${this.maxOpenPositions}, size check: passed)`);
      return { allowed: true, riskScore: 10 };
    }

    // Check 1: Minimum order size
    const orderValue = quantity * price;
    if (orderValue < this.minOrderSize) {
      return {
        allowed: false,
        reason: `حجم الطلب (${orderValue.toFixed(2)} USD) أقل من الحد الأدنى (${this.minOrderSize} USD)`,
      };
    }

    // Check 2: Maximum open positions
    const openPositions = await this.prisma.position.count({
      where: { userId, status: 'OPEN' },
    });
    if (openPositions >= this.maxOpenPositions) {
      return {
        allowed: false,
        reason: `لديك ${openPositions} مركز مفتوح بالفعل (الحد الأقصى: ${this.maxOpenPositions})`,
      };
    }

    // Check 3: Maximum position size as % of portfolio
    // FIX: Use _estimatePortfolioValue with paper-trading awareness.
    // For paper users, use AgentSettings.paperBalance (default $10,000) instead
    // of summing Portfolio table (which is empty for paper users).
    const portfolioValue = await this._estimatePortfolioValue(userId, false);
    if (portfolioValue > 0) {
      const positionPercent = (orderValue / portfolioValue) * 100;
      if (positionPercent > this.maxPositionSizePercent) {
        return {
          allowed: false,
          reason: `حجم المركز (${positionPercent.toFixed(1)}%) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%)`,
        };
      }
    }

    // Check 4: Daily loss limit
    const dailyLoss = await this._calculateDailyLoss(userId);
    if (portfolioValue > 0 && dailyLoss < 0) {
      const lossPercent = (Math.abs(dailyLoss) / portfolioValue) * 100;
      if (lossPercent >= this.maxDailyLossPercent) {
        return {
          allowed: false,
          reason: `خسائرك اليومية (${lossPercent.toFixed(1)}%) تجاوزت الحد الأقصى (${this.maxDailyLossPercent}%)`,
        };
      }
    }

    // Calculate risk score (0-100)
    const riskScore = this._calculateRiskScore(
      orderValue,
      portfolioValue,
      openPositions,
      dailyLoss,
    );

    return { allowed: true, riskScore };
  }

  /**
   * Calculate recommended position size based on risk percentage
   * Uses the 1% risk rule: never risk more than 1% of portfolio per trade
   *
   * V146: Now uses symbol-metadata for proper lot sizing.
   * Returns quantity in RAW UNITS (not lots) for backward compatibility,
   * plus additional lot and margin info.
   */
  calculatePositionSize(
    portfolioValue: number,
    entryPrice: number,
    stopLossPrice: number,
    riskPercent: number = 1,
    symbol?: string,
  ): { quantity: number; riskAmount: number; lots?: number; margin?: number; notional?: number } {
    const riskAmount = portfolioValue * (riskPercent / 100);
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice);

    if (riskPerUnit <= 0) {
      return { quantity: 0, riskAmount: 0 };
    }

    // V146: Use symbol-aware calculation when symbol is provided
    if (symbol) {
      const meta = getSymbolMetadata(symbol);
      const result = calculatePositionSizeFromRisk(riskAmount, entryPrice, stopLossPrice, symbol);

      // Cap to maxPositionSizePercent of portfolio
      const maxPositionValue = portfolioValue * (this.maxPositionSizePercent / 100);
      let quantityUnits = result.quantityUnits;
      let quantityLots = result.quantityLots;

      if (result.notional > maxPositionValue) {
        // Reduce to fit within max position size limit
        quantityUnits = maxPositionValue / entryPrice;
        // Re-convert to lots
        quantityLots = roundLotSize(unitsToLots(quantityUnits, symbol), symbol);
        quantityUnits = lotsToUnits(quantityLots, symbol);
      }

      this.logger.debug(
        `📊 Position sizing for ${symbol}: lots=${quantityLots}, units=${quantityUnits.toFixed(2)}, ` +
        `margin=$${calculateMargin(quantityUnits, entryPrice, symbol).toFixed(2)}, ` +
        `notional=$${calculateNotionalValue(quantityUnits, entryPrice).toFixed(2)}, ` +
        `risk=$${(Math.abs(entryPrice - stopLossPrice) * quantityUnits).toFixed(2)}`
      );

      return {
        quantity: Math.floor(quantityUnits * 1000000) / 1000000,
        riskAmount,
        lots: quantityLots,
        margin: calculateMargin(quantityUnits, entryPrice, symbol),
        notional: calculateNotionalValue(quantityUnits, entryPrice),
      };
    }

    // Legacy path: no symbol provided — use raw unit calculation
    const quantity = riskAmount / riskPerUnit;
    return { quantity: Math.floor(quantity * 1000000) / 1000000, riskAmount };
  }

  /**
   * Get default stop-loss and take-profit levels
   */
  getDefaultLevels(
    entryPrice: number,
    side: 'BUY' | 'SELL',
  ): { stopLoss: number; takeProfit: number } {
    if (side === 'BUY') {
      return {
        stopLoss: entryPrice * (1 - this.defaultStopLossPercent / 100),
        takeProfit: entryPrice * (1 + this.defaultTakeProfitPercent / 100),
      };
    } else {
      return {
        stopLoss: entryPrice * (1 + this.defaultStopLossPercent / 100),
        takeProfit: entryPrice * (1 - this.defaultTakeProfitPercent / 100),
      };
    }
  }

  /**
   * Get current risk parameters for display
   */
  getRiskParameters() {
    return {
      maxPositionSizePercent: this.maxPositionSizePercent,
      maxOpenPositions: this.maxOpenPositions,
      maxDailyLossPercent: this.maxDailyLossPercent,
      defaultStopLossPercent: this.defaultStopLossPercent,
      defaultTakeProfitPercent: this.defaultTakeProfitPercent,
      minOrderSize: this.minOrderSize,
    };
  }

  // ── Private Methods ──

  /**
   * Estimate portfolio value for a user.
   *
   * FIX: For paper-trading users, the Portfolio table is typically empty
   * (no real funds to track), so manualValue = 0. If the user has 1 open
   * position worth $5000, portfolioValue = $5000, and a new order for $5000
   * gives positionPercent = 100%. This was the root cause of ALL orders being
   * rejected with "حجم المركز (100.0%) يتجاوز الحد الأقصى (5%)".
   *
   * Now: for paper users (isPaperTrading=true), use AgentSettings.paperBalance
   * (default $10,000) as the portfolio base, giving realistic position sizing.
   * For real users, use the existing Portfolio + positions calculation.
   */
  private async _estimatePortfolioValue(userId: string, isPaperTrading = false): Promise<number> {
    // ── Paper Trading: Use AgentSettings.paperBalance ──
    if (isPaperTrading) {
      try {
        const agentSettings = await this.prisma.agentSettings.findUnique({
          where: { userId },
        });
        const paperBalance = agentSettings?.paperBalance?.toNumber() ?? 10000;
        this.logger.debug(`🛡️ Paper trading portfolio value: $${paperBalance} (from AgentSettings)`);
        return paperBalance;
      } catch {
        this.logger.debug(`🛡️ Paper trading portfolio value: $10000 (default)`);
        return 10000;
      }
    }

    // ── Real Trading: Portfolio table + open positions ──
    // Sum up all portfolio values for the user
    const portfolios = await this.prisma.portfolio.aggregate({
      where: { userId },
      _sum: { totalValue: true },
    });

    const manualValue = Number(portfolios._sum.totalValue || 0);

    // Also add current value of open positions
    const openPositions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
    });

    const positionsValue = openPositions.reduce((sum, p) => {
      return sum + Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice));
    }, 0);

    return manualValue + positionsValue;
  }

  /**
   * Determine if an exchange name represents a test/demo/paper environment.
   * Matches the same logic as RiskGatekeeperService._isTestExchange().
   */
  private _isTestExchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    const exactMatches = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation', 'mt5_demo'];
    if (exactMatches.includes(lower)) return true;
    const suffixPatterns = ['_test', '_paper', '_demo', '_sandbox', '_simulation', '-test', '-paper'];
    if (suffixPatterns.some(s => lower.endsWith(s))) return true;
    if (lower.includes('testnet')) return true;
    return false;
  }

  private async _calculateDailyLoss(userId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTrades = await this.prisma.trade.findMany({
      where: {
        userId,
        executedAt: { gte: todayStart },
        type: { in: ['EXIT', 'PARTIAL_EXIT'] },
      },
    });

    return todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  }

  private _calculateRiskScore(
    orderValue: number,
    portfolioValue: number,
    openPositions: number,
    dailyLoss: number,
  ): number {
    let score = 0;

    // Position size contribution (0-30)
    if (portfolioValue > 0) {
      score += Math.min(30, (orderValue / portfolioValue) * 100 * 1.5);
    }

    // Number of positions contribution (0-30)
    score += Math.min(30, openPositions * 3);

    // Daily loss contribution (0-40)
    if (dailyLoss < 0 && portfolioValue > 0) {
      score += Math.min(40, (Math.abs(dailyLoss) / portfolioValue) * 100 * 8);
    }

    return Math.min(100, Math.round(score));
  }
}
