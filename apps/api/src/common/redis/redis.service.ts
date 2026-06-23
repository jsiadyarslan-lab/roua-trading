import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * FIX: RedisService now gracefully degrades when Redis is unavailable.
 *
 * Previously, if REDIS_URL was not set or the Redis server was unreachable,
 * the ioredis client would repeatedly try to connect, causing:
 * 1. Connection errors flooding the logs
 * 2. BullModule (which depends on Redis) blocking NestJS bootstrap
 * 3. The entire API failing to start (ECONNREFUSED on port 3001)
 *
 * Now:
 * - If REDIS_URL is not set, we create a "no-op" mode that silently
 *   handles all Redis operations without crashing
 * - Connection errors are logged at 'warn' level, not 'error'
 * - The app can start even without Redis
 * - Features that need Redis will return degraded data instead of crashing
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly isAvailable: boolean;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', '');

    // FIX: If REDIS_URL is not set, operate in degraded mode
    if (!redisUrl || redisUrl === 'CHANGE_ME_IN_PRODUCTION') {
      this.logger.warn('REDIS_URL not configured — operating in degraded mode (no caching, no BullMQ queues)');
      this.isAvailable = false;
      // Create a dummy Redis client that won't actually connect
      // We'll check isAvailable before every operation
      this.client = new Redis({
        lazyConnect: true, // Don't connect immediately
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't retry
        enableOfflineQueue: false,
      });
      return;
    }

    this.isAvailable = true;
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      retryStrategy: (times) => {
        // FIX: Stop retrying after 10 attempts to prevent infinite loops
        if (times > 10) {
          this.logger.warn(`Redis retry limit reached (${times} attempts) — giving up`);
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (err) => {
      // FIX: Log as 'warn' not 'error' — Redis being down is not fatal
      this.logger.warn(`Redis connection error: ${err.message}`);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
  }

  private handleUnavailable<T>(fallback: T, operation: string): T {
    this.logger.debug(`Redis unavailable — skipping ${operation}`);
    return fallback;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable) return this.handleUnavailable(null, `get(${key})`);
    try {
      return await this.client.get(key);
    } catch (err: any) {
      this.logger.warn(`Redis GET failed for key "${key}": ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (!this.isAvailable) return this.handleUnavailable(undefined, `set(${key})`);
    try {
      if (ttlMs) {
        await this.client.set(key, value, 'PX', ttlMs);
      } else {
        const env = process.env.NODE_ENV || 'development';
        const defaultTtlMs = 24 * 60 * 60 * 1000;
        if (env === 'production') {
          this.logger.warn(`[Redis] Setting key "${key}" without TTL in production — defaulting to 24h.`);
          await this.client.set(key, value, 'PX', defaultTtlMs);
        } else {
          await this.client.set(key, value);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Redis SET failed for key "${key}": ${err.message}`);
    }
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number = 86400): Promise<boolean> {
    if (!this.isAvailable) return this.handleUnavailable(false, `setIfNotExists(${key})`);
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err: any) {
      this.logger.warn(`Redis SETNX failed for key "${key}": ${err.message}`);
      return false;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isAvailable) return this.handleUnavailable(undefined, `del(${key})`);
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.warn(`Redis DEL failed for key "${key}": ${err.message}`);
    }
  }

  // V219: Redis Set operations for PartialFillManager and future services
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.isAvailable) return this.handleUnavailable(0, `sadd(${key})`);
    try {
      return await this.client.sadd(key, ...members);
    } catch (err: any) {
      this.logger.warn(`Redis SADD failed for key "${key}": ${err.message}`);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.isAvailable) return this.handleUnavailable([], `smembers(${key})`);
    try {
      return await this.client.smembers(key);
    } catch (err: any) {
      this.logger.warn(`Redis SMEMBERS failed for key "${key}": ${err.message}`);
      return [];
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (!this.isAvailable) return this.handleUnavailable(0, `srem(${key})`);
    try {
      return await this.client.srem(key, ...members);
    } catch (err: any) {
      this.logger.warn(`Redis SREM failed for key "${key}": ${err.message}`);
      return 0;
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.isAvailable) return this.handleUnavailable(0, `incr(${key})`);
    try {
      return await this.client.incr(key);
    } catch (err: any) {
      this.logger.warn(`Redis INCR failed for key "${key}": ${err.message}`);
      return 0;
    }
  }

  async expire(key: string, ttlMs: number): Promise<void> {
    if (!this.isAvailable) return this.handleUnavailable(undefined, `expire(${key})`);
    try {
      await this.client.pexpire(key, ttlMs);
    } catch (err: any) {
      this.logger.warn(`Redis EXPIRE failed for key "${key}": ${err.message}`);
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.isAvailable) return this.handleUnavailable(-2, `ttl(${key})`);
    try {
      return await this.client.pttl(key);
    } catch (err: any) {
      this.logger.warn(`Redis TTL failed for key "${key}": ${err.message}`);
      return -2;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable) return this.handleUnavailable(false, `exists(${key})`);
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err: any) {
      this.logger.warn(`Redis EXISTS failed for key "${key}": ${err.message}`);
      return false;
    }
  }

  private readonly rateLimitScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    return { current, ttl }
  `;

  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    if (!this.isAvailable) {
      // FIX: When Redis is unavailable, ALLOW all requests (fail-open)
      // This prevents Redis outages from blocking legitimate traffic
      return { allowed: true, remaining: limit, resetIn: windowMs };
    }
    try {
      const result = await this.client.eval(
        this.rateLimitScript,
        1,
        key,
        windowMs,
      ) as [number, number];

      const current = result[0];
      const ttl = result[1];

      if (current > limit) {
        return { allowed: false, remaining: 0, resetIn: ttl };
      }

      return { allowed: true, remaining: limit - current, resetIn: ttl };
    } catch (err: any) {
      this.logger.warn(`Redis rate limit check failed: ${err.message}`);
      return { allowed: true, remaining: limit, resetIn: windowMs };
    }
  }

  // V430: In-flight deduplication for cacheOrGet — prevents thundering herd.
  // When the cache expires and multiple callers request the same key simultaneously,
  // only the FIRST caller runs the factory; all others await the same Promise.
  // Without this, 5 concurrent position-monitor cycles could trigger 5 OANDA REST
  // API calls for the same symbol at the same time.
  private inflightCacheOrGet = new Map<string, Promise<any>>();

  async cacheOrGet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T> {
    if (!this.isAvailable) {
      // No cache — just run the factory
      return factory();
    }
    const cached = await this.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // Parse error — re-fetch
      }
    }

    // V430: Deduplicate concurrent factory calls for the same key
    const existing = this.inflightCacheOrGet.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = (async () => {
      try {
        const value = await factory();
        await this.set(key, JSON.stringify(value), ttlMs);
        return value;
      } finally {
        this.inflightCacheOrGet.delete(key);
      }
    })();

    this.inflightCacheOrGet.set(key, promise);
    return promise;
  }

  async scanKeys(pattern: string, count: number = 100): Promise<string[]> {
    if (!this.isAvailable) return this.handleUnavailable([], `scanKeys(${pattern})`);
    try {
      const keys: string[] = [];
      let cursor = '0';

      do {
        const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== '0');

      return keys;
    } catch (err: any) {
      this.logger.warn(`Redis SCAN failed: ${err.message}`);
      return [];
    }
  }

  async scanAndCleanup(pattern: string = '*', defaultTtlMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.isAvailable) return 0;
    let cleaned = 0;
    try {
      const keys = await this.scanKeys(pattern);
      for (const key of keys) {
        const ttl = await this.client.pttl(key);
        if (ttl === -1) {
          await this.client.pexpire(key, defaultTtlMs);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        this.logger.log(`[Redis] Cleanup: set default TTL on ${cleaned}/${keys.length} keys matching "${pattern}"`);
      }
    } catch (error: any) {
      this.logger.warn(`[Redis] Cleanup scan failed: ${error?.message || error}`);
    }
    return cleaned;
  }

  async publish(channel: string, message: string): Promise<number> {
    if (!this.isAvailable) return this.handleUnavailable(0, `publish(${channel})`);
    try {
      return await this.client.publish(channel, message);
    } catch (err: any) {
      this.logger.warn(`Redis PUBLISH failed on channel "${channel}": ${err.message}`);
      return 0;
    }
  }

  async onModuleDestroy() {
    if (this.isAvailable) {
      try {
        await this.client.quit();
        this.logger.log('Redis disconnected');
      } catch {
        // Already disconnected
      }
    }
  }

  async ping(): Promise<string> {
    if (!this.isAvailable) return 'DEGRADED';
    try {
      return await this.client.ping();
    } catch (err: any) {
      this.logger.warn(`Redis PING failed: ${err.message}`);
      return 'ERROR';
    }
  }

  /** Check if Redis is available */
  getIsAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * V132: Create a duplicate Redis client for pub/sub subscriptions.
   * ioredis requires a separate client for subscribing because a
   * subscribed client enters "subscriber mode" and can only perform
   * subscribe/unsubscribe commands.
   *
   * @returns A new Redis client instance, or null if Redis is unavailable
   */
  duplicateSubscriber(): Redis | null {
    if (!this.isAvailable) return null;
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL', '');
      if (!redisUrl || redisUrl === 'CHANGE_ME_IN_PRODUCTION') return null;
      const dup = new Redis(redisUrl, {
        maxRetriesPerRequest: null, // Subscriber mode — don't timeout
        retryStrategy: (times) => {
          if (times > 10) return null;
          return Math.min(times * 200, 5000);
        },
      });
      dup.on('error', (err) => {
        this.logger.warn(`Redis subscriber error: ${err.message}`);
      });
      return dup;
    } catch (err: any) {
      this.logger.warn(`Failed to create Redis subscriber: ${err.message}`);
      return null;
    }
  }
}
