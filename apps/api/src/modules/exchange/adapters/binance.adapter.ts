import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';
import ccxt from 'ccxt';

/**
 * Binance Adapter via CCXT
 * 
 * Implements IExchangeAdapter for cryptocurrency markets via Binance.
 * Uses the ccxt library for standardized exchange interactions.
 * Redis caching and rate limiting are applied to stay within API limits.
 * 
 * Rate Limits (Binance):
 * - REST API: 1200 requests/min per IP
 * - We conservatively limit to 100 requests/min
 */
@Injectable()
export class BinanceAdapter implements IExchangeAdapter {
  readonly name = 'Binance';
  private readonly logger = new Logger(BinanceAdapter.name);
  private readonly exchange: any;

  // Cache TTLs
  private readonly QUOTE_CACHE_TTL = 3_000;       // 3 seconds (crypto moves fast)
  private readonly HISTORY_CACHE_TTL = 60_000;    // 1 minute

  // Rate limit: conservative 100 calls/min
  private readonly RATE_LIMIT_WINDOW = 60_000;
  private readonly RATE_LIMIT_MAX = 100;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.exchange = new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: 'spot' },
    });

    this.logger.log('💱 Binance Adapter initialized via CCXT');
  }

  /**
   * Fetch real-time quote for a crypto symbol
   * Symbol format: BTC/USDT, ETH/USDT, etc.
   */
  async fetchQuote(symbol: string): Promise<UnifiedQuoteDto> {
    const cacheKey = `binance:quote:${symbol}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedQuoteDto>(
        cacheKey,
        () => this._fetchQuoteFromExchange(symbol),
        this.QUOTE_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch Binance quote for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب بيانات ${symbol} من Binance: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Fetch historical OHLCV data for a crypto symbol
   */
  async fetchHistoricalData(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    const cacheKey = `binance:history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedCandleDto[]>(
        cacheKey,
        () => this._fetchHistoricalFromExchange(symbol, interval, start, end),
        this.HISTORY_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch Binance history for ${symbol}: ${error.message}`);
      throw new HttpException(
        `فشل في جلب البيانات التاريخية لـ ${symbol} من Binance: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ── Private: Direct Exchange Calls ──

  private async _fetchQuoteFromExchange(symbol: string): Promise<UnifiedQuoteDto> {
    await this._checkRateLimit();

    this.logger.debug(`💱 Fetching Binance quote: ${symbol}`);

    const ticker = await this.exchange.fetchTicker(symbol);

    return {
      symbol,
      name: symbol.replace('/', ' → '),
      exchange: 'Binance',
      currency: symbol.split('/')[1] || 'USDT',
      price: ticker.last ?? 0,
      change: ticker.change ?? 0,
      changePercent: ticker.percentage ?? 0,
      open: ticker.open ?? 0,
      high: ticker.high ?? 0,
      low: ticker.low ?? 0,
      close: ticker.last ?? 0,
      volume: ticker.baseVolume ?? 0,
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      timestamp: new Date(ticker.timestamp ?? Date.now()),
      source: this.name,
    };
  }

  private async _fetchHistoricalFromExchange(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    await this._checkRateLimit();

    this.logger.debug(`💱 Fetching Binance history: ${symbol} (${interval})`);

    // Map interval to CCXT timeframe
    const timeframe = this._mapInterval(interval);

    const ohlcv = await this.exchange.fetchOHLCV(
      symbol,
      timeframe,
      start.getTime(),
      undefined,
      end.getTime(),
    );

    return ohlcv.map((candle) => ({
      symbol,
      timestamp: new Date(candle[0]),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
      source: this.name,
    }));
  }

  // ── Private: Rate Limiting ──

  private async _checkRateLimit(): Promise<void> {
    const key = 'ratelimit:binance';

    const result = await this.redisService.checkRateLimit(
      key,
      this.RATE_LIMIT_MAX,
      this.RATE_LIMIT_WINDOW,
    );

    if (!result.allowed) {
      this.logger.warn(`⚠️ Rate limit exceeded for Binance. Reset in ${result.resetIn}ms`);
      throw new HttpException(
        `تم تجاوز حد الطلبات لـ Binance. يرجى المحاولة بعد ${Math.ceil((result.resetIn || 60000) / 1000)} ثوانٍ`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ── Private: Interval Mapping ──

  private _mapInterval(interval: string): string {
    const mapping: Record<string, string> = {
      '1min': '1m',
      '5min': '5m',
      '15min': '15m',
      '30min': '30m',
      '1h': '1h',
      '2h': '2h',
      '4h': '4h',
      '1day': '1d',
      '1week': '1w',
      '1month': '1M',
    };
    return mapping[interval] || '1d';
  }
}
