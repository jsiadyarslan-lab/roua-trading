// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Scalping Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType } from '../types/agent.types';

/**
 * ScalpingStrategy — High-frequency, small-profit trades
 *
 * Characteristics:
 * - Timeframe: M5 (5-minute candles) — V-PHASE3: was 1h, now uses strategy-native M5
 * - Confirmation: M15 + H1 (multi-timeframe alignment)
 * - Holding period: Seconds to minutes
 * - Take profit: Small (5-20 pips)
 * - Stop loss: Tight (3-10 pips)
 * - Requires: Low spread, high volume, clear micro-trends
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  RSI < 40 (oversold) + MACD bullish crossover         │
 * │       + Price near lower Bollinger Band + EMA9 > EMA21     │
 * │       + M15/H1 trend NOT bearish (MTF confirmation)        │
 * │                                                             │
 * │ SELL: RSI > 60 (overbought) + MACD bearish crossover      │
 * │       + Price near upper Bollinger Band + EMA9 < EMA21    │
 * │       + M15/H1 trend NOT bullish (MTF confirmation)        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * V-PHASE3 MTF Enhancement:
 * - M15 trend must agree or be neutral (not oppose)
 * - H1 trend must agree or be neutral (not oppose)
 * - If M15/H1 oppose → strength reduced by 40%, confidence reduced
 * - If M15/H1 align → strength boosted by 15%, confidence boosted
 *
 * Risk Management:
 * - ATR-based SL/TP (1x ATR for SL, 1.5x ATR for TP)
 * - Maximum spread check (reject if spread too wide)
 * - No trades during extreme volatility
 */
export class ScalpingStrategy extends BaseStrategy {
  readonly type = StrategyType.SCALPING;
  readonly name = 'مضاربة سريعة';
  readonly description = 'استراتيجية المضاربة السريعة — صفقات قصيرة الأجل بأرباح صغيرة متكررة (M5 + تأكيد M15/H1)';

  // Scalping-specific parameters
  private readonly maxSpreadPips: number;
  private readonly rsiOversold: number;
  private readonly rsiOverbought: number;

  constructor(params: any) {
    super(params);
    this.maxSpreadPips = params.scalpingMaxSpread ?? 3;
    this.rsiOversold = 40;  // Was 50 (too aggressive — overlapped at midpoint, generating signals against trend)
                         // Original doc says 35, relaxed to 40 as compromise: captures oversold dips without over-trading
    this.rsiOverbought = 60; // Was 50 (too aggressive — same overlap issue)
                         // Original doc says 65, relaxed to 60 as compromise: captures overbought rallies sensibly
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, macd, bollingerBands, ema, atr } = market;

    // Determine micro-trend direction
    const bullishTrend = ema.ema9 > ema.ema21;
    const bearishTrend = ema.ema9 < ema.ema21;

    // Check RSI conditions
    const isOversold = rsi < this.rsiOversold;
    const isOverbought = rsi > this.rsiOverbought;

    // Check MACD crossover
    const bullishMACD = macd.crossover === 'BULLISH' || macd.histogram > 0;
    const bearishMACD = macd.crossover === 'BEARISH' || macd.histogram < 0;

    // Check Bollinger Band position (relaxed from 0.35/0.65 → 0.45/0.55 for more signals)
    const nearLowerBand = bollingerBands.percentB < 0.45;
    const nearUpperBand = bollingerBands.percentB > 0.55;

    // REMOVED: Old spread check — ATR is volatility, not spread
    const spreadTooWide = false;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // V-PHASE3: MTF (Multi-Timeframe) Confirmation
    //
    // للمضاربة: نتحقق من أن M15 و H1 لا يعارضان الإشارة
    // - إذا كان M15/H1 في نفس الاتجاه → تعزيز القوة (+15)
    // - إذا كان M15/H1 محايد → لا تأثير
    // - إذا كان M15/H1 يعارض → تقليل القوة (-40%) + تقليل الثقة
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const mtfContext = market.mtfContext;
    let mtfBoost = 0;        // Bonus/penalty to strength
    let mtfConfidenceAdj = 0; // Bonus/penalty to confidence
    let mtfAlignment: StrategyAnalysis['indicators']['mtfAlignment'] = null;
    let mtfAlignmentScore = 0;

