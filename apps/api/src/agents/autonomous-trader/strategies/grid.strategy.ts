// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Grid Trading Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType, StrategyParams } from '../types/agent.types';

/**
 * GridStrategy — Range-bound market trading with grid levels
 *
 * Characteristics:
 * - Timeframe: Any (uses price levels, not time)
 * - Holding period: Variable (until grid completes)
 * - Take profit: Set at each grid level
 * - Stop loss: Below/above the grid range
 * - Requires: Range-bound market (sideways)
 *
 * How it works:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ The grid strategy places buy orders below current price    │
 * │ and sell orders above current price at regular intervals.  │
 * │                                                             │
 * │ Upper Bound ──── SELL SELL SELL ──── TP Level             │
 * │        │                                                    │
 * │ Current ──────── ENTRY POINT                               │
 * │        │                                                    │
 * │ Lower Bound ──── BUY BUY BUY ────── SL Level              │
 * │                                                             │
 * │ When price moves down → Buy orders fill                    │
 * │ When price moves up → Sell orders fill                     │
 * │ Profit from each grid level spread                         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Entry Conditions:
 * - Market is ranging (Bollinger Band bandwidth < threshold)
 * - RSI is neutral (40-60)
 * - No strong trend
 *
 * Risk Management:
 * - Hard stop-loss below/above grid range
 * - Maximum number of grid levels
 * - Grid spacing based on ATR
 */
export class GridStrategy extends BaseStrategy {
  readonly type = StrategyType.GRID;
  readonly name = 'شبكي';
  readonly description = 'استراتيجية الشبكة — تداول في نطاق سعري بأوامر شراء وبيع متدرجة';

  // Grid-specific parameters
  private readonly gridLevels: number;
  private readonly gridSpacingPercent: number;
  private readonly gridQuantityPerLevel: number;

  constructor(params: StrategyParams) {
    super(params);
    this.gridLevels = params.gridLevels ?? 5;
    this.gridSpacingPercent = params.gridSpacingPercent ?? 0.5; // 0.5% spacing
    this.gridQuantityPerLevel = params.gridQuantityPerLevel ?? 0;
    this.minRiskRewardRatio = 1.2; // V-PHASE2: raised from 1.0 — grid must have decent R:R to be profitable
    this.minConfidence = 50; // Higher confidence required for grid
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, bollingerBands, ema, atr } = market;

    // Grid works best in ranging/sideways markets
    const isRanging = market.trend === 'SIDEWAYS' || bollingerBands.bandwidth < 0.04;

    // RSI in neutral zone (best for grid)
    const rsiNeutral = rsi >= 35 && rsi <= 65;

    // No strong trend (EMA alignment not extreme)
    const noStrongTrend = Math.abs(ema.ema9 - ema.ema21) / market.price < 0.01;

    // Bollinger Band squeeze (potential range)
    const bbSqueeze = bollingerBands.bandwidth < 0.03;

    // Grid opportunity exists when market is ranging
    const hasOpportunity =
      isRanging &&
      rsiNeutral &&
      market.volatility !== 'EXTREME' &&
      market.volatility !== 'HIGH' &&
      atr > 0; // Need ATR for grid spacing

    // Determine direction: Grid is always BOTH (buy below, sell above)
    // But we indicate the first direction based on current position
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (hasOpportunity) {
      // If price is in lower half of range, start with BUY
      // If price is in upper half, start with SELL
      direction = bollingerBands.percentB < 0.5 ? OrderSide.BUY : OrderSide.SELL;
    }

    const strength = this._calculateGridStrength(isRanging, rsiNeutral, noStrongTrend, bbSqueeze, market.aiSignal);

