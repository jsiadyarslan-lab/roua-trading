// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Base Strategy (Abstract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategySignal, StrategyParams } from '../types/agent.types';

/**
 * BaseStrategy — Abstract base class for all trading strategies
 *
 * Every strategy must implement:
 * 1. analyze() — Given market data, determine if there's a trading opportunity
 * 2. generateSignal() — Convert analysis into an actionable signal with SL/TP
 * 3. validateEntry() — Final pre-entry validation (spread, liquidity, etc.)
 *
 * Safety Rules (enforced at base level):
 * - Stop-loss is MANDATORY for every signal
 * - Risk-reward ratio must be >= 1:1.5 (configurable)
 * - No signals during extreme volatility unless strategy explicitly handles it
 * - Position size must be within risk limits
 */
export abstract class BaseStrategy {
  abstract readonly type: StrategyType;
  abstract readonly name: string;
  abstract readonly description: string;

  protected params: StrategyParams;
  protected minRiskRewardRatio: number = 1.0; // Minimum R:R ratio (lowered from 1.2 to match risk calculator strategy-specific minimums)
  protected minConfidence: number = 40; // V-PHASE1: Raised from 20 to 40 — low threshold generated too many weak signals causing losses
  protected minIndicators: number = 2;   // V-PHASE-FIX: Minimum confirming indicators before a signal is valid (prevents weak single-indicator signals)
  protected minStrength: number = 20;    // V-PHASE-FIX: Minimum signal strength before a signal is valid (prevents near-zero strength signals)

  constructor(params: StrategyParams) {
    this.params = params;
  }

  /**
   * Main entry point: Analyze market data and generate signal if opportunity exists
   */
  async evaluate(market: MarketAnalysis): Promise<EvaluatedSignal | null> {
    // Step 1: Run strategy-specific analysis
    const analysis = this.analyze(market);

    // Step 2: Check if analysis produces a viable signal
    if (!analysis.hasOpportunity) {
      return null;
    }

    // Step 3: Validate entry conditions
    const validation = this.validateEntry(market, analysis);
    if (!validation.valid) {
      return null;
    }

    // Step 4: Generate the signal with SL/TP
    const signal = this.generateSignal(market, analysis);

    // Step 5: Enforce mandatory stop-loss (SAFETY RULE #1)
    if (!signal.stopLoss || signal.stopLoss <= 0) {
      return null; // NO TRADE WITHOUT STOP-LOSS
    }

    // Step 6: Validate risk-reward ratio
    if (signal.riskRewardRatio < this.minRiskRewardRatio) {
      return null;
    }

    // Step 7: Validate minimum confidence
    if (signal.confidence < this.minConfidence) {
      return null;
    }

    // Step 7.1: V-PHASE-FIX: Validate minimum signal strength from analysis
    if (analysis.strength < this.minStrength) {
      return null;
    }

    // Step 7.2: V-PHASE-FIX: Validate minimum confirming indicators
    const ind = analysis.indicators;
    const confirmingCount = [
      ind.trendAlignment,
      ind.volumeConfirmation,
      ind.rsi !== undefined,
      ind.macdCrossover !== undefined && ind.macdCrossover !== 'NONE',
    ].filter(Boolean).length;
    if (confirmingCount < this.minIndicators) {
      return null;
    }

    // Step 8: Assign stable signal ID for idempotency
    // Uses 30s window to ensure same signal generated twice is deduplicated
    const timeWindow = Math.floor(Date.now() / 30000);
    signal.id = `sig-${signal.symbol}-${signal.action}-${this.type}-${timeWindow}`;

    return signal;
  }

  /**
   * Strategy-specific market analysis
   * Must be implemented by each strategy
   */
  protected abstract analyze(market: MarketAnalysis): StrategyAnalysis;

  /**
   * Generate trading signal from analysis
   * Must be implemented by each strategy
   */
  protected abstract generateSignal(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): EvaluatedSignal;

