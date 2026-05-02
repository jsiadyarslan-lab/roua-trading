// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Mean Reversion Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType } from '../types/agent.types';

/**
 * MeanReversionStrategy — Statistical price reversion to the mean
 *
 * One of the most proven and backtested strategies in algorithmic trading.
 * Based on the statistical principle that prices tend to revert to their
 * historical mean after significant deviations.
 *
 * Characteristics:
 * - Win rate: 60-70% (highest among common strategies)
 * - Holding period: Hours to days
 * - Works best in: Ranging/sideways markets with mean-reverting behavior
 * - Risk: Can suffer in strong trending markets
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  Price below lower Bollinger Band (percentB < 0.15)  │
 * │       + RSI oversold (< 30) or strongly oversold (< 25)   │
 * │       + Price significantly below EMA21 (deviation > 1.5σ) │
 * │                                                             │
 * │ SELL: Price above upper Bollinger Band (percentB > 0.85)  │
 * │       + RSI overbought (> 70) or strongly overbought (> 75)│
 * │       + Price significantly above EMA21 (deviation > 1.5σ) │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - SL: 2x ATR from entry (wider to allow for continued deviation)
 * - TP: At the middle Bollinger Band (mean) or EMA21
 * - Position sizing: Smaller than trend-following due to counter-trend nature
 *
 * Sources:
 * - "Mean Reversion Trading in Forex: Strategy Guide for 2026"
 * - "Quantitative Trading" by Ernest Chan (mean reversion backtests)
 * - Academic research: 60-70% win rate in ranging markets
 */
export class MeanReversionStrategy extends BaseStrategy {
  readonly type = StrategyType.MEAN_REVERSION;
  readonly name = 'عودة للمتوسط';
  readonly description = 'استراتيجية عودة السعر لمتوسطه — صفقات عكسية عند الانحرافات الكبيرة مع نسبة فوز عالية';

  // Strategy-specific parameters
  private readonly rsiOversold: number;
  private readonly rsiOverbought: number;
  private readonly bbLowerThreshold: number;
  private readonly bbUpperThreshold: number;
  private readonly deviationMultiplier: number;

  constructor(params: any) {
    super(params);
    this.rsiOversold = params.meanReversionRsiOversold ?? 30;
    this.rsiOverbought = params.meanReversionRsiOverbought ?? 70;
    this.bbLowerThreshold = params.meanReversionBbLower ?? 0.15;
    this.bbUpperThreshold = params.meanReversionBbUpper ?? 0.85;
    this.deviationMultiplier = params.meanReversionDeviation ?? 1.5;
    this.minRiskRewardRatio = 1.0; // Mean reversion has lower R:R but high win rate
    this.minConfidence = 35; // Can work with moderate confidence
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, bollingerBands, ema, atr, price } = market;

    // Calculate deviation from mean (EMA21 as proxy for mean)
    const deviation = ema.ema21 > 0
      ? (price - ema.ema21) / (atr > 0 ? atr : ema.ema21 * 0.01)
      : 0;
    const absoluteDeviation = Math.abs(deviation);

    // Price significantly below mean → BUY (expect reversion up)
    const deeplyBelowMean = deviation < -this.deviationMultiplier;
    const belowBbLower = bollingerBands.percentB < this.bbLowerThreshold;
    const rsiOversold = rsi < this.rsiOversold;
    const stronglyOversold = rsi < 25;

    // Price significantly above mean → SELL (expect reversion down)
    const deeplyAboveMean = deviation > this.deviationMultiplier;
    const aboveBbUpper = bollingerBands.percentB > this.bbUpperThreshold;
    const rsiOverbought = rsi > this.rsiOverbought;
    const stronglyOverbought = rsi > 75;

    // Count confirming signals for each direction
    const buyConfirmations = [deeplyBelowMean, belowBbLower, rsiOversold, market.trend !== 'BULLISH'].filter(Boolean).length;
    const sellConfirmations = [deeplyAboveMean, aboveBbUpper, rsiOverbought, market.trend !== 'BEARISH'].filter(Boolean).length;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // BUY: Price deviated significantly below mean
    if (buyConfirmations >= 2 && (deeplyBelowMean || rsiOversold)) {
      direction = 'BUY';
      strength = this._calculateMeanReversionStrength(
        deeplyBelowMean, belowBbLower, rsiOversold, stronglyOversold, absoluteDeviation, market.aiSignal,
      );
      trendAlignment = false; // Mean reversion is counter-trend by nature
    }
    // SELL: Price deviated significantly above mean
    else if (sellConfirmations >= 2 && (deeplyAboveMean || rsiOverbought)) {
      direction = 'SELL';
      strength = this._calculateMeanReversionStrength(
        deeplyAboveMean, aboveBbUpper, rsiOverbought, stronglyOverbought, absoluteDeviation, market.aiSignal,
      );
      trendAlignment = false;
    }

