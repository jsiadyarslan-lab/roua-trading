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
      await this.client.set(key, value);
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
   * Rate limit check using Redis INCR + EXPIRE
   * Returns remaining requests count, or -1 if rate limited
   */
  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const current = await this.incr(key);

    if (current === 1) {
      await this.expire(key, windowMs);
    }

    const ttl = await this.ttl(key);

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

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('🔴 Redis disconnected');
  }
}
