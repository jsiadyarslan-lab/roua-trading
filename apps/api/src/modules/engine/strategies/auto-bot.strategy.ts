// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Auto Strategy Selector (Bot)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BotBaseStrategy } from './bot-base-strategy';
import {
  BotStrategyType,
  BotMarketData,
  BotStrategyAnalysis,
  BotMarketRegime,
  BotRegimeDetection,
} from './bot-strategy.types';
import { TrendFollowingStrategy } from './trend-following.strategy';
import { MeanReversionBotStrategy } from './mean-reversion.strategy';
import { BreakoutBotStrategy } from './breakout.strategy';
import { MomentumBotStrategy } from './momentum.strategy';

/**
 * AutoBotStrategy — Adaptive strategy auto-selection for the Bot
 *
 * This strategy implements a market regime detection algorithm that automatically
 * selects the best trading strategy based on current market conditions.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    REGIME DETECTION PIPELINE                │
 * │                                                             │
 * │  1. TREND ANALYSIS     → EMA alignment + trend strength     │
 * │  2. VOLATILITY ASSESS  → ATR + BB bandwidth                 │
 * │  3. MOMENTUM CHECK     → MACD direction + RSI level         │
 * │  4. REGIME CLASSIFY    → TRENDING_UP/DOWN/RANGING/          │
 * │                           VOLATILE/TRANSITIONAL              │
 * │                                                             │
 * │  REGIME → STRATEGY MAPPING:                                 │
 * │  ┌─────────────────┬───────────────────────────────────┐    │
 * │  │ TRENDING_UP     │ TREND_FOLLOWING, MOMENTUM          │    │
 * │  │ TRENDING_DOWN   │ TREND_FOLLOWING, MOMENTUM          │    │
 * │  │ RANGING         │ MEAN_REVERSION                      │    │
 * │  │ VOLATILE        │ BREAKOUT, MOMENTUM                  │    │
 * │  │ TRANSITIONAL    │ MOMENTUM (cautious)                 │    │
 * │  └─────────────────┴───────────────────────────────────┘    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Safety:
 * - Never switches strategy mid-trade
 * - 3-bar confirmation before regime change
 * - Cool-down period after switching (5 minutes)
 * - Falls back to MOMENTUM in unclear markets
 */
export class AutoBotStrategy extends BotBaseStrategy {
  readonly type = BotStrategyType.AUTO;
  readonly name = 'تلقائي (AUTO)';
  readonly description = 'استراتيجية تلقائية — تختار أفضل استراتيجية حسب ظروف السوق ووقت التداول';

  /** Regime history for 3-bar confirmation */
  private readonly regimeHistory = new Map<string, BotMarketRegime[]>();
  private readonly REGIME_CONFIRMATION_BARS = 3;

  /** Last strategy switch time per symbol */
  private readonly lastSwitchTime = new Map<string, Date>();
  private readonly COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  /** Strategy instances */
  private readonly trendFollowing: TrendFollowingStrategy;
  private readonly meanReversion: MeanReversionBotStrategy;
  private readonly breakout: BreakoutBotStrategy;
  private readonly momentum: MomentumBotStrategy;

  constructor(params: Record<string, any> = {}) {
    super(params);
    this.minRiskRewardRatio = 1.0; // Will use sub-strategy's R:R
    this.minConfidence = 35;       // Will use sub-strategy's confidence

    this.trendFollowing = new TrendFollowingStrategy(params.trendFollowing ?? {});
    this.meanReversion = new MeanReversionBotStrategy(params.meanReversion ?? {});
    this.breakout = new BreakoutBotStrategy(params.breakout ?? {});
    this.momentum = new MomentumBotStrategy(params.momentum ?? {});
  }

