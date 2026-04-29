import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';
import axios from 'axios';

/**
 * Twelve Data API Adapter
 * 
 * Implements IExchangeAdapter for the Twelve Data market data API.
 * Uses Redis for caching and rate limiting to stay within API limits.
 * 
 * Rate Limits:
 * - Free tier: 8 API calls/min, 800/day
 * - Pro tier: varies by plan
 * 
 * Cache TTL:
 * - Quotes: 10 minutes (matches frontend 10-min polling, reduces API hits)
 * - Historical: 10 minutes
 */
@Injectable()
export class TwelveDataAdapter implements IExchangeAdapter {
  readonly name = 'TwelveData';
  private readonly logger = new Logger(TwelveDataAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.twelvedata.com';

  // Cache TTLs — optimized for free tier sustainability
  // Free tier: 800 credits/day. Frontend polls non-crypto every 600s (10 min).
  // With 600s cache matching the polling interval, most requests hit Redis cache
  // instead of the API, dramatically reducing daily credit consumption.
  // With daily budget + 600s cache: we limit to ~700/day max, keeping 100 buffer.
  // Actual API hits: ~12 symbols * 144 polls/day = 1,728 cache reads, but only
  // ~12 * 6 actual API misses/day = 72 API calls — well within budget.
  private readonly QUOTE_CACHE_TTL = 600_000;       // 10 minutes (was 2min) — matches frontend polling
  private readonly HISTORY_CACHE_TTL = 600_000;    // 10 minutes (was 5m)

  // Rate limit: 8 calls per minute for free tier
  private readonly RATE_LIMIT_WINDOW = 60_000;     // 1 minute
  private readonly RATE_LIMIT_MAX = 8;

  // Daily credit budget — stay within free tier
  private readonly DAILY_CREDIT_LIMIT = 700; // Leave 100 buffer under 800/day limit
  private readonly DAILY_CREDIT_WINDOW = 86_400_000; // 24 hours in ms

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.apiKey = this.configService.get<string>('TWELVE_DATA_API_KEY', '')?.trim() || '';

    if (!this.apiKey) {
      this.logger.warn('⚠️ TWELVE_DATA_API_KEY is not set — market data will not work');
    }
  }