    return {
      hasOpportunity,
      direction,
      strength,
      requiresTrend: false, // Grid specifically does NOT require a trend
      spreadTooWide: false,
      indicators: {
        trendAlignment: !noStrongTrend, // For grid, "alignment" means no trend
        indicatorStrength: strength,
        volumeConfirmation: market.volume24h > 0,
        rsi,
      },
      reasoning: this._buildReasoning(hasOpportunity, isRanging, rsi, bollingerBands.bandwidth, market.price, bollingerBands),
      metadata: {
        strategy: 'GRID',
        isRanging,
        rsiNeutral,
        bbSqueeze,
        bbBandwidth: bollingerBands.bandwidth,
        gridLevels: this.gridLevels,
        gridSpacingPercent: this.gridSpacingPercent,
        gridRange: this._calculateGridRange(market),
      },
    };
  }

  protected generateSignal(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): EvaluatedSignal {
    const side = analysis.direction as OrderSide;
    const gridRange = this._calculateGridRange(market);

    // For grid: SL is below the lower bound, TP is at the upper bound
    const stopLoss = side === OrderSide.BUY
      ? gridRange.lowerBound
      : gridRange.upperBound;

    const takeProfit = side === OrderSide.BUY
      ? gridRange.upperBound
      : gridRange.lowerBound;

    const risk = Math.abs(market.price - stopLoss);
    const reward = Math.abs(takeProfit - market.price);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    const confidence = this.calculateConfidence({
      trendAlignment: false, // Grid doesn't need trend
      indicatorStrength: analysis.strength,
      volumeConfirmation: analysis.indicators.volumeConfirmation,
      aiSignal: market.aiSignal,
      rsi: market.rsi,
    });

    return {
      id: '', // Will be set by BaseStrategy.evaluate
      symbol: market.symbol,
      action: side,
      type: OrderType.LIMIT, // Grid uses limit orders at each level
      confidence,
      strategy: StrategyType.GRID,
      entryPrice: market.price,
      stopLoss, // MANDATORY — below/above grid range
      takeProfit,
      quantity: 0, // Will be calculated by RiskCalculator
      reasoning: analysis.reasoning,
      riskRewardRatio,
      riskScore: 0, // Will be calculated by RiskCalculator
      timestamp: new Date(),
      metadata: {
        ...analysis.metadata,
        gridRange,
        gridLevels: this._generateGridLevels(market, gridRange),
      },
    };
  }

  /**
   * Override validateEntry for grid-specific validation
   */
  protected validateEntry(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): { valid: boolean; reason?: string } {
    // Grid does NOT work in trending markets
    if (market.trend === 'BULLISH' || market.trend === 'BEARISH') {
      if (market.trendStrength > 70) {
        return { valid: false, reason: 'اتجاه قوي جداً — الشبكة لا تعمل في الأسواق المتجهة' };
      }
    }

    // Must not be extreme volatility
    if (market.volatility === 'EXTREME' || market.volatility === 'HIGH') {
      return { valid: false, reason: 'تقلب عالي جداً — غير مناسب لاستراتيجية الشبكة' };
    }

    return { valid: true };
  }

  /**
   * Calculate the grid range based on current price and ATR
   */
  private _calculateGridRange(market: MarketAnalysis): {
    upperBound: number;
    lowerBound: number;
    centerPrice: number;
    totalRange: number;
  } {
    // Use Bollinger Bands as natural range if available
    const upperBound = market.bollingerBands.upper;
    const lowerBound = market.bollingerBands.lower;
    const centerPrice = market.bollingerBands.middle;
    const totalRange = upperBound - lowerBound;

    return { upperBound, lowerBound, centerPrice, totalRange };
  }

  /**
   * Generate all grid levels
   */
  private _generateGridLevels(
    market: MarketAnalysis,
    gridRange: { upperBound: number; lowerBound: number; totalRange: number },
  ): Array<{ price: number; side: OrderSide; quantity: number }> {
    const levels: Array<{ price: number; side: OrderSide; quantity: number }> = [];
    const totalRange = gridRange.upperBound - gridRange.lowerBound;
    const step = totalRange / (this.gridLevels + 1);

    for (let i = 1; i <= this.gridLevels; i++) {
      const price = gridRange.lowerBound + step * i;
      const side = price < market.price ? OrderSide.BUY : OrderSide.SELL;

      levels.push({
        price: parseFloat(price.toFixed(8)),
        side,
        quantity: this.gridQuantityPerLevel,
      });
    }

    return levels;
  }

  private _calculateGridStrength(
    isRanging: boolean,
    rsiNeutral: boolean,
    noStrongTrend: boolean,
    bbSqueeze: boolean,
    aiSignal?: StrategySignal,
  ): number {
    let strength = 0;

    if (isRanging) strength += 30;
    if (rsiNeutral) strength += 25;
    if (noStrongTrend) strength += 20;
    if (bbSqueeze) strength += 15;

    // AI signal — for grid, neutral is actually good
    if (aiSignal === StrategySignal.NEUTRAL) {
      strength += 10;
    }

    return Math.min(100, strength);
  }

  private _buildReasoning(
    hasOpportunity: boolean,
    isRanging: boolean,
    rsi: number,
    bbBandwidth: number,
    price: number,
    bb: any,
  ): string {
    if (!hasOpportunity) {
      return 'السوق ليس في نطاق مناسب للشبكة';
    }

    const parts: string[] = [];
    if (isRanging) parts.push('السوق في نطاق عرضي');
    parts.push(`RSI محايد (${rsi.toFixed(1)})`);
    parts.push(`عرض بولنجر: ${(bbBandwidth * 100).toFixed(2)}%`);
    parts.push(`النطاق: ${bb.lower.toFixed(2)} - ${bb.upper.toFixed(2)}`);
    parts.push(`${this.gridLevels} مستويات شبكة`);

    return parts.join(' | ');
  }
}
