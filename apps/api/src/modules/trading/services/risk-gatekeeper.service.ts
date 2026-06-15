import { Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { RiskCheckResult, OrderCommand } from '../events/order.events';
import * as ccxt from 'ccxt';

/**
 * Risk Gatekeeper Service — Pre-Trade Risk Validation
 *
 * V137: PER-USER ISOLATION — Circuit breaker Redis keys now include userId.
 * Previously: `circuit-breaker:{symbol}` (cross-user contamination on restart)
 * Now:        `circuit-breaker:v2:{userId}:{symbol}` (per-user isolated)
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
export class RiskGatekeeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RiskGatekeeperService.name);

  // ── Configurable Risk Parameters (loaded from DB with env fallback) ──
  private maxPositionSizePercent: number;
  private maxOpenPositions: number;
  // V145: Per-source limits from agentExecutorConfig admin settings
  private executorMaxOpenPositions: number;
  private agentMaxOpenPositions: number;
  private maxDailyLossPercent: number;
  private minOrderSizeUSD: number;
  private maxOrderSizeUSD: number;
  private stopLossDefault: number;
  private circuitBreakerThresholdPercent: number;
  // ── Circuit Breaker State (in-memory, per user+symbol) ──
  // FIX: Changed key from symbol-only to userId:symbol to scope circuit breakers
  // per-user. Previously, if user A triggered a circuit breaker on BTC/USDT,
  // it blocked ALL users from trading that symbol — which is incorrect.
  // Now each user has their own circuit breaker state per symbol.
  // The key format is "userId:symbol" (e.g., "user123:BTC/USDT").
  private readonly CB_BASE_COOLDOWN_MS = 60_000; // 60 seconds base cooldown
  private readonly CB_MAX_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes max cooldown
  private readonly circuitBreakerState: Map<string, {
    triggered: boolean;
    until: Date;
    level: number; // Progressive cooldown level
    triggeredAt: Date; // When the circuit breaker was first triggered
    consecutiveTriggers: number; // Number of consecutive triggers
  }> = new Map();

  // ── Redis key prefix for circuit breaker persistence ──
  // V137 FIX: Changed from 'circuit-breaker:' to 'circuit-breaker:v2:' to avoid
  // conflicts with old-format keys (which used symbol-only, missing userId).
  // Old format: circuit-breaker:BTC/USDT (cross-user contamination)
  // New format: circuit-breaker:v2:userId:BTC/USDT (per-user isolated)
  private readonly CB_REDIS_PREFIX = 'circuit-breaker:v2:';

  // ── Last DB sync timestamp ──
  private lastSettingsSync = 0;
  private readonly SETTINGS_SYNC_INTERVAL = 30000; // Re-sync every 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly exchangeService: ExchangeService,
    @Optional() private readonly redis?: RedisService,
  ) {
    // Initialize with env var defaults — will be overwritten by DB settings
    this.maxPositionSizePercent = parseFloat(
      this.configService.get('RISK_MAX_POSITION_PERCENT', '2'),  // V204: was 5 — unified to 2% across all services
    );
    this.maxOpenPositions = parseInt(
      this.configService.get('RISK_MAX_OPEN_POSITIONS', '10'), // Safe default for real accounts
      10,
    );
    this.executorMaxOpenPositions = parseInt(
      this.configService.get('EXECUTOR_MAX_OPEN_POSITIONS', '5'), 10,
    );
    this.agentMaxOpenPositions = parseInt(
      this.configService.get('AGENT_MAX_OPEN_POSITIONS', '5'), 10,
    );
    this.maxDailyLossPercent = parseFloat(
      this.configService.get('RISK_MAX_DAILY_LOSS_PERCENT', '5'),
    );
    this.minOrderSizeUSD = parseFloat(
      this.configService.get('RISK_MIN_ORDER_SIZE', '10'),
    );
    this.maxOrderSizeUSD = parseFloat(
      this.configService.get('RISK_MAX_ORDER_SIZE', '5000'),
    );
    this.stopLossDefault = parseFloat(
      this.configService.get('RISK_STOP_LOSS_DEFAULT', '2'),
    );
    this.circuitBreakerThresholdPercent = parseFloat(
      this.configService.get('RISK_CIRCUIT_BREAKER_THRESHOLD', '10'),
    );
    // Load settings from DB on startup
    // FIX: Added .catch() to prevent unhandled promise rejection from constructor
    this.syncSettingsFromDB().catch((err) => this.logger.warn(`syncSettingsFromDB failed at startup: ${err?.message || err}`));

    this.logger.log('🛡️ Risk Gatekeeper initialized — pre-trade validation active (with DB sync)');
  }

  async onModuleInit() {
    // Load circuit breaker state from Redis on startup
    // FIX: Add a timeout so that an unreachable Redis doesn't block
    // NestJS bootstrap. Without this, scanKeys() waits for ioredis to
    // connect, which can hang if Redis is slow/unreachable → ECONNREFUSED.
    const INIT_TIMEOUT_MS = 5_000; // 5 seconds
    await Promise.race([
      this._loadCircuitBreakerStateFromRedis(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          this.logger.warn(`🛡️ Circuit breaker Redis load timed out after ${INIT_TIMEOUT_MS / 1000}s — continuing with empty state`);
          resolve();
        }, INIT_TIMEOUT_MS),
      ),
    ]);
  }

  async onModuleDestroy() {
    // Persist circuit breaker state to Redis before shutdown
    await this._saveCircuitBreakerStateToRedis();
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

    // SUSTAINABLE FIX: Skip if DB not available to avoid leaking connection pools
    if (!this.prisma?.isAvailable?.()) {
      return; // Will retry on next sync interval
    }

    try {
      // V136 FIX: Only read GLOBAL system settings (riskConfig, botConfig),
      // NOT all user-specific settings. Previously, findMany() loaded EVERY
      // setting from EVERY user into memory — a data leak risk and performance
      // issue. User-specific settings are read per-request via _loadUserRiskSettings().
      const settings = await this.prisma.setting.findMany({
        where: {
          key: { in: ['riskConfig', 'botConfig', 'AUTO_TRADING_ENABLED', 'agentExecutorConfig'] },
        },
      });
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
          // ═══════════════════════════════════════════════════════════════════
          // V144: Auto-migrate stale riskConfig.maxOpenPositions from old default (5).
          // The old admin settings page saved maxOpenPositions=5 as the default.
          // This value persists in the DB even after V143 changed the frontend
          // default to 15. The RiskGatekeeper reads this stale value every 30s
          // and uses it to BLOCK all new trades when total positions >= 5.
          //
          // This was THE root cause of "executor stops at 5 trades":
          //   1. SmartExecutor's own check: counts only smart_executor positions
          //      (5 < 15 → PASSES)
          //   2. RiskGatekeeper's check: counts ALL positions from ALL sources
          //      (5 >= 5 from stale DB → BLOCKS!)
          //
          // Fix: If the DB value is <= 5, auto-upgrade to 20 (env default)
          // and UPDATE the DB so the admin sees the new value.
          // ═══════════════════════════════════════════════════════════════════
          if (val <= 5) {
            const newVal = parseInt(this.configService.get('RISK_MAX_OPEN_POSITIONS', '20'), 10);
            this.logger.warn(`🛡️ V144: Auto-upgrading riskConfig.maxOpenPositions from ${val} to ${newVal} (stale old default detected)`);
            val = newVal;
            // Update the DB so admin sees the new value and it doesn't get re-read as 5
            this.prisma.setting.upsert({
              where: { key: 'riskConfig' },
              update: { value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(newVal) }) },
              create: { key: 'riskConfig', value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(newVal) }) },
            }).catch((dbErr: any) => {
              this.logger.warn(`🛡️ V144: Failed to update riskConfig in DB: ${dbErr?.message}`);
            });
          }
          this.maxOpenPositions = val;
        }
        if (riskConfig.stopLossDefault) this.stopLossDefault = parseFloat(riskConfig.stopLossDefault);

        if (riskConfig.circuitBreakerThreshold) this.circuitBreakerThresholdPercent = parseFloat(riskConfig.circuitBreakerThreshold);
      }

      // Apply botConfig from admin DB
      const botConfig = settingsMap.botConfig;
      if (botConfig) {
        if (botConfig.maxPositionSize) this.maxOrderSizeUSD = parseFloat(botConfig.maxPositionSize);
      }

      // V144: Also apply agentExecutorConfig if available.
      // If riskConfig.maxOpenPositions is NOT set but agentExecutorConfig is,
      // use the executor-specific limit as a hint for the global limit.
      // The global limit should be >= executor limit + agent limit.
      const agentExecConfig = settingsMap.agentExecutorConfig;
      if (agentExecConfig) {
        const execMax = parseInt(agentExecConfig.executorMaxOpenPositions || '15', 10);
        const agentMax = parseInt(agentExecConfig.agentMaxOpenPositions || '15', 10);
        // V145: Store per-source limits for source-aware position counting
        this.executorMaxOpenPositions = execMax;
        this.agentMaxOpenPositions = agentMax;
        this.logger.debug(`🛡️ V145: Per-source limits — executor=${execMax}, agent=${agentMax}`);

        if (!settingsMap.riskConfig?.maxOpenPositions) {
          const impliedGlobal = execMax + agentMax;
          if (this.maxOpenPositions < impliedGlobal) {
            this.logger.warn(`🛡️ V144: Global maxOpenPositions (${this.maxOpenPositions}) is less than executor+agent total (${impliedGlobal}). Consider increasing riskConfig.maxOpenPositions to at least ${impliedGlobal}.`);
          }
        }
      }

      this.logger.debug(`🛡️ Risk parameters synced from DB — maxOpenPositions=${this.maxOpenPositions}`);
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
    // FIX: enforceStopLoss is now async — it fetches market price for market orders
    // where command.price is undefined, instead of using `(command.price || 0)` which
    // caused false rejections for all market buy orders.
    const slCheck = await this.enforceStopLoss(command);
    if (!slCheck.allowed) return slCheck;

    // Check 2: Sufficient balance
    const balanceCheck = await this.checkSufficientBalance(command);
    if (!balanceCheck.allowed) return balanceCheck;

    // Check 3: Position size limit
    const sizeCheck = await this.checkPositionSizeLimit(command);
    if (!sizeCheck.allowed) return sizeCheck;

    // Check 4: Daily drawdown limit (scoped per exchange)
    const drawdownCheck = await this.checkDailyDrawdownLimit(command.userId, command.exchangeCredentialId);
    if (!drawdownCheck.allowed) return drawdownCheck;

    // Check 4b: Overall drawdown limit (all-time, not just today)
    const overallDrawdownCheck = await this.checkOverallDrawdownLimit(command.userId, command.exchangeCredentialId);
    if (!overallDrawdownCheck.allowed) return overallDrawdownCheck;

    // Check 5: Circuit breakers (scoped per user+symbol)
    const circuitCheck = await this.checkCircuitBreakers(command.userId, command.symbol);
    if (!circuitCheck.allowed) return circuitCheck;

    // Check 6: Trade repetition filter (V177 FIX #17)
    const repetitionCheck = await this.checkTradeRepetitionFilter(command);
    if (!repetitionCheck.allowed) return repetitionCheck;

    // Check 7: Price sanity filter (#9 FIX)
    const sanityCheck = await this.checkPriceSanity(command);
    if (!sanityCheck.allowed) return sanityCheck;

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
   * CHECK 7: Price Sanity Filter
   *
   * Validates that the order price is within reasonable range
   * of the last known price. Prevents orders at clearly wrong prices
   * (stale data, API errors, flash crash misreads).
   *
   * #9 FIX: Aggregates sanity check results into a Redis report
   * for monitoring (total checks, passes, rejects by symbol).
   */
  async checkPriceSanity(command: OrderCommand): Promise<RiskCheckResult> {
    // Skip for simulated trading
    if (command.isPaperTrading) {
      return { allowed: true };
    }

    // Get the order's reference price
    let orderPrice = command.price;
    if (!orderPrice || orderPrice <= 0) {
      try {
        const quote = await this.exchangeService.getQuote(command.symbol);
        orderPrice = quote?.price;
      } catch {
        return { allowed: true }; // Can't check — allow
      }
    }

    if (!orderPrice || orderPrice <= 0) {
      return { allowed: true };
    }

    // Get last known price from Redis
    const sanityKey = `price-sanity:last:${command.symbol}`;
    let lastKnownPrice: number | null = null;
    try {
      const raw = this.redis ? await this.redis.get(sanityKey) : null;
      lastKnownPrice = raw ? parseFloat(raw) : null;
    } catch {
      lastKnownPrice = null;
    }

    if (lastKnownPrice && lastKnownPrice > 0) {
      const deviation = Math.abs(orderPrice - lastKnownPrice) / lastKnownPrice;
      const MAX_DEVIATION = 0.10; // 10% max deviation

      if (deviation > MAX_DEVIATION) {
        // Update sanity report (aggregate)
        await this._updatePriceSanityReport(command.symbol, false, deviation);

        this.logger.warn(
          `🛡️ PRICE_SANITY: ${command.symbol} price ${orderPrice} deviates ${(deviation * 100).toFixed(1)}% from last known ${lastKnownPrice} — rejecting`,
        );
        return {
          allowed: false,
          reason: `سعر ${command.symbol} (${orderPrice}) يختلف بنسبة ${(deviation * 100).toFixed(1)}% عن آخر سعر معروف (${lastKnownPrice}) — قد يكون هناك خطأ في البيانات.`,
          failedCheck: 'PRICE_SANITY',
        };
      }
    }

    // Update last known price
    try {
      if (this.redis) {
        await this.redis.set(sanityKey, orderPrice.toString(), 300000); // 5 min TTL
      }
    } catch {}

    // Update sanity report (pass)
    await this._updatePriceSanityReport(command.symbol, true, 0);

    return { allowed: true };
  }

  /**
   * Update the price sanity report in Redis.
   * Aggregates ~10 lines of stats per symbol.
   */
  private async _updatePriceSanityReport(symbol: string, passed: boolean, deviation: number): Promise<void> {
    if (!this.redis) return;
    try {
      const reportKey = 'price-sanity:report';
      const raw = await this.redis.get(reportKey);
      const report: Record<string, { checks: number; passes: number; rejects: number; lastDeviation: number }> = raw ? JSON.parse(raw) : {};

      if (!report[symbol]) {
        report[symbol] = { checks: 0, passes: 0, rejects: 0, lastDeviation: 0 };
      }

      report[symbol].checks++;
      if (passed) report[symbol].passes++;
      else report[symbol].rejects++;
      report[symbol].lastDeviation = deviation;

      // Keep only last 100 symbols
      const keys = Object.keys(report);
      if (keys.length > 100) {
        delete report[keys[0]]; // Remove oldest
      }

      await this.redis.set(reportKey, JSON.stringify(report), 86400000); // 24h TTL
    } catch {}
  }

  /**
   * CHECK 1: Enforce Stop-Loss — MANDATORY
   *
   * Every order MUST have a stop-loss. No exceptions.
   * This is the #1 safety rule of the Roua platform.
   */
  async enforceStopLoss(command: OrderCommand): Promise<RiskCheckResult> {
    if (!command.stopLoss || command.stopLoss <= 0) {
      this.logger.warn(`🛡️ ORDER REJECTED: No stop-loss for ${command.symbol}`);

      return {
        allowed: false,
        reason: 'وقف الخسارة إجباري. لا يمكن تقديم أمر بدون وقف خسارة — هذا القانون الأول في منصة رؤى.',
        failedCheck: 'STOPLOSS_ENFORCEMENT',
      };
    }

    // FIX: Resolve reference price for stop-loss direction validation.
    // For MARKET orders, `command.price` is undefined/0 because there's no limit price.
    // Previously, `(command.price || 0)` resulted in `0`, making `stopLoss >= 0` always TRUE
    // for BUY orders — which incorrectly rejected ALL market buy orders with a valid SL.
    // Now: if price is missing, fetch the current market price from the exchange service.
    let referencePrice: number | undefined = command.price;
    if (!referencePrice || referencePrice <= 0) {
      try {
        const quote = await this.exchangeService.getQuote(command.symbol);
        if (quote && quote.price > 0) {
          referencePrice = quote.price;
          this.logger.debug(`🛡️ Fetched market price for SL validation: ${command.symbol} = $${referencePrice}`);
        }
      } catch {
        // Cannot fetch price — skip direction check rather than reject
        // A missing price reference should not block the order; the SL value itself
        // is still validated (> 0) and the exchange will reject invalid SL on execution.
        this.logger.warn(`🛡️ Cannot fetch price for ${command.symbol} — skipping SL direction check`);
        return { allowed: true };
      }
    }

    // If we still don't have a reference price, skip direction check (safety net)
    if (!referencePrice || referencePrice <= 0) {
      this.logger.warn(`🛡️ No reference price for ${command.symbol} — skipping SL direction check`);
      return { allowed: true };
    }

    // Validate stop-loss direction using the resolved reference price
    if (command.side === 'BUY' && command.stopLoss >= referencePrice) {
      return {
        allowed: false,
        reason: 'وقف الخسارة لأمر الشراء يجب أن يكون أقل من سعر الدخول.',
        failedCheck: 'STOPLOGIC_ENFORCEMENT',
      };
    }

    if (command.side === 'SELL' && command.stopLoss <= referencePrice) {
      return {
        allowed: false,
        reason: 'وقف الخسارة لأمر البيع يجب أن يكون أعلى من سعر الدخول.',
        failedCheck: 'STOPLOGIC_ENFORCEMENT',
      };
    }

    // V177 FIX #13 / V178 FIX: Strategy-aware Risk/Reward ratio validation
    // Different strategies have different R:R expectations:
    // - DCA: 0.4 (averages into positions, low R:R acceptable)
    // - Grid: 0.8 (many small trades)
    // - Mean Reversion: 0.8 (counter-trend, tight targets)
    // - Scalping: 1.0 (quick in-and-out)
    // - Default/Swing: 1.5 (standard trend-following)
    // The minimum R:R is now determined by the strategy source, not a flat 1.5.
    if (command.takeProfit && command.takeProfit > 0 && referencePrice) {
      const slDistance = Math.abs(referencePrice - command.stopLoss);
      const tpDistance = Math.abs(command.takeProfit - referencePrice);
      if (slDistance > 0) {
        const riskRewardRatio = tpDistance / slDistance;
        // V-PHASE2: Updated STRATEGY_MIN_RR to match RiskCalculator STRATEGY_MIN_RR table.
        // Previously DCA=0.4 was dead code (DCA strategy enforces 1.5+ after Phase 1).
        // Grid raised 0.8→1.2, VWAP_RSI raised 1.0→1.2, Mean Reversion raised 0.8→1.0.
        const STRATEGY_MIN_RR: Record<string, number> = {
          dca: 1.5,              // V-PHASE2: was 0.4 — DCA strategy now enforces minRiskRewardRatio=1.5
          grid: 1.2,             // V-PHASE2: was 0.8 — grid needs decent R:R
          mean_reversion: 1.0,   // V-PHASE2: was 0.8 — strategy now produces 1.25:1 minimum
          scalping: 1.0,         // unchanged
          vwap_rsi: 1.2,         // V-PHASE2: was 1.0 — strategy R:R is 1.67:1
          momentum_breakout: 1.2, // unchanged
          swing: 1.5,            // unchanged
        };
        const strategyKey = (command.strategy || command.source || '').toLowerCase();
        const minRR = STRATEGY_MIN_RR[strategyKey] || 1.2; // Default 1.2 (was flat 1.5)
        if (riskRewardRatio < minRR) {
          this.logger.warn(`🛡️ ORDER REJECTED: R:R ratio ${riskRewardRatio.toFixed(2)} < ${minRR} minimum (strategy: ${strategyKey || 'default'}) for ${command.symbol}`);
          return {
            allowed: false,
            reason: `نسبة المخاطرة/المكافأة (${riskRewardRatio.toFixed(2)}:1) أقل من الحد الأدنى للاستراتيجية ${strategyKey || 'الافتراضية'} (${minRR}:1). وسّع هدف الربح أو قلّل وقف الخسارة.`,
            failedCheck: 'RISK_REWARD_RATIO',
          };
        }
      }
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

      // FIX: SECURITY — Verify credential ownership
      // Without this check, a malicious user could pass another user's exchangeCredentialId
      // and the system would use their API keys to check balance (and potentially trade).
      // This is a critical authorization bypass vulnerability.
      if (credential.userId !== command.userId) {
        this.logger.error(
          `🛡️ SECURITY: User ${command.userId} attempted to use credential ${command.exchangeCredentialId} owned by ${credential.userId}`,
        );
        return {
          allowed: false,
          reason: 'بيانات الاعتماد لا تنتمي لحسابك.',
          failedCheck: 'CREDENTIAL_OWNERSHIP',
        };
      }

      if (!credential.isValid) {
        return {
          allowed: false,
          reason: 'بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API.',
          failedCheck: 'BALANCE_CHECK',
        };
      }

      // ── V181: Pure Paper Trading Bypass ONLY ──
      // FIX: Previously, _isSimulatedCredential() returned true for broker demo
      // accounts (mt5_demo, binance_test, testnet credentials), treating them
      // the same as pure paper trading. This was WRONG because:
      // 1. Broker demos connect to REAL brokers with REAL market data
      // 2. They execute orders on real platforms (MetaTrader, Binance testnet API)
      // 3. Bypassing risk checks on demo defeats the purpose — users won't discover
      //    risk limit violations until they switch to live accounts
      // Now: Only bypass for PURE paper/simulation (no broker connection at all).
      if (this._isSimulatedCredential(credential)) {
        this.logger.debug(`🛡️ Paper-only credential "${credential.exchange}" balance check: BYPASSED (pure simulation) — allowing order`);
        return { allowed: true };
      }

      // ── V181: Broker Demo / MT5 Accounts ──
      // For MT5 accounts (both live and demo), we can't use CCXT to verify balance.
      // Instead, we enforce order value limits and position size checks.
      // The MT5Adapter itself also enforces a 5% max position size limit.
      const isMT5Account = this._isMT5Exchange(credential.exchange);
      if (isMT5Account) {
        // MT5 accounts: Skip CCXT balance verification, but enforce value limits
        const orderValue = command.quantity * (command.price || 0);

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

        this.logger.debug(`🛡️ MT5 account "${credential.exchange}" balance check: CCXT bypassed (MT5 uses MetaAPI), order value limits enforced ($${orderValue.toFixed(2)})`);
        return { allowed: true };
      }

      // Check permissions (only for REAL exchanges — paper already bypassed above)
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

      // Try to verify actual balance via CCXT (real exchanges only)
      try {
        const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id, command.userId);
        // FIX: Try the exact exchange name first, then try resolving the real
        // exchange name from test variants (e.g. 'binance_test' → 'binance').
        // This allows test credentials with real API keys to still verify balance
        // via the real CCXT class (e.g. Binance testnet keys).
        let ExchangeClass = (ccxt as any)[credential.exchange];
        if (!ExchangeClass) {
          const realName = this._resolveRealExchangeName(credential.exchange);
          if (realName && (ccxt as any)[realName]) {
            ExchangeClass = (ccxt as any)[realName];
            this.logger.debug(`🛡️ Resolved exchange "${credential.exchange}" → "${realName}" for CCXT lookup`);
          }
        }
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

          // SELL-side balance check: verify user has enough base currency to sell
          if (command.side === 'SELL') {
            const baseCurrency = command.symbol.split('/')[0] || '';
            const baseBalance = balance[baseCurrency]?.free || 0;
            if (baseBalance < command.quantity) {
              return {
                allowed: false,
                reason: `رصيد غير كافي من ${baseCurrency}. المتاح: ${baseBalance.toFixed(6)} ${baseCurrency}، المطلوب: ${command.quantity} ${baseCurrency}.`,
                failedCheck: 'BALANCE_CHECK',
              };
            }
          }
        } else {
          // FIX: If exchange is not found in CCXT, it might be a custom exchange
          // or a test variant that we couldn't resolve. Instead of hard-rejecting,
          // allow the order to proceed — the execution layer will handle it.
          // Previously, this hard-reject blocked ALL orders for exchanges like
          // 'binance_test' that aren't exact CCXT class names.
          this.logger.warn(`🛡️ Exchange "${credential.exchange}" not found in CCXT — allowing order (execution layer will validate)`);
        }
      } catch (error: any) {
        // FIX: If decryption failed (ENCRYPTION_KEY changed), REJECT the order.
        // Previously, decrypt failures were allowed through under the assumption
        // that Smart Executor would auto-fallback to paper trading — but this is
        // dangerous: an order that bypasses balance checks can execute with
        // unverified credentials on a live exchange. Fail-closed is the only
        // safe policy.
        const isDecryptError = error.message?.includes('decrypt') ||
          error.message?.includes('initialization vector') ||
          error.message?.includes('فشل فك تشفير');
        if (isDecryptError) {
          this.logger.error(
            `🛡️ Credential decryption failed for ${credential.exchange} (likely ENCRYPTION_KEY changed) — ` +
            `REJECTING order to protect capital (fail-closed)`
          );
          return {
            allowed: false,
            reason: 'فشل فك تشفير بيانات الاعتماد — لا يمكن التحقق من الرصيد. تم رفض الطلب لحماية رأس المال. يرجى إعادة إدخال مفاتيح API.',
            failedCheck: 'BALANCE_CHECK',
          };
        } else {
          // FAIL-CLOSED: Other balance verification failures — reject to protect capital
          this.logger.error(`Balance verification failed for ${command.symbol}: ${error.message} — rejecting order`);
          return {
            allowed: false,
            reason: 'فشل التحقق من الرصيد — تم رفض الطلب لحماية رأس المال.',
            failedCheck: 'BALANCE_CHECK',
          };
        }
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
      // ── V181: Paper Trading Path ──
      // Only PURE paper/simulation accounts (no broker connection) take this path.
      // Broker demo accounts (mt5_demo, binance_test, testnet) now go through
      // the REAL trading path below, enforcing all risk checks to simulate
      // realistic conditions. This is critical because:
      // 1. Demo accounts connect to real brokers with real market data
      // 2. Users must experience realistic risk constraints before going live
      // 3. Bypassing risk checks on demo defeats the purpose of demo trading
      //
      // CRITICAL FIX v2: Also check command.isPaperTrading flag. The Smart Executor
      // sets this flag when submitting paper trades. The credential-based check
      // alone was failing because:
      // 1. Some test credentials have exchange names like "binance_testnet" that
      //    _isTestExchange might not recognize
      // 2. The credential lookup itself can fail (DB timeout, etc.)
      // 3. The maxPositionSizePercent was set to 5% by admin settings, and with
      //    a small portfolio estimation, orders were calculated as 100% of portfolio
      // This caused the error: "حجم المركز (100.0%) يتجاوز الحد الأقصى (5%)"
      // blocking ALL paper-trading executions.
      // ── V181: Now uses _isSimulatedCredential() which only matches pure paper ──
      const isPaperByFlag = command.isPaperTrading === true;
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: command.exchangeCredentialId },
      });
      const isSimulatedByCredential = this._isSimulatedCredential(credential);

      if (isPaperByFlag || isSimulatedByCredential) {
        // ═══════════════════════════════════════════════════════════════════
        // V145: SOURCE-AWARE position counting for paper/simulated trading.
        // Instead of counting ALL positions against the global limit,
        // count positions per-source against per-source limits.
        // This prevents the Agent's positions from blocking the Executor
        // and vice versa.
        // ═══════════════════════════════════════════════════════════════════
        const orderSource = command.source || 'auto_paper';
        const isExecutor = ['smart_executor', 'auto_paper'].includes(orderSource);
        const perSourceLimit = isExecutor ? this.executorMaxOpenPositions : this.agentMaxOpenPositions;

        // Count positions for THIS source only
        const sourcePositions = await this.prisma.position.count({
          where: {
            userId: command.userId,
            status: 'OPEN',
            source: isExecutor ? { in: ['smart_executor', 'auto_paper'] } : orderSource,
          },
        });

        if (sourcePositions >= perSourceLimit) {
          return {
            allowed: false,
            reason: `لديك ${sourcePositions} مركز مفتوح من ${isExecutor ? 'المنفذ' : 'الوكيل'} بالفعل (الحد الأقصى: ${perSourceLimit}). أغلق بعض المراكز أولاً.`,
            failedCheck: 'POSITION_SIZE_LIMIT',
          };
        }

        // Also check the GLOBAL limit (safety net — total across all sources)
        const totalOpenPositions = await this.prisma.position.count({
          where: { userId: command.userId, status: 'OPEN' },
        });
        if (totalOpenPositions >= this.maxOpenPositions) {
          return {
            allowed: false,
            reason: `لديك ${totalOpenPositions} مركز مفتوح إجمالاً (الحد الأقصى العام: ${this.maxOpenPositions}). أغلق بعض المراكز أولاً.`,
            failedCheck: 'POSITION_SIZE_LIMIT',
          };
        }

        this.logger.debug(`🛡️ Paper trading order ALLOWED (source=${orderSource}: ${sourcePositions}/${perSourceLimit}, total: ${totalOpenPositions}/${this.maxOpenPositions})`);

        // V172: Paper margin check — prevent used margin from exceeding paper balance.
        // Previously paper trading bypassed ALL balance checks → margin > balance.
        try {
          const settings = await this.prisma.agentSettings.findUnique({
            where: { userId: command.userId },
            select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true },
          });
          const paperBalance = settings?.paperBalance ? Number(settings.paperBalance) : 0; // V204: was 10000
          const cryptoLev = settings?.paperCryptoLeverage ? Number(settings.paperCryptoLeverage) : 1;
          const forexLev = settings?.paperForexLeverage ? Number(settings.paperForexLeverage) : 50;

          // Current used margin from all open positions
          const allOpen = await this.prisma.position.findMany({
            where: { userId: command.userId, status: 'OPEN' },
            select: { quantity: true, currentPrice: true, entryPrice: true, symbol: true },
          });
          let currentUsed = 0;
          for (const pos of allOpen) {
            const notional = Math.abs((Number(pos.quantity) || 0) * (Number(pos.currentPrice) || Number(pos.entryPrice) || 0));
            const symIsForex = (pos.symbol || '').includes('/') && !(pos.symbol || '').match(/USDT|BTC|ETH|SOL|BNB/i);
            currentUsed += symIsForex ? notional / forexLev : (cryptoLev > 1 ? notional / cryptoLev : notional);
          }

          // New position margin estimate
          const newNotional = Math.abs((command.quantity || 0) * (command.price || 0));
          if (newNotional > 10) {
            const symIsForex = (command.symbol || '').includes('/') && !(command.symbol || '').match(/USDT|BTC|ETH|SOL|BNB/i);
            const newMargin = symIsForex ? newNotional / forexLev : (cryptoLev > 1 ? newNotional / cryptoLev : newNotional);
            if ((currentUsed + newMargin) > paperBalance * 1.02) {
              const available = Math.max(0, paperBalance - currentUsed);
              return {
                allowed: false,
                reason: `هامش الورق غير كافٍ. الرصيد: $${paperBalance.toFixed(0)}، المستخدم: $${currentUsed.toFixed(0)}، المتاح: $${available.toFixed(0)}، مطلوب للمركز الجديد: $${newMargin.toFixed(0)}.`,
                failedCheck: 'PAPER_MARGIN_CHECK',
              };
            }
          }
        } catch {
          // Non-fatal — if margin check fails, allow the order
        }

        // V180+FIX: Position size percentage check for paper/simulated accounts.
        // Previously, paper trading completely bypassed position size % checks,
        // allowing positions of 86% of portfolio. Paper trading MUST enforce
        // the same position size limits as real trading so test results
        // reflect real-world behavior.
        // NO guard condition — must ALWAYS check. If balance unknown, block the trade.
        const paperBalance = await this._getPaperBalance(command.userId) || 0; // V204: was || 10000
        const orderValue = Math.abs((command.quantity || 0) * (command.price || 0));
        if (orderValue > 0) {
          const positionPercent = (orderValue / paperBalance) * 100;
          if (positionPercent > this.maxPositionSizePercent) {
            return {
              allowed: false,
              reason: `حجم المركز (${positionPercent.toFixed(1)}% من المحفظة) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%) حتى في التداول الورقي.`,
              failedCheck: 'POSITION_SIZE_LIMIT',
            };
          }
        }

        return { allowed: true };
      }

      // ═══════════════════════════════════════════════════════════════════
      // V145: SOURCE-AWARE position counting for REAL trading too.
      // Same logic as paper trading — count per-source first, then global.
      // ═══════════════════════════════════════════════════════════════════
      const orderSource = command.source || 'user_manual';
      const isExecutor = ['smart_executor', 'auto_paper'].includes(orderSource);
      const perSourceLimit = isExecutor ? this.executorMaxOpenPositions : this.agentMaxOpenPositions;

      // Count positions for THIS source only
      const sourcePositions = await this.prisma.position.count({
        where: {
          userId: command.userId,
          status: 'OPEN',
          source: isExecutor ? { in: ['smart_executor', 'auto_paper'] } : orderSource,
        },
      });

      if (sourcePositions >= perSourceLimit) {
        return {
          allowed: false,
          reason: `لديك ${sourcePositions} مركز مفتوح من ${isExecutor ? 'المنفذ' : 'الوكيل'} بالفعل (الحد الأقصى: ${perSourceLimit}). أغلق بعض المراكز أولاً.`,
          failedCheck: 'POSITION_SIZE_LIMIT',
        };
      }

      // Also check the GLOBAL limit (safety net — total across all sources)
      const openPositions = await this.prisma.position.count({
        where: { userId: command.userId, status: 'OPEN' },
      });

      if (openPositions >= this.maxOpenPositions) {
        return {
          allowed: false,
          reason: `لديك ${openPositions} مركز مفتوح إجمالاً (الحد الأقصى العام: ${this.maxOpenPositions}). أغلق بعض المراكز أولاً.`,
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
   *
   * FIX: Now scoped per exchange when exchangeCredentialId is available.
   * Previously, daily losses on Binance counted against the user's Alpaca
   * limit too. Now each exchange's drawdown is calculated independently.
   * If no exchange is specified, falls back to total across all exchanges.
   */
  async checkDailyDrawdownLimit(userId: string, exchangeCredentialId?: string): Promise<RiskCheckResult> {
    try {
      // ═══════════════════════════════════════════════════════════════
      // V181 FIX: Skip daily drawdown check for PURE PAPER trading ONLY.
      // Previously, broker demo accounts (mt5_demo, binance_test, testnet)
      // also bypassed this check, which defeated the purpose of demo trading.
      // Demo accounts connect to REAL brokers and MUST enforce risk checks
      // so users experience realistic constraints before going live.
      // Now: _isSimulatedCredential() only returns true for pure paper/simulation.
      // ═══════════════════════════════════════════════════════════════
      if (exchangeCredentialId) {
        const credential = await this.prisma.exchangeCredential.findUnique({
          where: { id: exchangeCredentialId },
        });
        if (this._isSimulatedCredential(credential)) {
          this.logger.debug(`🛡️ Paper-only credential "${credential?.exchange}" daily drawdown check: BYPASSED (pure simulation)`);
          return { allowed: true };
        }
      } else {
        // No credential specified — check if user only has paper/testnet credentials
        const realCredential = await this.prisma.exchangeCredential.findFirst({
          where: { userId, isValid: true, exchange: { not: 'paper-trading' }, testnet: { not: true } },
        });
        if (!realCredential) {
          // User only has simulated credentials — bypass
          this.logger.debug(`🛡️ Simulated-only user daily drawdown check: BYPASSED`);
          return { allowed: true };
        }
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // FIX: Scope daily drawdown per exchange if credential is provided
      const tradeWhere: any = {
        userId,
        executedAt: { gte: todayStart },
        type: { in: ['EXIT', 'PARTIAL_EXIT'] },
      };

      if (exchangeCredentialId) {
        // Find the exchange name for this credential
        const credential = await this.prisma.exchangeCredential.findUnique({
          where: { id: exchangeCredentialId },
          select: { exchange: true },
        });
        if (credential) {
          // Only count trades on the same exchange
          tradeWhere.exchange = credential.exchange;
        }
      }

      // Calculate today's realized losses from closed trades
      const todayTrades = await this.prisma.trade.findMany({
        where: tradeWhere,
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
   * CHECK 4b: Overall Drawdown Limit
   *
   * Stops trading if total realized losses exceed 30% of original portfolio value.
   * This protects against catastrophic losses that span multiple days.
   * Default threshold: 30% (configurable via RISK_MAX_OVERALL_DRAWDOWN_PERCENT env var).
   */
  async checkOverallDrawdownLimit(userId: string, exchangeCredentialId?: string): Promise<RiskCheckResult> {
    try {
      if (exchangeCredentialId) {
        const credential = await this.prisma.exchangeCredential.findUnique({ where: { id: exchangeCredentialId } });
        if (this._isSimulatedCredential(credential)) return { allowed: true };
      }

      const maxOverallDrawdownPercent = parseFloat(
        this.configService.get('RISK_MAX_OVERALL_DRAWDOWN_PERCENT', '30')
      );

      // Sum ALL realized losses from closed trades (no date filter)
      const allTrades = await this.prisma.trade.findMany({
        where: { userId, type: { in: ['EXIT', 'PARTIAL_EXIT'] } },
        select: { pnl: true },
      });
      const totalPnL = allTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);

      if (totalPnL < 0) {
        const portfolioValue = await this._estimatePortfolioValue(userId);
        if (portfolioValue > 0) {
          const originalValue = portfolioValue + Math.abs(totalPnL);
          const overallLossPercent = (Math.abs(totalPnL) / originalValue) * 100;
          if (overallLossPercent >= maxOverallDrawdownPercent) {
            this.logger.warn(
              `🛡️ OVERALL DRAWDOWN: User ${userId} overall loss ${overallLossPercent.toFixed(1)}% >= limit ${maxOverallDrawdownPercent}%`
            );
            return {
              allowed: false,
              reason: `إجمالي خسائرك (${overallLossPercent.toFixed(1)}%) تجاوز الحد الأقصى الكلي (${maxOverallDrawdownPercent}%). يرجى مراجعة استراتيجيتك قبل الاستمرار.`,
              failedCheck: 'OVERALL_DRAWDOWN',
            };
          }
        }
      }
      return { allowed: true };
    } catch (err: any) {
      this.logger.warn(`Overall drawdown check failed (non-fatal): ${err.message}`);
      return { allowed: true }; // Non-fatal — don't block trading on check failure
    }
  }

  /**
   * CHECK 5: Circuit Breakers
   *
   * Checks if there's a trading halt on the asset for THIS USER due to extreme volatility.
   * FIX: Now scoped per-user — userId is part of the circuit breaker key.
   * Previously, a circuit breaker triggered by user A on BTC/USDT would block
   * ALL users from trading that symbol. Now each user has their own state.
   *
   * Key format: "userId:symbol" (e.g., "user123:BTC/USDT")
   */
  async checkCircuitBreakers(userId: string, symbol: string): Promise<RiskCheckResult> {
    // FIX: Scope circuit breaker per user
    const cbKey = `${userId}:${symbol}`;

    // Check in-memory circuit breaker state
    const state = this.circuitBreakerState.get(cbKey);
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
        reason: `تداول ${symbol} متوقف مؤقتاً لك بسبب تقلب شديد (مستوى ${state.level}). يُستأنف بعد ${timeStr}.`,
        failedCheck: 'CIRCUIT_BREAKER',
      };
    }

    // FIX: If cooldown has expired, check if we should reset the level
    if (state && state.triggered && state.until <= new Date()) {
      try {
        const quote = await this.exchangeService.getQuote(symbol);
        if (quote && Math.abs(quote.changePercent) <= this.circuitBreakerThresholdPercent) {
          // Market has calmed — reset the circuit breaker completely
          this.circuitBreakerState.delete(cbKey);
          this._persistCircuitBreakerToRedis(cbKey);
          this.logger.log(`🟢 Circuit breaker RESET for ${symbol} — volatility subsided (${quote.changePercent.toFixed(1)}%)`);
        } else {
          // Still volatile — extend cooldown with next exponential level
          const newLevel = state.level + 1;
          const cooldownMs = Math.min(
            this.CB_BASE_COOLDOWN_MS * Math.pow(2, newLevel - 1),
            this.CB_MAX_COOLDOWN_MS,
          );
          const newUntil = new Date(Date.now() + cooldownMs);

          this.circuitBreakerState.set(cbKey, {
            triggered: true,
            until: newUntil,
            level: newLevel,
            triggeredAt: state.triggeredAt,
            consecutiveTriggers: state.consecutiveTriggers + 1,
          });
          this._persistCircuitBreakerToRedis(cbKey);

          this.logger.warn(
            `🔴 Circuit breaker RE-TRIGGERED for ${symbol}: still volatile (${quote?.changePercent?.toFixed(1)}%) — level ${newLevel}, cooldown ${Math.round(cooldownMs / 1000)}s`,
          );

          return {
            allowed: false,
            reason: `تقلب شديد مستمر في ${symbol} (مستوى ${newLevel}). التداول متوقف لك لمدة ${Math.round(cooldownMs / 60000)} دقيقة حمايةً لك.`,
            failedCheck: 'CIRCUIT_BREAKER',
          };
        }
      } catch {
        // Can't verify — reset cautiously (allow trading)
        this.circuitBreakerState.delete(cbKey);
        this._persistCircuitBreakerToRedis(cbKey);
      }
    }

    // Try to detect extreme volatility from live data
    try {
      const quote = await this.exchangeService.getQuote(symbol);
      if (quote && Math.abs(quote.changePercent) > this.circuitBreakerThresholdPercent) {
        // FIX: Progressive cooldown with exponential backoff
        // Determine level: check if there's a recent expired state to build upon
        const previousState = this.circuitBreakerState.get(cbKey);
        const level = previousState ? previousState.level + 1 : 1;
        const consecutiveTriggers = previousState ? previousState.consecutiveTriggers + 1 : 1;

        const cooldownMs = Math.min(
          this.CB_BASE_COOLDOWN_MS * Math.pow(2, level - 1),
          this.CB_MAX_COOLDOWN_MS,
        );
        const until = new Date(Date.now() + cooldownMs);

        this.circuitBreakerState.set(cbKey, {
          triggered: true,
          until,
          level,
          triggeredAt: new Date(),
          consecutiveTriggers,
        });
        this._persistCircuitBreakerToRedis(cbKey);

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
   * Persist circuit breaker state to Redis.
   * Called on module destroy and after each circuit breaker update.
   *
   * V137 FIX: Redis key now includes userId to prevent cross-user contamination.
   * Previously, the key was `circuit-breaker:{symbol}` which meant User A's
   * circuit breaker on BTC/USDT would be loaded for ALL users on restart.
   * Now the key is `circuit-breaker:v2:{userId}:{symbol}` matching the in-memory
   * Map key format `userId:symbol`.
   */
  private async _saveCircuitBreakerStateToRedis(): Promise<void> {
    if (!this.redis) return;
    try {
      for (const [cbKey, state] of this.circuitBreakerState.entries()) {
        // Only persist active circuit breakers (not expired ones)
        if (state.triggered && state.until > new Date()) {
          const remainingMs = state.until.getTime() - Date.now();
          // V137: cbKey format is "userId:symbol" — use it directly as Redis key suffix
          const key = `${this.CB_REDIS_PREFIX}${cbKey}`;
          const value = JSON.stringify({
            triggered: state.triggered,
            until: state.until.toISOString(),
            level: state.level,
            triggeredAt: state.triggeredAt.toISOString(),
            consecutiveTriggers: state.consecutiveTriggers,
          });
          // Set TTL matching the remaining cooldown + small buffer
          const ttlMs = remainingMs + 60000;
          await this.redis.set(key, value, ttlMs);
        }
      }
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to persist circuit breaker state to Redis: ${error.message}`);
    }
  }

  /**
   * Load circuit breaker state from Redis on startup.
   * Restores any active circuit breakers that survived a restart.
   *
   * V137 FIX: Now correctly parses userId from Redis key to prevent
   * cross-user contamination. Old format keys (circuit-breaker:{symbol})
   * are cleaned up since they lack userId isolation.
   */
  private async _loadCircuitBreakerStateFromRedis(): Promise<void> {
    if (!this.redis) return;
    try {
      // ── V137: Clean up OLD format keys (circuit-breaker:{symbol}) ──
      // These lack userId and cause cross-user contamination.
      // Delete all old-format keys on startup.
      try {
        const oldKeys = await this.redis.scanKeys('circuit-breaker:*');
        let oldCleaned = 0;
        for (const oldKey of oldKeys) {
          // Skip new-format keys (circuit-breaker:v2:...)
          if (oldKey.startsWith('circuit-breaker:v2:')) continue;
          await this.redis.del(oldKey).catch(() => {});
          oldCleaned++;
        }
        if (oldCleaned > 0) {
          this.logger.log(`🛡️ V137: Cleaned up ${oldCleaned} old-format circuit breaker key(s) (missing userId)`);
        }
      } catch (cleanErr: any) {
        this.logger.warn(`🛡️ V137: Failed to clean up old circuit breaker keys: ${cleanErr.message}`);
      }

      // ── Load NEW format keys (circuit-breaker:v2:{userId}:{symbol}) ──
      const keys = await this.redis.scanKeys(`${this.CB_REDIS_PREFIX}*`);
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (!data) continue;
        try {
          const state = JSON.parse(data);
          // V137: Extract cbKey (userId:symbol) from Redis key
          // Key format: circuit-breaker:v2:{userId}:{symbol}
          // cbKey = userId:symbol (matches in-memory Map key)
          const cbKey = key.replace(this.CB_REDIS_PREFIX, '');
          const until = new Date(state.until);
          // Only restore if the circuit breaker hasn't expired yet
          if (until > new Date()) {
            this.circuitBreakerState.set(cbKey, {
              triggered: state.triggered,
              until,
              level: state.level,
              triggeredAt: new Date(state.triggeredAt),
              consecutiveTriggers: state.consecutiveTriggers,
            });
            this.logger.log(`🛡️ Restored circuit breaker for ${cbKey} from Redis (level ${state.level}, expires ${until.toISOString()})`);
          } else {
            // Expired — clean up from Redis
            await this.redis.del(key).catch(() => {});
          }
        } catch {
          // Malformed data — clean up
          await this.redis.del(key).catch(() => {});
        }
      }
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to load circuit breaker state from Redis: ${error.message}`);
    }
  }

  /**
   * Persist a single circuit breaker state update to Redis.
   *
   * V137 FIX: The `cbKey` parameter is the in-memory Map key in format
   * "userId:symbol" (e.g., "user123:BTC/USDT"). The Redis key is now
   * `circuit-breaker:v2:{userId}:{symbol}` to include userId and prevent
   * cross-user contamination on server restart.
   */
  private async _persistCircuitBreakerToRedis(cbKey: string): Promise<void> {
    if (!this.redis) return;
    try {
      const state = this.circuitBreakerState.get(cbKey);
      if (!state) return;

      // V137: cbKey format is "userId:symbol" — use directly as Redis key suffix
      const key = `${this.CB_REDIS_PREFIX}${cbKey}`;

      if (state.triggered && state.until > new Date()) {
        const remainingMs = state.until.getTime() - Date.now();
        const value = JSON.stringify({
          triggered: state.triggered,
          until: state.until.toISOString(),
          level: state.level,
          triggeredAt: state.triggeredAt.toISOString(),
          consecutiveTriggers: state.consecutiveTriggers,
        });
        const ttlMs = remainingMs + 60000;
        await this.redis.set(key, value, ttlMs);
      } else {
        // Circuit breaker expired or reset — remove from Redis
        await this.redis.del(key).catch(() => {});
      }
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to persist circuit breaker state for ${cbKey}: ${error.message}`);
    }
  }

  /**
   * Get current risk parameters for display
   */
  getRiskParameters() {
    return {
      maxPositionSizePercent: this.maxPositionSizePercent,
      maxOpenPositions: this.maxOpenPositions,
      executorMaxOpenPositions: this.executorMaxOpenPositions,  // V145: Per-source limit
      agentMaxOpenPositions: this.agentMaxOpenPositions,        // V145: Per-source limit
      maxDailyLossPercent: this.maxDailyLossPercent,
      minOrderSizeUSD: this.minOrderSizeUSD,
      maxOrderSizeUSD: this.maxOrderSizeUSD,
      stopLossDefault: this.stopLossDefault,
      circuitBreakerThresholdPercent: this.circuitBreakerThresholdPercent,
    };
  }

  // ── Private Helpers ──

  /**
   * Determine if an exchange name represents a test/demo/paper environment.
   * These exchanges use virtual funds and don't need real balance verification.
   *
   * FIX: Previously, only 'paper-trading' was recognized as a test exchange.
   * However, credentials stored in the DB can have names like 'binance_test',
   * 'alpaca_paper', 'kucoin_test', etc. — all of which represent simulated
   * environments with virtual balance. Without this fix, any exchange name
   * not found in CCXT (like 'binance_test') would cause the order to be
   * rejected with: "لا يمكن التحقق من الرصيد للبورصة" — blocking ALL trades.
   *
   * Recognized test exchange patterns:
   * - Exactly 'paper-trading' or 'paper' or 'demo' or 'sandbox' or 'simulation'
   * - Ends with '_test', '_paper', '_demo', '_sandbox', '_simulation' (e.g. 'binance_test', 'alpaca_paper')
   * - Contains 'testnet' (e.g. 'binance_testnet')
   *
   * NOTE: 'test' is intentionally EXCLUDED from exactMatches to prevent any
   * exchange literally named "test" from bypassing ALL balance checks.
   *
   * IMPORTANT: This method ONLY checks the exchange name string. For credentials
   * that have `testnet: true` but a regular exchange name (e.g., Binance Testnet
   * credentials stored as exchange='binance' with testnet=true), use
   * `_isSimulatedCredential()` instead — it checks BOTH the exchange name
   * AND the testnet flag on the credential object.
   */
  private _isTestExchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    const exactMatches = ['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'];
    if (exactMatches.includes(lower)) return true;
    const suffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
    if (suffixes.some(s => lower.endsWith(s))) return true;
    if (lower.includes('testnet')) return true;
    return false;
  }

  /**
   * V181: Pure paper/simulation detection — NO real broker connection.
   *
   * This method identifies accounts that are PURELY internal simulations
   * with no connection to any external broker or exchange. These are the
   * ONLY accounts that should bypass certain risk checks (balance, drawdown)
   * because they have no real execution path and no real market data.
   *
   * CRITICAL DISTINCTION from _isTestExchange():
   * - _isTestExchange() includes broker demo accounts (mt5_demo, binance_test, etc.)
   *   which connect to REAL brokers with REAL market data but virtual funds.
   * - _isPaperOnly() excludes broker demos because they MUST enforce risk checks
   *   to simulate realistic trading conditions. If risk checks are bypassed on
   *   a broker demo, the user won't discover risk limit violations until they
   *   switch to a live account — which defeats the purpose of demo trading.
   *
   * Examples:
   * - 'paper-trading' / 'paper' → TRUE (pure simulation)
   * - 'mt5_demo'               → FALSE (real MetaTrader broker, virtual funds)
   * - 'binance_test'           → FALSE (real Binance API, testnet funds)
   */
  private _isPaperOnly(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    return ['paper-trading', 'paper', 'sandbox', 'simulation'].includes(lower);
  }

  /**
   * V181: Check if the exchange is an MT5/MetaTrader variant.
   * MT5 accounts (both live and demo) need special handling because:
   * - They use MetaAPI Cloud SDK, not CCXT
   * - Balance verification must go through MetaAPI, not CCXT
   * - They have their own position sizing rules (lot-based)
   */
  private _isMT5Exchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    return ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'].includes(lower);
  }

  /**
   * CHECK 6: Trade Repetition Filter (V177 FIX #17)
   *
   * Prevents repetitive trading patterns:
   * 1. Same userId+symbol+direction within 30 minutes → block
   * 2. More than 5 trades on the same symbol per day → block
   * 3. More than 3 consecutive losses on the same symbol → 2-hour block
   */
  async checkTradeRepetitionFilter(command: OrderCommand): Promise<RiskCheckResult> {
    try {
      const { userId, symbol, side } = command;

      // ── Rule 1: Same direction lockout (30 min) ──
      // If user closed a position in this direction on this symbol
      // less than 30 minutes ago, block the same direction.
      const dirLockKey = `trade-rep:dir-lock:${userId}:${symbol}:${side}`;
      const dirLocked = await this.redis?.get(dirLockKey);
      if (dirLocked) {
        this.logger.warn(`🛡️ V177 Direction lockout: ${symbol} ${side} blocked for user ${userId} — same direction closed <30m ago`);
        return {
          allowed: false,
          reason: `تم إغلاق مركز ${side === 'BUY' ? 'شراء' : 'بيع'} على ${symbol} مؤخراً — انتظر 30 دقيقة قبل فتح مركز جديد بنفس الاتجاه.`,
          failedCheck: 'TRADE_REPETITION',
        };
      }

      // ── Rule 2: Daily symbol trade limit (max 5 per day) ──
      const dailyCountKey = `trade-rep:daily:${userId}:${symbol}`;
      const dailyCount = parseInt(await this.redis?.get(dailyCountKey) || '0', 10);
      if (dailyCount >= 5) {
        this.logger.warn(`🛡️ V177 Daily symbol limit: ${symbol} has ${dailyCount} trades today for user ${userId} — blocking`);
        return {
          allowed: false,
          reason: `لديك ${dailyCount} صفقات على ${symbol} اليوم (الحد: 5). تنويع أفضل من التكرار.`,
          failedCheck: 'TRADE_REPETITION',
        };
      }

      // ── Rule 3: Consecutive loss block (3 losses → 2-hour block) ──
      const consecLossKey = `trade-rep:consec-loss:${userId}:${symbol}`;
      const consecLosses = parseInt(await this.redis?.get(consecLossKey) || '0', 10);
      if (consecLosses >= 3) {
        this.logger.warn(`🛡️ V177 Consecutive loss block: ${symbol} has ${consecLosses} consecutive losses for user ${userId} — 2h block`);
        return {
          allowed: false,
          reason: `${consecLosses} خسائر متتالية على ${symbol} — تم حظر التداول عليه لمدة ساعتين لحماية رأس المال.`,
          failedCheck: 'TRADE_REPETITION',
        };
      }

      return { allowed: true };
    } catch (error: any) {
      // Non-critical — if Redis fails, allow the trade
      this.logger.warn(`🛡️ Trade repetition check failed: ${error.message} — allowing order`);
      return { allowed: true };
    }
  }

  /**
   * V181: Determine if a credential represents a PURE paper/simulation account.
   *
   * This is the CORRECT method to use when deciding whether to bypass risk checks.
   * It ONLY returns true for accounts with no real broker connection — meaning
   * pure internal simulations where balance/drawdown checks are meaningless.
   *
   * Broker demo accounts (mt5_demo, binance_test, testnet credentials) return FALSE
   * because they connect to real brokers and MUST enforce risk checks to simulate
   * realistic trading conditions. The whole point of a demo account is to practice
   * with realistic constraints — bypassing risk checks defeats this purpose.
   */
  private _isSimulatedCredential(credential: { exchange: string; testnet?: boolean } | null): boolean {
    if (!credential) return false;
    // Check 1: Exchange name indicates PURE paper/simulation (no broker)
    if (this._isPaperOnly(credential.exchange)) return true;
    // Check 2: The testnet FLAG with a generic 'demo'/'sandbox' exchange name
    // Note: Real broker testnet (e.g. Binance with testnet=true) is NOT paper-only
    if ((credential as any).testnet === true && this._isPaperOnly(credential.exchange)) return true;
    return false;
  }

  /**
   * Resolve the real CCXT exchange class name from a possibly test-prefixed name.
   * E.g. 'binance_test' → 'binance', 'alpaca_paper' → 'alpaca'
   * Returns undefined if no real exchange can be inferred.
   */
  private _resolveRealExchangeName(exchangeName: string): string | undefined {
    if (!exchangeName) return undefined;
    const suffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
    for (const suffix of suffixes) {
      if (exchangeName.toLowerCase().endsWith(suffix)) {
        return exchangeName.slice(0, -suffix.length);
      }
    }
    if (exchangeName.toLowerCase().includes('testnet')) {
      return exchangeName.replace(/testnet/i, '');
    }
    return undefined;
  }

  private async _estimatePortfolioValue(userId: string): Promise<number> {
    // ═══════════════════════════════════════════════════════════════
    // FIX: For paper-trading users, use AgentSettings.paperBalance
    // instead of the Portfolio table (which is often empty or stale).
    // Previously, _estimatePortfolioValue() would return 0 for paper
    // users with no Portfolio records, then fall back to summing open
    // positions' notional value — which could be $400K+ and completely
    // wrong as a "portfolio value". This caused the daily drawdown
    // check to calculate absurd percentages like 832%.
    // ═══════════════════════════════════════════════════════════════

    // Step 1: Check if user has paper-trading credentials (primary)
    const paperCredential = await this.prisma.exchangeCredential.findFirst({
      where: { userId, exchange: 'paper-trading', isValid: true },
    });

    if (paperCredential) {
      // V172d: paperBalance = free cash, equity = freeCash + lockedMargin + unrealizedPnL
      try {
        const settings = await this.prisma.agentSettings.findUnique({
          where: { userId },
          select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true, paperGoldLeverage: true },
        });
        const freeCash = settings ? Number(settings.paperBalance) : 10000;
        const openPositions = await this.prisma.position.findMany({
          where: { userId, status: 'OPEN', exchange: 'paper-trading' },
          select: { quantity: true, entryPrice: true, symbol: true },
        }).catch(() => []);
        let lockedMargin = 0;
        const { getSymbolMetadata, AssetClass } = require('../../../modules/trading/services/symbol-metadata');
        const cryptoLev = Number(settings?.paperCryptoLeverage) || 1;
        const forexLev = Number(settings?.paperForexLeverage) || 50;
        const goldLev = Number(settings?.paperGoldLeverage) || 20;
        for (const pos of openPositions) {
          const meta = getSymbolMetadata(pos.symbol);
          let leverage = cryptoLev;
          if (meta.assetClass === AssetClass.FOREX) leverage = forexLev;
          else if (meta.assetClass === AssetClass.COMMODITY) leverage = goldLev;
          const notional = Number(pos.quantity) * Number(pos.entryPrice);
          lockedMargin += leverage > 1 ? notional / leverage : notional;
        }
        const equity = freeCash + lockedMargin;
        return equity > 0 ? equity : 10000;
      } catch {
        return 10000;
      }
    }

    // Step 2: Real exchange user — use Portfolio table + open positions
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

  /**
   * Get paper-trading balance from AgentSettings.
   * Used by checkPositionSizeLimit() to cap order value for paper trading.
   */
  private async _getPaperBalance(userId: string): Promise<number> {
    try {
      const settings = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });
      if (settings && Number(settings.paperBalance) > 0) {
        return Number(settings.paperBalance);
      }
    } catch {}
    return 10000; // Default paper balance
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
