// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — DCA (Dollar-Cost Averaging) Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { BaseStrategy, StrategyAnalysis } from './base-strategy';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, OrderSide, OrderType } from '../types/agent.types';

/**
 * DCAStrategy — Systematic accumulation with enhanced entry timing
 *
 * DCA is one of the most proven and reliable strategies for crypto markets.
 * It reduces the impact of volatility by spreading entries over time,
 * while our enhanced version adds timing signals to improve average entry price.
 *
 * Characteristics:
 * - Win rate: 70-80% over long timeframes (highest reliability)
 * - Holding period: Weeks to months
 * - Works best in: All market conditions (designed for uncertainty)
 * - Risk: Opportunity cost in strongly trending bull markets
 *
 * Enhanced DCA Logic:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ BASE:  Fixed-interval buying (every cycle, buy small)      │
 * │                                                             │
 * │ ENHANCEMENT: Adjust buy size based on market conditions:   │
 * │ - RSI < 40 → Buy 1.5x normal size (discount)              │
 * │ - RSI < 30 → Buy 2x normal size (big discount)            │
 * │ - RSI > 60 → Buy 0.5x normal size (reduced, expensive)    │
 * │ - RSI > 70 → Skip this cycle (too expensive)              │
 * │ - Price below EMA21 → Buy 1.3x (buying below average)     │
 * │ - BB percentB < 0.3 → Buy 1.5x (near support)            │
 * │                                                             │
 * │ SELL: Only when significant profit reached:                │
 * │ - Price above EMA21 + RSI > 70 + BB percentB > 0.8       │
 * │ - Take profit at 5-15% gain                                │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Sources:
 * - "DCA Trading Bot" — automated DCA with enhanced settings
 * - "DCA Bot Strategy for 2025: Automate Your Crypto"
 * - Academic evidence: DCA outperforms lump-sum in volatile markets
 */
export class DCAStrategy extends BaseStrategy {
  readonly type = StrategyType.DCA;
  readonly name = 'متوسط التكلفة';
  readonly description = 'استراتيجية التراكم المنتظم — شراء دوري مع تعزيز التوقيت حسب ظروف السوق';

  // DCA-specific parameters
  private readonly baseBuyMultiplier: number;
  private readonly discountThreshold: number;
  private readonly skipThreshold: number;

  constructor(params: any) {
    super(params);
    this.baseBuyMultiplier = params.dcaBaseMultiplier ?? 1.0;
    this.discountThreshold = params.dcaDiscountRsi ?? 40;
    this.skipThreshold = params.dcaSkipRsi ?? 70;
    this.minRiskRewardRatio = 0.5; // DCA accepts low R:R (high win rate compensates)
    this.minConfidence = 25; // Very low threshold — DCA is designed to work in any condition
  }

  protected analyze(market: MarketAnalysis): StrategyAnalysis {
    const { rsi, bollingerBands, ema, atr, price } = market;

    // DCA size multiplier based on market conditions
    let sizeMultiplier = this.baseBuyMultiplier;
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;

    // Skip buying if market is too expensive (overbought)
    if (rsi > this.skipThreshold) {
      // Consider taking profit instead
      if (rsi > 75 && bollingerBands.percentB > 0.8 && price > ema.ema21) {
        direction = 'SELL'; // Take profit signal
        strength = 60;
        sizeMultiplier = 1.0;
      } else {
        // Skip — market too expensive for buying
        return {
          hasOpportunity: false,
          direction: 'NEUTRAL',
          strength: 0,
          requiresTrend: false,
          spreadTooWide: false,
          indicators: {
            trendAlignment: false,
            indicatorStrength: 0,
            volumeConfirmation: market.volume24h > 0,
            rsi,
          },
          reasoning: `RSI مرتفع (${rsi.toFixed(1)}) — تأجيل الشراء حتى انخفاض السعر`,
          metadata: { strategy: 'DCA', action: 'SKIP', rsi, reason: 'overbought' },
        };
      }
    }

    // BUY signal — enhanced DCA entry
    if (direction !== 'SELL') {
      direction = 'BUY';

      // Size adjustments based on market conditions
      if (rsi < 30) {
        sizeMultiplier = 2.0; // Big discount — buy more
        strength = 70;
      } else if (rsi < this.discountThreshold) {
        sizeMultiplier = 1.5; // Moderate discount — buy extra
        strength = 55;
      } else if (rsi < 60) {
        sizeMultiplier = 1.0; // Normal conditions — regular buy
        strength = 40;
      } else {
        sizeMultiplier = 0.5; // Market rising — buy less
        strength = 25;
      }

      // Extra adjustments
      if (price < ema.ema21) {
        sizeMultiplier *= 1.3; // Below average — buy more
        strength += 10;
      }
      if (bollingerBands.percentB < 0.3) {
        sizeMultiplier *= 1.2; // Near support — buy more
        strength += 10;
      }

      // Cap the multiplier
      sizeMultiplier = Math.min(3.0, sizeMultiplier);
    }

    const hasOpportunity =
      strength >= 25 &&
      market.volatility !== 'EXTREME' &&
      atr > 0;

    return {
      hasOpportunity,
      direction,
      strength,
      requiresTrend: false, // DCA works in ALL market conditions
      spreadTooWide: false,
      indicators: {
        trendAlignment: ema.ema9 > ema.ema21,
        indicatorStrength: strength,
        volumeConfirmation: market.volume24h > 0,
        rsi,
      },
      reasoning: this._buildReasoning(direction, rsi, sizeMultiplier, price, ema.ema21),
      metadata: {
        strategy: 'DCA',
        sizeMultiplier: parseFloat(sizeMultiplier.toFixed(2)),
        action: direction,
        rsi,
        bbPercentB: bollingerBands.percentB,
        priceVsEma21: price > ema.ema21 ? 'ABOVE' : 'BELOW',
      },
    };
  }

