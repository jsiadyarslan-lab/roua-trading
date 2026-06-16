// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Unified Risk Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V219: CONSOLIDATION FIX — Merges THREE conflicting risk services into ONE:
//   - RiskGatekeeperService (7 pre-trade checks, circuit breaker, price sanity)
//   - RiskManagerService (position sizing, daily loss)
//   - RiskCalculatorService (agent risk assessment, R:R validation, kill switch)
//
// PROBLEM SOLVED:
// Previously, the same order could PASS the Gatekeeper and FAIL the RiskManager
// because the three services used DIFFERENT defaults:
//   maxPositionSizePercent: Gatekeeper=2%, RiskManager=20%, RiskCalculator=2%
//   Position counting: Gatekeeper=per-source, RiskManager=ALL, RiskCalculator=agent-only
//   Daily loss scope: Gatekeeper=per-exchange, RiskManager=ALL, RiskCalculator=combined
//   Portfolio valuation: Gatekeeper=own impl, others=PortfolioValuationService
//   STRATEGY_MIN_RR: Two copies that could drift out of sync
//
// Now there is ONE service, ONE set of defaults, ONE valuation method,
// ONE daily PnL method, ONE R:R table, and ONE risk score formula.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { PortfolioValuationService } from './portfolio-valuation.service';
import { RiskEventAuditService } from './risk-event-audit.service';
import { RiskCheckResult, OrderCommand } from '../events/order.events';
import { RiskAssessment, AgentConfig, StrategyType, EvaluatedSignal } from '../../../agents/autonomous-trader/types/agent.types';
import {
  getSymbolMetadata,
  calculatePositionSizeFromRisk,
  lotsToUnits,
  unitsToLots,
  roundLotSize,
  calculateMargin,
  calculateNotionalValue,
  AssetClass,
} from './symbol-metadata';
import * as ccxt from 'ccxt';

/**
 * SINGLE copy of strategy-specific minimum risk-reward ratios.
 * V-PHASE2: Updated after Phase 1+2 fixes.
 * V219: NOW THE ONLY COPY — Gatekeeper and RiskCalculator no longer have their own.
 */
const STRATEGY_MIN_RR: Record<string, number> = {
  dca: 1.5,              // V-PHASE2: was 0.4 — DCA strategy enforces minRiskRewardRatio=1.5
  grid: 1.2,             // V-PHASE2: was 0.8 — grid needs decent R:R
  mean_reversion: 1.0,   // V-PHASE2: was 0.8 — strategy produces 1.25:1 minimum
  scalping: 1.0,         // unchanged — 1.5x ATR TP / 1x ATR SL = 1.5:1
  vwap_rsi: 1.2,         // V-PHASE2: was 1.0 — strategy R:R is 1.67:1
  momentum_breakout: 1.2, // unchanged — 2:1 R:R
  swing: 1.5,            // unchanged — swing uses 2:1 (4x ATR TP / 2x ATR SL)
  // Agent enum variants (camelCase)
  [StrategyType.DCA]: 1.5,
  [StrategyType.MEAN_REVERSION]: 1.0,
  [StrategyType.SCALPING]: 1.0,
  [StrategyType.GRID]: 1.2,
  [StrategyType.VWAP_RSI]: 1.2,
  [StrategyType.SWING]: 1.5,
  [StrategyType.MOMENTUM_BREAKOUT]: 1.2,
};

