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
    this.minRiskRewardRatio = 2.0; // Swing requires better R:R
    this.minConfidence = 65; // Higher confidence threshold
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, macd, ema, atr, bollingerBands } = market;

    // Determine trend alignment
    const strongUptrend = ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50;
    const strongDowntrend = ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50;
    const mildUptrend = ema.ema9 > ema.ema21;
    const mildDowntrend = ema.ema9 < ema.ema21;

    // RSI pullback zones (buying in pullback within uptrend)
    const bullishPullback = rsi >= 35 && rsi <= 50;
    const bearishPullback = rsi >= 50 && rsi <= 65;

    // MACD momentum
    const macdBullish = macd.histogram > 0 || macd.crossover === 'BULLISH';
    const macdBearish = macd.histogram < 0 || macd.crossover === 'BEARISH';

    // Price position relative to EMA21
    const priceAboveEMA21 = market.price > ema.ema21;
    const priceBelowEMA21 = market.price < ema.ema21;

    // Determine direction and strength
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // BUY: Uptrend + pullback + momentum
    if ((strongUptrend || mildUptrend) && bullishPullback && macdBullish && priceAboveEMA21) {
      direction = 'BUY';
      strength = this._calculateSwingStrength(
        strongUptrend, bullishPullback, macdBullish, priceAboveEMA21, market.aiSignal,
      );
      trendAlignment = strongUptrend;
    }
    // SELL: Downtrend + pullback + momentum
    else if ((strongDowntrend || mildDowntrend) && bearishPullback && macdBearish && priceBelowEMA21) {
      direction = 'SELL';
      strength = this._calculateSwingStrength(
        strongDowntrend, bearishPullback, macdBearish, priceBelowEMA21, market.aiSignal,
      );
      trendAlignment = strongDowntrend;
    }
    // Alternative: Strong MACD crossover with trend
    else if (macd.crossover === 'BULLISH' && mildUptrend && rsi < 60) {
      direction = 'BUY';
      strength = 55;
      trendAlignment = mildUptrend;
    } else if (macd.crossover === 'BEARISH' && mildDowntrend && rsi > 40) {
      direction = 'SELL';
      strength = 55;
      trendAlignment = mildDowntrend;
    }

    const hasOpportunity =
      direction !== 'NEUTRAL' &&
      strength >= 45 &&
      market.trend !== 'SIDEWAYS' &&
      market.volatility !== 'EXTREME';

    return {
      hasOpportunity,
      direction,
      strength,
      requiresTrend: true, // Swing REQUIRES a clear trend
      spreadTooWide: false, // Spread not a concern for swing
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
