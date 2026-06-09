import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * DistributedLockService — Redis-based distributed locking for trade operations
 * 
 * #11 FIX: Prevents concurrent trade operations on the same exchange credential.
 * Uses Redis SET with NX (only if not exists) and PX (millisecond TTL) for
 * atomic lock acquisition. Auto-releases via TTL if the process crashes.
 * 
 * Key format: trade-rep:dir-lock:{userId}:{exchangeCredentialId}
 * Default TTL: 30 seconds (sufficient for most trade operations)
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  /** Redis key prefix for distributed locks */
  private readonly LOCK_PREFIX = 'trade-rep:dir-lock:';
  
  /** Default lock TTL in milliseconds */
  private readonly DEFAULT_TTL_MS = 30000; // 30 seconds
  
  /** Maximum retries for acquiring lock */
  private readonly MAX_RETRIES = 3;
  
  /** Delay between retries in milliseconds */
  private readonly RETRY_DELAY_MS = 500;

  constructor(private readonly redis: RedisService) {
    this.logger.log('🔒 Distributed Lock Service initialized — concurrent trade protection active');
  }

  /**
   * Acquire a distributed lock for a trade operation.
   * Returns a lock ID if successful, null if lock could not be acquired.
   * 
   * @param userId - User ID
   * @param resourceId - Resource ID (e.g., exchangeCredentialId)
   * @param ttlMs - Lock TTL in milliseconds (default: 30000)
   * @returns Lock ID (used for release) or null if failed
   */
  async acquireLock(
    userId: string,
    resourceId: string,
    ttlMs: number = this.DEFAULT_TTL_MS,
  ): Promise<string | null> {
    const lockKey = `${this.LOCK_PREFIX}${userId}:${resourceId}`;
    const lockId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Try to acquire lock with retries
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // Use setIfNotExists (SET NX) for atomic lock acquisition
        const acquired = await this.redis.setIfNotExists(lockKey, lockId, Math.ceil(ttlMs / 1000));
        
        if (acquired) {
          this.logger.debug(`🔒 Lock acquired: ${lockKey} (lockId: ${lockId}, TTL: ${ttlMs}ms)`);
          return lockId;
        }
        
        // Lock already held by another process
        this.logger.warn(
          `🔒 Lock ${lockKey} is held by another process (attempt ${attempt}/${this.MAX_RETRIES}) — retrying in ${this.RETRY_DELAY_MS}ms`
        );
        
        if (attempt < this.MAX_RETRIES) {
          await this._sleep(this.RETRY_DELAY_MS);
        }
      } catch (error: any) {
        this.logger.error(`🔒 Failed to acquire lock ${lockKey}: ${error.message}`);
        return null;
      }
    }
    
    this.logger.warn(`🔒 Could not acquire lock ${lockKey} after ${this.MAX_RETRIES} attempts`);
    return null;
  }

  /**
   * Release a distributed lock.
   * Only releases if the lock value matches the provided lockId (prevents
   * releasing a lock acquired by another process after TTL expiry).
   * 
   * @param userId - User ID
   * @param resourceId - Resource ID
   * @param lockId - Lock ID returned by acquireLock
   */
  async releaseLock(userId: string, resourceId: string, lockId: string): Promise<void> {
    const lockKey = `${this.LOCK_PREFIX}${userId}:${resourceId}`;
    
    try {
      // Only delete if the value matches our lockId (safe release)
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockId) {
        await this.redis.del(lockKey);
        this.logger.debug(`🔒 Lock released: ${lockKey} (lockId: ${lockId})`);
      } else if (currentValue) {
        this.logger.warn(
          `🔒 Lock ${lockKey} was held by another process (expected: ${lockId}, found: ${currentValue}) — not releasing`
        );
      }
      // If currentValue is null, the lock already expired via TTL — that's fine
    } catch (error: any) {
      this.logger.error(`🔒 Failed to release lock ${lockKey}: ${error.message}`);
    }
  }

  /**
   * Execute a function with a distributed lock.
   * Automatically acquires and releases the lock.
   * If lock cannot be acquired, throws an error.
   * 
   * @param userId - User ID
   * @param resourceId - Resource ID
   * @param fn - Function to execute while holding the lock
   * @param ttlMs - Lock TTL in milliseconds
   */
  async withLock<T>(
    userId: string,
    resourceId: string,
    fn: () => Promise<T>,
    ttlMs: number = this.DEFAULT_TTL_MS,
  ): Promise<T> {
    const lockId = await this.acquireLock(userId, resourceId, ttlMs);
    
    if (!lockId) {
      throw new Error(
        `لا يمكن تنفيذ العملية — يوجد عملية أخرى قيد التنفيذ على نفس الحساب. حاول مرة أخرى بعد ${this.DEFAULT_TTL_MS / 1000} ثوانٍ.`
      );
    }
    
    try {
      return await fn();
    } finally {
      await this.releaseLock(userId, resourceId, lockId);
    }
  }

  /**
   * Check if a lock is currently held for a resource.
   */
  async isLocked(userId: string, resourceId: string): Promise<boolean> {
    const lockKey = `${this.LOCK_PREFIX}${userId}:${resourceId}`;
    try {
      const value = await this.redis.get(lockKey);
      return value !== null;
    } catch {
      return false;
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
