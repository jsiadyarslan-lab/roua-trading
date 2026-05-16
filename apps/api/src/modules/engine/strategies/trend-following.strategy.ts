// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Trend Following Strategy (Bot)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BotBaseStrategy } from './bot-base-strategy';
import {
  BotStrategyType,
  BotMarketData,
  BotStrategyAnalysis,
  BotStrategySignal,
} from './bot-strategy.types';

/**
 * TrendFollowingStrategy — Ride the trend for maximum profit
 *
 * One of the most proven and widely used strategies in algorithmic trading.
 * Based on the principle that "the trend is your friend" — enters positions
 * in the direction of the established trend and rides it until reversal signals appear.
 *
 * Characteristics:
 * - Win rate: 40-50% (lower but with high R:R of 2:1+)
 * - Holding period: Hours to days
 * - Works best in: Strong trending markets (TRENDING_UP / TRENDING_DOWN)
 * - Risk: Whipsaws in sideways/choppy markets
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  Strong uptrend (EMA9 > EMA21 > EMA50)                │
 * │       + RSI > 45 and < 70 (momentum confirmed)             │
 * │       + MACD histogram positive or bullish crossover        │
 * │       + Price above EMA21                                   │
 * │       + Bollinger %B > 0.5 (above midpoint)                │
 * │                                                             │
 * │ SELL: Strong downtrend (EMA9 < EMA21 < EMA50)              │
 * │       + RSI < 55 and > 30 (momentum confirmed)             │
 * │       + MACD histogram negative or bearish crossover        │
 * │       + Price below EMA21                                   │
 * │       + Bollinger %B < 0.5 (below midpoint)                │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - SL: 2x ATR from entry (wide enough to survive pullbacks)
 * - TP: 4x ATR from entry (2:1 R:R ratio)
 * - Trailing stop recommended after 1x ATR profit
 *
 * Sources:
 * - "Trend Following" by Michael Covel — the definitive guide
 * - "Following the Trend" by Andreas Clenow — systematic trend following
 * - Academic: SSRN evidence for trend following in forex and crypto
 */
export class TrendFollowingStrategy extends BotBaseStrategy {
  readonly type = BotStrategyType.TREND_FOLLOWING;
  readonly name = 'متابعة الاتجاه';
  readonly description = 'استراتيجية متابعة الاتجاه — الدخول مع الاتجاه القوي والبقاء حتى الانعكاس';

  constructor(params: Record<string, any> = {}) {
    super(params);
    this.minRiskRewardRatio = 1.5; // Trend following needs good R:R
    this.minConfidence = 45;
  }

