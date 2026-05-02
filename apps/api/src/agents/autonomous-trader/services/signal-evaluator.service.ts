// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Signal Evaluator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { MarketAnalysis, EvaluatedSignal, StrategyType, StrategyParams } from '../types/agent.types';
import { BaseStrategy } from '../strategies/base-strategy';
import { ScalpingStrategy } from '../strategies/scalping.strategy';
import { SwingStrategy } from '../strategies/swing.strategy';
import { GridStrategy } from '../strategies/grid.strategy';
import { MeanReversionStrategy } from '../strategies/mean-reversion.strategy';
import { MomentumBreakoutStrategy } from '../strategies/momentum-breakout.strategy';
import { DCAStrategy } from '../strategies/dca.strategy';
import { VWAPRSIStrategy } from '../strategies/vwap-rsi.strategy';

/**
 * SignalEvaluatorService — Evaluates market data against strategies
 *
 * This service is the decision-making core of the autonomous agent.
 * It takes market analysis data and runs it through the configured
 * strategy to generate trading signals.
 *
 * Evaluation Pipeline:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Get the active strategy instance                        │
 * │ 2. Feed market analysis into strategy.evaluate()           │
 * │ 3. If signal generated → validate confidence & risk        │
 * │ 4. If valid → return EvaluatedSignal for execution         │
 * │ 5. If not → log reason and continue monitoring             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Multi-strategy support: Can evaluate the same market data
 * across multiple strategies and pick the best signal.
 */
@Injectable()
export class SignalEvaluatorService {
  private readonly logger = new Logger(SignalEvaluatorService.name);

  /** Active strategy instances per user */
  private readonly strategies = new Map<string, BaseStrategy>();

  constructor() {
    this.logger.log('📊 Signal Evaluator initialized');
  }

  /**
   * Evaluate market analysis using the configured strategy
   */
  async evaluate(
    market: MarketAnalysis,
    strategyType: StrategyType,
    strategyParams: StrategyParams,
    userId: string,
  ): Promise<EvaluatedSignal | null> {
    try {
      // Get or create strategy instance
      const strategy = this._getOrCreateStrategy(strategyType, strategyParams, userId);

      if (!strategy) {
        this.logger.warn(`Unknown strategy type: ${strategyType}`);
        return null;
      }

      // Run strategy evaluation
      const signal = await strategy.evaluate(market);

      if (!signal) {
        this.logger.debug(
          `📊 No signal for ${market.symbol} using ${strategyType} strategy`,
        );
        return null;
      }

      this.logger.log(
        `📊 Signal generated: ${signal.action} ${signal.symbol} ` +
        `(confidence: ${signal.confidence}%, R:R ${signal.riskRewardRatio.toFixed(2)}) ` +
        `— ${signal.reasoning.substring(0, 80)}`,
      );

      return signal;
    } catch (error: any) {
      this.logger.error(
        `Signal evaluation failed for ${market.symbol}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Evaluate market analysis across ALL strategies and return the best signal
   */
  async evaluateAll(
    market: MarketAnalysis,
    strategyParams: StrategyParams,
    userId: string,
  ): Promise<EvaluatedSignal | null> {
    const strategies: StrategyType[] = [
      StrategyType.SCALPING,
      StrategyType.SWING,
      StrategyType.GRID,
      StrategyType.MEAN_REVERSION,
      StrategyType.MOMENTUM_BREAKOUT,
      StrategyType.DCA,
      StrategyType.VWAP_RSI,
    ];

    const signals: EvaluatedSignal[] = [];

    for (const strategyType of strategies) {
      try {
        const signal = await this.evaluate(market, strategyType, strategyParams, userId);
        if (signal) {
          signals.push(signal);
        }
      } catch {
        // Continue with other strategies
      }
    }

    if (signals.length === 0) return null;

    // Pick the signal with the highest confidence
    signals.sort((a, b) => b.confidence - a.confidence);
    return signals[0];
  }

  /**
   * Update strategy parameters for a user
   */
  updateStrategy(userId: string, strategyType: StrategyType, params: StrategyParams): void {
    const key = `${userId}:${strategyType}`;
    this.strategies.delete(key); // Force recreation with new params
    this.logger.log(`📊 Strategy updated for user ${userId}: ${strategyType}`);
  }

  /**
   * Clear cached strategies for a user
   */
  clearUserStrategies(userId: string): void {
    for (const key of this.strategies.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.strategies.delete(key);
      }
    }
  }

  // ── Private Helpers ──

  private _getOrCreateStrategy(
    strategyType: StrategyType,
    params: StrategyParams,
    userId: string,
  ): BaseStrategy | null {
    const key = `${userId}:${strategyType}`;

    let strategy = this.strategies.get(key);
    if (strategy) return strategy;

    switch (strategyType) {
      case StrategyType.SCALPING:
        strategy = new ScalpingStrategy(params);
        break;
      case StrategyType.SWING:
        strategy = new SwingStrategy(params);
        break;
      case StrategyType.GRID:
        strategy = new GridStrategy(params);
        break;
      case StrategyType.MEAN_REVERSION:
        strategy = new MeanReversionStrategy(params);
        break;
      case StrategyType.MOMENTUM_BREAKOUT:
        strategy = new MomentumBreakoutStrategy(params);
        break;
      case StrategyType.DCA:
        strategy = new DCAStrategy(params);
        break;
      case StrategyType.VWAP_RSI:
        strategy = new VWAPRSIStrategy(params);
        break;
      default:
        return null;
    }

    this.strategies.set(key, strategy);
    return strategy;
  }
}