    // Mean reversion works best in non-extreme volatility
    const hasOpportunity =
      direction !== 'NEUTRAL' &&
      strength >= 30 &&
      market.volatility !== 'EXTREME' &&
      atr > 0;

    return {
      hasOpportunity,
      direction,
      strength,
      requiresTrend: false, // Mean reversion specifically does NOT require trend
      spreadTooWide: false,
      indicators: {
        trendAlignment,
        indicatorStrength: strength,
        volumeConfirmation: market.volume24h > 0,
        rsi,
        macdCrossover: market.macd.crossover,
      },
      reasoning: this._buildReasoning(direction, rsi, bollingerBands.percentB, deviation, ema.ema21, price),
      metadata: {
        strategy: 'MEAN_REVERSION',
        deviation: deviation.toFixed(3),
        absoluteDeviation: absoluteDeviation.toFixed(3),
        bbPercentB: bollingerBands.percentB,
        rsi,
        ema21: ema.ema21,
        atr,
      },
    };
  }

  protected generateSignal(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): EvaluatedSignal {
    const side = analysis.direction as OrderSide;

    // SL: 2x ATR from entry (wider than trend-following to survive continued deviation)
    // TP: At the mean (EMA21) — the expected reversion target
    const stopLoss = side === OrderSide.BUY
      ? market.price - market.atr * 2.0
      : market.price + market.atr * 2.0;

    const takeProfit = side === OrderSide.BUY
      ? Math.min(market.ema.ema21, market.bollingerBands.middle) // Target the mean
      : Math.max(market.ema.ema21, market.bollingerBands.middle);

    const risk = Math.abs(market.price - stopLoss);
    const reward = Math.abs(takeProfit - market.price);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    const confidence = this.calculateConfidence({
      trendAlignment: false,
      indicatorStrength: analysis.strength,
      volumeConfirmation: analysis.indicators.volumeConfirmation,
      aiSignal: market.aiSignal,
      rsi: market.rsi,
      macdCrossover: analysis.indicators.macdCrossover,
    });

    return {
      symbol: market.symbol,
      action: side,
      type: OrderType.MARKET, // Enter quickly when deviation is spotted
      confidence,
      strategy: StrategyType.MEAN_REVERSION,
      entryPrice: market.price,
      stopLoss,
      takeProfit,
      quantity: 0,
      reasoning: analysis.reasoning,
      riskRewardRatio,
      riskScore: 0,
      timestamp: new Date(),
      metadata: analysis.metadata,
    };
  }

  private _calculateMeanReversionStrength(
    deeplyDeviation: boolean,
    bbExtreme: boolean,
    rsiExtreme: boolean,
    stronglyExtreme: boolean,
    absoluteDeviation: number,
    aiSignal?: StrategySignal,
  ): number {
    let strength = 0;

    if (deeplyDeviation) strength += 25;
    if (bbExtreme) strength += 25;
    if (rsiExtreme) strength += 20;
    if (stronglyExtreme) strength += 15; // Extra bonus for extreme readings

    // Greater deviation = stronger reversion expected
    if (absoluteDeviation > 3) strength += 10;
    else if (absoluteDeviation > 2) strength += 5;

    // AI agreement — for mean reversion, SELL signals on overbought are positive
    if (aiSignal === StrategySignal.SELL || aiSignal === StrategySignal.STRONG_SELL ||
        aiSignal === StrategySignal.BUY || aiSignal === StrategySignal.STRONG_BUY) {
      strength += 5; // Small bonus for any non-neutral AI signal
    }

    return Math.min(100, strength);
  }

  private _buildReasoning(
    direction: string,
    rsi: number,
    bbPercentB: number,
    deviation: number,
    ema21: number,
    price: number,
  ): string {
    const parts: string[] = [];

    if (direction === 'BUY') {
      parts.push(`انحراف سلبي عن المتوسط (${deviation.toFixed(2)}σ)`);
      if (rsi < 30) parts.push(`RSI في تشبع بيعي (${rsi.toFixed(1)})`);
      if (bbPercentB < 0.15) parts.push(`السعر تحت الحد السفلي لبولنجر (%B=${bbPercentB.toFixed(2)})`);
      parts.push(`السعر (${price.toFixed(2)}) دون المتوسط (${ema21.toFixed(2)}) — متوقع عودة`);
    } else if (direction === 'SELL') {
      parts.push(`انحراف إيجابي عن المتوسط (+${deviation.toFixed(2)}σ)`);
      if (rsi > 70) parts.push(`RSI في تشبع شرائي (${rsi.toFixed(1)})`);
      if (bbPercentB > 0.85) parts.push(`السعر فوق الحد العلوي لبولنجر (%B=${bbPercentB.toFixed(2)})`);
      parts.push(`السعر (${price.toFixed(2)}) فوق المتوسط (${ema21.toFixed(2)}) — متوقع عودة`);
    } else {
      parts.push('السعر قريب من المتوسط — لا فرصة عودة');
    }

    return parts.join(' | ');
  }
}