  /**
   * Fetch real-time quote for a symbol
   * Uses Redis caching to minimize API calls
   */
  async fetchQuote(symbol: string): Promise<UnifiedQuoteDto> {
    const cacheKey = `quote:${symbol}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedQuoteDto>(
        cacheKey,
        () => this._fetchQuoteFromApi(symbol),
        this.QUOTE_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch quote for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب بيانات ${symbol}: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Fetch historical OHLCV data for a symbol
   */
  async fetchHistoricalData(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    const cacheKey = `history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedCandleDto[]>(
        cacheKey,
        () => this._fetchHistoricalFromApi(symbol, interval, start, end),
        this.HISTORY_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch history for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب البيانات التاريخية لـ ${symbol}: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ── Private: Direct API Calls ──

  private async _fetchQuoteFromApi(symbol: string): Promise<UnifiedQuoteDto> {
    // Check rate limit (including circuit breaker)
    await this._checkRateLimit();

    const url = `${this.baseUrl}/quote`;
    const params = {
      symbol,
      apikey: this.apiKey,
    };

    this.logger.debug(`📡 Fetching quote: ${symbol}`);

    const response = await axios.get(url, { params, timeout: 10000 });
    const data = response.data;

    if (data.status === 'error') {
      // Detect daily credit exhaustion from TwelveData's server-side counter
      // This happens when our Redis counter reset (container restart) but
      // TwelveData's counter didn't — so we're still over the limit on their end.
      if (data.message && (
        data.message.includes('run out of API credits') ||
        data.message.includes('out of API credits') ||
        data.message.includes('limit being')
      )) {
        await this._activateDailyCircuitBreaker();
      }
      throw new Error(data.message || 'Twelve Data API error');
    }

    return this._mapQuoteResponse(symbol, data);
  }

  private async _fetchHistoricalFromApi(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    // Check rate limit (including circuit breaker)
    await this._checkRateLimit();

    const url = `${this.baseUrl}/time_series`;
    const params = {
      symbol,
      interval,
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
      outputsize: 5000,
      apikey: this.apiKey,
    };

    this.logger.debug(`📡 Fetching history: ${symbol} (${interval})`);

    const response = await axios.get(url, { params, timeout: 15000 });
    const data = response.data;

    if (data.status === 'error') {
      // Detect daily credit exhaustion
      if (data.message && (
        data.message.includes('run out of API credits') ||
        data.message.includes('out of API credits') ||
        data.message.includes('limit being')
      )) {
        await this._activateDailyCircuitBreaker();
      }
      throw new Error(data.message || 'Twelve Data API error');
    }

    if (!data.values || !Array.isArray(data.values)) {
      return [];
    }

    return data.values.map((candle: any) =>
      this._mapCandleResponse(symbol, candle),
    );
  }

  // ── Private: Response Mappers ──

  private _mapQuoteResponse(symbol: string, data: any): UnifiedQuoteDto {
    return {
      symbol,
      name: data.name || symbol,
      exchange: data.exchange || '',
      currency: data.currency || 'USD',
      price: this._toNumber(data.close),
      change: this._toNumber(data.change),
      changePercent: this._toNumber(data.percent_change),
      open: this._toNumber(data.open),
      high: this._toNumber(data.high),
      low: this._toNumber(data.low),
      close: this._toNumber(data.close),
      volume: this._toNumber(data.volume),
      marketCap: data.market_cap ? this._toNumber(data.market_cap) : null,
      fiftyTwoWeekHigh: data.fifty_two_week?.high
        ? this._toNumber(data.fifty_two_week.high)
        : null,
      fiftyTwoWeekLow: data.fifty_two_week?.low
        ? this._toNumber(data.fifty_two_week.low)
        : null,
      timestamp: new Date(data.timestamp || Date.now()),
      source: this.name,
    };
  }

  private _mapCandleResponse(symbol: string, candle: any): UnifiedCandleDto {
    return {
      symbol,
      timestamp: new Date(candle.datetime),
      open: this._toNumber(candle.open),
      high: this._toNumber(candle.high),
      low: this._toNumber(candle.low),
      close: this._toNumber(candle.close),
      volume: this._toNumber(candle.volume),
      source: this.name,
    };
  }

  // ── Private: Rate Limiting ──

  private async _checkRateLimit(): Promise<void> {
    // ── Circuit breaker: check if TwelveData reported daily credit exhaustion ──
    // The key includes the API key hash, so changing the key auto-invalidates old breakers
    const keyHash = this._getKeyHash();
    const circuitBreakerKey = `twelvedata:daily_exhausted:${keyHash}`;
    const circuitBreaker = await this.redisService.get(circuitBreakerKey);
    if (circuitBreaker) {
      this.logger.warn(
        `🚫 TwelveData daily credits exhausted (circuit breaker active). All requests paused until reset.`,
      );
      throw new HttpException(
        `تم تجاوز الحد اليومي لطلبات Twelve Data. يرجى المحاولة غداً.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ── Per-minute rate limit (8 calls/min) ──
    const key = 'ratelimit:twelvedata';

    const result = await this.redisService.checkRateLimit(
      key,
      this.RATE_LIMIT_MAX,
      this.RATE_LIMIT_WINDOW,
    );

    if (!result.allowed) {
      this.logger.warn(
        `⚠️ Rate limit exceeded for Twelve Data. Reset in ${result.resetIn}ms`,
      );
      throw new HttpException(
        `تم تجاوز حد الطلبات. يرجى المحاولة بعد ${Math.ceil((result.resetIn || 60000) / 1000)} ثوانٍ`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ── Daily credit budget (700/day for free tier) ──
    const dailyKey = 'ratelimit:twelvedata:daily';
    const dailyResult = await this.redisService.checkRateLimit(
      dailyKey,
      this.DAILY_CREDIT_LIMIT,
      this.DAILY_CREDIT_WINDOW,
    );

    if (!dailyResult.allowed) {
      this.logger.warn(
        `⚠️ Daily credit limit reached for Twelve Data (${this.DAILY_CREDIT_LIMIT}/day). Remaining credits reset at midnight.`,
      );
      throw new HttpException(
        `تم تجاوز الحد اليومي لطلبات Twelve Data. يرجى المحاولة غداً.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.logger.debug(
      `Rate limit: ${result.remaining}/min, ${dailyResult.remaining}/day remaining`,
    );
  }

  /**
   * Activate the daily circuit breaker.
   * When TwelveData's server says we're out of credits, we set a Redis key
   * that blocks ALL subsequent requests until it expires.
   *
   * TTL is set to 4 hours — long enough to avoid spamming the API every 5 minutes
   * when credits are truly exhausted for the day, but short enough to auto-recover
   * if the user updates their API key or if TwelveData resets earlier than expected.
   * The key also includes the API key hash so changing the key auto-invalidates it.
   *
   * FIX: Changed from 5 minutes to 4 hours. With 5-min TTL, the system retried
   * 288 times/day generating massive error spam. With 4-hour TTL, it retries at most
   * 6 times/day, which is reasonable for a daily credit exhaustion scenario.
   */
  private async _activateDailyCircuitBreaker(): Promise<void> {
    // Include API key hash in the circuit breaker key so changing the key auto-invalidates it
    const keyHash = this._getKeyHash();
    const circuitBreakerKey = `twelvedata:daily_exhausted:${keyHash}`;

    // Check if this is a re-activation (circuit breaker was already active recently)
    const reactivationKey = `twelvedata:reactivation_count:${keyHash}`;
    let reactivationCount = 0;
    try {
      const existing = await this.redisService.get(reactivationKey);
      reactivationCount = existing ? (JSON.parse(existing).count || 0) + 1 : 1;
    } catch {
      reactivationCount = 1;
    }

    // If circuit breaker keeps getting re-activated (3+ times), extend to 8 hours
    const ttlMs = reactivationCount >= 3 ? 8 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000; // 8h or 4h

    await this.redisService.set(
      circuitBreakerKey,
      JSON.stringify({
        activatedAt: new Date().toISOString(),
        reason: 'TwelveData server reported daily credit exhaustion',
        apiKeyHash: keyHash,
        reactivationCount,
      }),
      ttlMs,
    );

    // Track reactivation count with 24h TTL (resets daily)
    await this.redisService.set(
      reactivationKey,
      JSON.stringify({ count: reactivationCount, lastActivated: new Date().toISOString() }),
      86_400_000,
    );

    const ttlHours = ttlMs / (60 * 60 * 1000);
    this.logger.error(
      `🚫 TwelveData DAILY CREDITS EXHAUSTED — circuit breaker activated for ${ttlHours} hours ` +
      `(reactivation #${reactivationCount}). ` +
      `If you updated your API key, it will take effect automatically. ` +
      `Set DISABLE_TWELVE_DATA=true to skip TwelveData entirely. ` +
      `Consider upgrading your TwelveData plan at https://twelvedata.com/pricing`,
    );
  }

  /**
   * Compute a simple hash of the API key for circuit breaker key scoping.
   * When the API key changes, the old circuit breaker key becomes irrelevant.
   */
  private _getKeyHash(): string {
    let hash = 0;
    for (let i = 0; i < this.apiKey.length; i++) {
      const chr = this.apiKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return hash.toString(36);
  }

  // ── Private: Utility ──

  private _toNumber(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }
}
