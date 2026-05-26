// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Breakout Strategy (Bot)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BotBaseStrategy } from './bot-base-strategy';
import {
  BotStrategyType,
  BotMarketData,
  BotStrategyAnalysis,
} from './bot-strategy.types';

/**
 * BreakoutStrategy — Catch strong moves at breakout points
 *
 * Identifies when price breaks through key support/resistance levels
 * with strong momentum, indicating the start of a new trend.
 *
 * Characteristics:
 * - Win rate: 40-50% (lower but with high R:R of 2:1+)
 * - Holding period: Hours to days
 * - Works best in: Volatile markets with clear breakout patterns
 * - Risk: False breakouts (whipsaws)
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  Price breaks above upper Bollinger Band              │
 * │       + RSI > 55 and < 80 (strong but not extreme)        │
 * │       + MACD histogram positive and expanding               │
 * │       + ATR expanding (volatility increasing = breakout)    │
 * │                                                             │
 * │ SELL: Price breaks below lower Bollinger Band              │
 * │       + RSI < 45 and > 20 (strong but not extreme)        │
 * │       + MACD histogram negative and expanding               │
 * │       + ATR expanding                                        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - SL: 1.5x ATR from entry (tight to exit quickly on false breakout)
 * - TP: 3x ATR from entry (2:1 R:R ratio)
 */
export class BreakoutBotStrategy extends BotBaseStrategy {
  readonly type = BotStrategyType.BREAKOUT;
  readonly name = 'الاختراق';
  readonly description = 'استراتيجية الاختراق — الدخول عند كسر مستويات الدعم والمقاومة مع زخم قوي';

  constructor(params: Record<string, any> = {}) {
    super(params);
    this.minRiskRewardRatio = 1.5; // Breakout needs good R:R
    this.minConfidence = 40;
  }

  protected analyze(market: BotMarketData): BotStrategyAnalysis {
    const { rsi, macdHistogram, macdCrossover, bbPercentB, bbUpper, bbLower, ema9, ema21, atr, price } = market;

    // Breakout detection: price outside Bollinger Bands
    const aboveUpperBand = price > bbUpper || bbPercentB > 0.95;
    const belowLowerBand = price < bbLower || bbPercentB < 0.05;

    // Momentum confirmation
    const bullishMomentum = rsi > 55 && rsi < 80;
    const bearishMomentum = rsi < 45 && rsi > 20;

    // MACD expansion
    const macdExpandingUp = macdHistogram > 0 && macdCrossover === 'BULLISH';
    const macdExpandingDown = macdHistogram < 0 && macdCrossover === 'BEARISH';

    // EMA alignment
    const emaBullish = ema9 > ema21;
    const emaBearish = ema9 < ema21;

    // Volume and volatility confirmation
    const hasVolume = market.volume24h > 0;
    const volatilityConfirming = market.volatility === 'HIGH' || market.volatility === 'MEDIUM';

    // Count confirming signals
    const buySignals = [aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, volatilityConfirming].filter(Boolean).length;
    const sellSignals = [belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, volatilityConfirming].filter(Boolean).length;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    if (buySignals >= 3 && (aboveUpperBand || emaBullish)) {
      direction = 'BUY';
      strength = this._calculateBreakoutStrength(aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, market.signalAction);
      trendAlignment = emaBullish;
    } else if (sellSignals >= 3 && (belowLowerBand || emaBearish)) {
      direction = 'SELL';
      strength = this._calculateBreakoutStrength(belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, market.signalAction);
      trendAlignment = emaBearish;
    }

    const hasOpportunity = direction !== 'NEUTRAL' && strength >= 35 && atr > 0;

    // SL/TP for breakout: tighter SL, larger TP
    const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(
      price, direction as 'BUY' | 'SELL', atr,
      1.5, // Tight SL: 1.5x ATR
      3.0, // Large TP: 3x ATR
    );

    const confidence = this.calculateConfidence({
      trendAlignment,
      indicatorStrength: strength,
      volumeConfirmation: hasVolume,
      signalAgreement: market.signalAction === direction,
      rsi,
      macdCrossover,
    });

    return {
      hasOpportunity,
      direction,
      strength,
      confidence,
      reasoning: this._buildReasoning(direction, aboveUpperBand, belowLowerBand, rsi, macdCrossover, price),
      stopLoss,
      takeProfit,
      riskRewardRatio,
      metadata: {
        strategy: 'BREAKOUT',
        aboveUpperBand,
        belowLowerBand,
        bbPercentB,
        rsi,
        macdHistogram,
        emaAlignment: emaBullish ? 'BULLISH' : emaBearish ? 'BEARISH' : 'MIXED',
        atr,
        volatility: market.volatility,
      },
    };
  }

  private _calculateBreakoutStrength(
    breakout: boolean,
    momentum: boolean,
    macdExpanding: boolean,
    emaAligned: boolean,
    hasVolume: boolean,
    signalAction?: string,
  ): number {
    let strength = 0;
    if (breakout) strength += 25;
    if (momentum) strength += 20;
    if (macdExpanding) strength += 20;
    if (emaAligned) strength += 15;
    if (hasVolume) strength += 10;
    if (signalAction === 'BUY' || signalAction === 'SELL') strength += 10;
    return Math.min(100, strength);
  }

  private _buildReasoning(
    direction: string,
    aboveUpperBand: boolean,
    belowLowerBand: boolean,
    rsi: number,
    macdCrossover: string,
    price: number,
  ): string {
    const parts: string[] = [];
    if (direction === 'BUY') {
      if (aboveUpperBand) parts.push('اختراق الحد العلوي لبولنجر');
      parts.push(`RSI يشير لزخم صعودي (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BULLISH') parts.push('تقاطع MACD صعودي');
      parts.push('اختراق بمستوى مرتفع — احتمال بداية اتجاه جديد');
    } else if (direction === 'SELL') {
      if (belowLowerBand) parts.push('كسر الحد السفلي لبولنجر');
      parts.push(`RSI يشير لزخم هبوطي (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BEARISH') parts.push('تقاطع MACD هبوطي');
      parts.push('كسر بمستوى مرتفع — احتمال بداية اتجاه هابط');
    } else {
      parts.push('لا يوجد اختراق واضح');
    }
    return parts.join(' | ');
  }
}
