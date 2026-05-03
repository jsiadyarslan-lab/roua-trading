import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('🔴 Redis connected');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err.message);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs) {
      await this.client.set(key, value, 'PX', ttlMs);
    } else {
      // FIX #11: Warn and set a default 24h TTL in production when no TTL is provided.
      // Keys without TTL cause memory leaks as they persist indefinitely.
      const env = process.env.NODE_ENV || 'development';
      const defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours
      if (env === 'production') {
        this.logger.warn(`[Redis] Setting key "${key}" without TTL in production — defaulting to 24h. Pass ttlMs to set() to avoid this warning.`);
        await this.client.set(key, value, 'PX', defaultTtlMs);
      } else {
        await this.client.set(key, value);
      }
    }
  }

  /**
   * Set a key only if it does not already exist (atomic SET NX).
   * Returns true if the key was set (did NOT exist before), false if it already existed.
   * Implements the pattern: redis.set(key, value, 'EX', seconds, 'NX')
   *
   * @param key The Redis key
   * @param value The value to set
   * @param ttlSeconds Time-to-live in seconds (default: 86400 = 24 hours)
   * @returns true if lock was acquired, false if key already existed
   */
  async setIfNotExists(key: string, value: string, ttlSeconds: number = 86400): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlMs: number): Promise<void> {
    await this.client.pexpire(key, ttlMs);
  }

  async ttl(key: string): Promise<number> {
    return this.client.pttl(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Rate limit check using atomic Lua script (INCR + EXPIRE in one round trip).
   *
   * FIX: Previously used separate INCR + EXPIRE commands, which created a race condition.
   * If the process crashed between INCR returning 1 and EXPIRE, the key would persist
   * forever with no TTL, permanently blocking that rate limit key.
   *
   * The Lua script is atomic — Redis executes it as a single operation:
   * 1. INCR the counter
   * 2. If counter is 1 (first request), set the TTL
   * 3. Return [currentCount, ttlMs]
   */
  private readonly rateLimitScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    return { current, ttl }
  `;

  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const result = await this.client.eval(
      this.rateLimitScript,
      1,          // number of keys
      key,        // KEYS[1]
      windowMs,   // ARGV[1]
    ) as [number, number];

    const current = result[0];
    const ttl = result[1];

    if (current > limit) {
      return { allowed: false, remaining: 0, resetIn: ttl };
    }

    return { allowed: true, remaining: limit - current, resetIn: ttl };
  }

  /**
   * Cache with TTL - get from cache or set from factory
   */
  async cacheOrGet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = await this.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // If parsing fails, re-fetch
      }
    }

    const value = await factory();
    await this.set(key, JSON.stringify(value), ttlMs);
    return value;
  }

  /**
   * Scan for keys matching a pattern using Redis SCAN (safe for production).
   * Returns all matching keys without blocking the server.
   *
   * @param pattern Glob pattern to match (e.g., 'agent:state:*')
   * @param count Approximate number of keys per scan iteration (default: 100)
   * @returns Array of matching key strings
   */
  async scanKeys(pattern: string, count: number = 100): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * FIX #11: Scan and clean up keys that have no TTL set.
   * Finds keys matching a pattern that have TTL = -1 (no expiry) and sets a default TTL.
   * This prevents memory leaks from keys set without TTL.
   *
   * @param pattern Key pattern to scan (default: '*' — all keys)
   * @param defaultTtlMs Default TTL to set on keys without TTL (default: 24 hours)
   * @returns Number of keys that were cleaned up
   */
  async scanAndCleanup(pattern: string = '*', defaultTtlMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    let cleaned = 0;
    try {
      const keys = await this.scanKeys(pattern);
      for (const key of keys) {
        const ttl = await this.client.pttl(key);
        // ttl === -1 means no expiry set, ttl === -2 means key doesn't exist
        if (ttl === -1) {
          await this.client.pexpire(key, defaultTtlMs);
          cleaned++;
          this.logger.debug(`[Redis] Set TTL ${defaultTtlMs}ms on key "${key}" (was -1 = no expiry)`);
        }
      }
      if (cleaned > 0) {
        this.logger.log(`[Redis] Cleanup: set default TTL on ${cleaned}/${keys.length} keys matching "${pattern}"`);
      }
    } catch (error: any) {
      this.logger.error(`[Redis] Cleanup scan failed: ${error?.message || error}`);
    }
    return cleaned;
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('🔴 Redis disconnected');
  }

  /**
   * Ping the Redis server to check connectivity.
   * Returns 'PONG' on success.
   */
  async ping(): Promise<string> {
    return this.client.ping();
  }
}