@Injectable()
export class UnifiedRiskService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnifiedRiskService.name);

  // ── UNIFIED Configuration — ONE set of defaults ──
  // V219: Gatekeeper was 2%, RiskManager was 20% — NOW unified to 2%
  private maxPositionSizePercent: number;
  private maxOpenPositions: number;
  private executorMaxOpenPositions: number;
  private agentMaxOpenPositions: number;
  // V219: Daily loss is ALWAYS combined from ALL sources (V-PHASE3)
  private maxDailyLossPercent: number;
  private minOrderSizeUSD: number;
  private maxOrderSizeUSD: number;
  private stopLossDefault: number;
  private circuitBreakerThresholdPercent: number;
  private defaultStopLossPercent: number;
  private defaultTakeProfitPercent: number;
  private defaultRiskPerTradePercent: number;
  private maxOverallDrawdownPercent: number;

  // ── DB Settings Sync ──
  private lastSettingsSync = 0;
  private readonly SETTINGS_SYNC_INTERVAL = 30000;

  // ── Circuit Breaker State ──
  private readonly CB_BASE_COOLDOWN_MS = 60_000;
  private readonly CB_MAX_COOLDOWN_MS = 30 * 60_000;
  private readonly CB_REDIS_PREFIX = 'circuit-breaker:v2:';
  private readonly circuitBreakerState: Map<string, {
    triggered: boolean;
    until: Date;
    level: number;
    triggeredAt: Date;
    consecutiveTriggers: number;
  }> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly exchangeService: ExchangeService,
    private readonly portfolioValuation: PortfolioValuationService,
    private readonly riskEventAudit: RiskEventAuditService,
    @Optional() private readonly redis?: RedisService,
  ) {
    // ── UNIFIED defaults — NO MORE CONFLICTS ──
    this.maxPositionSizePercent = parseFloat(
      this.configService.get('RISK_MAX_POSITION_PERCENT', '2'),
    );
    this.maxOpenPositions = parseInt(
      this.configService.get('RISK_MAX_OPEN_POSITIONS', '20'), 10,
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
    this.defaultStopLossPercent = parseFloat(
      this.configService.get('RISK_DEFAULT_STOP_LOSS', '3'),
    );
    this.defaultTakeProfitPercent = parseFloat(
      this.configService.get('RISK_DEFAULT_TAKE_PROFIT', '6'),
    );
    this.defaultRiskPerTradePercent = parseFloat(
      this.configService.get('RISK_PER_TRADE_PERCENT', '1.5'),
    );
    this.maxOverallDrawdownPercent = parseFloat(
      this.configService.get('RISK_MAX_OVERALL_DRAWDOWN_PERCENT', '30'),
    );

    this.syncSettingsFromDB().catch((err) =>
      this.logger.warn(`syncSettingsFromDB failed at startup: ${err?.message || err}`),
    );

    this.logger.log('🛡️ UnifiedRiskService initialized — ONE risk service, ONE set of rules (V219)');
  }

  async onModuleInit() {
    const INIT_TIMEOUT_MS = 5_000;
    await Promise.race([
      this._loadCircuitBreakerStateFromRedis(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          this.logger.warn(`🛡️ Circuit breaker Redis load timed out — continuing with empty state`);
          resolve();
        }, INIT_TIMEOUT_MS),
      ),
    ]);
  }

  async onModuleDestroy() {
    await this._saveCircuitBreakerStateToRedis();
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API — PRE-TRADE VALIDATION (replaces Gatekeeper + RiskManager)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Run ALL risk checks for an order command.
   * V219: This is the ONLY risk gate — no more double-check in TradingService.
   * Checks are executed in order (fail-fast):
   *  1. enforceStopLoss          — Stop-loss MANDATORY + direction + R:R
   *  2. checkAutoTradingEnabled  — Global/per-user kill switch (from RiskCalculator)
   *  3. checkSufficientBalance   — User has enough funds
   *  4. checkPositionSizeLimit   — Per-source + global position count + % of portfolio
   *  5. checkDailyDrawdownLimit  — COMBINED daily loss from ALL sources (V-PHASE3)
   *  6. checkOverallDrawdownLimit — All-time drawdown cap
   *  7. checkCircuitBreakers     — Per-user circuit breaker
   *  8. checkTradeRepetition     — Direction lockout, daily symbol limit, consecutive losses
   *  9. checkPriceSanity         — Price deviation > 10%
   * 10. checkDuplicatePosition   — Same symbol+strategy block (from RiskCalculator)
   */
  async validateOrder(command: OrderCommand): Promise<RiskCheckResult> {
    await this.syncSettingsFromDB();

    this.logger.debug(
      `🛡️ [UNIFIED] Validating order: ${command.side} ${command.quantity} ${command.symbol}`,
    );

    // Check 1: Stop-loss enforcement + R:R
    const slCheck = await this.enforceStopLoss(command);
    if (!slCheck.allowed) return slCheck;

    // Check 2: Auto-trading kill switch
    const killSwitchCheck = await this.checkAutoTradingEnabled(command.userId);
    if (!killSwitchCheck.allowed) return killSwitchCheck;

    // Check 3: Sufficient balance
    const balanceCheck = await this.checkSufficientBalance(command);
    if (!balanceCheck.allowed) return balanceCheck;

    // Check 4: Position size limit (per-source + global + %)
    const sizeCheck = await this.checkPositionSizeLimit(command);
    if (!sizeCheck.allowed) return sizeCheck;

    // Check 5: Daily drawdown (COMBINED from ALL sources)
    const drawdownCheck = await this.checkDailyDrawdownLimit(command.userId, command.exchangeCredentialId);
    if (!drawdownCheck.allowed) return drawdownCheck;

    // Check 6: Overall drawdown
    const overallDrawdownCheck = await this.checkOverallDrawdownLimit(command.userId, command.exchangeCredentialId);
    if (!overallDrawdownCheck.allowed) return overallDrawdownCheck;

    // Check 7: Circuit breakers
    const circuitCheck = await this.checkCircuitBreakers(command.userId, command.symbol);
    if (!circuitCheck.allowed) return circuitCheck;

    // Check 8: Trade repetition filter
    const repetitionCheck = await this.checkTradeRepetitionFilter(command);
    if (!repetitionCheck.allowed) return repetitionCheck;

    // Check 9: Price sanity
    const sanityCheck = await this.checkPriceSanity(command);
    if (!sanityCheck.allowed) return sanityCheck;

    // Check 10: Duplicate position (same symbol+strategy)
    const dupCheck = await this.checkDuplicatePosition(command);
    if (!dupCheck.allowed) return dupCheck;

    // All checks passed — calculate risk score
    const riskScore = await this._calculateRiskScore(command);

    this.riskEventAudit.log({
      userId: command.userId,
      service: 'RiskGatekeeper' as any,  // V219: Uses 'RiskGatekeeper' enum value for compatibility; will be updated when schema adds 'UnifiedRisk'
      decision: 'ACCEPT',
      reason: 'All risk checks passed',
      symbol: command.symbol,
      source: command.source,
      riskScore,
    });

    return { allowed: true, riskScore };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API — AGENT RISK ASSESSMENT (replaces RiskCalculator.assessRisk)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Full risk assessment for the autonomous trader agent.
   * V219: Uses the SAME configuration and valuation as validateOrder().
   */
  async assessRisk(
    userId: string,
    signal: EvaluatedSignal,
    config: AgentConfig,
  ): Promise<RiskAssessment> {
    // Use UNIFIED portfolio valuation (not agent-only)
    const portfolioValue = await this._getPortfolioValue(userId);
    const dailyPnL = await this._getCombinedDailyPnL(userId);
    const dailyLossPercent = portfolioValue > 0
      ? (Math.abs(Math.min(0, dailyPnL)) / portfolioValue) * 100
      : 0;
    const openPositionsCount = await this._getOpenPositionsCount(userId);

    // Apply config overrides (from AgentConfig) or use unified defaults
    const maxPositionSizePercent = config.maxPositionSizePercent || this.maxPositionSizePercent;
    const maxDailyLossPercent = config.maxDailyLossPercent || this.maxDailyLossPercent;
    const maxOpenPositions = config.maxOpenPositions || this.agentMaxOpenPositions;
    const riskPerTradePercent = config.riskPerTradePercent || this.defaultRiskPerTradePercent;

    // Position sizing
    const positionSize = this._calculatePositionSize(
      portfolioValue, riskPerTradePercent, signal.entryPrice,
      signal.stopLoss, maxPositionSizePercent, signal.symbol,
    );

    // R:R ratio
    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
    const reward = Math.abs(signal.takeProfit - signal.entryPrice);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    // Risk score (normalized formula from RiskCalculator)
    const riskScore = this._calculateNormalizedRiskScore({
      positionSize, portfolioValue, maxPositionSizePercent,
      openPositionsCount, maxOpenPositions,
      dailyLossPercent, maxDailyLossPercent,
      riskRewardRatio, volatility: signal.metadata?.volatility,
    });

    // Validate all safety rules
    let canTrade = true;
    let reason: string | undefined;

    // RULE 1: Mandatory stop-loss
    if (!signal.stopLoss || signal.stopLoss <= 0) {
      canTrade = false;
      reason = 'وقف الخسارة إجباري — لا يمكن فتح مركز بدون وقف خسارة';
    }

    // RULE 2: Daily loss limit (COMBINED from all sources)
    if (dailyLossPercent >= maxDailyLossPercent) {
      canTrade = false;
      reason = `الخسارة اليومية (${dailyLossPercent.toFixed(1)}%) تجاوزت الحد (${maxDailyLossPercent}%) — توقف الوكيل تلقائياً`;
    }

    // RULE 3: Max open positions
    if (openPositionsCount >= maxOpenPositions) {
      canTrade = false;
      reason = `عدد المراكز المفتوحة (${openPositionsCount}) بلغ الحد الأقصى (${maxOpenPositions})`;
    }

    // RULE 4: Position size within limit
    const POSITION_SIZE_TOLERANCE = 0.01;
    const positionValuePercent = portfolioValue > 0
      ? (positionSize * signal.entryPrice / portfolioValue) * 100
      : 0;
    if (positionValuePercent > maxPositionSizePercent + POSITION_SIZE_TOLERANCE) {
      canTrade = false;
      reason = `حجم المركز (${positionValuePercent.toFixed(1)}%) يتجاوز الحد (${maxPositionSizePercent}%)`;
    }

    // RULE 5: R:R ratio — strategy-specific minimum (UNIFIED table)
    const strategyMinRR = STRATEGY_MIN_RR[signal.strategy] ?? 1.2;
    if (riskRewardRatio < strategyMinRR) {
      canTrade = false;
      reason = `نسبة المخاطرة للمكافأة (${riskRewardRatio.toFixed(2)}) أقل من الحد الأدنى لاستراتيجية ${signal.strategy} (${strategyMinRR})`;
    }

    // RULE 6: Duplicate position check
    const existingPosition = await this._hasOpenPosition(userId, signal.symbol);
    if (existingPosition && existingPosition.strategy === signal.strategy) {
      canTrade = false;
      reason = `يوجد مركز مفتوح بالفعل لـ ${signal.symbol} باستخدام نفس الاستراتيجية (${signal.strategy})`;
    }

    // RULE 7: Auto-trading kill switch
    const killSwitch = await this._checkAutoTradingEnabled(userId);
    if (!killSwitch.enabled) {
      canTrade = false;
      reason = killSwitch.reason;
    }

    return {
      canTrade, reason, positionSize,
      stopLoss: signal.stopLoss, takeProfit: signal.takeProfit,
      riskRewardRatio, riskScore, dailyPnL, dailyLossPercent,
      openPositionsCount, portfolioValue,
    };
  }

  /**
   * Check if daily loss limit has been reached.
   * V219: Uses COMBINED daily PnL from ALL sources (V-PHASE3).
   */
  async isDailyLimitReached(userId: string, maxDailyLossPercent?: number): Promise<boolean> {
    const limitPercent = maxDailyLossPercent || this.maxDailyLossPercent;

    // Bypass for paper-only users
    try {
      const realCredential = await this.prisma.exchangeCredential.findFirst({
        where: {
          userId, isValid: true,
          exchange: { not: 'paper-trading' },
          testnet: { not: true },
        },
      });
      if (!realCredential) return false;
    } catch { /* proceed with check */ }

    const dailyPnL = await this._getCombinedDailyPnL(userId);
    const portfolioValue = await this._getPortfolioValue(userId);
    if (portfolioValue <= 0 || dailyPnL >= 0) return false;

    const lossPercent = (Math.abs(dailyPnL) / portfolioValue) * 100;
    return lossPercent >= limitPercent;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API — POSITION SIZING (from RiskManager)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Calculate recommended position size based on risk percentage.
   * V219: Uses UNIFIED maxPositionSizePercent (was conflicting: 2% vs 20%).
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
    if (riskPerUnit <= 0) return { quantity: 0, riskAmount: 0 };

    if (symbol) {
      const result = calculatePositionSizeFromRisk(riskAmount, entryPrice, stopLossPrice, symbol);
      const maxPositionValue = portfolioValue * (this.maxPositionSizePercent / 100);
      let quantityUnits = result.quantityUnits;
      let quantityLots = result.quantityLots;

      if (result.notional > maxPositionValue) {
        quantityUnits = maxPositionValue / entryPrice;
        quantityLots = roundLotSize(unitsToLots(quantityUnits, symbol), symbol);
        quantityUnits = lotsToUnits(quantityLots, symbol);
      }

      return {
        quantity: Math.floor(quantityUnits * 1000000) / 1000000,
        riskAmount, lots: quantityLots,
        margin: calculateMargin(quantityUnits, entryPrice, symbol),
        notional: calculateNotionalValue(quantityUnits, entryPrice),
      };
    }

    const quantity = riskAmount / riskPerUnit;
    const maxPositionValue = portfolioValue * (this.maxPositionSizePercent / 100);
    const currentPositionValue = quantity * entryPrice;
    const finalQuantity = currentPositionValue > maxPositionValue
      ? maxPositionValue / entryPrice
      : quantity;

    return { quantity: Math.floor(finalQuantity * 1000000) / 1000000, riskAmount };
  }

  /**
   * Get default stop-loss and take-profit levels.
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
   * Get current risk parameters (UNIFIED — no more conflicts).
   */
  getRiskParameters() {
    return {
      maxPositionSizePercent: this.maxPositionSizePercent,
      maxOpenPositions: this.maxOpenPositions,
      executorMaxOpenPositions: this.executorMaxOpenPositions,
      agentMaxOpenPositions: this.agentMaxOpenPositions,
      maxDailyLossPercent: this.maxDailyLossPercent,
      minOrderSizeUSD: this.minOrderSizeUSD,
      maxOrderSizeUSD: this.maxOrderSizeUSD,
      stopLossDefault: this.stopLossDefault,
      circuitBreakerThresholdPercent: this.circuitBreakerThresholdPercent,
      defaultStopLossPercent: this.defaultStopLossPercent,
      defaultTakeProfitPercent: this.defaultTakeProfitPercent,
      defaultRiskPerTradePercent: this.defaultRiskPerTradePercent,
      maxOverallDrawdownPercent: this.maxOverallDrawdownPercent,
      strategyMinRR: STRATEGY_MIN_RR,
    };
  }

  /**
   * Get the unified STRATEGY_MIN_RR table.
   * V219: ONE copy — no more drift between Gatekeeper and RiskCalculator.
   */
  getStrategyMinRR(): Record<string, number> {
    return { ...STRATEGY_MIN_RR };
  }

  // ═══════════════════════════════════════════════════════════════════
  // INDIVIDUAL CHECKS — Used by validateOrder() and independently
  // ═══════════════════════════════════════════════════════════════════

  /** CHECK 1: Enforce Stop-Loss — MANDATORY */
  async enforceStopLoss(command: OrderCommand): Promise<RiskCheckResult> {
    if (!command.stopLoss || command.stopLoss <= 0) {
      return {
        allowed: false,
        reason: 'وقف الخسارة إجباري. لا يمكن تقديم أمر بدون وقف خسارة — هذا القانون الأول في منصة رؤى.',
        failedCheck: 'STOPLOSS_ENFORCEMENT',
      };
    }

    let referencePrice: number | undefined = command.price;
    if (!referencePrice || referencePrice <= 0) {
      try {
        const quote = await this.exchangeService.getQuote(command.symbol);
        if (quote && quote.price > 0) referencePrice = quote.price;
      } catch {
        return { allowed: true }; // Can't check direction — allow
      }
    }

    if (!referencePrice || referencePrice <= 0) return { allowed: true };

    // Direction validation
    if (command.side === 'BUY' && command.stopLoss >= referencePrice) {
      return { allowed: false, reason: 'وقف الخسارة لأمر الشراء يجب أن يكون أقل من سعر الدخول.', failedCheck: 'STOPLOGIC_ENFORCEMENT' };
    }
    if (command.side === 'SELL' && command.stopLoss <= referencePrice) {
      return { allowed: false, reason: 'وقف الخسارة لأمر البيع يجب أن يكون أعلى من سعر الدخول.', failedCheck: 'STOPLOGIC_ENFORCEMENT' };
    }

    // R:R ratio validation — UNIFIED table (V219: was two separate copies)
    if (command.takeProfit && command.takeProfit > 0 && referencePrice) {
      const slDistance = Math.abs(referencePrice - command.stopLoss);
      const tpDistance = Math.abs(command.takeProfit - referencePrice);
      if (slDistance > 0) {
        const riskRewardRatio = tpDistance / slDistance;
        const strategyKey = (command.strategy || command.source || '').toLowerCase();
        const minRR = STRATEGY_MIN_RR[strategyKey] || 1.2;
        if (riskRewardRatio < minRR) {
          return {
            allowed: false,
            reason: `نسبة المخاطرة/المكافأة (${riskRewardRatio.toFixed(2)}:1) أقل من الحد الأدنى للاستراتيجية ${strategyKey || 'الافتراضية'} (${minRR}:1).`,
            failedCheck: 'RISK_REWARD_RATIO',
          };
        }
      }
    }

    return { allowed: true };
  }

  /** CHECK 2: Auto-trading kill switch (from RiskCalculator — was missing in Gatekeeper) */
  async checkAutoTradingEnabled(userId: string): Promise<RiskCheckResult> {
    const result = await this._checkAutoTradingEnabled(userId);
    if (!result.enabled) {
      return { allowed: false, reason: result.reason, failedCheck: 'AUTO_TRADING_KILL_SWITCH' };
    }
    return { allowed: true };
  }

  /** CHECK 3: Sufficient Balance */
  async checkSufficientBalance(command: OrderCommand): Promise<RiskCheckResult> {
    try {
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: command.exchangeCredentialId },
      });

      if (!credential) {
        return { allowed: false, reason: 'بيانات الاعتماد غير موجودة.', failedCheck: 'BALANCE_CHECK' };
      }

      // Security: Verify credential ownership
      if (credential.userId !== command.userId) {
        this.logger.error(`🛡️ SECURITY: User ${command.userId} attempted credential ${command.exchangeCredentialId} owned by ${credential.userId}`);
        return { allowed: false, reason: 'بيانات الاعتماد لا تنتمي لحسابك.', failedCheck: 'CREDENTIAL_OWNERSHIP' };
      }

      if (!credential.isValid) {
        return { allowed: false, reason: 'بيانات الاعتماد غير صالحة — يرجى التحقق من مفتاح API.', failedCheck: 'BALANCE_CHECK' };
      }

      // Pure paper trading bypass
      if (this._isSimulatedCredential(credential)) {
        this.logger.debug(`🛡️ Paper-only credential balance check: BYPASSED`);
        return { allowed: true };
      }

      // MT5 accounts — skip CCXT, enforce value limits
      if (this._isMT5Exchange(credential.exchange)) {
        const orderValue = command.quantity * (command.price || 0);
        if (orderValue < this.minOrderSizeUSD) {
          return { allowed: false, reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) أقل من الحد الأدنى (${this.minOrderSizeUSD} USD).`, failedCheck: 'BALANCE_CHECK' };
        }
        if (orderValue > this.maxOrderSizeUSD) {
          return { allowed: false, reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) تتجاوز الحد الأقصى (${this.maxOrderSizeUSD} USD).`, failedCheck: 'BALANCE_CHECK' };
        }
        return { allowed: true };
      }

      // Check permissions
      const permissions = JSON.parse(credential.permissions || '["read"]');
      if (!permissions.includes('trade')) {
        return { allowed: false, reason: 'مفتاح API لا يملك صلاحية التداول.', failedCheck: 'BALANCE_CHECK' };
      }

      // Get current price
      let currentPrice = command.price;
      if (!currentPrice) {
        try {
          const quote = await this.exchangeService.getQuote(command.symbol);
          currentPrice = quote.price;
        } catch {
          return { allowed: false, reason: 'لا يمكن التحقق من سعر الصفقة — تم رفض الطلب لحماية رأس المال.', failedCheck: 'BALANCE_CHECK' };
        }
      }

      const orderValue = command.quantity * (currentPrice || 0);

      if (orderValue < this.minOrderSizeUSD) {
        return { allowed: false, reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) أقل من الحد الأدنى (${this.minOrderSizeUSD} USD).`, failedCheck: 'BALANCE_CHECK' };
      }
      if (orderValue > this.maxOrderSizeUSD) {
        return { allowed: false, reason: `قيمة الطلب (${orderValue.toFixed(2)} USD) تتجاوز الحد الأقصى (${this.maxOrderSizeUSD} USD).`, failedCheck: 'BALANCE_CHECK' };
      }

      // CCXT balance verification
      try {
        const { apiKey, apiSecret } = await this.credentialsService.decryptCredential(credential.id, command.userId);
        let ExchangeClass = (ccxt as any)[credential.exchange];
        if (!ExchangeClass) {
          const realName = this._resolveRealExchangeName(credential.exchange);
          if (realName && (ccxt as any)[realName]) ExchangeClass = (ccxt as any)[realName];
        }
        if (ExchangeClass) {
          const exchange = new ExchangeClass({ apiKey, secret: apiSecret, enableRateLimit: true });
          const balance = await exchange.fetchBalance();
          const quoteCurrency = command.symbol.split('/').pop() || 'USDT';
          const availableBalance = balance[quoteCurrency]?.free || 0;

          if (command.side === 'BUY' && availableBalance < orderValue) {
            return { allowed: false, reason: `رصيد غير كافي. المتاح: ${availableBalance.toFixed(2)} ${quoteCurrency}، المطلوب: ${orderValue.toFixed(2)} ${quoteCurrency}.`, failedCheck: 'BALANCE_CHECK' };
          }
          if (command.side === 'SELL') {
            const baseCurrency = command.symbol.split('/')[0] || '';
            const baseBalance = balance[baseCurrency]?.free || 0;
            if (baseBalance < command.quantity) {
              return { allowed: false, reason: `رصيد غير كافي من ${baseCurrency}. المتاح: ${baseBalance.toFixed(6)}، المطلوب: ${command.quantity}.`, failedCheck: 'BALANCE_CHECK' };
            }
          }
        } else {
          this.logger.warn(`🛡️ Exchange "${credential.exchange}" not found in CCXT — allowing (execution layer validates)`);
        }
      } catch (error: any) {
        const isDecryptError = error.message?.includes('decrypt') || error.message?.includes('initialization vector');
        if (isDecryptError) {
          return { allowed: false, reason: 'فشل فك تشفير بيانات الاعتماد — لا يمكن التحقق من الرصيد.', failedCheck: 'BALANCE_CHECK' };
        }
        return { allowed: false, reason: 'فشل التحقق من الرصيد — تم رفض الطلب لحماية رأس المال.', failedCheck: 'BALANCE_CHECK' };
      }

      return { allowed: true };
    } catch (error: any) {
      this.logger.error(`Balance check error: ${error.message}`);
      return { allowed: false, reason: 'فشل فحص الرصيد — تم رفض الطلب لحماية رأس المال.', failedCheck: 'BALANCE_CHECK' };
    }
  }

  /** CHECK 4: Position Size Limit — per-source + global + % of portfolio */
  async checkPositionSizeLimit(command: OrderCommand): Promise<RiskCheckResult> {
    try {
      const isPaperByFlag = command.isPaperTrading === true;
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: command.exchangeCredentialId },
      });
      const isSimulatedByCredential = this._isSimulatedCredential(credential);

      if (isPaperByFlag || isSimulatedByCredential) {
        // Paper trading path — per-source counting
        const orderSource = command.source || 'auto_paper';
        const isExecutor = ['smart_executor', 'auto_paper'].includes(orderSource);
        const perSourceLimit = isExecutor ? this.executorMaxOpenPositions : this.agentMaxOpenPositions;

        const sourcePositions = await this.prisma.position.count({
          where: {
            userId: command.userId, status: 'OPEN',
            source: isExecutor ? { in: ['smart_executor', 'auto_paper'] } : orderSource,
          },
        });

        if (sourcePositions >= perSourceLimit) {
          return { allowed: false, reason: `لديك ${sourcePositions} مركز مفتوح من ${isExecutor ? 'المنفذ' : 'الوكيل'} بالفعل (الحد: ${perSourceLimit}).`, failedCheck: 'POSITION_SIZE_LIMIT' };
        }

        const totalOpenPositions = await this.prisma.position.count({
          where: { userId: command.userId, status: 'OPEN' },
        });
        if (totalOpenPositions >= this.maxOpenPositions) {
          return { allowed: false, reason: `لديك ${totalOpenPositions} مركز مفتوح إجمالاً (الحد العام: ${this.maxOpenPositions}).`, failedCheck: 'POSITION_SIZE_LIMIT' };
        }

        // Paper margin check
        try {
          const settings = await this.prisma.agentSettings.findUnique({
            where: { userId: command.userId },
            select: { paperBalance: true, paperCryptoLeverage: true, paperForexLeverage: true },
          });
          const paperBalance = settings?.paperBalance ? Number(settings.paperBalance) : 0;
          const cryptoLev = settings?.paperCryptoLeverage ? Number(settings.paperCryptoLeverage) : 1;
          const forexLev = settings?.paperForexLeverage ? Number(settings.paperForexLeverage) : 50;

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

          const newNotional = Math.abs((command.quantity || 0) * (command.price || 0));
          if (newNotional > 10) {
            const symIsForex = (command.symbol || '').includes('/') && !(command.symbol || '').match(/USDT|BTC|ETH|SOL|BNB/i);
            const newMargin = symIsForex ? newNotional / forexLev : (cryptoLev > 1 ? newNotional / cryptoLev : newNotional);
            if ((currentUsed + newMargin) > paperBalance * 1.02) {
              const available = Math.max(0, paperBalance - currentUsed);
              return { allowed: false, reason: `هامش الورق غير كافٍ. المتاح: $${available.toFixed(0)}، مطلوب: $${newMargin.toFixed(0)}.`, failedCheck: 'PAPER_MARGIN_CHECK' };
            }
          }
        } catch { /* non-fatal */ }

        // V219: UNIFIED position size % check — same maxPositionSizePercent for ALL
        const paperBalance = await this._getPaperBalance(command.userId) || 0;
        const orderValue = Math.abs((command.quantity || 0) * (command.price || 0));
        if (orderValue > 0) {
          const positionPercent = (orderValue / paperBalance) * 100;
          if (positionPercent > this.maxPositionSizePercent) {
            return { allowed: false, reason: `حجم المركز (${positionPercent.toFixed(1)}% من المحفظة) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%).`, failedCheck: 'POSITION_SIZE_LIMIT' };
          }
        }

        return { allowed: true };
      }

      // Real trading path — same per-source counting
      const orderSource = command.source || 'user_manual';
      const isExecutor = ['smart_executor', 'auto_paper'].includes(orderSource);
      const perSourceLimit = isExecutor ? this.executorMaxOpenPositions : this.agentMaxOpenPositions;

      const sourcePositions = await this.prisma.position.count({
        where: {
          userId: command.userId, status: 'OPEN',
          source: isExecutor ? { in: ['smart_executor', 'auto_paper'] } : orderSource,
        },
      });
      if (sourcePositions >= perSourceLimit) {
        return { allowed: false, reason: `لديك ${sourcePositions} مركز مفتوح من ${isExecutor ? 'المنفذ' : 'الوكيل'} بالفعل (الحد: ${perSourceLimit}).`, failedCheck: 'POSITION_SIZE_LIMIT' };
      }

      const openPositions = await this.prisma.position.count({
        where: { userId: command.userId, status: 'OPEN' },
      });
      if (openPositions >= this.maxOpenPositions) {
        return { allowed: false, reason: `لديك ${openPositions} مركز مفتوح إجمالاً (الحد العام: ${this.maxOpenPositions}).`, failedCheck: 'POSITION_SIZE_LIMIT' };
      }

      // V219: UNIFIED portfolio valuation via PortfolioValuationService
      let currentPrice = command.price;
      if (!currentPrice) {
        try {
          const quote = await this.exchangeService.getQuote(command.symbol);
          currentPrice = quote.price;
        } catch {
          return { allowed: false, reason: 'Price unavailable', failedCheck: 'POSITION_SIZE_LIMIT' };
        }
      }

      const orderValue = command.quantity * (currentPrice || 0);
      const portfolioValue = await this._getPortfolioValue(command.userId);

      if (portfolioValue > 0) {
        const positionPercent = (orderValue / portfolioValue) * 100;
        // V219: Uses UNIFIED maxPositionSizePercent (was 2% in Gatekeeper vs 20% in RiskManager)
        if (positionPercent > this.maxPositionSizePercent) {
          return { allowed: false, reason: `حجم المركز (${positionPercent.toFixed(1)}% من المحفظة) يتجاوز الحد الأقصى (${this.maxPositionSizePercent}%).`, failedCheck: 'POSITION_SIZE_LIMIT' };
        }
      }

      return { allowed: true };
    } catch (error: any) {
      this.logger.error(`Position size check error: ${error.message}`);
      return { allowed: false, reason: 'Cannot verify position size limit', failedCheck: 'POSITION_SIZE_LIMIT' };
    }
  }

  /** CHECK 5: Daily Drawdown — V219: COMBINED from ALL sources (no more per-exchange only) */
  async checkDailyDrawdownLimit(userId: string, exchangeCredentialId?: string): Promise<RiskCheckResult> {
    try {
      // Paper-only bypass
      if (exchangeCredentialId) {
        const credential = await this.prisma.exchangeCredential.findUnique({ where: { id: exchangeCredentialId } });
        if (this._isSimulatedCredential(credential)) return { allowed: true };
      } else {
        const realCredential = await this.prisma.exchangeCredential.findFirst({
          where: { userId, isValid: true, exchange: { not: 'paper-trading' }, testnet: { not: true } },
        });
        if (!realCredential) return { allowed: true };
      }

      // V219: ALWAYS use COMBINED daily PnL from ALL sources
      // Previously: Gatekeeper checked per-exchange only, RiskManager checked ALL
      // This meant losses on Binance didn't count against Alpaca's limit in Gatekeeper
      const dailyPnL = await this._getCombinedDailyPnL(userId);

      if (dailyPnL < 0) {
        const portfolioValue = await this._getPortfolioValue(userId);
        if (portfolioValue > 0) {
          const lossPercent = (Math.abs(dailyPnL) / portfolioValue) * 100;
          if (lossPercent >= this.maxDailyLossPercent) {
            return {
              allowed: false,
              reason: `خسائرك اليومية (${lossPercent.toFixed(1)}%) تجاوزت الحد الأقصى (${this.maxDailyLossPercent}%). توقف عن التداول ليومك.`,
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

  /** CHECK 6: Overall Drawdown Limit */
  async checkOverallDrawdownLimit(userId: string, exchangeCredentialId?: string): Promise<RiskCheckResult> {
    try {
      if (exchangeCredentialId) {
        const credential = await this.prisma.exchangeCredential.findUnique({ where: { id: exchangeCredentialId } });
        if (this._isSimulatedCredential(credential)) return { allowed: true };
      }

      const allTrades = await this.prisma.trade.findMany({
        where: { userId, type: { in: ['EXIT', 'PARTIAL_EXIT'] } },
        select: { pnl: true },
      });
      const totalPnL = allTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);

      if (totalPnL < 0) {
        const portfolioValue = await this._getPortfolioValue(userId);
        if (portfolioValue > 0) {
          const originalValue = portfolioValue + Math.abs(totalPnL);
          const overallLossPercent = (Math.abs(totalPnL) / originalValue) * 100;
          if (overallLossPercent >= this.maxOverallDrawdownPercent) {
            return {
              allowed: false,
              reason: `إجمالي خسائرك (${overallLossPercent.toFixed(1)}%) تجاوز الحد الأقصى الكلي (${this.maxOverallDrawdownPercent}%).`,
              failedCheck: 'OVERALL_DRAWDOWN',
            };
          }
        }
      }
      return { allowed: true };
    } catch (err: any) {
      this.logger.warn(`Overall drawdown check failed: ${err.message}`);
      return { allowed: true }; // Non-fatal
    }
  }

  /** CHECK 7: Circuit Breakers */
  async checkCircuitBreakers(userId: string, symbol: string): Promise<RiskCheckResult> {
    const cbKey = `${userId}:${symbol}`;
    const state = this.circuitBreakerState.get(cbKey);

    if (state && state.triggered && state.until > new Date()) {
      const remainingMs = state.until.getTime() - Date.now();
      const timeStr = remainingMs < 60000 ? `${Math.ceil(remainingMs / 1000)} ثانية` : `${Math.ceil(remainingMs / 60000)} دقيقة`;
      return { allowed: false, reason: `تداول ${symbol} متوقف مؤقتاً (مستوى ${state.level}). يُستأنف بعد ${timeStr}.`, failedCheck: 'CIRCUIT_BREAKER' };
    }

    if (state && state.triggered && state.until <= new Date()) {
      try {
        const quote = await this.exchangeService.getQuote(symbol);
        if (quote && Math.abs(quote.changePercent) <= this.circuitBreakerThresholdPercent) {
          this.circuitBreakerState.delete(cbKey);
          this._persistCircuitBreakerToRedis(cbKey);
        } else {
          const newLevel = state.level + 1;
          const cooldownMs = Math.min(this.CB_BASE_COOLDOWN_MS * Math.pow(2, newLevel - 1), this.CB_MAX_COOLDOWN_MS);
          this.circuitBreakerState.set(cbKey, { triggered: true, until: new Date(Date.now() + cooldownMs), level: newLevel, triggeredAt: state.triggeredAt, consecutiveTriggers: state.consecutiveTriggers + 1 });
          this._persistCircuitBreakerToRedis(cbKey);
          return { allowed: false, reason: `تقلب شديد مستمر في ${symbol} (مستوى ${newLevel}).`, failedCheck: 'CIRCUIT_BREAKER' };
        }
      } catch {
        this.circuitBreakerState.delete(cbKey);
        this._persistCircuitBreakerToRedis(cbKey);
      }
    }

    try {
      const quote = await this.exchangeService.getQuote(symbol);
      if (quote && Math.abs(quote.changePercent) > this.circuitBreakerThresholdPercent) {
        const previousState = this.circuitBreakerState.get(cbKey);
        const level = previousState ? previousState.level + 1 : 1;
        const consecutiveTriggers = previousState ? previousState.consecutiveTriggers + 1 : 1;
        const cooldownMs = Math.min(this.CB_BASE_COOLDOWN_MS * Math.pow(2, level - 1), this.CB_MAX_COOLDOWN_MS);
        this.circuitBreakerState.set(cbKey, { triggered: true, until: new Date(Date.now() + cooldownMs), level, triggeredAt: new Date(), consecutiveTriggers });
        this._persistCircuitBreakerToRedis(cbKey);
        const cooldownStr = cooldownMs < 60000 ? `${Math.round(cooldownMs / 1000)} ثانية` : `${Math.round(cooldownMs / 60000)} دقيقة`;
        return { allowed: false, reason: `تقلب شديد في ${symbol} (${quote.changePercent.toFixed(1)}%). التداول متوقف لمدة ${cooldownStr} (مستوى ${level}).`, failedCheck: 'CIRCUIT_BREAKER' };
      }
    } catch { /* allow */ }

    return { allowed: true };
  }

  /** CHECK 8: Trade Repetition Filter + V222 DB Cooldown */
  async checkTradeRepetitionFilter(command: OrderCommand): Promise<RiskCheckResult> {
    try {
      const { userId, symbol, side } = command;

      // ═══════════════════════════════════════════════════════════════════
      // V222 BULLETPROOF: DB-level cooldown — checked FIRST, before Redis.
      // This check is 100% reliable regardless of Redis availability.
      // If a position was CLOSED on this symbol within the last 15 min,
      // block ALL new positions (both directions, all sources).
      // ═══════════════════════════════════════════════════════════════════
      const COOLDOWN_MINUTES = 15;
      const recentlyClosed = await this.prisma.position.findFirst({
        where: {
          userId,
          symbol,
          status: { in: ['CLOSED', 'LIQUIDATED'] },
          closedAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000) },
        },
        orderBy: { closedAt: 'desc' },
      });
      if (recentlyClosed) {
        const closedAgo = Math.round((Date.now() - new Date(recentlyClosed.closedAt!).getTime()) / 60000);
        this.logger.warn(
          `🛡️ V222 RISK-COOLDOWN: Blocked ${side} on ${symbol} — position closed ${closedAgo} min ago`
        );
        return {
          allowed: false,
          reason: `تم إغلاق مركز على ${symbol} قبل ${closedAgo} دقيقة — انتظر ${COOLDOWN_MINUTES - closedAgo} دقيقة`,
          failedCheck: 'TRADE_REPETITION',
        };
      }

      // V221 FIX: Symbol-level lockout — blocks BOTH directions for 15 minutes.
      // Prevents flip-flop pattern: BUY → SL → SELL immediately → SL → BUY ...
      const symbolLockKey = `trade-rep:symbol-lock:${userId}:${symbol}`;
      const symbolLocked = await this.redis?.get(symbolLockKey);
      if (symbolLocked) {
        return { allowed: false, reason: `تم إغلاق مركز على ${symbol} مؤخراً — انتظر 15 دقيقة قبل فتح مركز جديد.`, failedCheck: 'TRADE_REPETITION' };
      }

      // Direction lockout (30 min) — same direction only
      const dirLockKey = `trade-rep:dir-lock:${userId}:${symbol}:${side}`;
      const dirLocked = await this.redis?.get(dirLockKey);
      if (dirLocked) {
        return { allowed: false, reason: `تم إغلاق مركز ${side === 'BUY' ? 'شراء' : 'بيع'} على ${symbol} مؤخراً — انتظر 30 دقيقة.`, failedCheck: 'TRADE_REPETITION' };
      }

      // Daily symbol limit (max 5)
      const dailyCountKey = `trade-rep:daily:${userId}:${symbol}`;
      const dailyCount = parseInt(await this.redis?.get(dailyCountKey) || '0', 10);
      if (dailyCount >= 5) {
        return { allowed: false, reason: `لديك ${dailyCount} صفقات على ${symbol} اليوم (الحد: 5).`, failedCheck: 'TRADE_REPETITION' };
      }

      // Consecutive loss block (3 → 2h)
      const consecLossKey = `trade-rep:consec-loss:${userId}:${symbol}`;
      const consecLosses = parseInt(await this.redis?.get(consecLossKey) || '0', 10);
      if (consecLosses >= 3) {
        return { allowed: false, reason: `${consecLosses} خسائر متتالية على ${symbol} — حظر لمدة ساعتين.`, failedCheck: 'TRADE_REPETITION' };
      }

      return { allowed: true };
    } catch (err: any) {
      // V222 FIX: FAIL-CLOSED — if the DB cooldown check fails, BLOCK the trade.
      // Previously this was fail-open (return allowed: true), meaning if Redis
      // or DB had an error, the trade would go through — enabling flip-flop.
      // Now: if we can't verify the symbol is safe, we block it.
      this.logger.error(`V222 RISK-COOLDOWN check failed: ${err.message} — BLOCKING trade for safety`);
      return {
        allowed: false,
        reason: `فشل فحص التكرار — تم حظر الصفقة احتياطياً`,
        failedCheck: 'TRADE_REPETITION',
      };
    }
  }

  /** CHECK 9: Price Sanity */
  async checkPriceSanity(command: OrderCommand): Promise<RiskCheckResult> {
    if (command.isPaperTrading) return { allowed: true };

    let orderPrice = command.price;
    if (!orderPrice || orderPrice <= 0) {
      try {
        const quote = await this.exchangeService.getQuote(command.symbol);
        orderPrice = quote?.price;
      } catch { return { allowed: true }; }
    }
    if (!orderPrice || orderPrice <= 0) return { allowed: true };

    try {
      const sanityKey = `price-sanity:last:${command.symbol}`;
      const raw = this.redis ? await this.redis.get(sanityKey) : null;
      const lastKnownPrice = raw ? parseFloat(raw) : null;

      if (lastKnownPrice && lastKnownPrice > 0) {
        const deviation = Math.abs(orderPrice - lastKnownPrice) / lastKnownPrice;
        if (deviation > 0.10) {
          return { allowed: false, reason: `سعر ${command.symbol} يختلف بنسبة ${(deviation * 100).toFixed(1)}% عن آخر سعر معروف.`, failedCheck: 'PRICE_SANITY' };
        }
      }

      if (this.redis) {
        await this.redis.set(sanityKey, orderPrice.toString(), 300000);
      }
    } catch { /* allow */ }

    return { allowed: true };
  }

  /** CHECK 10: Duplicate Position — block same symbol regardless of direction/source */
  async checkDuplicatePosition(command: OrderCommand): Promise<RiskCheckResult> {
    if (!command.strategy && !command.source) return { allowed: true };

    try {
      const existingPosition = await this.prisma.position.findFirst({
        where: { userId: command.userId, symbol: command.symbol, status: 'OPEN' },
      });

      if (existingPosition) {
        // V221 FIX: Block ALL positions on a symbol that already has one open.
        // Previously only blocked same strategy/source, allowing opposite-direction
        // hedging (BUY+SELL on same symbol from different sources) which burned fees
        // while positions cancelled each other's P&L.
        if (existingPosition.side !== command.side) {
          return { allowed: false, reason: `يوجد مركز ${existingPosition.side} مفتوح لـ ${command.symbol} — لا يمكن فتح مركز معاكس على نفس الزوج`, failedCheck: 'DUPLICATE_POSITION' };
        }
        // Same direction — check if same source/strategy
        const existingStrategy = (existingPosition as any).strategy || existingPosition.source || '';
        const newStrategy = command.strategy || command.source || '';
        if (existingStrategy === newStrategy) {
          return { allowed: false, reason: `يوجد مركز مفتوح بالفعل لـ ${command.symbol} باستخدام نفس الاستراتيجية (${newStrategy}).`, failedCheck: 'DUPLICATE_POSITION' };
        }
        // Same direction, different source — also block (duplicate exposure)
        return { allowed: false, reason: `يوجد مركز ${existingPosition.side} مفتوح لـ ${command.symbol} من ${existingPosition.source} — لا تكرار`, failedCheck: 'DUPLICATE_POSITION' };
      }
    } catch { /* allow */ }

    return { allowed: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Settings Sync (UNIFIED from all 3 services)
  // ═══════════════════════════════════════════════════════════════════

  private async syncSettingsFromDB(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsSync < this.SETTINGS_SYNC_INTERVAL) return;
    this.lastSettingsSync = now;

    if (!this.prisma?.isAvailable?.()) return;

    try {
      const settings = await this.prisma.setting.findMany({
        where: { key: { in: ['riskConfig', 'botConfig', 'AUTO_TRADING_ENABLED', 'agentExecutorConfig'] } },
      });
      const settingsMap: Record<string, any> = {};
      for (const s of settings) {
        try { settingsMap[s.key] = JSON.parse(s.value); } catch { settingsMap[s.key] = s.value; }
      }

      const riskConfig = settingsMap.riskConfig;
      if (riskConfig) {
        if (riskConfig.maxDrawdown) this.maxDailyLossPercent = parseFloat(riskConfig.maxDrawdown);
        if (riskConfig.maxOpenPositions) {
          let val = parseInt(riskConfig.maxOpenPositions, 10);
          // V144: Auto-migrate stale maxOpenPositions <= 5
          if (val <= 5) {
            val = parseInt(this.configService.get('RISK_MAX_OPEN_POSITIONS', '20'), 10);
            this.logger.warn(`🛡️ V144: Auto-upgrading maxOpenPositions from ${riskConfig.maxOpenPositions} to ${val}`);
            this.prisma.setting.upsert({
              where: { key: 'riskConfig' },
              update: { value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(val) }) },
              create: { key: 'riskConfig', value: JSON.stringify({ ...riskConfig, maxOpenPositions: String(val) }) },
            }).catch(() => {});
          }
          this.maxOpenPositions = val;
        }
        if (riskConfig.stopLossDefault) {
          this.stopLossDefault = parseFloat(riskConfig.stopLossDefault);
          this.defaultStopLossPercent = parseFloat(riskConfig.stopLossDefault);
        }
        if (riskConfig.circuitBreakerThreshold) this.circuitBreakerThresholdPercent = parseFloat(riskConfig.circuitBreakerThreshold);
        if (riskConfig.takeProfitDefault) this.defaultTakeProfitPercent = parseFloat(riskConfig.takeProfitDefault);

        // V219: UNIFIED position size calculation
        // Previously RiskManager used riskPerTrade * 3 (up to 30%), Gatekeeper used env var.
        // Now: riskPerTrade * 3 capped at 30% is applied to the UNIFIED maxPositionSizePercent
        if (riskConfig.riskPerTrade) {
          const riskPct = parseFloat(riskConfig.riskPerTrade);
          this.maxPositionSizePercent = Math.min(30, riskPct * 3);
          this.defaultRiskPerTradePercent = riskPct;
        }
      }

      const botConfig = settingsMap.botConfig;
      if (botConfig?.maxPositionSize) this.maxOrderSizeUSD = parseFloat(botConfig.maxPositionSize);

      const agentExecConfig = settingsMap.agentExecutorConfig;
      if (agentExecConfig) {
        const execMax = parseInt(agentExecConfig.executorMaxOpenPositions || '5', 10);
        const agentMax = parseInt(agentExecConfig.agentMaxOpenPositions || '5', 10);
        this.executorMaxOpenPositions = execMax;
        this.agentMaxOpenPositions = agentMax;

        if (!settingsMap.riskConfig?.maxOpenPositions) {
          const impliedGlobal = execMax + agentMax;
          if (this.maxOpenPositions < impliedGlobal) {
            this.logger.warn(`🛡️ Global maxOpenPositions (${this.maxOpenPositions}) < executor+agent total (${impliedGlobal}). Consider increasing.`);
          }
        }
      }

      this.logger.debug(`🛡️ [UNIFIED] Risk parameters synced — maxSize=${this.maxPositionSizePercent}%, maxOpen=${this.maxOpenPositions}, dailyLoss=${this.maxDailyLossPercent}%`);
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to sync settings: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Unified Valuation & PnL (NO MORE FORMULA DRIFT)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * V219: UNIFIED portfolio valuation via PortfolioValuationService.
   * Previously: Gatekeeper had its OWN implementation, others used V218 unified service.
   * Now: ALL use the same service — no formula drift possible.
   */
  private async _getPortfolioValue(userId: string): Promise<number> {
    try {
      const valuation = await this.portfolioValuation.autoDetectValuation(userId);
      return valuation.totalValue;
    } catch (error: any) {
      const defaultBalance = parseFloat(this.configService.get('DEFAULT_PAPER_BALANCE', '10000')) || 10000;
      this.logger.warn(`🛡️ PortfolioValuationService failed for ${userId}: ${error.message} — using default: $${defaultBalance}`);
      return defaultBalance;
    }
  }

  /**
   * V219: UNIFIED combined daily PnL from ALL sources.
   * Previously: Gatekeeper checked per-exchange, RiskManager checked ALL, RiskCalculator checked ALL.
   * Now: ONE method, ALWAYS combined — prevents 10% combined daily loss.
   */
  private async _getCombinedDailyPnL(userId: string): Promise<number> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const trades = await this.prisma.trade.findMany({
        where: { userId, executedAt: { gte: todayStart }, type: { in: ['EXIT', 'PARTIAL_EXIT'] }, pnl: { not: null } },
      });
      return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    } catch { return 0; }
  }

  private async _getPaperBalance(userId: string): Promise<number> {
    try {
      const settings = await this.prisma.agentSettings.findUnique({ where: { userId } });
      if (settings && Number(settings.paperBalance) > 0) return Number(settings.paperBalance);
    } catch {}
    return 10000;
  }

  private async _getOpenPositionsCount(userId: string): Promise<number> {
    try {
      return await this.prisma.position.count({ where: { userId, status: 'OPEN', source: 'agent' } });
    } catch { return 0; }
  }

  private async _hasOpenPosition(userId: string, symbol: string): Promise<any> {
    try {
      return await this.prisma.position.findFirst({ where: { userId, symbol, status: 'OPEN' } });
    } catch { return null; }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Risk Score & Position Sizing
  // ═══════════════════════════════════════════════════════════════════

  /**
   * V219: UNIFIED risk score for validateOrder().
   * Uses the NORMALIZED formula from RiskCalculator (proportional to limits).
   * Previously: Gatekeeper and RiskManager used raw multipliers.
   */
  private async _calculateRiskScore(command: OrderCommand): Promise<number> {
    const portfolioValue = await this._getPortfolioValue(command.userId);
    const dailyPnL = await this._getCombinedDailyPnL(command.userId);
    const dailyLossPercent = portfolioValue > 0 ? (Math.abs(Math.min(0, dailyPnL)) / portfolioValue) * 100 : 0;
    const openPositions = await this.prisma.position.count({ where: { userId: command.userId, status: 'OPEN' } });

    let currentPrice = command.price || 0;
    if (!currentPrice) {
      try {
        const quote = await this.exchangeService.getQuote(command.symbol);
        currentPrice = quote.price;
      } catch {}
    }
    const orderValue = command.quantity * (currentPrice || 0);
    const positionPercent = portfolioValue > 0 ? (orderValue / portfolioValue) * 100 : 0;

    return this._calculateNormalizedRiskScore({
      positionSize: orderValue, portfolioValue, maxPositionSizePercent: this.maxPositionSizePercent,
      openPositionsCount: openPositions, maxOpenPositions: this.maxOpenPositions,
      dailyLossPercent, maxDailyLossPercent: this.maxDailyLossPercent,
      riskRewardRatio: 0, // Not available in OrderCommand context
    });
  }

  /**
   * Normalized risk score formula (from RiskCalculator — proportional to limits).
   * This is better than the raw multiplier formula because:
   * - A position at 50% of limit gets 50% of the score contribution
   * - A position at 100% of limit gets 100% of the score contribution
   * vs. raw multipliers where absolute values don't account for limit scaling.
   */
  private _calculateNormalizedRiskScore(params: {
    positionSize: number; portfolioValue: number; maxPositionSizePercent: number;
    openPositionsCount: number; maxOpenPositions: number;
    dailyLossPercent: number; maxDailyLossPercent: number;
    riskRewardRatio: number; volatility?: string;
  }): number {
    let score = 0;

    // Position size relative to limit (0-30 points)
    if (params.portfolioValue > 0) {
      const positionPercent = (params.positionSize / params.portfolioValue) * 100;
      score += Math.min(30, (positionPercent / params.maxPositionSizePercent) * 30);
    }

    // Open positions ratio (0-25 points)
    score += Math.min(25, (params.openPositionsCount / Math.max(1, params.maxOpenPositions)) * 25);

    // Daily loss contribution (0-30 points)
    score += Math.min(30, (params.dailyLossPercent / Math.max(1, params.maxDailyLossPercent)) * 30);

    // R:R ratio penalty (0-15 points)
    if (params.riskRewardRatio > 0) {
      if (params.riskRewardRatio < 2.0) score += 15;
      else if (params.riskRewardRatio < 3.0) score += 8;
    }

    // Volatility bonus
    if (params.volatility === 'EXTREME') score += 15;
    else if (params.volatility === 'HIGH') score += 8;

    return Math.min(100, Math.round(score));
  }

  private _calculatePositionSize(
    portfolioValue: number, riskPerTradePercent: number,
    entryPrice: number, stopLoss: number,
    maxPositionSizePercent?: number, symbol?: string,
  ): number {
    if (portfolioValue <= 0 || entryPrice <= 0 || stopLoss <= 0) return 0;

    const maxSizePercent = maxPositionSizePercent || this.maxPositionSizePercent;
    const riskAmount = portfolioValue * (riskPerTradePercent / 100);
    const priceRisk = Math.abs(entryPrice - stopLoss);
    if (priceRisk === 0) return 0;

    if (symbol) {
      const result = calculatePositionSizeFromRisk(riskAmount, entryPrice, stopLoss, symbol);
      const maxPositionValue = portfolioValue * (maxSizePercent / 100);
      let quantityUnits = result.quantityUnits;
      let quantityLots = result.quantityLots;

      if (result.notional > maxPositionValue) {
        quantityUnits = maxPositionValue / entryPrice;
        quantityLots = roundLotSize(unitsToLots(quantityUnits, symbol), symbol);
        quantityUnits = lotsToUnits(quantityLots, symbol);
      }
      return parseFloat(quantityUnits.toFixed(8));
    }

    let quantity = riskAmount / priceRisk;
    const maxPositionValue = portfolioValue * (maxSizePercent / 100);
    if (quantity * entryPrice > maxPositionValue) {
      quantity = maxPositionValue / entryPrice;
    }
    return parseFloat(quantity.toFixed(8));
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Auto-Trading Kill Switch
  // ═══════════════════════════════════════════════════════════════════

  private async _checkAutoTradingEnabled(userId: string): Promise<{ enabled: boolean; reason?: string }> {
    try {
      const dbSetting = await this.prisma.setting.findUnique({ where: { key: 'AUTO_TRADING_ENABLED' } });
      const globalEnabled = dbSetting ? JSON.parse(dbSetting.value) : this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
      if (!globalEnabled) {
        return { enabled: false, reason: 'التداول الذاتي معطّل على مستوى النظام — تواصل مع الإدارة' };
      }

      const userSettings = await this.prisma.agentSettings.findUnique({ where: { userId } });
      if (userSettings && !userSettings.autoTradingEnabled) {
        return { enabled: false, reason: 'التداول الذاتي معطّل في إعداداتك — فعّله من صفحة إعدادات الوكيل' };
      }
    } catch {
      // If we can't check, allow trading (fail-open for kill switch is safer than blocking)
    }
    return { enabled: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Helper Methods
  // ═══════════════════════════════════════════════════════════════════

  private _isPaperOnly(exchangeName: string): boolean {
    if (!exchangeName) return false;
    return ['paper-trading', 'paper', 'sandbox', 'simulation'].includes(exchangeName.toLowerCase());
  }

  private _isTestExchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    const lower = exchangeName.toLowerCase();
    if (['paper-trading', 'paper', 'demo', 'sandbox', 'simulation'].includes(lower)) return true;
    if (['_test', '_paper', '_demo', '_sandbox', '_simulation'].some(s => lower.endsWith(s))) return true;
    if (lower.includes('testnet')) return true;
    return false;
  }

  private _isMT5Exchange(exchangeName: string): boolean {
    if (!exchangeName) return false;
    return ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'].includes(exchangeName.toLowerCase());
  }

  private _isSimulatedCredential(credential: { exchange: string; testnet?: boolean } | null): boolean {
    if (!credential) return false;
    if (this._isPaperOnly(credential.exchange)) return true;
    if ((credential as any).testnet === true && this._isPaperOnly(credential.exchange)) return true;
    return false;
  }

  private _resolveRealExchangeName(exchangeName: string): string | undefined {
    if (!exchangeName) return undefined;
    const suffixes = ['_test', '_paper', '_demo', '_sandbox', '_simulation'];
    for (const suffix of suffixes) {
      if (exchangeName.toLowerCase().endsWith(suffix)) return exchangeName.slice(0, -suffix.length);
    }
    if (exchangeName.toLowerCase().includes('testnet')) return exchangeName.replace(/testnet/i, '');
    return undefined;
  }

  // ── Circuit Breaker Redis Persistence ──

  private async _saveCircuitBreakerStateToRedis(): Promise<void> {
    if (!this.redis) return;
    try {
      for (const [cbKey, state] of this.circuitBreakerState.entries()) {
        if (state.triggered && state.until > new Date()) {
          const remainingMs = state.until.getTime() - Date.now();
          const key = `${this.CB_REDIS_PREFIX}${cbKey}`;
          await this.redis.set(key, JSON.stringify({
            triggered: state.triggered, until: state.until.toISOString(),
            level: state.level, triggeredAt: state.triggeredAt.toISOString(),
            consecutiveTriggers: state.consecutiveTriggers,
          }), remainingMs + 60000);
        }
      }
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to persist CB state: ${error.message}`);
    }
  }

  private async _loadCircuitBreakerStateFromRedis(): Promise<void> {
    if (!this.redis) return;
    try {
      // Clean up old-format keys
      try {
        const oldKeys = await this.redis.scanKeys('circuit-breaker:*');
        for (const oldKey of oldKeys) {
          if (oldKey.startsWith('circuit-breaker:v2:')) continue;
          await this.redis.del(oldKey).catch(() => {});
        }
      } catch {}

      const keys = await this.redis.scanKeys(`${this.CB_REDIS_PREFIX}*`);
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (!data) continue;
        try {
          const state = JSON.parse(data);
          const cbKey = key.replace(this.CB_REDIS_PREFIX, '');
          const until = new Date(state.until);
          if (until > new Date()) {
            this.circuitBreakerState.set(cbKey, {
              triggered: state.triggered, until, level: state.level,
              triggeredAt: new Date(state.triggeredAt), consecutiveTriggers: state.consecutiveTriggers,
            });
          } else {
            await this.redis.del(key).catch(() => {});
          }
        } catch {
          await this.redis.del(key).catch(() => {});
        }
      }
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to load CB state: ${error.message}`);
    }
  }

  private async _persistCircuitBreakerToRedis(cbKey: string): Promise<void> {
    if (!this.redis) return;
    try {
      const state = this.circuitBreakerState.get(cbKey);
      if (!state) return;
      const key = `${this.CB_REDIS_PREFIX}${cbKey}`;
      if (state.triggered && state.until > new Date()) {
        const remainingMs = state.until.getTime() - Date.now();
        await this.redis.set(key, JSON.stringify({
          triggered: state.triggered, until: state.until.toISOString(),
          level: state.level, triggeredAt: state.triggeredAt.toISOString(),
          consecutiveTriggers: state.consecutiveTriggers,
        }), remainingMs + 60000);
      } else {
        await this.redis.del(key).catch(() => {});
      }
    } catch (error: any) {
      this.logger.warn(`🛡️ Failed to persist CB for ${cbKey}: ${error.message}`);
    }
  }
}