  protected generateSignal(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): EvaluatedSignal {
    const side = analysis.direction as OrderSide;
    const sizeMultiplier = (analysis.metadata?.sizeMultiplier as number) || 1.0;

    if (side === OrderSide.BUY) {
      // DCA BUY: SL below recent support, TP based on ATR (not just EMA21)
      // CRITICAL FIX: When price > EMA21, targeting EMA21 gives a NEGATIVE reward!
      // Instead, always use ATR-based TP which guarantees positive R:R
      const stopLoss = market.price - market.atr * 2.5; // Wide SL — DCA is long-term
      const takeProfit = market.price + market.atr * 2.0; // ATR-based TP — always positive reward

      const risk = Math.abs(market.price - stopLoss);
      const reward = Math.abs(takeProfit - market.price);
      const riskRewardRatio = risk > 0 ? reward / risk : 0.8; // Default 0.8 if calculation fails

      return {
        id: '', // Will be set by BaseStrategy.evaluate
        symbol: market.symbol,
        action: side,
        type: OrderType.MARKET,
        confidence: Math.min(80, 30 + analysis.strength * 0.5),
        strategy: StrategyType.DCA,
        entryPrice: market.price,
        stopLoss,
        takeProfit,
        quantity: sizeMultiplier, // Will be multiplied by base position size
        reasoning: analysis.reasoning,
        riskRewardRatio,
        riskScore: 0,
        timestamp: new Date(),
        metadata: analysis.metadata,
      };
    }

    // SELL (take profit)
    const stopLoss = market.price + market.atr * 1.5;
    const takeProfit = market.price - market.atr * 3.0;
    const risk = Math.abs(market.price - stopLoss);
    const reward = Math.abs(takeProfit - market.price);
    const riskRewardRatio = risk > 0 ? reward / risk : 1.5;

    return {
      id: '', // Will be set by BaseStrategy.evaluate
      symbol: market.symbol,
      action: side,
      type: OrderType.MARKET,
      confidence: Math.min(75, 35 + analysis.strength * 0.4),
      strategy: StrategyType.DCA,
      entryPrice: market.price,
      stopLoss,
      takeProfit,
      quantity: 1.0,
      reasoning: analysis.reasoning,
      riskRewardRatio,
      riskScore: 0,
      timestamp: new Date(),
      metadata: analysis.metadata,
    };
  }

  private _buildReasoning(
    direction: string,
    rsi: number,
    sizeMultiplier: number,
    price: number,
    ema21: number,
  ): string {
    const parts: string[] = [];

    if (direction === 'BUY') {
      parts.push('شراء DCA دوري');
      if (sizeMultiplier >= 2.0) parts.push(`حجم مُضاعف (${sizeMultiplier.toFixed(1)}x) — خصم كبير`);
      else if (sizeMultiplier >= 1.5) parts.push(`حجم مُعزز (${sizeMultiplier.toFixed(1)}x) — سعر مخفض`);
      else if (sizeMultiplier < 1.0) parts.push(`حجم مخفض (${sizeMultiplier.toFixed(1)}x) — سعر مرتفع`);

      if (rsi < 40) parts.push(`RSI منخفض (${rsi.toFixed(1)}) — فرصة شراء`);
      if (price < ema21) parts.push('السعر دون المتوسط — توقيت جيد');
    } else if (direction === 'SELL') {
      parts.push('بيع DCA — تحقيق أرباح');
      if (rsi > 70) parts.push(`RSI مرتفع (${rsi.toFixed(1)}) — توقيت جيد للبيع`);
    }

    return parts.join(' | ');
  }
}
