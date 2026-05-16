// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Mean Reversion Strategy (Bot)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BotBaseStrategy } from './bot-base-strategy';
import {
  BotStrategyType,
  BotMarketData,
  BotStrategyAnalysis,
  BotStrategySignal,
} from './bot-strategy.types';

/**
 * MeanReversionStrategy — Statistical price reversion to the mean
 *
 * Based on the statistical principle that prices tend to revert to their
 * historical mean after significant deviations. One of the highest win-rate
 * strategies in ranging markets.
 *
 * Characteristics:
 * - Win rate: 60-70% (highest among common strategies)
 * - Holding period: Hours to days
 * - Works best in: Ranging/sideways markets
 * - Risk: Can suffer in strong trending markets
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  Price below lower Bollinger Band (percentB < 0.15)  │
 * │       + RSI oversold (< 30)                                 │
 * │       + Price significantly below EMA21 (deviation > 1.5σ) │
 * │                                                             │
 * │ SELL: Price above upper Bollinger Band (percentB > 0.85)  │
 * │       + RSI overbought (> 70)                               │
 * │       + Price significantly above EMA21 (deviation > 1.5σ) │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - SL: 2x ATR from entry (wider to survive continued deviation)
 * - TP: At EMA21 (the mean) — the expected reversion target
 * - Position sizing: Smaller than trend-following due to counter-trend nature
 */
export class MeanReversionBotStrategy extends BotBaseStrategy {
  readonly type = BotStrategyType.MEAN_REVERSION;
  readonly name = 'عودة للمتوسط';
  readonly description = 'استراتيجية عودة السعر لمتوسطه — صفقات عكسية عند الانحرافات الكبيرة';

  private readonly rsiOversold: number;
  private readonly rsiOverbought: number;
  private readonly bbLowerThreshold: number;
  private readonly bbUpperThreshold: number;
  private readonly deviationMultiplier: number;

  constructor(params: Record<string, any> = {}) {
    super(params);
    this.rsiOversold = params.rsiOversold ?? 30;
    this.rsiOverbought = params.rsiOverbought ?? 70;
    this.bbLowerThreshold = params.bbLowerThreshold ?? 0.15;
    this.bbUpperThreshold = params.bbUpperThreshold ?? 0.85;
    this.deviationMultiplier = params.deviationMultiplier ?? 1.5;
    this.minRiskRewardRatio = 1.0; // Lower R:R but high win rate
    this.minConfidence = 35;
  }

  protected analyze(market: BotMarketData): BotStrategyAnalysis {
    const { rsi, bbPercentB, bbMiddle, ema21, atr, price } = market;

    // Calculate deviation from mean
    const deviation = ema21 > 0
      ? (price - ema21) / (atr > 0 ? atr : ema21 * 0.01)
      : 0;
    const absoluteDeviation = Math.abs(deviation);

    // Price significantly below mean → BUY (expect reversion up)
    const deeplyBelowMean = deviation < -this.deviationMultiplier;
    const belowBbLower = bbPercentB < this.bbLowerThreshold;
    const rsiOversold = rsi < this.rsiOversold;
    const stronglyOversold = rsi < 25;

    // Price significantly above mean → SELL (expect reversion down)
    const deeplyAboveMean = deviation > this.deviationMultiplier;
    const aboveBbUpper = bbPercentB > this.bbUpperThreshold;
    const rsiOverbought = rsi > this.rsiOverbought;
    const stronglyOverbought = rsi > 75;

    // Count confirming signals
    const buyConfirmations = [deeplyBelowMean, belowBbLower, rsiOversold, market.trend !== 'BULLISH'].filter(Boolean).length;
    const sellConfirmations = [deeplyAboveMean, aboveBbUpper, rsiOverbought, market.trend !== 'BEARISH'].filter(Boolean).length;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;

    // BUY: Price deviated significantly below mean
    if (buyConfirmations >= 2 && (deeplyBelowMean || rsiOversold)) {
      direction = 'BUY';
      strength = this._calculateReversionStrength(deeplyBelowMean, belowBbLower, rsiOversold, stronglyOversold, absoluteDeviation, market.signalAction);
    }
    // SELL: Price deviated significantly above mean
    else if (sellConfirmations >= 2 && (deeplyAboveMean || rsiOverbought)) {
      direction = 'SELL';
      strength = this._calculateReversionStrength(deeplyAboveMean, aboveBbUpper, rsiOverbought, stronglyOverbought, absoluteDeviation, market.signalAction);
    }

    const hasOpportunity = direction !== 'NEUTRAL' && strength >= 30 && atr > 0;

    // SL: 2x ATR, TP: at the mean (EMA21 or BB middle, whichever is closer)
    const stopLoss = direction === 'BUY'
      ? price - atr * 2.0
      : price + atr * 2.0;

    const takeProfit = direction === 'BUY'
      ? Math.min(ema21, bbMiddle) // Target the mean
      : Math.max(ema21, bbMiddle);

    const risk = Math.abs(price - stopLoss);
    const reward = Math.abs(takeProfit - price);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    const confidence = this.calculateConfidence({
      trendAlignment: false, // Mean reversion is counter-trend
      indicatorStrength: strength,
      volumeConfirmation: market.volume24h > 0,
      signalAgreement: market.signalAction === direction,
      rsi,
      macdCrossover: market.macdCrossover,
    });

    return {
      hasOpportunity,
      direction,
      strength,
      confidence,
      reasoning: this._buildReasoning(direction, rsi, bbPercentB, deviation, ema21, price),
      stopLoss,
      takeProfit,
      riskRewardRatio,
      metadata: {
        strategy: 'MEAN_REVERSION',
        deviation: deviation.toFixed(3),
        absoluteDeviation: absoluteDeviation.toFixed(3),
        bbPercentB,
        rsi,
        ema21,
        atr,
      },
    };
  }

  private _calculateReversionStrength(
    deepDeviation: boolean,
    bbExtreme: boolean,
    rsiExtreme: boolean,
    stronglyExtreme: boolean,
    absoluteDeviation: number,
    signalAction?: string,
  ): number {
    let strength = 0;
    if (deepDeviation) strength += 25;
    if (bbExtreme) strength += 25;
    if (rsiExtreme) strength += 20;
    if (stronglyExtreme) strength += 15;
    if (absoluteDeviation > 3) strength += 10;
    else if (absoluteDeviation > 2) strength += 5;
    if (signalAction === 'BUY' || signalAction === 'SELL') strength += 5;
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
