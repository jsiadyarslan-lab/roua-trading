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
import { AdaptiveStrategySelectorService } from './adaptive-strategy-selector.service';

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
 * AUTO Strategy:
 * When strategy type is AUTO, the service uses AdaptiveStrategySelector
 * to detect market regime and automatically select the best strategy.
 * This is the recommended mode for most users.
 */
@Injectable()
export class SignalEvaluatorService {
  private readonly logger = new Logger(SignalEvaluatorService.name);

  /** Active strategy instances per user */
  private readonly strategies = new Map<string, BaseStrategy>();

  /** Last AUTO-selected strategy per user (for logging) */
  private readonly lastAutoSelection = new Map<string, StrategyType>();

  constructor(
    private readonly adaptiveSelector: AdaptiveStrategySelectorService,
  ) {
    this.logger.log('📊 Signal Evaluator initialized (with AUTO adaptive selection)');
  }

  /**
   * Evaluate market analysis using the configured strategy
   *
   * When strategyType is AUTO:
   * 1. Detect market regime
   * 2. Score all strategies
   * 3. Select the best strategy
   * 4. Evaluate using the selected strategy
   * 5. FIX: If no signal from best strategy, try the next-best strategies
   *    (previously gave up after first attempt, now tries top 3 scored strategies)
   */
  async evaluate(
    market: MarketAnalysis,
    strategyType: StrategyType,
    strategyParams: StrategyParams,
    userId: string,
  ): Promise<EvaluatedSignal | null> {
    try {
      let effectiveStrategy = strategyType;
      let autoScores: Array<{ strategy: StrategyType; score: number }> | null = null;

      // ── AUTO Strategy: Detect regime and select best strategy ──
      if (strategyType === StrategyType.AUTO) {
        const selection = await this.adaptiveSelector.selectBestStrategy(userId, market);

        effectiveStrategy = selection.strategy;
        autoScores = selection.scores;

        // Log regime change if strategy changed
        const lastStrategy = this.lastAutoSelection.get(userId);
        if (lastStrategy && lastStrategy !== effectiveStrategy) {
          this.logger.log(
            `📊 AUTO strategy switched for ${userId}: ${lastStrategy} → ${effectiveStrategy} ` +
            `(regime: ${selection.regime.regime}, score: ${selection.scores[0]?.score})`,
          );
        }
        this.lastAutoSelection.set(userId, effectiveStrategy);
      }

      // Get or create strategy instance
      const strategy = this._getOrCreateStrategy(effectiveStrategy, strategyParams, userId);

      if (!strategy) {
        this.logger.warn(`Unknown strategy type: ${effectiveStrategy}`);
        return null;
      }

      // Run strategy evaluation
      let signal = await strategy.evaluate(market);

      // FIX: If AUTO strategy and no signal from best strategy, try next-best strategies.
      // This prevents the agent from being stuck when the top-scored strategy's conditions
      // aren't met but a lower-scored strategy might still generate a valid signal.
      if (!signal && strategyType === StrategyType.AUTO && autoScores && autoScores.length > 1) {
        // Try up to 3 next-best strategies
        const fallbackStrategies = autoScores
          .filter(s => s.strategy !== effectiveStrategy)
          .slice(0, 3);

        for (const fallback of fallbackStrategies) {
          const fallbackStrategy = this._getOrCreateStrategy(fallback.strategy, strategyParams, userId);
          if (!fallbackStrategy) continue;

          try {
            const fallbackSignal = await fallbackStrategy.evaluate(market);
            if (fallbackSignal) {
              signal = fallbackSignal;
              effectiveStrategy = fallback.strategy;
              this.logger.log(
                `📊 AUTO fallback: ${fallback.strategy} generated signal for ${market.symbol} ` +
                `(best strategy had no signal, fallback score: ${fallback.score})`,
              );
              break;
            }
          } catch {
            // Continue to next fallback strategy
          }
        }
      }

      if (!signal) {
        this.logger.debug(
          `📊 No signal for ${market.symbol} using ${effectiveStrategy} strategy`,
        );
        return null;
      }

      // Add AUTO metadata if this was an auto-selected strategy
      if (strategyType === StrategyType.AUTO) {
        signal.metadata = {
          ...signal.metadata,
          autoSelected: true,
          originalStrategy: StrategyType.AUTO,
          effectiveStrategy,
        };
      }

      this.logger.log(
        `📊 Signal generated: ${signal.action} ${signal.symbol} ` +
        `(strategy: ${effectiveStrategy}${strategyType === StrategyType.AUTO ? ' [AUTO]' : ''}, ` +
        `confidence: ${signal.confidence}%, R:R ${signal.riskRewardRatio.toFixed(2)}) ` +
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
   * Used for comparative analysis and AUTO fallback
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
   * Get current AUTO regime info for a user (for UI display)
   */
  async getAutoRegimeInfo(userId: string, market: MarketAnalysis) {
    if (!market) return null;

    const regime = this.adaptiveSelector.detectRegime(market);
    const scores = await this.adaptiveSelector.scoreStrategies(userId, regime);

    return {
      regime: regime.regime,
      confidence: regime.confidence,
      indicators: regime.indicators,
      recommendedStrategies: regime.recommendedStrategies,
      currentStrategy: this.lastAutoSelection.get(userId) || null,
      strategyScores: scores.map(s => ({
        strategy: s.strategy,
        score: s.score,
        reason: s.reason,
      })),
    };
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
    this.lastAutoSelection.delete(userId);
  }

  // ── Private Helpers ──

  private _getOrCreateStrategy(
    strategyType: StrategyType,
    params: StrategyParams,
    userId: string,
  ): BaseStrategy | null {
    // AUTO is not a real strategy — should be resolved before this call
    if (strategyType === StrategyType.AUTO) {
      this.logger.warn('AUTO strategy should be resolved before _getOrCreateStrategy');
      return null;
    }

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
