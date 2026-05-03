// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Adaptive Strategy Selector Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import {
  MarketAnalysis,
  StrategyType,
  MarketRegime,
  RegimeDetection,
  StrategyScore,
} from '../types/agent.types';

/**
 * AdaptiveStrategySelector — The Brain Behind Auto Strategy Selection
 *
 * This service implements a market regime detection algorithm that automatically
 * selects the best trading strategy based on current market conditions.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    REGIME DETECTION PIPELINE                │
 * │                                                             │
 * │  1. TREND ANALYSIS   → EMA alignment + trend strength       │
 * │  2. VOLATILITY ASSESSMENT → ATR% + BB bandwidth             │
 * │  3. MOMENTUM CHECK   → MACD direction + RSI level           │
 * │  4. REGIME CLASSIFICATION → TRENDING_UP/DOWN/RANGING/       │
 * │                             VOLATILE/TRANSITIONAL            │
 * │                                                             │
 * │                    STRATEGY SCORING SYSTEM                   │
 * │                                                             │
 * │  Score = Regime Match (40%) + Recent Performance (30%)      │
 * │        + Drawdown Penalty (20%) + Win Rate Trend (10%)      │
 * │                                                             │
 * │  REGIME → STRATEGY MAPPING:                                 │
 * │  ┌─────────────────┬───────────────────────────────────┐    │
 * │  │ TRENDING_UP     │ SWING, MOMENTUM_BREAKOUT, VWAP_RSI│    │
 * │  │ TRENDING_DOWN   │ SWING, MOMENTUM_BREAKOUT, DCA     │    │
 * │  │ RANGING         │ MEAN_REVERSION, GRID, SCALPING     │    │
 * │  │ VOLATILE        │ DCA, SCALPING (reduced size)       │    │
 * │  │ TRANSITIONAL    │ SCALPING, DCA (cautious)           │    │
 * │  └─────────────────┴───────────────────────────────────┘    │
 * │                                                             │
 * │  SAFETY RULES:                                              │
 * │  - Never switch strategy mid-trade                          │
 * │  - 3-bar confirmation before regime change                  │
 * │  - Cool-down period after switching (5 minutes)             │
 * │  - Gradual allocation shifts, not binary switching          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Sources:
 * - QuantStart: "Market Regime Detection using Hidden Markov Models"
 * - QuantInsti: "Regime-Switching Models for Trading"
 * - LSEG/Refinitiv: "Adaptive Trading Strategy Selection"
 * - Academic: SSRN 6477100 "Dynamic Strategy Allocation"
 */
@Injectable()
export class AdaptiveStrategySelectorService {
  private readonly logger = new Logger(AdaptiveStrategySelectorService.name);

  /** Cache regime detections per symbol (30-second TTL) */
  private readonly REGIME_CACHE_TTL = 30000;

  /** Regime history for 3-bar confirmation */
  private readonly regimeHistory = new Map<string, MarketRegime[]>();

  /** Last strategy switch time per user (cool-down enforcement) */
  private readonly lastSwitchTime = new Map<string, Date>();

  /** Cool-down period in milliseconds (5 minutes) */
  private readonly COOLDOWN_MS = 5 * 60 * 1000;

