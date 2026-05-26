// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Bot Base Strategy (Abstract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  BotStrategyType,
  BotMarketData,
  BotStrategyAnalysis,
  BotStrategySignal,
} from './bot-strategy.types';

/**
 * BotBaseStrategy — Abstract base class for all bot trading strategies
 *
 * Every bot strategy must implement:
 * 1. analyze() — Given market data, determine if there's a trading opportunity
 * 2. getName() / getDescription() — Strategy metadata
 *
 * Safety Rules (enforced at base level):
 * - Stop-loss is MANDATORY for every signal
 * - Risk-reward ratio must be >= minRiskRewardRatio (default 1.2)
 * - No signals during extreme volatility unless strategy explicitly handles it
 * - Confidence must be >= minConfidence (default 40)
 */
export abstract class BotBaseStrategy {
  abstract readonly type: BotStrategyType;
  abstract readonly name: string;
  abstract readonly description: string;

  protected minRiskRewardRatio: number = 1.2;
  protected minConfidence: number = 40;
  protected params: Record<string, any>;

  constructor(params: Record<string, any> = {}) {
    this.params = params;
  }

  /**
   * Main entry point: Analyze market data and produce signal if opportunity exists
   */
  async evaluate(market: BotMarketData): Promise<BotStrategyAnalysis | null> {
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

    // Step 4: Enforce mandatory stop-loss (SAFETY RULE #1)
    if (!analysis.stopLoss || analysis.stopLoss <= 0) {
      return null;
    }

    // Step 5: Validate risk-reward ratio
    if (analysis.riskRewardRatio < this.minRiskRewardRatio) {
      return null;
    }

    // Step 6: Validate minimum confidence
    if (analysis.confidence < this.minConfidence) {
      return null;
    }

    return analysis;
  }

  /**
   * Strategy-specific market analysis — must be implemented by each strategy
   */
  protected abstract analyze(market: BotMarketData): BotStrategyAnalysis;

  /**
   * Validate entry conditions — can be overridden by strategies
   */
  protected validateEntry(
    market: BotMarketData,
    analysis: BotStrategyAnalysis,
  ): { valid: boolean; reason?: string } {
    // Don't trade during extreme volatility
    if (market.volatility === 'EXTREME') {
      return { valid: false, reason: 'تقلب شديد — تجنب الدخول' };
    }

    // Don't trade if no clear direction
    if (analysis.direction === 'NEUTRAL') {
      return { valid: false, reason: 'لا اتجاه واضح' };
    }

    return { valid: true };
  }

  /**
   * Calculate stop-loss and take-profit levels based on ATR
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
    indicatorStrength: number;
    volumeConfirmation: boolean;
    signalAgreement?: boolean;
    rsi?: number;
    macdCrossover?: 'BULLISH' | 'BEARISH' | 'NONE';
  }): number {
    let confidence = 0;

    // Trend alignment (25 points)
    if (factors.trendAlignment) confidence += 25;

    // Indicator strength (25 points)
    confidence += Math.min(25, factors.indicatorStrength * 0.25);

    // Volume confirmation (15 points)
    if (factors.volumeConfirmation) confidence += 15;

    // Signal agreement from SignalService (20 points)
    if (factors.signalAgreement) confidence += 20;

    // RSI not overbought/oversold against position (15 points)
    if (factors.rsi) {
      if (factors.rsi > 30 && factors.rsi < 70) confidence += 15;
      else if (factors.rsi > 20 && factors.rsi < 80) confidence += 8;
    }

    return Math.min(100, Math.round(confidence));
  }

  /**
   * Update strategy parameters
   */
  updateParams(params: Partial<Record<string, any>>): void {
    this.params = { ...this.params, ...params };
  }
}
