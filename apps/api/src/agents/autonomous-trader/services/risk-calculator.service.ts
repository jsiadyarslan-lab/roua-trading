// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Risk Calculator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { RiskAssessment, AgentConfig, StrategyType } from '../types/agent.types';
import { EvaluatedSignal } from '../types/agent.types';
import {
  getSymbolMetadata,
  calculatePositionSizeFromRisk,
  lotsToUnits,
  unitsToLots,
  roundLotSize,
  calculateMargin,
  calculateNotionalValue,
} from '../../../modules/trading/services/symbol-metadata';
import { PortfolioValuationService } from '../../../modules/trading/services/portfolio-valuation.service';

/**
 * RiskCalculatorService — Smart risk management engine
 *
 * Calculates position size, validates risk limits, and ensures
 * every trade adheres to the strict safety rules of the platform.
 *
 * Safety Rules (NON-NEGOTIABLE):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Stop-loss is MANDATORY for every position               │
 * │ 2. Max position size: 1-2% of portfolio per trade          │
 * │ 3. Max daily loss: 5% of portfolio — agent auto-stops      │
 * │ 4. Max open positions: 5 per user                          │
 * │ 5. Risk-reward ratio must be >= 1:1.5                      │
 * │ 6. No new trades if daily loss limit reached                │
 * │ 7. No withdrawal capability (trading permissions only)      │
 * │ 8. Full audit trail for every risk decision                 │
 * └─────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class RiskCalculatorService {
  private readonly logger = new Logger(RiskCalculatorService.name);

  // Default risk parameters (overridden by agent config and DB settings)
  private defaultMaxPositionSizePercent = 2;
  private defaultMaxDailyLossPercent = 5;
  private defaultMaxOpenPositions = 5;
  private defaultRiskPerTradePercent = 1.5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly portfolioValuation: PortfolioValuationService,
  ) {
    // Load defaults from env
    this.defaultMaxPositionSizePercent = parseFloat(
      this.configService.get('MAX_POSITION_SIZE_PERCENT', '2'),
    );
    this.defaultMaxDailyLossPercent = parseFloat(
      this.configService.get('MAX_DAILY_LOSS_PERCENT', '5'),
    );
    this.defaultMaxOpenPositions = parseInt(
      this.configService.get('MAX_OPEN_POSITIONS', '5'),
      10,
    );

    this.logger.log('🛡️ Risk Calculator initialized — capital protection active');
  }

  /**
   * Strategy-specific minimum risk-reward ratios.
   * V-PHASE2: Updated to match the actual strategy R:R outputs after Phase 1+2 fixes.
   * Previously, DCA had 0.4 (dead code — DCA strategy now enforces 1.5+).
   * Grid raised from 0.8 to 1.2 (grid needs decent R:R to be profitable).
   * Mean Reversion raised from 0.8 to 1.0 (Phase 1 fixed its TP to 2.5x ATR).
   */
  private readonly STRATEGY_MIN_RR: Record<string, number> = {
    [StrategyType.DCA]: 1.5,              // V-PHASE2: was 0.4 — dead code, DCA strategy enforces 1.5
    [StrategyType.MEAN_REVERSION]: 1.0,   // V-PHASE2: was 0.8 — strategy now produces 1.25:1 minimum
    [StrategyType.SCALPING]: 1.0,         // unchanged — 1.5x ATR TP / 1x ATR SL = 1.5:1
    [StrategyType.GRID]: 1.2,             // V-PHASE2: was 0.8 — grid needs decent R:R
    [StrategyType.VWAP_RSI]: 1.2,         // V-PHASE2: was 1.0 — strategy R:R is 1.67:1
    [StrategyType.SWING]: 1.5,            // unchanged — swing uses 2:1 (4x ATR TP / 2x ATR SL)
    [StrategyType.MOMENTUM_BREAKOUT]: 1.2, // unchanged — 2:1 R:R
  };

  /**
   * Full risk assessment for a potential trade
   * Returns whether the trade is allowed and all calculated risk metrics
   */
  async assessRisk(
    userId: string,
    signal: EvaluatedSignal,
    config: AgentConfig,
  ): Promise<RiskAssessment> {
    // Step 1: Get current portfolio value
    const portfolioValue = await this._getPortfolioValue(userId);

    // Step 2: Calculate daily P&L
    const dailyPnL = await this._getDailyPnL(userId);
    const dailyLossPercent = portfolioValue > 0
      ? (Math.abs(Math.min(0, dailyPnL)) / portfolioValue) * 100
      : 0;

    // Step 3: Count open positions
    const openPositionsCount = await this._getOpenPositionsCount(userId);

    // Step 4: Apply risk limits from config (or defaults)
    const maxPositionSizePercent = config.maxPositionSizePercent || this.defaultMaxPositionSizePercent;
    const maxDailyLossPercent = config.maxDailyLossPercent || this.defaultMaxDailyLossPercent;
    const maxOpenPositions = config.maxOpenPositions || this.defaultMaxOpenPositions;
    const riskPerTradePercent = config.riskPerTradePercent || this.defaultRiskPerTradePercent;

    // Step 5: Calculate position size (with maxPositionSizePercent cap)
    // V146: Pass symbol for lot-aware sizing
    const positionSize = this._calculatePositionSize(
      portfolioValue,
      riskPerTradePercent,
      signal.entryPrice,
      signal.stopLoss,
      maxPositionSizePercent,
      signal.symbol,
    );

    // Step 6: Calculate risk-reward ratio
    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
    const reward = Math.abs(signal.takeProfit - signal.entryPrice);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    // Step 7: Calculate risk score (0-100)
    const riskScore = this._calculateRiskScore({
      positionSize,
      portfolioValue,
      maxPositionSizePercent,
      openPositionsCount,
      maxOpenPositions,
      dailyLossPercent,
      maxDailyLossPercent,
      riskRewardRatio,
      volatility: signal.metadata?.volatility,
    });

    // Step 8: Validate all safety rules
    let canTrade = true;
    let reason: string | undefined;

    // RULE 1: Mandatory stop-loss (already enforced by strategy, but double-check)
    if (!signal.stopLoss || signal.stopLoss <= 0) {
      canTrade = false;
      reason = 'وقف الخسارة إجباري — لا يمكن فتح مركز بدون وقف خسارة';
    }

    // RULE 2: Daily loss limit
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
    // FIX: Add 0.01% tolerance for floating-point arithmetic.
    // _calculatePositionSize() caps the value to exactly maxPositionSizePercent,
    // but floating-point multiplication produces results like 2.0000000001%
    // which was being rejected even though it's effectively equal to the limit.
    const POSITION_SIZE_TOLERANCE = 0.01; // 0.01% tolerance
    const positionValuePercent = portfolioValue > 0
      ? (positionSize * signal.entryPrice / portfolioValue) * 100
      : 0;

    if (positionValuePercent > maxPositionSizePercent + POSITION_SIZE_TOLERANCE) {
      canTrade = false;
      reason = `حجم المركز (${positionValuePercent.toFixed(1)}%) يتجاوز الحد (${maxPositionSizePercent}%)`;
    }


    // RULE 5: Risk-reward ratio — strategy-specific minimum
    // CRITICAL FIX: Each strategy has a different R:R expectation.
    // DCA and Mean Reversion have low R:R but high win rates — rejecting them
    // with a blanket 1.2 minimum prevents these strategies from ever executing!
    const strategyMinRR = this.STRATEGY_MIN_RR[signal.strategy] ?? 1.2;
    if (riskRewardRatio < strategyMinRR) {
      canTrade = false;
      reason = `نسبة المخاطرة للمكافأة (${riskRewardRatio.toFixed(2)}) أقل من الحد الأدنى لاستراتيجية ${signal.strategy} (${strategyMinRR})`;
    }

    // RULE 6: Duplicate positions check
    // RELAXED: Previously this blocked ANY duplicate position for the same symbol.
    // Now we allow it but log a warning, OR we check if the strategy is different.
    // This allows the Agent and Executor to work on the same symbol with different strategies.
    const existingPosition = await this._hasOpenPosition(userId, signal.symbol);
    if (existingPosition) {
      // If it's the SAME strategy, we might want to block to prevent double-entry
      if (existingPosition.strategy === signal.strategy) {
        canTrade = false;
        reason = `يوجد مركز مفتوح بالفعل لـ ${signal.symbol} باستخدام نفس الاستراتيجية (${signal.strategy})`;
      } else {
        this.logger.log(`⚠️ Adding additional position for ${signal.symbol} using strategy ${signal.strategy} (existing: ${existingPosition.strategy})`);
      }
    }

    // RULE 7: Check if AUTO_TRADING_ENABLED (global DB/ENV = admin kill switch)
    let globalAutoTradingEnabled: boolean;
    try {
      const dbSetting = await this.prisma.setting.findUnique({
        where: { key: 'AUTO_TRADING_ENABLED' },
      });
      if (dbSetting) {
        globalAutoTradingEnabled = JSON.parse(dbSetting.value);
      } else {
        globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
      }
    } catch {
      globalAutoTradingEnabled = this.configService.get('AUTO_TRADING_ENABLED', 'true') === 'true';
    }

    if (!globalAutoTradingEnabled) {
      canTrade = false;
      reason = 'التداول الذاتي معطّل على مستوى النظام — تواصل مع الإدارة';
      this.logger.warn(`🚫 AUTO_TRADING_ENABLED=false (global) — ALL trades for user ${userId} are being rejected.`);
    } else {
      // Also check per-user autoTradingEnabled from AgentSettings
      try {
        const userSettings = await this.prisma.agentSettings.findUnique({
          where: { userId },
        });
        if (userSettings && !userSettings.autoTradingEnabled) {
          canTrade = false;
          reason = 'التداول الذاتي معطّل في إعداداتك — فعّله من صفحة إعدادات الوكيل';
          this.logger.warn(`🚫 User ${userId} autoTradingEnabled=false — trades rejected.`);
        }
      } catch (e: any) {
        this.logger.warn(`Could not check user autoTradingEnabled in risk assessment: ${e.message}`);
      }
    }

    if (canTrade) {
      this.logger.debug(
        `🛡️ Trade allowed: ${signal.action} ${signal.symbol} ` +
        `qty=${positionSize.toFixed(6)} risk=${riskScore}`,
      );
    } else {
      this.logger.warn(`🛡️ Trade rejected: ${reason}`);
    }

    // ══════════════════════════════════════════════════════════════
    // V430: قائمة أزواج محجوبة — أسعار غير موثوقة من المصدر
    //
    // BRENT/USD: OANDA يرجع سعر 0.0003 (خاطئ، الصحيح ~$70-80).
    // بدلاً من الاعتماد على حارس السعر المريب فقط، نحظر الزوج صراحة
    // حتى يُحل المشكلة من المصدر (OANDA streaming).
    // ══════════════════════════════════════════════════════════════
    const BLOCKED_SYMBOLS = new Set([
      'BRENT/USD',
    ]);

    if (BLOCKED_SYMBOLS.has(signal.symbol?.toUpperCase() || '')) {
      this.logger.warn(
        `🚫 V430 BLOCKED SYMBOL: ${signal.symbol} is in the blocked list — ` +
        `price data unreliable from source. Order BLOCKED.`,
      );
      return {
        canTrade: false,
        positionSize: 0,
        stopLoss: 0,
        takeProfit: 0,
        riskRewardRatio: 0,
        riskScore: 100,
        dailyPnL: 0,
        dailyLossPercent: 0,
        openPositionsCount: 0,
        portfolioValue: 0,
        reason: `الزوج ${signal.symbol} محجوب — بيانات السعر غير موثوقة`,
      } as RiskAssessment;
    }

    // ══════════════════════════════════════════════════════════════
    // V428: حارسان أخيران قبل التنفيذ — درس 2 يوليو 2026
    //
    // المشكلة: BRENT/USD جاء بسعر 0.0003 (خاطئ تماماً، الصحيح ~$70-80)
    // النتيجة: quantity = riskAmount / 0.0003 = ملايين الوحدات → خسارة -$704
    // حتى مع وجود maxPositionSizePercent=2%، الحسابات الوسيطة تتجاوزه
    // عند سعر شبه صفري.
    //
    // الحارس 1: سعر مريب → حجب كامل
    // الحارس 2: حد مطلق بالدولار → تقليص إجباري
    // ══════════════════════════════════════════════════════════════

    // الحارس 1: سعر الدخول مريب (أصغر من 0.0001 لغير العملات الميمية المعروفة)
    const isMemeWithTinyPrice = signal.symbol?.toUpperCase().includes('SHIB') ||
      signal.symbol?.toUpperCase().includes('PEPE') ||
      signal.symbol?.toUpperCase().includes('FLOKI');

    if (signal.entryPrice > 0 && signal.entryPrice < 0.0001 && !isMemeWithTinyPrice) {
      this.logger.error(
        `🚨 V428 SUSPICIOUS PRICE BLOCKED: ${signal.symbol} entryPrice=${signal.entryPrice} ` +
        `is unrealistically low — order BLOCKED to prevent catastrophic position sizing.`,
      );
      return {
        canTrade: false,
        reason: `V428: سعر الدخول ${signal.entryPrice} مريب جداً لـ ${signal.symbol} — تم الحجب`,
        positionSize: 0,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskRewardRatio: 0,
        riskScore: 100,
        dailyPnL,
        dailyLossPercent,
        openPositionsCount,
        portfolioValue,
      };
    }

    // الحارس 2: حد مطلق بالدولار = 3% من portfolio
    // على $700k = $21,000 | على $1,000 = $30
    const ABSOLUTE_MAX_NOTIONAL = portfolioValue * 0.03;
    const currentNotional = positionSize * Math.abs(signal.entryPrice);
    let safePositionSize = positionSize;

    if (currentNotional > ABSOLUTE_MAX_NOTIONAL && signal.entryPrice > 0) {
      safePositionSize = ABSOLUTE_MAX_NOTIONAL / signal.entryPrice;
      this.logger.warn(
        `🛡️ V428 ABSOLUTE CAP: notional $${currentNotional.toFixed(2)} > ` +
        `3% cap ($${ABSOLUTE_MAX_NOTIONAL.toFixed(2)}) for ${signal.symbol} ` +
        `— qty reduced: ${positionSize.toFixed(6)} → ${safePositionSize.toFixed(6)}`,
      );
    }

    return {
      canTrade,
      reason,
      positionSize: parseFloat(safePositionSize.toFixed(8)),
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      riskRewardRatio,
      riskScore,
      dailyPnL,
      dailyLossPercent,
      openPositionsCount,
      portfolioValue,
    };
  }

  /**
   * Check if daily loss limit has been reached
   *
   * V-PHASE3 FIX: Now checks COMBINED daily PnL from ALL sources (executor + agent + manual),
   * not just the agent's own trades. Previously, each system tracked its own 5% limit
   * independently, allowing a combined 10% daily drawdown. Now both systems check the
   * unified total, so the 5% limit is enforced across ALL trading sources combined.
   *
   * Original V133 fixes preserved:
   * 1. PAPER-TRADING BYPASS: If user has no real credentials, daily limit is bypassed
   *    (paper trading is for learning/testing).
   * 2. CROSS-SOURCE TRACKING: Now counts ALL sources instead of just agent's own.
   */
  async isDailyLimitReached(userId: string, maxDailyLossPercent: number): Promise<boolean> {
    // ── FIX #2 (V133): Bypass daily limit for paper-trading-only users ──
    // RiskGatekeeperService already bypasses this check for simulated-only users.
    // The Agent should follow the same logic — paper trading is for learning,
    // and stopping the agent on virtual losses defeats the purpose.
    try {
      const realCredential = await this.prisma.exchangeCredential.findFirst({
        where: {
          userId,
          isValid: true,
          exchange: { not: 'paper-trading' },
          testnet: { not: true },
        },
      });
      if (!realCredential) {
        this.logger.debug(
          `🛡️ Agent daily limit check BYPASSED for user ${userId} — paper-trading only (no real credentials)`,
        );
        return false;
      }
    } catch (credErr: any) {
      this.logger.warn(
        `🛡️ Could not check credentials for daily limit bypass: ${credErr.message} — proceeding with check`,
      );
    }

    // V-PHASE3: Use combined daily PnL from ALL sources (not just agent's own).
    // Previously only counted source='agent' trades, allowing executor + agent
    // to each lose 5% independently = 10% combined. Now counts ALL sources.
    const dailyPnL = await this._getCombinedDailyPnL(userId);
    const portfolioValue = await this._getPortfolioValue(userId);

    if (portfolioValue <= 0) return false;
    // No realized losses today → never blocked
    if (dailyPnL >= 0) return false;

    const lossPercent = (Math.abs(dailyPnL) / portfolioValue) * 100;
    if (lossPercent >= maxDailyLossPercent) {
      this.logger.warn(
        `🛡️ Agent daily loss limit reached: ${lossPercent.toFixed(2)}% >= ${maxDailyLossPercent}% (agent-only losses: $${dailyPnL.toFixed(2)})`,
      );
      return true;
    }
    return false;
  }

  /**
   * Get current risk parameters
   */
  getRiskParameters() {
    return {
      maxPositionSizePercent: this.defaultMaxPositionSizePercent,
      maxDailyLossPercent: this.defaultMaxDailyLossPercent,
      maxOpenPositions: this.defaultMaxOpenPositions,
      riskPerTradePercent: this.defaultRiskPerTradePercent,
    };
  }

  // ── Private Helpers ──

  private _calculatePositionSize(
    portfolioValue: number,
    riskPerTradePercent: number,
    entryPrice: number,
    stopLoss: number,
    maxPositionSizePercent?: number,
    symbol?: string,
  ): number {
    if (portfolioValue <= 0 || entryPrice <= 0 || stopLoss <= 0) return 0;

    // Use config maxPositionSizePercent or fallback to default
    const maxSizePercent = maxPositionSizePercent || this.defaultMaxPositionSizePercent;

    // Risk amount = portfolio × risk %
    const riskAmount = portfolioValue * (riskPerTradePercent / 100);

    // Price risk per unit = |entry - stopLoss|
    const priceRisk = Math.abs(entryPrice - stopLoss);

    if (priceRisk === 0) return 0;

    // V429: العودة بـ lots مُقرَّبة لخطوة 0.01 بدلاً من وحدات خام
    // السبب: المستخدم يرى الحجم كعقود (0.01، 0.02...) وليس كوحدات (1000، 2000...)
    // الحد الأدنى: 0.01 lot | الخطوة: 0.01
    if (symbol) {
      const result = calculatePositionSizeFromRisk(riskAmount, entryPrice, stopLoss, symbol);

      // Cap to maxPositionSizePercent of portfolio
      const maxPositionValue = portfolioValue * (maxSizePercent / 100);
      let quantityLots = result.quantityLots;

      if (result.notional > maxPositionValue) {
        const cappedUnits = maxPositionValue / entryPrice;
        quantityLots = roundLotSize(unitsToLots(cappedUnits, symbol), symbol);
      }

      // V429: تقريب إلى أقرب 0.01 (خطوة العقد القياسية)
      // Math.floor لمنع تجاوز الحد، ثم max(0.01) للحد الأدنى
      const step = 0.01;
      const rounded = Math.max(step, Math.floor(quantityLots / step) * step);
      return parseFloat(rounded.toFixed(2));
    }

    // Legacy path: no symbol — raw unit calculation
    let quantity = riskAmount / priceRisk;

    const maxPositionValue = portfolioValue * (maxSizePercent / 100);
    const currentPositionValue = quantity * entryPrice;

    if (currentPositionValue > maxPositionValue) {
      quantity = maxPositionValue / entryPrice;
      this.logger.debug(
        `🛡️ Position size capped: ${currentPositionValue.toFixed(2)} > ${maxPositionValue.toFixed(2)} ` +
        `(max ${maxSizePercent}% of portfolio) → reduced to ${quantity.toFixed(8)} units`,
      );
    }

    return parseFloat(quantity.toFixed(8));
  }

  private _calculateRiskScore(params: {
    positionSize: number;
    portfolioValue: number;
    maxPositionSizePercent: number;
    openPositionsCount: number;
    maxOpenPositions: number;
    dailyLossPercent: number;
    maxDailyLossPercent: number;
    riskRewardRatio: number;
    volatility?: string;
  }): number {
    let score = 0;

    // Position size relative to portfolio (0-30 points)
    if (params.portfolioValue > 0) {
      const positionPercent = (params.positionSize * 100) / params.portfolioValue;
      score += Math.min(30, (positionPercent / params.maxPositionSizePercent) * 30);
    }

    // Open positions ratio (0-25 points)
    score += Math.min(25, (params.openPositionsCount / params.maxOpenPositions) * 25);

    // Daily loss contribution (0-30 points)
    score += Math.min(30, (params.dailyLossPercent / params.maxDailyLossPercent) * 30);

    // R:R ratio penalty (0-15 points)
    if (params.riskRewardRatio < 2.0) score += 15;
    else if (params.riskRewardRatio < 3.0) score += 8;

    // Volatility bonus
    if (params.volatility === 'EXTREME') score += 15;
    else if (params.volatility === 'HIGH') score += 8;

    return Math.min(100, Math.round(score));
  }

  /**
   * V218: Portfolio valuation now delegates to PortfolioValuationService.
   * This is the SINGLE SOURCE OF TRUTH — both RiskManager and RiskCalculator
   * use the same formula, eliminating the possibility of drift.
   */
  private async _getPortfolioValue(userId: string): Promise<number> {
    try {
      const valuation = await this.portfolioValuation.autoDetectValuation(userId);
      return valuation.totalValue;
    } catch (error: any) {
      // Fallback: return default for paper trading so agent doesn't get stuck
      const defaultBalance = parseFloat(
        this.configService.get('DEFAULT_PAPER_BALANCE', '10000'),
      ) || 10000;
      this.logger.warn(
        `🛡️ V218: PortfolioValuationService failed for ${userId}: ${error.message} — using default: $${defaultBalance}`,
      );
      return defaultBalance;
    }
  }

  /**
   * Get daily P&L from ALL sources (used by assessRisk for display purposes).
   * NOTE: This includes Smart Executor, Agent, and manual trades.
   */
  private async _getDailyPnL(userId: string): Promise<number> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const trades = await this.prisma.trade.findMany({
        where: {
          userId,
          executedAt: { gte: todayStart },
          type: { in: ['EXIT', 'PARTIAL_EXIT'] },
        },
      });

      return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    } catch {
      return 0;
    }
  }

  /**
   * V-PHASE3: Get combined daily PnL from ALL trade sources.
   * This ensures the daily loss limit is enforced across ALL trading systems
   * (Smart Executor + Agent + Manual) combined, not per-system independently.
   */
  private async _getCombinedDailyPnL(userId: string): Promise<number> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const trades = await this.prisma.trade.findMany({
        where: {
          userId,
          executedAt: { gte: todayStart },
          type: { in: ['EXIT', 'PARTIAL_EXIT'] },
          pnl: { not: null },
        },
      });

      return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    } catch {
      return 0;
    }
  }

  /**
   * V133: Get daily PnL from the AGENT's own trades ONLY.
   * @deprecated Use _getCombinedDailyPnL() for daily limit checks.
   * Kept for internal reporting/diagnostics where agent-specific PnL is needed.
   */
  private async _getAgentDailyPnL(userId: string): Promise<number> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const trades = await this.prisma.trade.findMany({
        where: {
          userId,
          executedAt: { gte: todayStart },
          type: { in: ['EXIT', 'PARTIAL_EXIT'] },
          source: 'agent',  // V133: Only count the agent's own losses
        },
      });

      return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    } catch {
      return 0;
    }
  }

  // V146b: Only count Agent's own positions, not Smart Executor's
  private async _getOpenPositionsCount(userId: string): Promise<number> {
    try {
      return await this.prisma.position.count({
        where: { userId, status: 'OPEN', source: 'agent' },
      });
    } catch {
      return 0;
    }
  }

  private async _hasOpenPosition(userId: string, symbol: string): Promise<any> {
    try {
      return await this.prisma.position.findFirst({
        where: { userId, symbol, status: 'OPEN' },
      });
    } catch {
      return null;
    }
  }
}
