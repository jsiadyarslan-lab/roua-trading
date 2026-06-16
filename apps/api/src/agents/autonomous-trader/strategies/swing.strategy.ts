// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Swing Trading Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType } from '../types/agent.types';

/**
 * SwingStrategy — Medium-term position trading
 *
 * Characteristics:
 * - Timeframe: H4 (4-hour candles) — V-PHASE3: was 1h, now uses strategy-native H4
 * - Confirmation: D1 (daily confirmation) — MUST agree for trade entry
 * - Holding period: Hours to days
 * - Take profit: Moderate (50-200 pips)
 * - Stop loss: Wider (30-100 pips)
 * - Requires: Clear trend, momentum confirmation, D1 alignment
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  Clear uptrend (EMA9 > EMA21 > EMA50) on H4          │
 * │       + RSI pullback to 40-50 zone + MACD histogram        │
 * │       turning positive + Price above EMA21                 │
 * │       + D1 trend NOT bearish (daily confirmation)          │
 * │                                                             │
 * │ SELL: Clear downtrend (EMA9 < EMA21 < EMA50) on H4        │
 * │       + RSI pullback to 50-60 zone + MACD histogram        │
 * │       turning negative + Price below EMA21                 │
 * │       + D1 trend NOT bullish (daily confirmation)          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * V-PHASE3 MTF Enhancement:
 * - D1 trend MUST NOT oppose the signal (mandatory for swing)
 * - If D1 opposes → signal REJECTED (strength drops to 0)
 * - If D1 confirms → strength boosted by 20%, confidence +10
 * - If D1 is neutral → no penalty, no bonus
 *
 * Why D1 is critical for swing:
 *   Swing trades last 1-3 days. A H4 uptrend against a D1
 *   downtrend is just a pullback — it will reverse. Only
 *   H4 trends aligned with D1 have staying power.
 *
 * Risk Management:
 * - ATR-based SL/TP (2x ATR for SL, 4x ATR for TP)
 * - Trend must be confirmed by multiple EMA alignment
 * - Exit on trend reversal signal
 */
export class SwingStrategy extends BaseStrategy {
  readonly type = StrategyType.SWING;
  readonly name = 'تداول سوينغ';
  readonly description = 'استراتيجية السوينغ — صفقات متوسطة الأجل تعتمد على الاتجاه والزخم (H4 + تأكيد يومي D1)';

  private readonly holdingPeriodHours: number;

  constructor(params: any) {
    super(params);
    this.holdingPeriodHours = params.swingHoldingPeriodHours ?? 48;
    this.minRiskRewardRatio = 1.5; // Swing requires good R:R (using ATR 2x/4x gives 2:1)
    this.minConfidence = 40; // V-PHASE1: Raised from 30 to 40 — consistent with base strategy
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, macd, ema, atr, bollingerBands } = market;

    // Determine trend alignment
    const strongUptrend = ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50;
    const strongDowntrend = ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50;
    const mildUptrend = ema.ema9 > ema.ema21;
    const mildDowntrend = ema.ema9 < ema.ema21;

    // RSI pullback zones — WIDENED for more signal generation
    const bullishPullback = rsi >= 30 && rsi <= 55;
    const bearishPullback = rsi >= 45 && rsi <= 70;

    // MACD momentum
    const macdBullish = macd.histogram > 0 || macd.crossover === 'BULLISH';
    const macdBearish = macd.histogram < 0 || macd.crossover === 'BEARISH';

    // Price position relative to EMA21
    const priceAboveEMA21 = market.price > ema.ema21;
    const priceBelowEMA21 = market.price < ema.ema21;

    // Bollinger Band position for additional confirmation
    const nearLowerBand = bollingerBands.percentB < 0.4;
    const nearUpperBand = bollingerBands.percentB > 0.6;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // V-PHASE3: MTF (Multi-Timeframe) Confirmation
    //
    // للسوينغ: D1 (اليومي) يجب أن يوافق الإشارة
    // - إذا كان D1 يعارض → رفض الإشارة بالكامل (قوة = 0)
    // - إذا كان D1 يؤكد → تعزيز القوة (+20%) + ثقة (+10)
    // - إذا كان D1 محايد → لا تأثير
    //
    // هذا حاسم لأن صفقات السوينغ تدوم 1-3 أيام،
    // فإذا كان الاتجاه اليومي معاكس فالصفقة ستفشل.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const mtfContext = market.mtfContext;
    let mtfBoost = 0;
    let mtfConfidenceAdj = 0;
    let mtfReject = false; // D1 opposition = hard reject
    let mtfAlignment: StrategyAnalysis['indicators']['mtfAlignment'] = null;
    let mtfAlignmentScore = 0;

