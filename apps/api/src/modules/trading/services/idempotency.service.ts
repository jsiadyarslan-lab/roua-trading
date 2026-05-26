import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { TIMEFRAME_EXPIRY_MS, BriefTimeframe } from '../../ai/strategic-council/strategic-council.types';

/**
 * Idempotency Service — Prevents Duplicate Order Execution
 *
 * Uses Redis SET NX EX (atomic) to ensure that
 * each idempotencyKey can only be processed once within a 60-second window.
 *
 * V130: TTL reduced from 24h to 60s. The 24-hour TTL was catastrophic because
 * any failed order (risk rejection, missing SL) would block retries for a full day.
 * 60 seconds is 20x the critical race window (<3s) and allows quick retries.
 * Failed orders release the lock immediately via releaseLock().
 *
 * How it works:
 * ┌───────────────────────────────────────────────────────────┐
 * │ 1. Client sends order with unique idempotencyKey          │
 * │ 2. checkAndLock(key) attempts Redis SET NX with 60s TTL  │
 * │ 3. If key exists → 409 Conflict (duplicate request)      │
 * │ 4. If key doesn't exist → Lock acquired, proceed         │
 * │ 5. Key auto-expires after 60 seconds                      │
 * └───────────────────────────────────────────────────────────┘
 *
 * Redis command: SET idempotency:{key} '{json}' EX 60 NX
 *
 * This ensures:
 * - Network retries don't create duplicate orders
 * - Cross-source dedup (Smart Executor + Agent can't double-trade)
 * - Automatic cleanup after 60 seconds
 * - Atomic operation — no race condition possible
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  /** Key prefix for Redis */
  private readonly KEY_PREFIX = 'idempotency:';

  /**
   * V132: Dynamic TTL based on timeframe.
   *
   * V130 used a fixed 60s TTL. Problem: M1 briefs expire in 60s anyway,
   * but W1 briefs are valid for 7 days. Using 60s for all timeframes
   * meant that a brief for H4 could be locked, fail, and then the same
   * userId:symbol:side couldn't be retried for the same longer-term signal.
   *
   * V132: Smart TTL based on the timeframe of the brief:
   *   - M1/M5 (executor scalping): 30s — these expire in 1-5 minutes
   *   - M15/M30 (short-term): 60s — expire in 15-30 minutes
   *   - H1/H4 (medium-term): 120s — expire in 1-4 hours
   *   - D1/W1 (long-term): 300s — expire in 1-7 days
   *   - Default (unknown timeframe): 60s
   *
   * This ensures the lock duration matches the signal's validity window,
   * preventing both false positives (blocking valid re-execution) and
   * false negatives (lock expires too quickly for long-term signals).
   */
  private getTimeframeTTL(timeframe?: string): number {
    if (!timeframe) return 60; // default 60s
    const tf = timeframe.toUpperCase() as BriefTimeframe;
    const expiryMs = TIMEFRAME_EXPIRY_MS[tf];
    if (!expiryMs) return 60; // unknown timeframe → default 60s

    // TTL = 2% of the timeframe expiry, minimum 30s, maximum 300s
    // Rationale: The race window is < 3s, so even 30s is 10x safety margin.
    // For longer timeframes, we allow more time for retries.
    const ttl = Math.max(30, Math.min(300, Math.round(expiryMs / 1000 * 0.02)));
    return ttl;
  }

  constructor(private readonly redisService: RedisService) {
    this.logger.log('🔑 Idempotency Service initialized — duplicate protection active');
  }

  /**
   * Check if an idempotency key is already used, and lock it if not.
   * Uses atomic Redis SET NX EX pattern.
   *
   * @param key The unique idempotency key from the client
   * @returns true if lock was acquired (key was NOT used before), false if already exists
   *
   * Implementation: Uses RedisService.setIfNotExists(key, value, ttlSeconds)
   * which executes: SET key value EX ttl NX — atomic, no race condition
   */
  /**
   * Check if an idempotency key is already used, and lock it if not.
   * Uses atomic Redis SET NX EX pattern.
   *
   * V132: Accepts optional timeframe parameter for smart TTL.
   *
   * @param key The unique idempotency key from the client
   * @param timeframe Optional timeframe for smart TTL calculation
   * @returns true if lock was acquired (key was NOT used before), false if already exists
   */
  async checkAndLock(key: string, timeframe?: string): Promise<boolean> {
    const redisKey = `${this.KEY_PREFIX}${key}`;
    const ttl = this.getTimeframeTTL(timeframe);

    try {
      const acquired = await this.redisService.setIfNotExists(
        redisKey,
        JSON.stringify({ locked: true, lockedAt: new Date().toISOString(), timeframe: timeframe || 'unknown' }),
        ttl,
      );

      if (!acquired) {
        this.logger.warn(`🔑 Duplicate idempotency key detected: ${key} (TTL: ${ttl}s)`);
        return false;
      }

      this.logger.debug(`🔑 Idempotency key locked: ${key} (TTL: ${ttl}s, timeframe: ${timeframe || 'default'})`);
      return true;
    } catch (error: any) {
      // On Redis failure, block the request to prevent duplicate orders
      this.logger.error(`Idempotency check failed for ${key}: ${error.message} — blocking request to prevent duplicates`);
      return false;
    }
  }

  /**
   * Release an idempotency lock (e.g., if order creation fails before submission)
   * This allows the client to retry with the same key
   */
  async releaseLock(key: string): Promise<void> {
    const redisKey = `${this.KEY_PREFIX}${key}`;
    try {
      await this.redisService.del(redisKey);
      this.logger.debug(`🔑 Idempotency key released: ${key}`);
    } catch (error: any) {
      this.logger.error(`Failed to release idempotency key ${key}: ${error.message}`);
    }
  }

  /**
   * Check if a key is currently locked without acquiring it
   */
  async isLocked(key: string): Promise<boolean> {
    const redisKey = `${this.KEY_PREFIX}${key}`;
    try {
      const exists = await this.redisService.get(redisKey);
      return !!exists;
    } catch {
      return false;
    }
  }
}
