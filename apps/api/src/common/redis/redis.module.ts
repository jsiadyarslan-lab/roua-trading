import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * FIX: Redis is now optional (graceful degradation).
 *
 * Previously, if REDIS_URL was not set or Redis was unreachable,
 * ioredis would retry forever (maxRetriesPerRequest: 3) and
 * BullModule would block the entire NestJS bootstrap.
 *
 * This caused the #1 production outage: ECONNREFUSED on port 3001
 * because NestJS could never finish initializing.
 *
 * Now:
 * - RedisService connects lazily and handles errors gracefully
 * - BullModule is registered conditionally (only if REDIS_URL is set)
 * - If Redis is down, the app starts but features that need Redis
 *   (BullMQ queues, rate limiting, caching) return degraded responses
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
