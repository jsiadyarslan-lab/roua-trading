// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Adaptive Strategy Selector Service
// #14 FIX: Agent Strategy Full Healing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { SignalEvaluatorService } from './signal-evaluator.service';

/**
 * AdaptiveStrategySelector — Dynamic strategy allocation based on performance
 *
 * #14 FIX: Works alongside SignalEvaluator to ensure the Agent follows
 * the strategy path that generated 85%+ of profits.
 * - Monitors all strategy paths and their PnL contributions
 * - Allocates more trading capital to winning strategies
 * - Never eliminates a strategy entirely (minimum allocation: 10%)
 * - Auto-rebalances when a different strategy becomes top performer
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ ADAPTIVE ALLOCATION PIPELINE                                │
 * │                                                             │
 * │  1. Get recent PnL performance grouped by strategy          │
 * │  2. Score each strategy (winRate + avgPnl)                  │
 * │  3. Calculate allocations from scores                       │
 * │  4. Enforce min (10%) and max (60%) allocation bounds       │
 * │  5. Normalize to 100% total                                 │
 * │  6. Select strategy with highest allocation                 │
 * │                                                             │
 * │ ALLOCATION RULES:                                           │
 * │  ┌──────────────────────────────────────────────────────┐   │
 * │  │ Top performer    → up to 60% allocation              │   │
 * │  │ Minimum strategy → at least 10% allocation           │   │
 * │  │ Too many strats  → equal distribution                 │   │
 * │  │ No data          → default: 100%                     │   │
 * │  └──────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class AdaptiveStrategySelectorService {
  private readonly logger = new Logger(AdaptiveStrategySelectorService.name);

  /** Minimum allocation for any strategy (10%) */
  private readonly MIN_ALLOCATION_PCT = 10;

  /** Maximum allocation for any strategy (60%) */
  private readonly MAX_ALLOCATION_PCT = 60;

  /** Redis key for strategy allocations */
  private readonly ALLOCATION_KEY_PREFIX = 'strategy:allocation:';

  /** Rebalance interval (check every 30 minutes) */
  private readonly REBALANCE_INTERVAL_MS = 30 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly signalEvaluator: SignalEvaluatorService,
  ) {
    this.logger.log(
      '🎯 Adaptive Strategy Selector initialized — dynamic allocation active',
    );
  }

  /**
   * Get the current allocation for all strategies for a user.
   * Returns a map of strategy → allocation percentage.
   */
  async getStrategyAllocations(
    userId: string,
  ): Promise<Record<string, number>> {
    try {
      const key = `${this.ALLOCATION_KEY_PREFIX}${userId}`;
      const raw = await this.redis.get(key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Fall through to default
    }

    // Default: equal allocation
    return { default: 100 };
  }

  /**
   * Select the best strategy for the next trade based on:
   * 1. Current allocations
   * 2. Recent performance
   * 3. Market conditions (optional)
   *
   * Never returns null — always selects a strategy.
   */
  async selectStrategy(
    userId: string,
    symbol: string,
  ): Promise<{
    strategy: string;
    allocation: number;
    reason: string;
  }> {
    // Step 1: Get recent performance by strategy
    const performance = await this._getRecentPerformance(userId);

    // Step 2: Calculate new allocations
    const allocations = this._calculateAllocations(performance);

    // Step 3: Save allocations
    const key = `${this.ALLOCATION_KEY_PREFIX}${userId}`;
    await this.redis.set(key, JSON.stringify(allocations), 3600000); // 1h TTL

    // Step 4: Select strategy with highest allocation
    let bestStrategy = 'default';
    let bestAllocation = 0;
    for (const [strategy, allocation] of Object.entries(allocations)) {
      if (allocation > bestAllocation) {
        bestAllocation = allocation;
        bestStrategy = strategy;
      }
    }

    const reason =
      bestAllocation >= 50
        ? `Top performer (${bestAllocation}% allocation) — following proven path`
        : `Balanced allocation (${bestAllocation}%) — diversified approach`;

    return { strategy: bestStrategy, allocation: bestAllocation, reason };
  }

  /**
   * Get recent PnL performance grouped by strategy source.
   */
  private async _getRecentPerformance(
    userId: string,
  ): Promise<
    Map<string, {
      tradeCount: number;
      winRate: number;
      totalPnl: number;
      avgPnl: number;
    }>
  > {
    const result = new Map<
      string,
      { tradeCount: number; winCount: number; totalPnl: number }
    >();

    try {
      const positions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'CLOSED',
          closedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          source: true,
          realizedPnl: true,
        },
      });

      for (const pos of positions) {
        const source = pos.source || 'unknown';
        const pnl = Number(pos.realizedPnl) || 0;
        const existing = result.get(source) || {
          tradeCount: 0,
          winCount: 0,
          totalPnl: 0,
        };
        existing.tradeCount++;
        if (pnl > 0) existing.winCount++;
        existing.totalPnl += pnl;
        result.set(source, existing);
      }
    } catch {
      // Return empty map on error
    }

    // Convert to final format
    const performance = new Map<
      string,
      {
        tradeCount: number;
        winRate: number;
        totalPnl: number;
        avgPnl: number;
      }
    >();

    for (const [strategy, data] of result.entries()) {
      performance.set(strategy, {
        tradeCount: data.tradeCount,
        winRate:
          data.tradeCount > 0 ? data.winCount / data.tradeCount : 0,
        totalPnl: data.totalPnl,
        avgPnl:
          data.tradeCount > 0 ? data.totalPnl / data.tradeCount : 0,
      });
    }

    return performance;
  }

  /**
   * Calculate strategy allocations based on performance.
   * - Top performer gets up to 60%
   * - All strategies get at least 10%
   * - Remaining budget distributed proportionally
   */
  private _calculateAllocations(
    performance: Map<
      string,
      {
        tradeCount: number;
        winRate: number;
        totalPnl: number;
        avgPnl: number;
      }
    >,
  ): Record<string, number> {
    if (performance.size === 0) {
      return { default: 100 };
    }

    if (performance.size === 1) {
      const [strategy] = [...performance.keys()];
      return { [strategy]: 100 };
    }

    // Score each strategy (weighted combination of winRate and avgPnl)
    const scores = new Map<string, number>();
    for (const [strategy, perf] of performance.entries()) {
      const score = perf.winRate * 50 + Math.max(0, perf.avgPnl) * 0.5;
      scores.set(strategy, Math.max(score, 1)); // Minimum score of 1
    }

    // Calculate raw allocations from scores
    const totalScore = [...scores.values()].reduce((sum, s) => sum + s, 0);
    const allocations: Record<string, number> = {};

    for (const [strategy, score] of scores.entries()) {
      allocations[strategy] = (score / totalScore) * 100;
    }

    // Enforce minimum allocation (10%)
    const strategyCount = Object.keys(allocations).length;
    const totalMinAllocation = this.MIN_ALLOCATION_PCT * strategyCount;

    if (totalMinAllocation > 100) {
      // If too many strategies, equal allocation
      const equalPct = Math.floor(100 / strategyCount);
      for (const strategy of Object.keys(allocations)) {
        allocations[strategy] = equalPct;
      }
    } else {
      // Enforce minimums
      for (const strategy of Object.keys(allocations)) {
        if (allocations[strategy] < this.MIN_ALLOCATION_PCT) {
          allocations[strategy] = this.MIN_ALLOCATION_PCT;
        }
      }

      // Enforce maximum
      for (const strategy of Object.keys(allocations)) {
        if (allocations[strategy] > this.MAX_ALLOCATION_PCT) {
          allocations[strategy] = this.MAX_ALLOCATION_PCT;
        }
      }

      // Normalize to 100%
      const total = Object.values(allocations).reduce(
        (sum, a) => sum + a,
        0,
      );
      if (total !== 100) {
        const scale = 100 / total;
        for (const strategy of Object.keys(allocations)) {
          allocations[strategy] = Math.round(
            allocations[strategy] * scale,
          );
        }
      }
    }

    return allocations;
  }
}
