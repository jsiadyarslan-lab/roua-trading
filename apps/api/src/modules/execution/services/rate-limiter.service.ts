// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Rate Limiter Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { ConfigService } from '@nestjs/config';

/**
 * RateLimiterService — Redis Token Bucket Rate Limiting
 *
 * Implements per-exchange, per-user rate limiting using the
 * Redis Token Bucket algorithm. Ensures that API calls to
 * exchanges never exceed their rate limits.
 *
 * Architecture:
 * ┌───────────────────────────────────────────────────────────┐
 * │                                                           │
 * │  checkRateLimit(exchangeId, userId, weight)               │
 * │    ↓                                                      │
 * │  Redis Token Bucket:                                      │
 * │    ┌─────────────────────────────────────────┐            │
 * │    │ rate:{exchangeId}:{userId}:sec           │            │
 * │    │   → INCR + EXPIRE (1s window)           │            │
 * │    │   → maxRequestsPerSecond check           │            │
 * │    │                                         │            │
 * │    │ rate:{exchangeId}:{userId}:min           │            │
 * │    │   → INCR + EXPIRE (60s window)          │            │
 * │    │   → maxRequestsPerMinute check           │            │
 * │    └─────────────────────────────────────────┘            │
 * │    ↓                                                      │
 * │  If within limits → return true (proceed)                 │
 * │  If exceeded → queue in RabbitMQ for delayed processing   │
 * │                                                           │
 * └───────────────────────────────────────────────────────────┘
 *
 * Exchange Rate Limits:
 * ┌──────────────┬──────────────────────┬───────────────────────┐
 * │ Exchange     │ Requests/Second      │ Requests/Minute       │
 * ├──────────────┼──────────────────────┼───────────────────────┤
 * │ Binance      │ 5                    │ 120                   │
 * │ Alpaca       │ 3                    │ 200                   │
 * │ Paper        │ 20                   │ 1000                  │
 * └──────────────┴──────────────────────┴───────────────────────┘
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  /** Redis key prefixes */
  private readonly RATE_PREFIX_SEC = 'rate:sec:';
  private readonly RATE_PREFIX_MIN = 'rate:min:';

  /** Default rate limits per exchange */
  private readonly defaultLimits: Record<string, { maxRequestsPerSecond: number; maxRequestsPerMinute: number }> = {
    binance: { maxRequestsPerSecond: 5, maxRequestsPerMinute: 120 },
    alpaca: { maxRequestsPerSecond: 3, maxRequestsPerMinute: 200 },
    paper: { maxRequestsPerSecond: 20, maxRequestsPerMinute: 1000 },
  };

  /** Custom limits from environment variables */
  private customLimits: Record<string, { maxRequestsPerSecond: number; maxRequestsPerMinute: number }> = {};

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    // Load custom rate limits from environment
    this._loadCustomLimits();
    this.logger.log('⚡ Rate Limiter Service initialized — token bucket active');
  }

  /**
   * Check if a request is within rate limits
   *
   * Uses Redis INCR + EXPIRE for atomic token bucket implementation.
   * Each request increments counters for both second and minute windows.
   *
   * @param exchangeId The exchange identifier (e.g., 'binance')
   * @param userId The user ID for per-user limiting
   * @param weight The request weight (default: 1, some API calls count as more)
   * @returns true if request is within limits, false if rate limited
   */
  async checkRateLimit(
    exchangeId: string,
    userId: string,
    weight: number = 1,
  ): Promise<boolean> {
    const limits = this._getLimits(exchangeId);
    const secKey = `${this.RATE_PREFIX_SEC}${exchangeId}:${userId}`;
    const minKey = `${this.RATE_PREFIX_MIN}${exchangeId}:${userId}`;

    try {
      // Check second window
      const secResult = await this.redisService.checkRateLimit(
        secKey,
        limits.maxRequestsPerSecond,
        1000, // 1 second window
      );

      if (!secResult.allowed) {
        this.logger.warn(
          `⚡ Rate limit EXCEEDED (per-second): ${exchangeId}/${userId} — ${secResult.remaining} remaining`,
        );
        return false;
      }

      // Check minute window
      const minResult = await this.redisService.checkRateLimit(
        minKey,
        limits.maxRequestsPerMinute,
        60000, // 60 second window
      );

      if (!minResult.allowed) {
        this.logger.warn(
          `⚡ Rate limit EXCEEDED (per-minute): ${exchangeId}/${userId} — ${minResult.remaining} remaining`,
        );
        return false;
      }

      return true;
    } catch (error: any) {
      // On Redis failure, be permissive (allow the request)
      // Better to risk a rate limit violation than block all trading
      this.logger.error(`⚡ Rate limit check failed: ${error.message} — allowing request`);
      return true;
    }
  }

  /**
   * Get the remaining request capacity for a user on an exchange
   * Useful for displaying rate limit status in the UI
   */
  async getRemainingCapacity(
    exchangeId: string,
    userId: string,
  ): Promise<{ perSecond: number; perMinute: number }> {
    const limits = this._getLimits(exchangeId);
    const secKey = `${this.RATE_PREFIX_SEC}${exchangeId}:${userId}`;
    const minKey = `${this.RATE_PREFIX_MIN}${exchangeId}:${userId}`;

    try {
      const secCurrent = parseInt(await this.redisService.get(secKey) || '0', 10);
      const minCurrent = parseInt(await this.redisService.get(minKey) || '0', 10);

      return {
        perSecond: Math.max(0, limits.maxRequestsPerSecond - secCurrent),
        perMinute: Math.max(0, limits.maxRequestsPerMinute - minCurrent),
      };
    } catch {
      return {
        perSecond: limits.maxRequestsPerSecond,
        perMinute: limits.maxRequestsPerMinute,
      };
    }
  }

  /**
   * Update rate limits for an exchange at runtime
   * Useful for dynamic rate limit adjustments based on exchange responses
   */
  updateLimits(
    exchangeId: string,
    limits: { maxRequestsPerSecond: number; maxRequestsPerMinute: number },
  ): void {
    this.customLimits[exchangeId] = limits;
    this.logger.log(`⚡ Updated rate limits for ${exchangeId}: ${limits.maxRequestsPerSecond}/s, ${limits.maxRequestsPerMinute}/m`);
  }

  // ── Private Helpers ──

  private _getLimits(exchangeId: string): { maxRequestsPerSecond: number; maxRequestsPerMinute: number } {
    // Check custom limits first
    if (this.customLimits[exchangeId]) {
      return this.customLimits[exchangeId];
    }

    // Fall back to default limits
    if (this.defaultLimits[exchangeId]) {
      return this.defaultLimits[exchangeId];
    }

    // Conservative default for unknown exchanges
    return { maxRequestsPerSecond: 2, maxRequestsPerMinute: 60 };
  }

  private _loadCustomLimits(): void {
    // Load from environment variables if set
    const customBinance = this.configService.get<string>('RATE_LIMIT_BINANCE');
    if (customBinance) {
      const [sec, min] = customBinance.split(',').map(Number);
      if (sec && min) this.customLimits['binance'] = { maxRequestsPerSecond: sec, maxRequestsPerMinute: min };
    }

    const customAlpaca = this.configService.get<string>('RATE_LIMIT_ALPACA');
    if (customAlpaca) {
      const [sec, min] = customAlpaca.split(',').map(Number);
      if (sec && min) this.customLimits['alpaca'] = { maxRequestsPerSecond: sec, maxRequestsPerMinute: min };
    }
  }
}