  protected analyze(market: BotMarketData): BotStrategyAnalysis {
    const { rsi, macdHistogram, macdCrossover, bbPercentB, ema9, ema21, ema50, atr, price } = market;

    // ── Trend Detection ──
    const strongUptrend = ema9 > ema21 && ema21 > ema50;
    const mildUptrend = ema9 > ema21;
    const strongDowntrend = ema9 < ema21 && ema21 < ema50;
    const mildDowntrend = ema9 < ema21;

    // ── Momentum Confirmation ──
    const bullishMomentum = rsi > 45 && rsi < 70;
    const bearishMomentum = rsi < 55 && rsi > 30;
    const macdBullish = macdHistogram > 0 || macdCrossover === 'BULLISH';
    const macdBearish = macdHistogram < 0 || macdCrossover === 'BEARISH';

    // ── Price Position ──
    const priceAboveEMA21 = price > ema21;
    const priceBelowEMA21 = price < ema21;

    // ── Bollinger Position ──
    const bbAboveMid = bbPercentB > 0.5;
    const bbBelowMid = bbPercentB < 0.5;

    // ── Count Confirmations ──
    const buySignals = [strongUptrend || mildUptrend, bullishMomentum, macdBullish, priceAboveEMA21, bbAboveMid].filter(Boolean).length;
    const sellSignals = [strongDowntrend || mildDowntrend, bearishMomentum, macdBearish, priceBelowEMA21, bbBelowMid].filter(Boolean).length;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // BUY: Confirmed uptrend with momentum
    if (buySignals >= 3 && (strongUptrend || mildUptrend)) {
      direction = 'BUY';
      strength = this._calculateTrendStrength(strongUptrend, bullishMomentum, macdBullish, priceAboveEMA21, bbAboveMid, market.signalAction);
      trendAlignment = strongUptrend;
    }
    // SELL: Confirmed downtrend with momentum
    else if (sellSignals >= 3 && (strongDowntrend || mildDowntrend)) {
      direction = 'SELL';
      strength = this._calculateTrendStrength(strongDowntrend, bearishMomentum, macdBearish, priceBelowEMA21, bbBelowMid, market.signalAction);
      trendAlignment = strongDowntrend;
    }

    const hasOpportunity = direction !== 'NEUTRAL' && strength >= 35;

    // Calculate SL/TP
    const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(
      price, direction as 'BUY' | 'SELL', atr,
      2.0, // Wide SL: 2x ATR
      4.0, // Large TP: 4x ATR
    );

    const confidence = this.calculateConfidence({
      trendAlignment,
      indicatorStrength: strength,
      volumeConfirmation: market.volume24h > 0,
      signalAgreement: market.signalAction === direction,
      rsi,
      macdCrossover,
    });

    return {
      hasOpportunity,
      direction,
      strength,
      confidence,
      reasoning: this._buildReasoning(direction, rsi, macdCrossover, ema9, ema21, ema50, price),
      stopLoss,
      takeProfit,
      riskRewardRatio,
      metadata: {
        strategy: 'TREND_FOLLOWING',
        strongUptrend,
        strongDowntrend,
        rsi,
        macdCrossover,
        emaAlignment: strongUptrend ? 'BULLISH' : strongDowntrend ? 'BEARISH' : 'MIXED',
        atr,
      },
    };
  }

  private _calculateTrendStrength(
    strongTrend: boolean,
    momentum: boolean,
    macdAligned: boolean,
    pricePosition: boolean,
    bbPosition: boolean,
    signalAction?: string,
  ): number {
    let strength = 0;
    if (strongTrend) strength += 30;
    if (momentum) strength += 25;
    if (macdAligned) strength += 20;
    if (pricePosition) strength += 10;
    if (bbPosition) strength += 10;
    // Signal agreement bonus
    if (signalAction === 'BUY' || signalAction === 'SELL') strength += 5;
    return Math.min(100, strength);
  }

  private _buildReasoning(
    direction: string,
    rsi: number,
    macdCrossover: string,
    ema9: number,
    ema21: number,
    ema50: number,
    price: number,
  ): string {
    const parts: string[] = [];
    if (direction === 'BUY') {
      if (ema9 > ema21 && ema21 > ema50) parts.push('اتجاه صعودي قوي (EMA9 > EMA21 > EMA50)');
      else if (ema9 > ema21) parts.push('اتجاه صعودي (EMA9 > EMA21)');
      parts.push(`RSI في منطقة صعودية (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BULLISH') parts.push('تقاطع MACD صعودي');
      parts.push(`السعر فوق EMA21 (${price.toFixed(2)} > ${ema21.toFixed(2)})`);
    } else if (direction === 'SELL') {
      if (ema9 < ema21 && ema21 < ema50) parts.push('اتجاه هبوطي قوي (EMA9 < EMA21 < EMA50)');
      else if (ema9 < ema21) parts.push('اتجاه هبوطي (EMA9 < EMA21)');
      parts.push(`RSI في منطقة هبوطية (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BEARISH') parts.push('تقاطع MACD هبوطي');
      parts.push(`السعر تحت EMA21 (${price.toFixed(2)} < ${ema21.toFixed(2)})`);
    } else {
      parts.push('لا يوجد اتجاه واضح — لا توجد فرصة');
    }
    return parts.join(' | ');
  }
}
