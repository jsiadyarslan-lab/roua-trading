// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Swing Trading Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType } from '../types/agent.types';

/**
 * SwingStrategy — Medium-term position trading
 *
 * Characteristics:
 * - Timeframe: 1H-4H candles
 * - Holding period: Hours to days
 * - Take profit: Moderate (50-200 pips)
 * - Stop loss: Wider (30-100 pips)
 * - Requires: Clear trend, momentum confirmation
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  Clear uptrend (EMA9 > EMA21 > EMA50)                │
 * │       + RSI pullback to 40-50 zone + MACD histogram        │
 * │       turning positive + Price above EMA21                 │
 * │                                                             │
 * │ SELL: Clear downtrend (EMA9 < EMA21 < EMA50)              │
 * │       + RSI pullback to 50-60 zone + MACD histogram        │
 * │       turning negative + Price below EMA21                 │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - ATR-based SL/TP (2x ATR for SL, 4x ATR for TP)
 * - Trend must be confirmed by multiple EMA alignment
 * - Exit on trend reversal signal
 */
export class SwingStrategy extends BaseStrategy {
  readonly type = StrategyType.SWING;
  readonly name = 'تداول سوينغ';
  readonly description = 'استراتيجية السوينغ — صفقات متوسطة الأجل تعتمد على الاتجاه والزخم';

  private readonly holdingPeriodHours: number;

  constructor(params: any) {
    super(params);
    this.holdingPeriodHours = params.swingHoldingPeriodHours ?? 48;
    this.minRiskRewardRatio = 1.5; // Swing requires good R:R (using ATR 2x/4x gives 2:1)
    this.minConfidence = 30; // Lowered from 40 — was still too strict, signals in 30-40 range are valid
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, macd, ema, atr, bollingerBands } = market;

    // Determine trend alignment
    const strongUptrend = ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50;
    const strongDowntrend = ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50;
    const mildUptrend = ema.ema9 > ema.ema21;
    const mildDowntrend = ema.ema9 < ema.ema21;

    // RSI pullback zones — WIDENED for more signal generation
    // Old: 35-50 (BUY) / 50-65 (SELL) — too narrow, rarely triggered
    // New: 30-55 (BUY) / 45-70 (SELL) — captures more pullback opportunities
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

    // Determine direction and strength
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // PATH 1 (Primary): Uptrend + pullback + momentum (original, but with wider RSI)
    // Changed from 4-condition AND to 3-condition: relaxed priceAboveEMA21 requirement
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
    // PATH 2: Strong MACD crossover with mild trend (original alternative)
    else if (macd.crossover === 'BULLISH' && mildUptrend && rsi < 60) {
      direction = 'BUY';
      strength = 55;
      trendAlignment = mildUptrend;
    } else if (macd.crossover === 'BEARISH' && mildDowntrend && rsi > 40) {
      direction = 'SELL';
      strength = 55;
      trendAlignment = mildDowntrend;
    }
    // PATH 3 (NEW): Oversold/Overbought + Bollinger extreme + ANY trend hint
    // Captures reversal opportunities that the primary path misses
    else if (rsi < 35 && nearLowerBand && (mildUptrend || macdBullish)) {
      direction = 'BUY';
      strength = 45;
      trendAlignment = mildUptrend;
    } else if (rsi > 65 && nearUpperBand && (mildDowntrend || macdBearish)) {
      direction = 'SELL';
      strength = 45;
      trendAlignment = mildDowntrend;
    }
    // PATH 4 (NEW): Strong EMA alignment alone (no pullback needed)
    // Captures strong trending moves
    else if (strongUptrend && rsi < 65 && macdBullish) {
      direction = 'BUY';
      strength = 50;
      trendAlignment = true;
    } else if (strongDowntrend && rsi > 35 && macdBearish) {
      direction = 'SELL';
      strength = 50;
      trendAlignment = true;
    }

    const hasOpportunity =
      direction !== 'NEUTRAL' &&
      strength >= 20 &&
      market.volatility !== 'EXTREME';

    return {
      hasOpportunity,
      direction,
      strength,
      requiresTrend: false, // FIX: Changed from true — swing can trade in mild sideways too
                                // SIDEWAYS rejection was killing too many valid signals
      spreadTooWide: false,
      indicators: {
        trendAlignment,
        indicatorStrength: strength,
        volumeConfirmation: market.volume24h > 0,
        rsi,
        macdCrossover: macd.crossover,
      },
      reasoning: this._buildReasoning(direction, strongUptrend, strongDowntrend, rsi, macd.crossover, market.price, ema),
      metadata: {
        strategy: 'SWING',
        strongUptrend,
        strongDowntrend,
        rsi,
        macdHistogram: macd.histogram,
        priceVsEMA21: priceAboveEMA21 ? 'ABOVE' : 'BELOW',
        emaAlignment: strongUptrend ? 'BULLISH' : strongDowntrend ? 'BEARISH' : 'MIXED',
        holdingPeriodHours: this.holdingPeriodHours,
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

    const confidence = this.calculateConfidence({
      trendAlignment: analysis.indicators.trendAlignment,
      indicatorStrength: analysis.strength,
      volumeConfirmation: analysis.indicators.volumeConfirmation,
      aiSignal: market.aiSignal,
      rsi: market.rsi,
      macdCrossover: analysis.indicators.macdCrossover,
    });

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
  ): string {
    const parts: string[] = [];

    if (direction === 'BUY') {
      if (strongUptrend) parts.push('اتجاه صعودي قوي (EMA9 > EMA21 > EMA50)');
      parts.push(`ارتداد RSI إلى منطقة الشراء (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BULLISH') parts.push('تقاطع MACD صعودي');
      parts.push(`السعر (${price.toFixed(2)}) فوق EMA21 (${ema.ema21.toFixed(2)})`);
    } else if (direction === 'SELL') {
      if (strongDowntrend) parts.push('اتجاه هبوطي قوي (EMA9 < EMA21 < EMA50)');
      parts.push(`ارتداد RSI إلى منطقة البيع (${rsi.toFixed(1)})`);
      if (macdCrossover === 'BEARISH') parts.push('تقاطع MACD هبوطي');
      parts.push(`السعر (${price.toFixed(2)}) تحت EMA21 (${ema.ema21.toFixed(2)})`);
    } else {
      parts.push('لا يوجد اتجاه واضح للسوينغ');
    }

    return parts.join(' | ');
  }
}
