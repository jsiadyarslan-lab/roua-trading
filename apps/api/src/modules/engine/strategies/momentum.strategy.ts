// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Momentum Strategy (Bot)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BotBaseStrategy } from './bot-base-strategy';
import {
  BotStrategyType,
  BotMarketData,
  BotStrategyAnalysis,
} from './bot-strategy.types';

/**
 * MomentumStrategy — Trade with the momentum, not against it
 *
 * Based on the principle that assets with strong recent performance tend
 * to continue performing well in the near term. Focuses on rate of change
 * and relative strength to identify the strongest movers.
 *
 * Characteristics:
 * - Win rate: 45-55% (moderate but with good R:R)
 * - Holding period: Hours to days
 * - Works best in: Trending markets with clear momentum
 * - Risk: Momentum reversals (sudden trend changes)
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  Strong positive 24h change (> 1.5%)                  │
 * │       + RSI > 50 and < 75 (bullish but not overbought)     │
 * │       + MACD histogram positive                             │
 * │       + Price above EMA9 (short-term momentum)              │
 * │       + Volume confirmation (24h volume > 0)                │
 * │                                                             │
 * │ SELL: Strong negative 24h change (< -1.5%)                 │
 * │       + RSI < 50 and > 25 (bearish but not oversold)        │
 * │       + MACD histogram negative                             │
 * │       + Price below EMA9                                    │
 * │       + Volume confirmation                                 │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - SL: 1.5x ATR from entry
 * - TP: 3x ATR from entry (2:1 R:R ratio)
 * - Position sizing: Based on momentum strength
 *
 * Sources:
 * - "Momentum Investing" — Jegadeesh & Titman academic research
 * - "Relative Strength Investing" — proven in equity and crypto markets
 */
export class MomentumBotStrategy extends BotBaseStrategy {
  readonly type = BotStrategyType.MOMENTUM;
  readonly name = 'الزخم';
  readonly description = 'استراتيجية الزخم — تداول مع اتجاه السعر القوي بناءً على معدل التغيير';

  private readonly minChangePercent: number;
  private readonly rsiBullishMin: number;
  private readonly rsiBullishMax: number;
  private readonly rsiBearishMin: number;
  private readonly rsiBearishMax: number;

  constructor(params: Record<string, any> = {}) {
    super(params);
    this.minChangePercent = params.minChangePercent ?? 1.5;
    this.rsiBullishMin = params.rsiBullishMin ?? 50;
    this.rsiBullishMax = params.rsiBullishMax ?? 75;
    this.rsiBearishMin = params.rsiBearishMin ?? 25;
    this.rsiBearishMax = params.rsiBearishMax ?? 50;
    this.minRiskRewardRatio = 1.3;
    this.minConfidence = 40;
  }

  protected analyze(market: BotMarketData): BotStrategyAnalysis {
    const { rsi, macdHistogram, macdCrossover, ema9, ema21, atr, price, changePercent24h, volume24h } = market;

    // ── Momentum Detection ──
    const strongBullishChange = changePercent24h > this.minChangePercent;
    const strongBearishChange = changePercent24h < -this.minChangePercent;
    const moderateBullishChange = changePercent24h > 0.5;
    const moderateBearishChange = changePercent24h < -0.5;

    // RSI zones
    const rsiBullishZone = rsi > this.rsiBullishMin && rsi < this.rsiBullishMax;
    const rsiBearishZone = rsi > this.rsiBearishMin && rsi < this.rsiBearishMax;

    // MACD confirmation
    const macdBullish = macdHistogram > 0 || macdCrossover === 'BULLISH';
    const macdBearish = macdHistogram < 0 || macdCrossover === 'BEARISH';

    // Price momentum (above/below short-term EMA)
    const priceAboveEma9 = price > ema9;
    const priceBelowEma9 = price < ema9;

    // Volume confirmation
    const hasVolume = volume24h > 0;

    // EMA trend
    const emaBullish = ema9 > ema21;
    const emaBearish = ema9 < ema21;

    // Count confirming signals
    const buySignals = [
      strongBullishChange || moderateBullishChange,
      rsiBullishZone,
      macdBullish,
      priceAboveEma9,
      hasVolume,
      emaBullish,
    ].filter(Boolean).length;

    const sellSignals = [
      strongBearishChange || moderateBearishChange,
      rsiBearishZone,
      macdBearish,
      priceBelowEma9,
      hasVolume,
      emaBearish,
    ].filter(Boolean).length;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // BUY: Strong momentum with confirming indicators
    if (buySignals >= 3 && (strongBullishChange || macdBullish)) {
      direction = 'BUY';
      strength = this._calculateMomentumStrength(
        strongBullishChange, rsiBullishZone, macdBullish, priceAboveEma9, emaBullish, hasVolume, market.signalAction,
      );
      trendAlignment = emaBullish;
    }
    // SELL: Strong bearish momentum with confirming indicators
    else if (sellSignals >= 3 && (strongBearishChange || macdBearish)) {
      direction = 'SELL';
      strength = this._calculateMomentumStrength(
        strongBearishChange, rsiBearishZone, macdBearish, priceBelowEma9, emaBearish, hasVolume, market.signalAction,
      );
      trendAlignment = emaBearish;
    }

    const hasOpportunity = direction !== 'NEUTRAL' && strength >= 35 && atr > 0;

    // SL/TP
    const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(
      price, direction as 'BUY' | 'SELL', atr,
      1.5, // SL: 1.5x ATR
      3.0, // TP: 3x ATR
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
      reasoning: this._buildReasoning(direction, changePercent24h, rsi, macdCrossover, price, ema9),
      stopLoss,
      takeProfit,
      riskRewardRatio,
      metadata: {
        strategy: 'MOMENTUM',
        changePercent24h,
        rsi,
        macdHistogram,
        emaAlignment: emaBullish ? 'BULLISH' : emaBearish ? 'BEARISH' : 'MIXED',
        atr,
        volume24h,
      },
    };
  }

  private _calculateMomentumStrength(
    strongChange: boolean,
    rsiAligned: boolean,
    macdAligned: boolean,
    priceVsEma9: boolean,
    emaAligned: boolean,
    hasVolume: boolean,
    signalAction?: string,
  ): number {
    let strength = 0;
    if (strongChange) strength += 25;
    if (rsiAligned) strength += 20;
    if (macdAligned) strength += 20;
    if (priceVsEma9) strength += 15;
    if (emaAligned) strength += 10;
    if (hasVolume) strength += 5;
    if (signalAction === 'BUY' || signalAction === 'SELL') strength += 5;
    return Math.min(100, strength);
  }

  private _buildReasoning(
    direction: string,
    changePercent: number,
    rsi: number,
    macdCrossover: string,
    price: number,
    ema9: number,
  ): string {
    const parts: string[] = [];
    if (direction === 'BUY') {
      parts.push(`زخم صعودي (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% خلال 24 ساعة)`);
      parts.push(`RSI في منطقة شرائية (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BULLISH') parts.push('تقاطع MACD صعودي');
      parts.push(`السعر فوق EMA9 (${price.toFixed(2)} > ${ema9.toFixed(2)})`);
    } else if (direction === 'SELL') {
      parts.push(`زخم هبوطي (${changePercent.toFixed(2)}% خلال 24 ساعة)`);
      parts.push(`RSI في منطقة بيعية (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BEARISH') parts.push('تقاطع MACD هبوطي');
      parts.push(`السعر تحت EMA9 (${price.toFixed(2)} < ${ema9.toFixed(2)})`);
    } else {
      parts.push('لا يوجد زخم كافٍ للدخول');
    }
    return parts.join(' | ');
  }
}