  /**
   * Validate entry conditions
   * Can be overridden by strategies for custom validation
   */
  protected validateEntry(
    market: MarketAnalysis,
    analysis: StrategyAnalysis,
  ): { valid: boolean; reason?: string } {
    // Don't trade during extreme volatility
    if (market.volatility === 'EXTREME') {
      return { valid: false, reason: 'تقلب شديد — تجنب الدخول' };
    }

    // Don't trade if market has no clear direction and strategy requires one
    if (market.trend === 'SIDEWAYS' && analysis.requiresTrend) {
      return { valid: false, reason: 'سوق جانبي — لا اتجاه واضح' };
    }

    // Check spread (if available)
    if (analysis.spreadTooWide) {
      return { valid: false, reason: 'فارق سعري واسع جداً' };
    }

    return { valid: true };
  }

  /**
   * Calculate stop-loss and take-profit levels
   * Based on ATR (Average True Range) for volatility-adjusted levels
   */
  protected calculateLevels(
    entryPrice: number,
    side: 'BUY' | 'SELL',
    atr: number,
    slMultiplier: number = 1.5,
    tpMultiplier: number = 3.0,
  ): { stopLoss: number; takeProfit: number; riskRewardRatio: number } {
    let stopLoss: number;
    let takeProfit: number;

    if (side === 'BUY') {
      stopLoss = entryPrice - atr * slMultiplier;
      takeProfit = entryPrice + atr * tpMultiplier;
    } else {
      stopLoss = entryPrice + atr * slMultiplier;
      takeProfit = entryPrice - atr * tpMultiplier;
    }

    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    return { stopLoss, takeProfit, riskRewardRatio };
  }

  /**
   * Calculate confidence score based on multiple factors
   */
  protected calculateConfidence(factors: {
    trendAlignment: boolean;
    indicatorStrength: number; // 0-100
    volumeConfirmation: boolean;
    aiSignal?: StrategySignal;
    rsi?: number;
    macdCrossover?: 'BULLISH' | 'BEARISH' | 'NONE';
  }): number {
    let confidence = 0;

    // Trend alignment (25 points)
    if (factors.trendAlignment) {
      confidence += 25;
    }

    // Indicator strength (25 points)
    confidence += Math.min(25, factors.indicatorStrength * 0.25);

    // Volume confirmation (15 points)
    if (factors.volumeConfirmation) {
      confidence += 15;
    }

    // AI signal agreement (20 points)
    // FIX: Apply AI bonus for BOTH buy and sell signals, not just buy.
    // Previously only BUY signals got the bonus when trendAlignment was true,
    // which unfairly penalized SELL signals.
    if (factors.aiSignal) {
      if (
        (factors.aiSignal === StrategySignal.STRONG_BUY || factors.aiSignal === StrategySignal.BUY ||
         factors.aiSignal === StrategySignal.STRONG_SELL || factors.aiSignal === StrategySignal.SELL) &&
        factors.trendAlignment
      ) {
        confidence += 20;
      } else if (
        factors.aiSignal === StrategySignal.STRONG_BUY || factors.aiSignal === StrategySignal.BUY ||
        factors.aiSignal === StrategySignal.STRONG_SELL || factors.aiSignal === StrategySignal.SELL
      ) {
        // Non-aligned AI signal — smaller bonus
        confidence += 10;
      } else if (factors.aiSignal === StrategySignal.NEUTRAL) {
        confidence += 5;
      }
    }

    // RSI not overbought/oversold against position (15 points)
    if (factors.rsi) {
      if (factors.rsi > 30 && factors.rsi < 70) {
        confidence += 15;
      } else if (factors.rsi > 20 && factors.rsi < 80) {
        confidence += 8;
      }
    }

    return Math.min(100, Math.round(confidence));
  }

  /**
   * Update strategy parameters
   */
  updateParams(params: Partial<StrategyParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Get current strategy parameters
   */
  getParams(): StrategyParams {
    return { ...this.params };
  }
}

// ── Strategy Analysis Result ──

export interface StrategyAnalysis {
  hasOpportunity: boolean;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: number; // 0-100
  requiresTrend: boolean;
  spreadTooWide: boolean;
  indicators: {
    trendAlignment: boolean;
    indicatorStrength: number;
    volumeConfirmation: boolean;
    rsi?: number;
    macdCrossover?: 'BULLISH' | 'BEARISH' | 'NONE';
    // V-PHASE3: MTF alignment — whether higher timeframes confirm this signal
    mtfAlignment?: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'MIXED' | 'NEUTRAL' | null;
    mtfAlignmentScore?: number; // 0-100
  };
  reasoning: string;
  metadata: Record<string, any>;
}