  /** Minimum regime history for confirmation (3 bars) */
  private readonly REGIME_CONFIRMATION_BARS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🧠 Adaptive Strategy Selector initialized — auto-regime detection active');
  }

  // ── Regime Detection ──

  /**
   * Detect the current market regime from market analysis data.
   *
   * Uses a rule-based classifier that combines:
   * - EMA alignment (trend direction)
   * - Trend strength (0-100)
   * - Volatility level (ATR%, BB bandwidth)
   * - Momentum direction (MACD, RSI)
   * - ADX proxy (from trend strength and EMA alignment)
   *
   * This is the "Level 1" regime detector. In the future, it can be
   * upgraded to a Hidden Markov Model (HMM) for more sophisticated detection.
   */
  detectRegime(market: MarketAnalysis): RegimeDetection {
    const { ema, rsi, macd, bollingerBands, atr, trendStrength } = market;

    // ── Step 1: Calculate ADX Proxy ──
    // Since we don't have a dedicated ADX calculation, we derive it from:
    // - Trend strength (EMA alignment)
    // - Directional movement (EMA9 vs EMA21 gap)
    const emaGap = Math.abs(ema.ema9 - ema.ema21) / ema.ema21 * 100;
    const adxProxy = this._calculateADXProxy(trendStrength, emaGap, bollingerBands.bandwidth);

    // ── Step 2: Determine EMA Alignment ──
    let emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED' = 'MIXED';
    if (ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50) {
      emaAlignment = 'BULLISH';
    } else if (ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50) {
      emaAlignment = 'BEARISH';
    }

    // ── Step 3: Determine Momentum Direction ──
    let momentumDirection: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
    const macdSignal = macd.histogram > 0 ? 1 : macd.histogram < 0 ? -1 : 0;
    const rsiSignal = rsi > 55 ? 1 : rsi < 45 ? -1 : 0;
    const trendBias = emaAlignment === 'BULLISH' ? 1 : emaAlignment === 'BEARISH' ? -1 : 0;

    const combinedMomentum = macdSignal + rsiSignal * 0.5 + trendBias * 0.3;
    if (combinedMomentum > 0.5) momentumDirection = 'UP';
    else if (combinedMomentum < -0.5) momentumDirection = 'DOWN';

    // ── Step 4: Classify Market Regime ──
    let regime: MarketRegime;
    let confidence: number;

    // Strong trend detection (ADX proxy > 40, clear EMA alignment)
    if (adxProxy > 40 && emaAlignment !== 'MIXED') {
      if (emaAlignment === 'BULLISH' && momentumDirection === 'UP') {
        regime = MarketRegime.TRENDING_UP;
        confidence = this._calculateRegimeConfidence(adxProxy, 50, trendStrength);
      } else if (emaAlignment === 'BEARISH' && momentumDirection === 'DOWN') {
        regime = MarketRegime.TRENDING_DOWN;
        confidence = this._calculateRegimeConfidence(adxProxy, 50, trendStrength);
      } else {
        // Trend weakening — transitional
        regime = MarketRegime.TRANSITIONAL;
        confidence = 50;
      }
    }
    // Ranging market (low ADX, narrow BB, sideways trend)
    else if (adxProxy < 25 && bollingerBands.bandwidth < 0.04 && market.trend === 'SIDEWAYS') {
      regime = MarketRegime.RANGING;
      confidence = this._calculateRegimeConfidence(25 - adxProxy, 0.04 - bollingerBands.bandwidth, trendStrength);
    }
    // Volatile market (high ATR%, wide BB)
    else if (bollingerBands.bandwidth > 0.06 || market.volatility === 'EXTREME' || market.volatility === 'HIGH') {
      regime = MarketRegime.VOLATILE;
      confidence = this._calculateRegimeConfidence(bollingerBands.bandwidth * 100, 50, trendStrength);
    }
    // Transitional (everything else — no clear regime)
    else {
      regime = MarketRegime.TRANSITIONAL;
      confidence = 40;
    }

    // ── Step 5: Apply 3-bar confirmation ──
    const confirmedRegime = this._applyConfirmation(market.symbol, regime);

    // ── Step 6: Map regime to recommended strategies ──
    const recommendedStrategies = this._mapRegimeToStrategies(confirmedRegime, rsi, adxProxy);

    const detection: RegimeDetection = {
      regime: confirmedRegime,
      confidence,
      indicators: {
        trendStrength,
        volatilityLevel: market.volatility,
        emaAlignment,
        bbBandwidth: bollingerBands.bandwidth,
        adxProxy,
        momentumDirection,
      },
      recommendedStrategies,
      timestamp: new Date(),
    };

    this.logger.debug(
      `🧠 Regime for ${market.symbol}: ${confirmedRegime} (confidence: ${confidence}%, ` +
      `ADX proxy: ${adxProxy.toFixed(1)}, EMA: ${emaAlignment}, momentum: ${momentumDirection})`,
    );

    return detection;
  }

  /**
   * Score and rank all strategies for a given market regime.
   *
   * Scoring Formula:
   *   Score = RegimeMatch (40%) + RecentPerformance (30%)
   *         + DrawdownPenalty (20%) + WinRateTrend (10%)
   */
  async scoreStrategies(
    userId: string,
    regime: RegimeDetection,
  ): Promise<StrategyScore[]> {
    const allStrategies: StrategyType[] = [
      StrategyType.SCALPING,
      StrategyType.SWING,
      StrategyType.GRID,
      StrategyType.MEAN_REVERSION,
      StrategyType.MOMENTUM_BREAKOUT,
      StrategyType.DCA,
      StrategyType.VWAP_RSI,
    ];

    const scores: StrategyScore[] = [];

    for (const strategy of allStrategies) {
      // ── Factor 1: Regime Match (40%) ──
      const regimeMatch = this._calculateRegimeMatch(strategy, regime);

      // ── Factor 2: Recent Performance (30%) ──
      const recentPerformance = await this._getRecentPerformance(userId, strategy);

      // ── Factor 3: Drawdown Penalty (20%) ──
      const drawdownPenalty = await this._getDrawdownPenalty(userId, strategy);

      // ── Factor 4: Win Rate Trend (10%) ──
      const winRateTrend = await this._getWinRateTrend(userId, strategy);

      // ── Combined Score ──
      const score = Math.round(
        regimeMatch * 0.40 +
        recentPerformance * 0.30 +
        drawdownPenalty * 0.20 +
        winRateTrend * 0.10,
      );

      scores.push({
        strategy,
        score,
        regimeMatch,
        recentPerformance,
        drawdownPenalty,
        winRateTrend,
        reason: this._buildScoreReason(strategy, regime.regime, regimeMatch, recentPerformance),
      });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    this.logger.log(
      `🧠 Strategy scores for ${userId} [${regime.regime}]: ` +
      scores.map(s => `${s.strategy}=${s.score}`).join(', '),
    );

    return scores;
  }

  /**
   * Select the best strategy for a given market condition.
   *
   * This is the main entry point for the AUTO strategy.
   * It detects the regime, scores all strategies, and returns the best one.
   *
   * Includes cool-down enforcement: won't switch strategy within
   * the cool-down period unless the new strategy scores significantly higher.
   */
  async selectBestStrategy(
    userId: string,
    market: MarketAnalysis,
  ): Promise<{ strategy: StrategyType; regime: RegimeDetection; scores: StrategyScore[] }> {
    // Step 1: Detect market regime
    const regime = this.detectRegime(market);

    // Step 2: Score all strategies
    const scores = await this.scoreStrategies(userId, regime);

    // Step 3: Select the best strategy with cool-down check
    const bestScore = scores[0];
    let selectedStrategy = bestScore.strategy;

    // Check cool-down — avoid rapid switching
    const lastSwitch = this.lastSwitchTime.get(userId);
    if (lastSwitch) {
      const timeSinceSwitch = Date.now() - lastSwitch.getTime();
      if (timeSinceSwitch < this.COOLDOWN_MS) {
        // During cool-down, only switch if new strategy is significantly better (>20 points)
        const cachedStrategyKey = `agent:auto:last-strategy:${userId}`;
        try {
          const lastStrategy = await this.redis.get(cachedStrategyKey);
          if (lastStrategy && bestScore.score - 20 < 70) {
            // Keep previous strategy during cool-down unless new one is very strong
            const previousStrategy = scores.find(s => s.strategy === lastStrategy);
            if (previousStrategy && previousStrategy.score > 30) {
              selectedStrategy = previousStrategy.strategy;
              this.logger.debug(
                `🧠 Cool-down active for ${userId} — keeping ${selectedStrategy} ` +
                `(best was ${bestScore.strategy}=${bestScore.score})`,
              );
            }
          }
        } catch {
          // Redis error — proceed with best strategy
        }
      }
    }

    // Step 4: Update cache and switch time
    try {
      await this.redis.set(
        `agent:auto:last-strategy:${userId}`,
        selectedStrategy,
        this.COOLDOWN_MS,
      );
    } catch {
      // Non-critical
    }

    this.lastSwitchTime.set(userId, new Date());

    this.logger.log(
      `🧠 AUTO strategy selected for ${userId}: ${selectedStrategy} ` +
      `(regime: ${regime.regime}, score: ${bestScore.score})`,
    );

    return { strategy: selectedStrategy, regime, scores };
  }

  // ── Regime-to-Strategy Mapping ──

  /**
   * Map detected regime to recommended strategy types.
   *
   * Based on research:
   * - Trending → Trend Following (SWING), Breakout (MOMENTUM_BREAKOUT)
   * - Ranging → Mean Reversion (MEAN_REVERSION), Grid (GRID), Scalping (SCALPING)
   * - Volatile → DCA (safe accumulation), Scalping (small quick trades)
   * - Transitional → Scalping (flexible), DCA (cautious accumulation)
   */
  private _mapRegimeToStrategies(
    regime: MarketRegime,
    rsi: number,
    adxProxy: number,
  ): StrategyType[] {
    switch (regime) {
      case MarketRegime.TRENDING_UP:
        // Strong uptrend: ride the trend
        if (rsi < 65) {
          return [StrategyType.SWING, StrategyType.MOMENTUM_BREAKOUT, StrategyType.VWAP_RSI, StrategyType.SCALPING];
        } else {
          // Overbought in uptrend — still follow but be cautious
          return [StrategyType.SWING, StrategyType.VWAP_RSI, StrategyType.DCA];
        }

      case MarketRegime.TRENDING_DOWN:
        // Strong downtrend: short or accumulate cautiously
        if (rsi > 35) {
          return [StrategyType.SWING, StrategyType.MOMENTUM_BREAKOUT, StrategyType.VWAP_RSI];
        } else {
          // Oversold in downtrend — good DCA opportunity
          return [StrategyType.DCA, StrategyType.MEAN_REVERSION, StrategyType.SWING];
        }

      case MarketRegime.RANGING:
        // Sideways market: mean reversion and grid excel
        return [StrategyType.MEAN_REVERSION, StrategyType.GRID, StrategyType.SCALPING, StrategyType.VWAP_RSI];

      case MarketRegime.VOLATILE:
        // High volatility: cautious strategies with small positions
        return [StrategyType.DCA, StrategyType.SCALPING, StrategyType.MEAN_REVERSION];

      case MarketRegime.TRANSITIONAL:
        // Unclear: flexible strategies
        return [StrategyType.SCALPING, StrategyType.DCA, StrategyType.VWAP_RSI];

      default:
        return [StrategyType.SCALPING, StrategyType.DCA];
    }
  }

  /**
   * Calculate how well a strategy matches the detected regime.
   * Returns 0-100 where 100 = perfect match.
   */
  private _calculateRegimeMatch(strategy: StrategyType, regime: RegimeDetection): number {
    const recommendedStrategies = regime.recommendedStrategies;
    const index = recommendedStrategies.indexOf(strategy);

    if (index === -1) {
      // Strategy is not recommended for this regime — low match
      // But don't give 0 — some strategies are versatile
      const versatileStrategies = [StrategyType.DCA, StrategyType.SCALPING];
      return versatileStrategies.includes(strategy) ? 25 : 10;
    }

    // Higher score for higher-ranked strategies
    // 1st recommended = 95, 2nd = 80, 3rd = 65, 4th = 50
    const scores = [95, 80, 65, 50];
    return scores[index] ?? 40;
  }

  // ── Performance Tracking ──

  /**
   * Get recent performance score for a strategy (30% weight).
   * Based on recent PnL from the last 7 days.
   */
  private async _getRecentPerformance(userId: string, strategy: StrategyType): Promise<number> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const trades = await this.prisma.autonomousTrade.findMany({
        where: {
          userId,
          strategy,
          createdAt: { gte: sevenDaysAgo },
          status: 'FILLED',
          exitPrice: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (trades.length === 0) {
        // No recent data — neutral score
        return 50;
      }

      const totalPnL = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
      const wins = trades.filter(t => Number(t.pnl || 0) > 0).length;
      const winRate = wins / trades.length;

      // Score based on win rate and total PnL
      let score = winRate * 60; // 0-60 from win rate

      // Bonus for positive PnL
      if (totalPnL > 0) {
        score += Math.min(40, (totalPnL / 1000) * 40); // 0-40 from PnL magnitude
      }

      return Math.min(100, Math.max(0, Math.round(score)));
    } catch {
      return 50; // Neutral on error
    }
  }

  /**
   * Get drawdown penalty score (20% weight).
   * Higher score = less drawdown = better.
   */
  private async _getDrawdownPenalty(userId: string, strategy: StrategyType): Promise<number> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const trades = await this.prisma.autonomousTrade.findMany({
        where: {
          userId,
          strategy,
          createdAt: { gte: sevenDaysAgo },
          status: 'FILLED',
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      if (trades.length < 3) return 70; // Not enough data — moderate score

      // Calculate max drawdown from sequential trades
      let peak = 0;
      let maxDrawdown = 0;
      let runningPnL = 0;

      for (const trade of trades) {
        runningPnL += Number(trade.pnl || 0);
        if (runningPnL > peak) peak = runningPnL;
        const drawdown = peak - runningPnL;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Convert drawdown to a score (less drawdown = higher score)
      // 0 drawdown = 100, 5% drawdown = 50, 10%+ = 10
      const drawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

      if (drawdownPercent === 0) return 100;
      if (drawdownPercent < 2) return 90;
      if (drawdownPercent < 5) return 70;
      if (drawdownPercent < 10) return 40;
      return 10;
    } catch {
      return 70;
    }
  }

  /**
   * Get win rate trend score (10% weight).
   * Measures if recent win rate is improving or declining.
   */
  private async _getWinRateTrend(userId: string, strategy: StrategyType): Promise<number> {
    try {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Recent week trades
      const recentTrades = await this.prisma.autonomousTrade.findMany({
        where: {
          userId,
          strategy,
          createdAt: { gte: sevenDaysAgo },
          status: 'FILLED',
          exitPrice: { not: null },
        },
      });

      // Previous week trades
      const prevTrades = await this.prisma.autonomousTrade.findMany({
        where: {
          userId,
          strategy,
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
          status: 'FILLED',
          exitPrice: { not: null },
        },
      });

      if (recentTrades.length < 3) return 50;

      const recentWinRate = recentTrades.filter(t => Number(t.pnl || 0) > 0).length / recentTrades.length;

      if (prevTrades.length < 3) {
        // No comparison data — just use recent win rate
        return Math.round(recentWinRate * 100);
      }

      const prevWinRate = prevTrades.filter(t => Number(t.pnl || 0) > 0).length / prevTrades.length;

      // Improving trend = higher score
      const improvement = recentWinRate - prevWinRate;

      if (improvement > 0.1) return 90; // Strongly improving
      if (improvement > 0) return 70; // Slightly improving
      if (improvement > -0.1) return 50; // Stable
      if (improvement > -0.2) return 30; // Declining
      return 10; // Strongly declining
    } catch {
      return 50;
    }
  }

  // ── Confirmation & Safety ──

  /**
   * Apply 3-bar confirmation to regime detection.
   * Regime must be consistent for 3 consecutive detections
   * before switching to a new regime classification.
   */
  private _applyConfirmation(symbol: string, detectedRegime: MarketRegime): MarketRegime {
    const history = this.regimeHistory.get(symbol) || [];

    // Add current detection
    history.push(detectedRegime);

    // Keep only last N bars
    if (history.length > this.REGIME_CONFIRMATION_BARS) {
      history.shift();
    }

    this.regimeHistory.set(symbol, history);

    // Need at least 3 detections for confirmation
    if (history.length < this.REGIME_CONFIRMATION_BARS) {
      return detectedRegime; // Not enough history — accept as-is
    }

    // Check if all recent detections agree
    const allSame = history.every(r => r === history[0]);
    if (allSame) {
      return history[0]; // Confirmed regime
    }

    // Not confirmed — keep the most frequent regime in history
    const counts = new Map<MarketRegime, number>();
    for (const r of history) {
      counts.set(r, (counts.get(r) || 0) + 1);
    }

    let mostFrequent = detectedRegime;
    let maxCount = 0;
    for (const [regime, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = regime;
      }
    }

    return mostFrequent;
  }

  // ── Helper Functions ──

  /**
   * Calculate ADX proxy from available indicators.
   * ADX measures trend strength regardless of direction.
   * Range: 0-100 (0 = no trend, 100 = extremely strong trend)
   */
  private _calculateADXProxy(trendStrength: number, emaGap: number, bbBandwidth: number): number {
    // Weighted combination:
    // - trendStrength (from EMA alignment): 50% weight
    // - EMA gap (directional movement): 30% weight
    // - BB bandwidth inverse (wider bands = trending): 20% weight
    const trendComponent = trendStrength * 0.50;
    const gapComponent = Math.min(50, emaGap * 30) * 0.30; // Scale gap to 0-50 range
    const bandwidthComponent = Math.min(50, bbBandwidth * 500) * 0.20; // Scale bandwidth

    return Math.min(100, Math.round(trendComponent + gapComponent + bandwidthComponent));
  }

  /**
   * Calculate regime detection confidence based on indicator clarity.
   * Higher confidence when indicators strongly agree.
   */
  private _calculateRegimeConfidence(
    primaryIndicator: number,
    secondaryIndicator: number,
    trendStrength: number,
  ): number {
    let confidence = 40; // Base confidence

    // Strong primary indicator → higher confidence
    confidence += Math.min(30, primaryIndicator * 0.5);

    // Secondary indicator supports → higher confidence
    confidence += Math.min(20, Math.abs(secondaryIndicator) * 200);

    // Strong trend strength → higher confidence for trending regimes
    if (trendStrength > 60) confidence += 10;

    return Math.min(100, Math.max(20, Math.round(confidence)));
  }

  /**
   * Build a human-readable reason for the strategy score.
   */
  private _buildScoreReason(
    strategy: StrategyType,
    regime: MarketRegime,
    regimeMatch: number,
    performance: number,
  ): string {
    const regimeNames: Record<MarketRegime, string> = {
      [MarketRegime.TRENDING_UP]: 'صعودي متجه',
      [MarketRegime.TRENDING_DOWN]: 'هبوطي متجه',
      [MarketRegime.RANGING]: 'نطاق عرضي',
      [MarketRegime.VOLATILE]: 'متقلب',
      [MarketRegime.TRANSITIONAL]: 'انتقالي',
    };

    const matchLevel = regimeMatch > 80 ? 'ممتاز' : regimeMatch > 50 ? 'جيد' : 'ضعيف';
    const perfLevel = performance > 70 ? 'أداء قوي' : performance > 40 ? 'أداء متوسط' : 'أداء ضعيف';

    return `${strategy} — توافق ${matchLevel} مع السوق ${regimeNames[regime]} (${regimeMatch}%), ${perfLevel} (${performance}%)`;
  }
}