    if (mtfContext) {
      mtfAlignment = mtfContext.mtfAlignment;
      mtfAlignmentScore = mtfContext.mtfAlignmentScore;

      // Check higher timeframes for opposition
      for (const htf of mtfContext.higherTimeframes) {
        // For BUY signal: H1 or M15 bearish = opposition
        // For SELL signal: H1 or M15 bullish = opposition
        // We only know direction after direction is determined, so we store the data
        // and apply it below after direction is set.
      }
    }

    // Determine direction
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // BUY signal: oversold + bullish indicators
    const buySignals = [isOversold, bullishMACD, nearLowerBand, bullishTrend].filter(Boolean).length;
    const sellSignals = [isOverbought, bearishMACD, nearUpperBand, bearishTrend].filter(Boolean).length;

    if (buySignals >= 2) {
      direction = 'BUY';
      strength = this._calculateScalpStrength(
        isOversold, bullishMACD, nearLowerBand, bullishTrend, market.aiSignal,
      );
      trendAlignment = bullishTrend;

      // V-PHASE3: MTF check for BUY — is M15/H1 opposing?
      if (mtfContext) {
        const hasBearishOpposition = mtfContext.higherTimeframes.some(
          htf => htf.trend === 'BEARISH' && htf.trendStrength > 40
        );
        const hasBullishConfirmation = mtfContext.higherTimeframes.some(
          htf => htf.trend === 'BULLISH'
        );

        if (hasBearishOpposition) {
          mtfBoost = -Math.round(strength * 0.4); // Reduce strength by 40%
          mtfConfidenceAdj = -10;
        } else if (hasBullishConfirmation) {
          mtfBoost = 15; // Boost strength
          mtfConfidenceAdj = 5;
        }
      }
    }
    // SELL signal: overbought + bearish indicators
    else if (sellSignals >= 2) {
      direction = 'SELL';
      strength = this._calculateScalpStrength(
        isOverbought, bearishMACD, nearUpperBand, bearishTrend, market.aiSignal,
      );
      trendAlignment = bearishTrend;

      // V-PHASE3: MTF check for SELL — is M15/H1 opposing?
      if (mtfContext) {
        const hasBullishOpposition = mtfContext.higherTimeframes.some(
          htf => htf.trend === 'BULLISH' && htf.trendStrength > 40
        );
        const hasBearishConfirmation = mtfContext.higherTimeframes.some(
          htf => htf.trend === 'BEARISH'
        );

        if (hasBullishOpposition) {
          mtfBoost = -Math.round(strength * 0.4); // Reduce strength by 40%
          mtfConfidenceAdj = -10;
        } else if (hasBearishConfirmation) {
          mtfBoost = 15; // Boost strength
          mtfConfidenceAdj = 5;
        }
      }
    }

    // Apply MTF boost/penalty
    strength = Math.max(0, Math.min(100, strength + mtfBoost));

    const hasOpportunity =
      direction !== 'NEUTRAL' &&
      strength >= 20 &&
      !spreadTooWide &&
      market.volatility !== 'EXTREME';

