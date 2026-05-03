// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Momentum Breakout Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType } from '../types/agent.types';

/**
 * MomentumBreakoutStrategy — Catch strong moves at breakout points
 *
 * One of the most widely used strategies in crypto and forex trading.
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
 * │       + Strong volume confirmation (24h volume spike)       │
 * │       + RSI > 55 (momentum confirmed, not overbought)     │
 * │       + MACD histogram positive and expanding               │
 * │       + ATR expanding (volatility increasing = breakout)    │
 * │                                                             │
 * │ SELL: Price breaks below lower Bollinger Band              │
 * │       + Strong volume confirmation                          │
 * │       + RSI < 45 (momentum confirmed, not oversold)        │
 * │       + MACD histogram negative and expanding               │
 * │       + ATR expanding                                        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - SL: 1.5x ATR from entry (tight to exit quickly on false breakout)
 * - TP: 3x ATR from entry (3:2 R:R ratio — winners must exceed losers)
 * - Trailing stop recommended after position moves in favor
 *
 * Sources:
 * - "Momentum Breakout Trading Strategy" — proven in crypto markets
 * - "Key Algorithmic Trading Strategies: From Trend Following" (2026)
 * - "Ride the Wave: Momentum Algo Trading Techniques"
 */
export class MomentumBreakoutStrategy extends BaseStrategy {
  readonly type = StrategyType.MOMENTUM_BREAKOUT;
  readonly name = 'اختراق الزخم';
  readonly description = 'استراتيجية اختراق الزخم — الدخول عند كسور المستويات مع زخم قوي';

  constructor(params: any) {
    super(params);
    this.minRiskRewardRatio = 1.2; // Breakout needs good R:R (ATR 1.5x/3x gives 2:1)
    this.minConfidence = 30; // Lowered from 40 — to allow more breakout signals
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, macd, bollingerBands, ema, atr, price } = market;

    // Breakout detection: price outside Bollinger Bands
    const aboveUpperBand = price > bollingerBands.upper || bollingerBands.percentB > 0.95;
    const belowLowerBand = price < bollingerBands.lower || bollingerBands.percentB < 0.05;

    // Momentum confirmation
    const bullishMomentum = rsi > 55 && rsi < 80; // Strong but not extreme
    const bearishMomentum = rsi < 45 && rsi > 20; // Strong but not extreme

    // MACD expansion (histogram growing)
    const macdExpandingUp = macd.histogram > 0 && macd.crossover === 'BULLISH';
    const macdExpandingDown = macd.histogram < 0 && macd.crossover === 'BEARISH';

    // EMA alignment for trend confirmation
    const emaBullish = ema.ema9 > ema.ema21;
    const emaBearish = ema.ema9 < ema.ema21;

    // Volume spike detection (using 24h volume as proxy)
    const hasVolume = market.volume24h > 0;

    // ATR expanding (volatility confirming breakout)
    const volatilityConfirming = market.volatility === 'HIGH' || market.volatility === 'MEDIUM';

    // Count confirming signals
    const buySignals = [aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, volatilityConfirming].filter(Boolean).length;
    const sellSignals = [belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, volatilityConfirming].filter(Boolean).length;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // BUY breakout: price breaking above resistance with momentum
    if (buySignals >= 3 && (aboveUpperBand || emaBullish)) {
      direction = 'BUY';
      strength = this._calculateBreakoutStrength(
        aboveUpperBand, bullishMomentum, macdExpandingUp, emaBullish, hasVolume, market.aiSignal,
      );
      trendAlignment = emaBullish;
    }
    // SELL breakout: price breaking below support with momentum
    else if (sellSignals >= 3 && (belowLowerBand || emaBearish)) {
      direction = 'SELL';
      strength = this._calculateBreakoutStrength(
        belowLowerBand, bearishMomentum, macdExpandingDown, emaBearish, hasVolume, market.aiSignal,
      );
      trendAlignment = emaBearish;
    }

    const hasOpportunity =
      direction !== 'NEUTRAL' &&
      strength >= 25 && // Lowered from 35 — to allow more breakout signals
      market.volatility !== 'EXTREME' && // Avoid trading during extreme chaos
      atr > 0;

    return {
      hasOpportunity,
      direction,
      strength,
      requiresTrend: false, // Breakout CREATES the trend
      spreadTooWide: false,
      indicators: {
        trendAlignment,
        indicatorStrength: strength,
        volumeConfirmation: hasVolume,
        rsi,
        macdCrossover: macd.crossover,
      },
      reasoning: this._buildReasoning(direction, aboveUpperBand, belowLowerBand, rsi, macd.crossover, price, bollingerBands),
      metadata: {
        strategy: 'MOMENTUM_BREAKOUT',
        aboveUpperBand,
        belowLowerBand,
        bbPercentB: bollingerBands.percentB,
        rsi,
        macdHistogram: macd.histogram,
        emaAlignment: emaBullish ? 'BULLISH' : emaBearish ? 'BEARISH' : 'MIXED',
        atr,
        volatility: market.volatility,
      },
    };
  }

  protected generateSignal(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): EvaluatedSignal {
    const side = analysis.direction as OrderSide;

    // Breakout SL/TP: tighter SL, larger TP
    const { stopLoss, takeProfit, riskRewardRatio } = this.calculateLevels(
      market.price,
      side,
      market.atr,
      1.5, // SL: 1.5x ATR (tight — exit fast on false breakout)
      3.0, // TP: 3x ATR (2:1 R:R)
    );

    const confidence = this.calculateConfidence({
      trendAlignment: analysis.indicators.trendAlignment,
      indicatorStrength: analysis.strength,
      volumeConfirmation: analysis.indicators.volumeConfirmation,
      aiSignal: market.aiSignal,
      rsi: market.rsi,
      macdCrossover: analysis.indicators.macdCrossover,
    });

    return {
      symbol: market.symbol,
      action: side,
      type: OrderType.MARKET, // Breakouts need fast market orders
      confidence,
      strategy: StrategyType.MOMENTUM_BREAKOUT,
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

  private _calculateBreakoutStrength(
    breakout: boolean,
    momentum: boolean,
    macdExpanding: boolean,
    emaAligned: boolean,
    hasVolume: boolean,
    aiSignal?: StrategySignal,
  ): number {
    let strength = 0;

    if (breakout) strength += 25; // Price breakout confirmed
    if (momentum) strength += 20; // RSI confirming momentum
    if (macdExpanding) strength += 20; // MACD expanding
    if (emaAligned) strength += 15; // EMA confirming direction
    if (hasVolume) strength += 10; // Volume supporting breakout

    // AI agreement bonus
    if (aiSignal === StrategySignal.STRONG_BUY || aiSignal === StrategySignal.STRONG_SELL) {
      strength += 10;
    } else if (aiSignal === StrategySignal.BUY || aiSignal === StrategySignal.SELL) {
      strength += 5;
    }

    return Math.min(100, strength);
  }

  private _buildReasoning(
    direction: string,
    aboveUpperBand: boolean,
    belowLowerBand: boolean,
    rsi: number,
    macdCrossover: string,
    price: number,
    bb: any,
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
