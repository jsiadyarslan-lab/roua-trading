// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Scalping Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType } from '../types/agent.types';

/**
 * ScalpingStrategy — High-frequency, small-profit trades
 *
 * Characteristics:
 * - Timeframe: 1-5 minute candles
 * - Holding period: Seconds to minutes
 * - Take profit: Small (5-20 pips)
 * - Stop loss: Tight (3-10 pips)
 * - Requires: Low spread, high volume, clear micro-trends
 *
 * Entry Conditions:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BUY:  RSI < 35 (oversold) + MACD bullish crossover         │
 * │       + Price near lower Bollinger Band + EMA9 > EMA21     │
 * │                                                             │
 * │ SELL: RSI > 65 (overbought) + MACD bearish crossover      │
 * │       + Price near upper Bollinger Band + EMA9 < EMA21    │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Risk Management:
 * - ATR-based SL/TP (1x ATR for SL, 1.5x ATR for TP)
 * - Maximum spread check (reject if spread too wide)
 * - No trades during extreme volatility
 */
export class ScalpingStrategy extends BaseStrategy {
  readonly type = StrategyType.SCALPING;
  readonly name = 'مضاربة سريعة';
  readonly description = 'استراتيجية المضاربة السريعة — صفقات قصيرة الأجل بأرباح صغيرة متكررة';

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
    // In typical markets, BB %B oscillates between 0.3-0.7, so wider thresholds capture more
    const nearLowerBand = bollingerBands.percentB < 0.45;
    const nearUpperBand = bollingerBands.percentB > 0.55;

    // Check spread (using ATR as proxy — if ATR is very low relative to price, spread may be too wide)
    const spreadTooWide = atr > 0 && (atr / market.price) * 100 > 0.5;

    // Determine direction
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let trendAlignment = false;

    // BUY signal: oversold + bullish indicators
    // Relaxed: requires ANY 2 of 4 indicators (no mandatory subset)
    // Previously required (isOversold || bullishMACD) as mandatory — too strict
    const buySignals = [isOversold, bullishMACD, nearLowerBand, bullishTrend].filter(Boolean).length;
    const sellSignals = [isOverbought, bearishMACD, nearUpperBand, bearishTrend].filter(Boolean).length;

    if (buySignals >= 2) {
      direction = 'BUY';
      strength = this._calculateScalpStrength(
        isOversold, bullishMACD, nearLowerBand, bullishTrend, market.aiSignal,
      );
      trendAlignment = bullishTrend;
    }
    // SELL signal: overbought + bearish indicators
    else if (sellSignals >= 2) {
      direction = 'SELL';
      strength = this._calculateScalpStrength(
        isOverbought, bearishMACD, nearUpperBand, bearishTrend, market.aiSignal,
      );
      trendAlignment = bearishTrend;
    }

    // Lowered strength threshold from 20 → 15 to allow more trades in typical markets
    // With 4 indicator checks, even 1-2 matches should be valid for scalping
    const hasOpportunity =
      direction !== 'NEUTRAL' &&
      strength >= 15 &&
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
      },
      reasoning: this._buildReasoning(direction, rsi, macd.crossover, bollingerBands.percentB, ema),
      metadata: {
        strategy: 'SCALPING',
        rsi,
        macdHistogram: macd.histogram,
        bollingerPercentB: bollingerBands.percentB,
        emaCrossover: bullishTrend ? 'BULLISH' : bearishTrend ? 'BEARISH' : 'NONE',
        atr,
        spreadTooWide,
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
      1.5, // Quick TP: 1.5x ATR
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

    return parts.join(' | ');
  }
}
