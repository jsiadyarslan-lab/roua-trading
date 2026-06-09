// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Signal Evaluator Service
// #14 FIX: Agent Strategy Full Healing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * SignalEvaluator — Pre-risk signal quality assessment
 *
 * #14 FIX: Ensures no strategy is completely disabled. Every strategy
 * gets a minimum weight (0.3) even after consecutive losses.
 * The strategy that generated 85%+ of recent profits gets a 1.3x multiplier.
 * Poor-performing strategies get temporary reduction (min 0.3), not elimination.
 * Auto-recovery: weights restore gradually as performance improves.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ SIGNAL EVALUATION PIPELINE                                  │
 * │                                                             │
 * │  1. Get current strategy weight from Redis                  │
 * │  2. Apply performance multiplier for top strategy           │
 * │  3. Enforce minimum weight (0.3) — NEVER disable           │
 * │  4. Adjust confidence with weight                           │
 * │  5. Return enriched signal for RiskGatekeeper               │
 * │                                                             │
 * │ WEIGHT MANAGEMENT:                                          │
 * │  - Default weight: 1.0 (full)                              │
 * │  - Losing streak → reduce by 0.2 (min 0.3)                 │
 * │  - Winning → restore by 0.15 per win (up to 1.0)           │
 * │  - Top profit strategy → up to 1.3x multiplier             │
 * └─────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class SignalEvaluatorService {
  private readonly logger = new Logger(SignalEvaluatorService.name);

  /** Minimum weight for any strategy — never completely disable */
  private readonly MIN_STRATEGY_WEIGHT = 0.3;

  /** Maximum multiplier for the best-performing strategy */
  private readonly MAX_PERFORMANCE_MULTIPLIER = 1.3;

  /** Redis key prefix for strategy weights */
  private readonly WEIGHT_KEY_PREFIX = 'strategy:weight:';

  /** Redis key prefix for strategy performance tracking */
  private readonly PERFORMANCE_KEY_PREFIX = 'strategy:perf:';

  /** Window for performance calculation (last N trades) */
  private readonly PERFORMANCE_WINDOW = 20;

  /** Weight recovery rate per successful trade (0→1 over ~5 trades) */
  private readonly RECOVERY_RATE = 0.15;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('📊 Signal Evaluator initialized — strategy healing active');
  }

  /**
   * Evaluate a signal before it goes to RiskGatekeeper.
   * Returns the signal with an adjusted confidence/weight.
   * NEVER blocks a signal — only adjusts its weight.
   */
  async evaluateSignal(signal: {
    strategy: string;
    symbol: string;
    userId: string;
    side: 'BUY' | 'SELL';
    confidence: number;
  }): Promise<{
    strategy: string;
    symbol: string;
    userId: string;
    side: 'BUY' | 'SELL';
    confidence: number;
    weight: number;
    adjustedConfidence: number;
    evaluationReason: string;
  }> {
    // Step 1: Get current strategy weight
    let weight = await this._getStrategyWeight(signal.userId, signal.strategy);

    // Step 2: Apply performance multiplier for top strategy
    const topStrategy = await this._getTopPerformingStrategy(signal.userId);
    if (topStrategy && topStrategy.strategy === signal.strategy) {
      const multiplier = Math.min(
        this.MAX_PERFORMANCE_MULTIPLIER,
        1.0 + (topStrategy.profitShare / 100) * 0.3,
      );
      weight *= multiplier;
      this.logger.debug(
        `📊 Strategy ${signal.strategy} is top performer (${topStrategy.profitShare.toFixed(0)}% profit share) — multiplier: ${multiplier.toFixed(2)}`,
      );
    }

    // Step 3: Enforce minimum weight
    weight = Math.max(weight, this.MIN_STRATEGY_WEIGHT);

    // Step 4: Adjust confidence with weight
    const adjustedConfidence = Math.min(100, signal.confidence * weight);

    const evaluationReason =
      weight >= 1.0
        ? `Full weight (${weight.toFixed(2)}) — strategy performing normally`
        : weight >= this.MIN_STRATEGY_WEIGHT + 0.1
          ? `Partial reduction (${weight.toFixed(2)}) — recovering from losses`
          : `Minimum weight (${weight.toFixed(2)}) — strategy healing active`;

    return {
      ...signal,
      weight,
      adjustedConfidence,
      evaluationReason,
    };
  }

  /**
   * Record a trade result for a strategy — used to track performance
   * and adjust weights dynamically.
   */
  async recordTradeResult(
    userId: string,
    strategy: string,
    pnl: number,
  ): Promise<void> {
    try {
      const perfKey = `${this.PERFORMANCE_KEY_PREFIX}${userId}:${strategy}`;

      // Get existing performance data
      const existingRaw = await this.redis.get(perfKey);
      const existing: { trades: { pnl: number; timestamp: number }[] } =
        existingRaw
          ? JSON.parse(existingRaw)
          : { trades: [] };

      // Add new trade
      existing.trades.push({ pnl, timestamp: Date.now() });

      // Keep only last N trades (rolling window)
      if (existing.trades.length > this.PERFORMANCE_WINDOW) {
        existing.trades = existing.trades.slice(-this.PERFORMANCE_WINDOW);
      }

      // Save back to Redis (24h TTL)
      await this.redis.set(perfKey, JSON.stringify(existing), 86400000);

      // Update strategy weight based on recent performance
      await this._updateStrategyWeight(userId, strategy, existing.trades);
    } catch (error: any) {
      this.logger.warn(
        `Failed to record trade result for ${strategy}: ${error.message}`,
      );
    }
  }

  /**
   * Get the current weight for a strategy.
   * Default is 1.0 (full weight).
   */
  private async _getStrategyWeight(
    userId: string,
    strategy: string,
  ): Promise<number> {
    try {
      const key = `${this.WEIGHT_KEY_PREFIX}${userId}:${strategy}`;
      const raw = await this.redis.get(key);
      return raw ? parseFloat(raw) : 1.0;
    } catch {
      return 1.0;
    }
  }

  /**
   * Update strategy weight based on recent trade performance.
   * Losing streak → reduce weight (min 0.3)
   * Winning → gradually restore weight (recovery rate per win)
   */
  private async _updateStrategyWeight(
    userId: string,
    strategy: string,
    trades: { pnl: number; timestamp: number }[],
  ): Promise<void> {
    if (trades.length < 3) return; // Need at least 3 trades to evaluate

    const recentTrades = trades.slice(-10); // Last 10 trades
    const winRate =
      recentTrades.filter((t) => t.pnl > 0).length / recentTrades.length;
    const totalPnl = recentTrades.reduce((sum, t) => sum + t.pnl, 0);

    let currentWeight = await this._getStrategyWeight(userId, strategy);

    if (winRate < 0.2 && totalPnl < 0) {
      // Severe losing streak — reduce weight but never below minimum
      currentWeight = Math.max(this.MIN_STRATEGY_WEIGHT, currentWeight - 0.2);
      this.logger.warn(
        `📊 Strategy ${strategy} losing streak (${(winRate * 100).toFixed(0)}% win rate) — weight reduced to ${currentWeight.toFixed(2)}`,
      );
    } else if (winRate >= 0.5 && totalPnl > 0) {
      // Winning — gradually restore weight
      currentWeight = Math.min(1.0, currentWeight + this.RECOVERY_RATE);
      this.logger.debug(
        `📊 Strategy ${strategy} winning (${(winRate * 100).toFixed(0)}% win rate) — weight restored to ${currentWeight.toFixed(2)}`,
      );
    }
    // else: mixed results — keep current weight (no change)

    const key = `${this.WEIGHT_KEY_PREFIX}${userId}:${strategy}`;
    await this.redis.set(key, currentWeight.toString(), 86400000); // 24h TTL
  }

  /**
   * Get the top-performing strategy for a user based on recent PnL.
   * Returns the strategy that generated the highest share of profits.
   */
  private async _getTopPerformingStrategy(userId: string): Promise<{
    strategy: string;
    totalPnl: number;
    profitShare: number;
  } | null> {
    try {
      // Get recent closed positions grouped by source/strategy
      const recentPositions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'CLOSED',
          closedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          }, // Last 7 days
          realizedPnl: { not: 0 },
        },
        select: {
          source: true,
          realizedPnl: true,
        },
      });

      if (recentPositions.length === 0) return null;

      // Group by source/strategy
      const strategyPnl = new Map<string, number>();
      let totalProfit = 0;

      for (const pos of recentPositions) {
        const strategy = pos.source || 'unknown';
        const pnl = Number(pos.realizedPnl) || 0;
        if (pnl > 0) {
          strategyPnl.set(strategy, (strategyPnl.get(strategy) || 0) + pnl);
          totalProfit += pnl;
        }
      }

      if (totalProfit === 0) return null;

      // Find strategy with highest profit share
      let topStrategy = '';
      let topPnl = 0;
      for (const [strategy, pnl] of strategyPnl.entries()) {
        if (pnl > topPnl) {
          topPnl = pnl;
          topStrategy = strategy;
        }
      }

      return {
        strategy: topStrategy,
        totalPnl: topPnl,
        profitShare: (topPnl / totalProfit) * 100,
      };
    } catch {
      return null;
    }
  }
}
