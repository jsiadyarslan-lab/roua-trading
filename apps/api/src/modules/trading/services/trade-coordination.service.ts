// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Trade Coordination Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// #18: Unifies V1 and V2 paths by preventing the SmartExecutor
// and Autonomous Trader Agent from opening conflicting positions
// on the same symbol.
//
// Rules:
// 1. If SmartExecutor has an open position on a symbol, Agent should NOT open another
// 2. If Agent has an open position on a symbol, SmartExecutor should NOT open another
// 3. Each symbol can only have ONE open position at a time (regardless of source)
// 4. Redis-based distributed lock prevents race conditions
//
// FAIL-OPEN: If Redis or the coordination service fails, trades are still allowed.
// This prevents a coordination outage from blocking all trading activity.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

@Injectable()
export class TradeCoordinationService {
  private readonly logger = new Logger(TradeCoordinationService.name);
  private readonly LOCK_TTL_MS = 5_000; // 5 seconds — time to complete a trade execution
  private readonly LOCK_PREFIX = 'trade:lock:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🔗 Trade Coordination Service initialized — preventing duplicate positions');
  }

  /**
   * Check if a symbol already has an open position for this user.
   * Returns the source of the existing position, or null if no conflict.
   */
  async getExistingPositionSource(userId: string, symbol: string): Promise<string | null> {
    try {
      const existing = await this.prisma.position.findFirst({
        where: {
          userId,
          symbol,
          status: 'OPEN',
          entryPrice: { gt: 0 },
        },
        select: { source: true, id: true, side: true, openedAt: true },
      });

      return existing?.source || null;
    } catch (err: any) {
      // FAIL-OPEN: If DB query fails, allow the trade
      this.logger.warn(`🔗 Position source check failed for ${userId}:${symbol}: ${err.message} — allowing trade`);
      return null;
    }
  }

  /**
   * Check if opening a position on this symbol is allowed.
   * Returns { allowed: boolean, reason: string, existingSource: string | null }
   */
  async canOpenPosition(
    userId: string,
    symbol: string,
    requestingSource: string,
  ): Promise<{ allowed: boolean; reason: string; existingSource: string | null }> {
    // Check for existing position
    const existingSource = await this.getExistingPositionSource(userId, symbol);

    if (existingSource) {
      // Same source already has a position — might be a duplicate signal
      if (
        existingSource === requestingSource ||
        (existingSource === 'auto_paper' && requestingSource === 'smart_executor') ||
        (existingSource === 'smart_executor' && requestingSource === 'auto_paper')
      ) {
        return {
          allowed: false,
          reason: `${requestingSource} already has an open position on ${symbol}`,
          existingSource,
        };
      }

      // Different source has a position — block
      return {
        allowed: false,
        reason: `Cannot open: ${existingSource} already has an open position on ${symbol}. Only one position per symbol allowed.`,
        existingSource,
      };
    }

    // Check for distributed lock (another execution in progress)
    try {
      const lockKey = `${this.LOCK_PREFIX}${userId}:${symbol}`;
      const locked = await this.redis.get(lockKey);
      if (locked) {
        return {
          allowed: false,
          reason: `Trade execution in progress on ${symbol} by ${locked}`,
          existingSource: locked,
        };
      }
    } catch (err: any) {
      // FAIL-OPEN: Redis unavailable — allow trade
      this.logger.debug(`🔗 Lock check failed (Redis unavailable): ${err.message} — allowing trade`);
    }

    return { allowed: true, reason: 'OK', existingSource: null };
  }

  /**
   * Acquire a distributed lock for a symbol before executing a trade.
   * Returns true if lock was acquired, false if already locked.
   */
  async acquireTradeLock(userId: string, symbol: string, source: string): Promise<boolean> {
    const lockKey = `${this.LOCK_PREFIX}${userId}:${symbol}`;
    try {
      // V180 FIX: Use SET NX (atomic) instead of GET + SET (race condition).
      // Previously: GET returns null → another process also GETs null → both SET.
      // Now: setIfNotExists atomically sets only if key doesn't exist — no race window.
      const acquired = await this.redis.setIfNotExists(lockKey, source, this.LOCK_TTL_MS / 1000);
      if (!acquired) {
        this.logger.debug(`⏳ Lock already held on ${symbol} — ${source} must wait`);
        return false;
      }
      return true;
    } catch {
      // Redis unavailable — allow trade (fail open, not closed)
      this.logger.debug(`🔗 Lock acquisition failed (Redis unavailable) — allowing trade for ${source}`);
      return true;
    }
  }

  /**
   * Release the distributed lock after trade execution completes.
   */
  async releaseTradeLock(userId: string, symbol: string): Promise<void> {
    const lockKey = `${this.LOCK_PREFIX}${userId}:${symbol}`;
    try {
      await this.redis.del(lockKey);
    } catch {
      // Non-critical — lock will expire via TTL
    }
  }

  /**
   * Get all open positions for a user, grouped by source.
   * Returns { smart_executor: number, agent: number, total: number, symbols: string[] }
   */
  async getOpenPositionSummary(userId: string): Promise<{
    smart_executor: number;
    agent: number;
    total: number;
    symbols: string[];
  }> {
    try {
      const positions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'OPEN',
          entryPrice: { gt: 0 },
        },
        select: { source: true, symbol: true },
      });

      const smartExecutor = positions.filter(
        (p) => p.source === 'smart_executor' || p.source === 'auto_paper',
      ).length;
      const agent = positions.filter((p) => p.source === 'agent').length;

      return {
        smart_executor: smartExecutor,
        agent: agent,
        total: positions.length,
        symbols: [...new Set(positions.map((p) => p.symbol))],
      };
    } catch (err: any) {
      this.logger.warn(`🔗 Position summary failed for ${userId}: ${err.message}`);
      return { smart_executor: 0, agent: 0, total: 0, symbols: [] };
    }
  }

  /**
   * V1→V2 Circuit Breaker Key Cleanup
   * Cleans up old V1 circuit breaker keys from Redis.
   * Should be called once at startup.
   *
   * V137 changed the circuit breaker key format from `circuit-breaker:{symbol}`
   * (cross-user contamination) to `circuit-breaker:v2:{userId}:{symbol}` (per-user).
   * Old keys could apply User A's circuit breaker to ALL users on restart.
   */
  async cleanupV1CircuitBreakerKeys(): Promise<number> {
    let cleaned = 0;
    try {
      // Find keys matching the old pattern: circuit-breaker:{symbol} (without userId)
      // These are V1 keys that should no longer exist
      const keys = await this.redis.scanKeys('circuit-breaker:*');
      for (const key of keys) {
        // V2 keys have format: circuit-breaker:v2:{userId}:{symbol}
        // V1 keys have format: circuit-breaker:{symbol}
        if (!key.includes(':v2:')) {
          await this.redis.del(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        this.logger.log(`🧹 Cleaned up ${cleaned} V1 circuit breaker keys`);
      }
    } catch (err: any) {
      this.logger.debug(`V1 key cleanup skipped: ${err.message}`);
    }
    return cleaned;
  }
}