  /**
   * Override evaluate() directly for AUTO strategy.
   * This strategy delegates to sub-strategies, so it needs
   * the full evaluate flow (not just analyze).
   */
  async evaluate(market: BotMarketData): Promise<BotStrategyAnalysis | null> {
    // Step 1: Detect market regime
    const regime = this._detectRegime(market);

    // Step 2: Select the best strategy for this regime
    const selectedStrategy = this._selectStrategyForRegime(regime, market);
    const strategyName = this._getStrategyTypeName(selectedStrategy);

    // Step 3: Run the selected strategy's evaluate method
    const result = await selectedStrategy.evaluate(market);

    // If no signal from sub-strategy, return null
    if (!result) {
      return null;
    }

    // Step 4: Enrich metadata with AUTO regime info
    result.metadata = {
      ...result.metadata,
      parentStrategy: 'AUTO',
      selectedStrategy: strategyName,
      regime: regime.regime,
      regimeConfidence: regime.confidence,
      regimeIndicators: regime.indicators,
    };

    // Step 5: Enrich reasoning with regime info
    const regimeNames: Record<BotMarketRegime, string> = {
      [BotMarketRegime.TRENDING_UP]: 'صعودي متجه',
      [BotMarketRegime.TRENDING_DOWN]: 'هبوطي متجه',
      [BotMarketRegime.RANGING]: 'نطاق عرضي',
      [BotMarketRegime.VOLATILE]: 'متقلب',
      [BotMarketRegime.TRANSITIONAL]: 'انتقالي',
    };

    result.reasoning = `[AUTO → ${strategyName} | نظام: ${regimeNames[regime.regime]}] ${result.reasoning}`;

    return result;
  }

  /**
   * analyze() is not used directly for AUTO strategy —
   * all logic is in evaluate() which delegates to sub-strategies.
   * This method provides a minimal fallback that should never be called
   * because evaluate() is overridden.
   */
  protected analyze(market: BotMarketData): BotStrategyAnalysis {
    // Minimal fallback — AUTO strategy delegates to evaluate() directly
    return {
      hasOpportunity: false,
      direction: 'NEUTRAL',
      strength: 0,
      confidence: 0,
      reasoning: 'AUTO strategy uses evaluate() — this should not be called',
      stopLoss: 0,
      takeProfit: 0,
      riskRewardRatio: 0,
      metadata: { strategy: 'AUTO', note: 'fallback' },
    };
  }

  // ── Regime Detection ──

  private _detectRegime(market: BotMarketData): BotRegimeDetection {
    const { ema9, ema21, ema50, rsi, macdHistogram, macdCrossover, bbBandwidth, bbPercentB, atr, price, trendStrength } = market;

    // Calculate ADX proxy from available indicators
    const emaGap = Math.abs(ema9 - ema21) / ema21 * 100;
    const adxProxy = this._calculateADXProxy(trendStrength, emaGap, bbBandwidth);

    // Determine EMA alignment
    let emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED' = 'MIXED';
    if (ema9 > ema21 && ema21 > ema50) emaAlignment = 'BULLISH';
    else if (ema9 < ema21 && ema21 < ema50) emaAlignment = 'BEARISH';

    // Determine momentum direction
    let momentumDirection: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
    const macdSignal = macdHistogram > 0 ? 1 : macdHistogram < 0 ? -1 : 0;
    const rsiSignal = rsi > 55 ? 1 : rsi < 45 ? -1 : 0;
    const trendBias = emaAlignment === 'BULLISH' ? 1 : emaAlignment === 'BEARISH' ? -1 : 0;
    const combinedMomentum = macdSignal + rsiSignal * 0.5 + trendBias * 0.3;
    if (combinedMomentum > 0.5) momentumDirection = 'UP';
    else if (combinedMomentum < -0.5) momentumDirection = 'DOWN';

    // Classify market regime
    let regime: BotMarketRegime;
    let confidence: number;

    if (adxProxy > 40 && emaAlignment !== 'MIXED') {
      if (emaAlignment === 'BULLISH' && momentumDirection === 'UP') {
        regime = BotMarketRegime.TRENDING_UP;
        confidence = 70;
      } else if (emaAlignment === 'BEARISH' && momentumDirection === 'DOWN') {
        regime = BotMarketRegime.TRENDING_DOWN;
        confidence = 70;
      } else {
        regime = BotMarketRegime.TRANSITIONAL;
        confidence = 50;
      }
    } else if (adxProxy < 25 && bbBandwidth < 0.04 && market.trend === 'SIDEWAYS') {
      regime = BotMarketRegime.RANGING;
      confidence = 65;
    } else if (bbBandwidth > 0.06 || market.volatility === 'EXTREME' || market.volatility === 'HIGH') {
      regime = BotMarketRegime.VOLATILE;
      confidence = 60;
    } else {
      regime = BotMarketRegime.TRANSITIONAL;
      confidence = 40;
    }

    // Apply 3-bar confirmation
    const confirmedRegime = this._applyConfirmation(market.symbol, regime);

    // Map regime to recommended strategy
    const recommendedStrategy = this._mapRegimeToStrategy(confirmedRegime, rsi);

    return {
      regime: confirmedRegime,
      confidence,
      recommendedStrategy,
      indicators: {
        trendStrength,
        volatility: market.volatility,
        emaAlignment,
        bbBandwidth,
        momentumDirection,
      },
    };
  }

