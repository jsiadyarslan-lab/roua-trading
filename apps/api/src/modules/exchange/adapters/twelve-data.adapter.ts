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
 * - Quotes: 5 seconds (real-time feel with rate limit respect)
 * - Historical: 5 minutes (less volatile data)
 */
@Injectable()
export class TwelveDataAdapter implements IExchangeAdapter {
  readonly name = 'TwelveData';
  private readonly logger = new Logger(TwelveDataAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.twelvedata.com';

  // Cache TTLs — optimized for free tier sustainability
  // Free tier: 800 credits/day. With 9 non-crypto symbols polled every 15s:
  //   9 symbols * 4 polls/min * 60 min/hr * 24 hr = 51,840 — WAY too many.
  // With 60s cache: 9 symbols * 1 poll/min * 60 min/hr * 24 hr = 12,960 — still too many.
  // With 120s cache: 9 symbols * 0.5 polls/min * 60 * 24 = 6,480 — still over.
  // With daily budget + 120s cache: we limit to ~700/day max, keeping 100 buffer.
  private readonly QUOTE_CACHE_TTL = 120_000;       // 2 minutes (was 5s)
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
    this.apiKey = this.configService.get<string>('TWELVE_DATA_API_KEY', '');

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
    // Check rate limit
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
    // Check rate limit
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

  // ── Private: Utility ──

  private _toNumber(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }
}