    return {
      hasOpportunity,
      direction,
      strength,
      requiresTrend: false, // Scalping can work in sideways markets
      spreadTooWide,
      indicators: {
        trendAlignment,
        indicatorStrength: strength,
        volumeConfirmation: market.volume24h > 0,
        rsi,
        macdCrossover: macd.crossover,
        // V-PHASE3: MTF alignment data
        mtfAlignment,
        mtfAlignmentScore,
      },
      reasoning: this._buildReasoning(direction, rsi, macd.crossover, bollingerBands.percentB, ema, mtfContext),
      metadata: {
        strategy: 'SCALPING',
        rsi,
        macdHistogram: macd.histogram,
        bollingerPercentB: bollingerBands.percentB,
        emaCrossover: bullishTrend ? 'BULLISH' : bearishTrend ? 'BEARISH' : 'NONE',
        atr,
        spreadTooWide,
        // V-PHASE3: MTF metadata
        mtfAlignment: mtfAlignment || 'N/A',
        mtfAlignmentScore,
        mtfBoost,
        mtfConfidenceAdj,
        higherTimeframes: mtfContext?.higherTimeframes.map(h => ({
          tf: h.timeframe,
          trend: h.trend,
          strength: h.trendStrength,
        })) || [],
      },
    };
  }

  protected generateSignal(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): EvaluatedSignal {
    const side = analysis.direction as OrderSide;
    const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(
      market.price,
      side,
      market.atr,
      1.0, // Tight SL: 1x ATR
      1.2, // BUG-066j: Quick TP: 1.2x ATR (was 1.5 → R:R 1.2 instead of 1.5)
    );

    // V-PHASE3: Apply MTF confidence adjustment
    const mtfConfidenceAdj = (analysis.metadata as any).mtfConfidenceAdj || 0;

    const confidence = Math.max(0, Math.min(100,
      this.calculateConfidence({
        trendAlignment: analysis.indicators.trendAlignment,
        indicatorStrength: analysis.strength,
        volumeConfirmation: analysis.indicators.volumeConfirmation,
        aiSignal: market.aiSignal,
        rsi: market.rsi,
        macdCrossover: analysis.indicators.macdCrossover,
      }) + mtfConfidenceAdj
    ));

    return {
      id: '', // Will be set by BaseStrategy.evaluate
      symbol: market.symbol,
      action: side,
      type: OrderType.MARKET, // Scalpers use market orders for speed
      confidence,
      strategy: StrategyType.SCALPING,
      entryPrice: market.price,
      stopLoss, // MANDATORY
      takeProfit,
      quantity: 0, // Will be calculated by RiskCalculator
      reasoning: analysis.reasoning,
      riskRewardRatio,
      riskScore: 0, // Will be calculated by RiskCalculator
      timestamp: new Date(),
      metadata: analysis.metadata,
    };
  }

  private _calculateScalpStrength(
    rsiExtreme: boolean,
    macdAligned: boolean,
    bbExtreme: boolean,
    trendAligned: boolean,
    aiSignal?: StrategySignal,
  ): number {
    let strength = 0;

    if (rsiExtreme) strength += 25;
    if (macdAligned) strength += 25;
    if (bbExtreme) strength += 20;
    if (trendAligned) strength += 15;

    // AI agreement bonus
    if (aiSignal === StrategySignal.STRONG_BUY || aiSignal === StrategySignal.STRONG_SELL) {
      strength += 15;
    } else if (aiSignal === StrategySignal.BUY || aiSignal === StrategySignal.SELL) {
      strength += 8;
    }

    return Math.min(100, strength);
  }

  private _buildReasoning(
    direction: string,
    rsi: number,
    macdCrossover: string,
    bbPercentB: number,
    ema: any,
    mtfContext?: any,
  ): string {
    const parts: string[] = [];

    if (direction === 'BUY') {
      parts.push(`RSI منخفض (${rsi.toFixed(1)}) — تشبع بيعي`);
      if (macdCrossover === 'BULLISH') parts.push('تقاطع MACD صعودي');
      if (bbPercentB < 0.2) parts.push('السعر قرب الحد السفلي لبولنجر');
      if (ema.ema9 > ema.ema21) parts.push('EMA9 فوق EMA21 — اتجاه صعودي');
    } else if (direction === 'SELL') {
      parts.push(`RSI مرتفع (${rsi.toFixed(1)}) — تشبع شرائي`);
      if (macdCrossover === 'BEARISH') parts.push('تقاطع MACD هبوطي');
      if (bbPercentB > 0.8) parts.push('السعر قرب الحد العلوي لبولنجر');
      if (ema.ema9 < ema.ema21) parts.push('EMA9 تحت EMA21 — اتجاه هبوطي');
    } else {
      parts.push('لا توجد فرصة واضحة');
    }

    // V-PHASE3: Add MTF reasoning
    if (mtfContext && direction !== 'NEUTRAL') {
      const htfSummary = mtfContext.higherTimeframes
        .map((h: any) => `${h.timeframe}:${h.trend}`)
        .join(', ');
      parts.push(`أطر أعلى [${htfSummary}] — توافق: ${mtfContext.mtfAlignment}`);
    }

    return parts.join(' | ');
  }
}