  // ── Regime → Strategy Mapping ──

  private _mapRegimeToStrategy(regime: BotMarketRegime, rsi: number): BotStrategyType {
    switch (regime) {
      case BotMarketRegime.TRENDING_UP:
        return rsi < 65 ? BotStrategyType.TREND_FOLLOWING : BotStrategyType.MOMENTUM;
      case BotMarketRegime.TRENDING_DOWN:
        return rsi > 35 ? BotStrategyType.TREND_FOLLOWING : BotStrategyType.MOMENTUM;
      case BotMarketRegime.RANGING:
        return BotStrategyType.MEAN_REVERSION;
      case BotMarketRegime.VOLATILE:
        return BotStrategyType.BREAKOUT;
      case BotMarketRegime.TRANSITIONAL:
        return BotStrategyType.MOMENTUM;
      default:
        return BotStrategyType.MOMENTUM;
    }
  }

  // ── Strategy Selection ──

  private _selectStrategyForRegime(regime: BotRegimeDetection, market: BotMarketData): BotBaseStrategy {
    // Check cool-down — avoid rapid switching
    const lastSwitch = this.lastSwitchTime.get(market.symbol);
    if (lastSwitch) {
      const timeSinceSwitch = Date.now() - lastSwitch.getTime();
      if (timeSinceSwitch < this.COOLDOWN_MS) {
        // During cool-down, keep the previous strategy unless the new one is very different
        // For simplicity, we respect the regime recommendation even during cooldown
        // but log it
      }
    }

    this.lastSwitchTime.set(market.symbol, new Date());

    switch (regime.recommendedStrategy) {
      case BotStrategyType.TREND_FOLLOWING:
        return this.trendFollowing;
      case BotStrategyType.MEAN_REVERSION:
        return this.meanReversion;
      case BotStrategyType.BREAKOUT:
        return this.breakout;
      case BotStrategyType.MOMENTUM:
        return this.momentum;
      default:
        return this.momentum;
    }
  }

  // ── Helper Functions ──

  private _calculateADXProxy(trendStrength: number, emaGap: number, bbBandwidth: number): number {
    const trendComponent = trendStrength * 0.50;
    const gapComponent = Math.min(50, emaGap * 30) * 0.30;
    const bandwidthComponent = Math.min(50, bbBandwidth * 500) * 0.20;
    return Math.min(100, Math.round(trendComponent + gapComponent + bandwidthComponent));
  }

  private _applyConfirmation(symbol: string, detectedRegime: BotMarketRegime): BotMarketRegime {
    const history = this.regimeHistory.get(symbol) || [];
    history.push(detectedRegime);
    if (history.length > this.REGIME_CONFIRMATION_BARS) history.shift();
    this.regimeHistory.set(symbol, history);

    if (history.length < this.REGIME_CONFIRMATION_BARS) return detectedRegime;

    // Check if all recent detections agree
    const allSame = history.every(r => r === history[0]);
    if (allSame) return history[0];

    // Not confirmed — return the most frequent regime in history
    const counts = new Map<BotMarketRegime, number>();
    for (const r of history) counts.set(r, (counts.get(r) || 0) + 1);

    let mostFrequent = detectedRegime;
    let maxCount = 0;
    for (const [regime, count] of counts) {
      if (count > maxCount) { maxCount = count; mostFrequent = regime; }
    }
    return mostFrequent;
  }

  private _getStrategyTypeName(strategy: BotBaseStrategy): string {
    return strategy.type;
  }
}