    if (mtfContext) {
      mtfAlignment = mtfContext.mtfAlignment;
      mtfAlignmentScore = mtfContext.mtfAlignmentScore;

      // Find the D1 (daily) timeframe data
      const d1Data = mtfContext.higherTimeframes.find(h => h.timeframe === 'D1');
      const h4Data = mtfContext.higherTimeframes.find(h => h.timeframe === 'H4');

      // We'll apply D1 check after direction is determined
      // For now, store the data
      (this as any).__d1Data = d1Data || null;
      (this as any).__h4Data = h4Data || null;
    } else {
      (this as any).__d1Data = null;
      (this as any).__h4Data = null;
    }

    // Determine direction and strength
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // PATH 1 (Primary): Uptrend + pullback + momentum (original, but with wider RSI)
    if ((strongUptrend || mildUptrend) && bullishPullback && macdBullish) {
      direction = 'BUY';
      strength = this._calculateSwingStrength(
        strongUptrend, bullishPullback, macdBullish, priceAboveEMA21, market.aiSignal,
      );
      trendAlignment = strongUptrend;
    }
    // SELL: Downtrend + pullback + momentum
    else if ((strongDowntrend || mildDowntrend) && bearishPullback && macdBearish) {
      direction = 'SELL';
      strength = this._calculateSwingStrength(
        strongDowntrend, bearishPullback, macdBearish, priceBelowEMA21, market.aiSignal,
      );
      trendAlignment = strongDowntrend;
    }
    // PATH 2: Strong MACD crossover with mild trend
    else if (macd.crossover === 'BULLISH' && mildUptrend && rsi < 60) {
      direction = 'BUY';
      strength = 55;
      trendAlignment = mildUptrend;
    } else if (macd.crossover === 'BEARISH' && mildDowntrend && rsi > 40) {
      direction = 'SELL';
      strength = 55;
      trendAlignment = mildDowntrend;
    }
    // PATH 3: Oversold/Overbought + Bollinger extreme + ANY trend hint
    else if (rsi < 35 && nearLowerBand && (mildUptrend || macdBullish)) {
      direction = 'BUY';
      strength = 45;
      trendAlignment = mildUptrend;
    } else if (rsi > 65 && nearUpperBand && (mildDowntrend || macdBearish)) {
      direction = 'SELL';
      strength = 45;
      trendAlignment = mildDowntrend;
    }
    // PATH 4: Strong EMA alignment alone (no pullback needed)
    else if (strongUptrend && rsi < 65 && macdBullish) {
      direction = 'BUY';
      strength = 50;
      trendAlignment = true;
    } else if (strongDowntrend && rsi > 35 && macdBearish) {
      direction = 'SELL';
      strength = 50;
      trendAlignment = true;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // V-PHASE3: Apply D1 (daily) confirmation/rejection
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (direction !== 'NEUTRAL' && mtfContext) {
      const d1Data = (this as any).__d1Data as { trend: string; trendStrength: number } | null;

      if (d1Data) {
        if (direction === 'BUY') {
          if (d1Data.trend === 'BEARISH' && d1Data.trendStrength > 30) {
            // D1 opposes BUY — hard reject for swing
            mtfReject = true;
            mtfBoost = -strength; // Reduce strength to 0
            mtfConfidenceAdj = -20;
          } else if (d1Data.trend === 'BULLISH') {
            // D1 confirms BUY — boost
            mtfBoost = Math.round(strength * 0.2); // +20% strength
            mtfConfidenceAdj = 10;
          }
        } else if (direction === 'SELL') {
          if (d1Data.trend === 'BULLISH' && d1Data.trendStrength > 30) {
            // D1 opposes SELL — hard reject for swing
            mtfReject = true;
            mtfBoost = -strength; // Reduce strength to 0
            mtfConfidenceAdj = -20;
          } else if (d1Data.trend === 'BEARISH') {
            // D1 confirms SELL — boost
            mtfBoost = Math.round(strength * 0.2); // +20% strength
            mtfConfidenceAdj = 10;
          }
        }
      }
    }

    // Clean up temporary data
    delete (this as any).__d1Data;
    delete (this as any).__h4Data;

    // Apply MTF boost/penalty
    strength = Math.max(0, Math.min(100, strength + mtfBoost));

    // If D1 opposes, force no opportunity (swing rule: don't fight the daily)
    const hasOpportunity =
      !mtfReject &&
      direction !== 'NEUTRAL' &&
      strength >= 20 &&
      market.volatility !== 'EXTREME';

    return {
      hasOpportunity,
      direction,
      strength,
      // V-PHASE2 FIX: Swing REQUIRES a trend — it's a trend-following strategy.
      requiresTrend: true,
      spreadTooWide: false,
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
      reasoning: this._buildReasoning(
        direction, strongUptrend, strongDowntrend, rsi, macd.crossover, market.price, ema, mtfContext, mtfReject
      ),
      metadata: {
        strategy: 'SWING',
        strongUptrend,
        strongDowntrend,
        rsi,
        macdHistogram: macd.histogram,
        priceVsEMA21: priceAboveEMA21 ? 'ABOVE' : 'BELOW',
        emaAlignment: strongUptrend ? 'BULLISH' : strongDowntrend ? 'BEARISH' : 'MIXED',
        holdingPeriodHours: this.holdingPeriodHours,
        // V-PHASE3: MTF metadata
        mtfAlignment: mtfAlignment || 'N/A',
        mtfAlignmentScore,
        mtfBoost,
        mtfConfidenceAdj,
        mtfRejected: mtfReject,
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
      2.0, // Wider SL: 2x ATR
      4.0, // Larger TP: 4x ATR (2:1 R:R)
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

    // Swing can use limit orders for better entry
    const orderType = analysis.strength >= 70 ? OrderType.MARKET : OrderType.LIMIT;

    return {
      id: '', // Will be set by BaseStrategy.evaluate
      symbol: market.symbol,
      action: side,
      type: orderType,
      confidence,
      strategy: StrategyType.SWING,
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

  private _calculateSwingStrength(
    strongTrend: boolean,
    pullback: boolean,
    macdAligned: boolean,
    pricePosition: boolean,
    aiSignal?: StrategySignal,
  ): number {
    let strength = 0;

    if (strongTrend) strength += 30;
    if (pullback) strength += 25;
    if (macdAligned) strength += 20;
    if (pricePosition) strength += 10;

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
    strongUptrend: boolean,
    strongDowntrend: boolean,
    rsi: number,
    macdCrossover: string,
    price: number,
    ema: any,
    mtfContext?: any,
    mtfReject?: boolean,
  ): string {
    const parts: string[] = [];

    // V-PHASE3: If D1 rejected, explain why
    if (mtfReject) {
      const d1Data = mtfContext?.higherTimeframes?.find((h: any) => h.timeframe === 'D1');
      parts.push(`⚠️ مرفوض: الإطار اليومي D1 يعارض (${d1Data?.trend || 'غير معروف'}) — لا ندخل ضد الاتجاه اليومي`);
      return parts.join(' | ');
    }

    if (direction === 'BUY') {
      if (strongUptrend) parts.push('اتجاه صعودي قوي على H4 (EMA9 > EMA21 > EMA50)');
      parts.push(`ارتداد RSI إلى منطقة الشراء (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BULLISH') parts.push('تقاطع MACD صعودي');
      parts.push(`السعر (${price.toFixed(2)}) فوق EMA21 (${ema.ema21.toFixed(2)})`);
    } else if (direction === 'SELL') {
      if (strongDowntrend) parts.push('اتجاه هبوطي قوي على H4 (EMA9 < EMA21 < EMA50)');
      parts.push(`ارتداد RSI إلى منطقة البيع (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BEARISH') parts.push('تقاطع MACD هبوطي');
      parts.push(`السعر (${price.toFixed(2)}) تحت EMA21 (${ema.ema21.toFixed(2)})`);
    } else {
      parts.push('لا يوجد اتجاه واضح للسوينغ');
    }

    // V-PHASE3: Add D1 confirmation reasoning
    if (mtfContext && direction !== 'NEUTRAL') {
      const d1Data = mtfContext.higherTimeframes?.find((h: any) => h.timeframe === 'D1');
      if (d1Data) {
        if (d1Data.trend === 'BULLISH' && direction === 'BUY') {
          parts.push('✅ تأكيد يومي: D1 صعودي');
        } else if (d1Data.trend === 'BEARISH' && direction === 'SELL') {
          parts.push('✅ تأكيد يومي: D1 هبوطي');
        } else if (d1Data.trend === 'SIDEWAYS') {
          parts.push('➖ الإطار اليومي محايد');
        }
      } else {
        parts.push('⚠️ بيانات D1 غير متوفرة');
      }
    }

    return parts.join(' | ');
  }
}
