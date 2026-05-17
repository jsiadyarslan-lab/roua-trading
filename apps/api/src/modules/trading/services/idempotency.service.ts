import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

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
   * TTL: 60 seconds (V130 SUSTAINABLE FIX)
   *
   * WHY changed from 24 hours: The 24-hour TTL meant that any failed order
   * (risk rejection, missing SL, timeout) would block ALL retries for a full
   * day on that userId:symbol:side combination. This was catastrophic because:
   *   - A single SL=0 brief → SOL:BUY blocked for 24 hours
   *   - AI model timeout → entire symbol+direction frozen for a day
   *   - With 3 users × 4 pairs × 2 sides = 24 keys, one failure could
   *     freeze a significant portion of trading capacity
   *
   * 60 seconds is sufficient because:
   *   - The critical race window is < 3 seconds (check → placeOrder)
   *   - 60s = 20x safety margin over the race window
   *   - Failed orders release the lock immediately via releaseLock()
   *   - The TTL is only a safety net for crashes/timeouts
   */
  private readonly LOCK_TTL_SECONDS = 60;

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
  async checkAndLock(key: string): Promise<boolean> {
    const redisKey = `${this.KEY_PREFIX}${key}`;

    try {
      const acquired = await this.redisService.setIfNotExists(
        redisKey,
        JSON.stringify({ locked: true, lockedAt: new Date().toISOString() }),
        this.LOCK_TTL_SECONDS,
      );

      if (!acquired) {
        this.logger.warn(`🔑 Duplicate idempotency key detected: ${key}`);
        return false;
      }

      this.logger.debug(`🔑 Idempotency key locked: ${key} (TTL: 60s)`);
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
