import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';
import * as ccxt from 'ccxt';

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
  private readonly QUOTE_CACHE_TTL = 5_000;       // V422: 5 seconds (matches stream TTL)
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
    // BUG-C10 FIX: Use hour-granularity bucketing instead of date-only.
    // Date-only caused same-day requests to return stale cached data.
    const cacheKey = `binance:history:${symbol}:${interval}:${Math.floor(start.getTime() / 3_600_000)}:${Math.floor(end.getTime() / 3_600_000)}`;

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

    const normalizedSymbol = this._normalizeSymbol(symbol);
    let ticker;
    try {
      ticker = await this.exchange.fetchTicker(normalizedSymbol);
    } catch (error: any) {
      // If /USD pair doesn't exist on Binance, try /USDT instead
      if (normalizedSymbol.endsWith('/USD') && error?.message?.includes('does not have market symbol')) {
        const usdtSymbol = normalizedSymbol.replace('/USD', '/USDT');
        this.logger.warn(`💱 ${normalizedSymbol} not found on Binance, trying ${usdtSymbol}`);
        ticker = await this.exchange.fetchTicker(usdtSymbol);
      } else {
        throw error;
      }
    }

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

    const timeframe = this._mapInterval(interval);
    const normalizedSymbol = this._normalizeSymbol(symbol);

    // BUG-C01 FIX: Paginate fetchOHLCV — was passing limit=undefined (CCXT default=500).
    // Now fetches in batches of 1000 until all data between start and end is retrieved.
    const fetchBatch = async (sym: string, since: number): Promise<any[]> => {
      return await this.exchange.fetchOHLCV(sym, timeframe, since, 1000, end.getTime());
    };

    let allOhlcv: any[] = [];
    let cursor = start.getTime();
    const actualSymbol = normalizedSymbol;

    try {
      let batch = await fetchBatch(actualSymbol, cursor);
      if (batch.length === 0) {
        // Try /USDT fallback
        if (actualSymbol.endsWith('/USD')) {
          const usdtSymbol = actualSymbol.replace('/USD', '/USDT');
          this.logger.warn(`💱 ${actualSymbol} not found, trying ${usdtSymbol}`);
          batch = await fetchBatch(usdtSymbol, cursor);
          if (batch.length > 0) {
            // Continue pagination with the working symbol
            allOhlcv = allOhlcv.concat(batch);
            cursor = batch[batch.length - 1][0] + 1;
            while (batch.length === 1000 && cursor < end.getTime()) {
              batch = await fetchBatch(usdtSymbol, cursor);
              if (batch.length === 0) break;
              allOhlcv = allOhlcv.concat(batch);
              cursor = batch[batch.length - 1][0] + 1;
            }
          }
        }
      } else {
        allOhlcv = allOhlcv.concat(batch);
        cursor = batch[batch.length - 1][0] + 1;
        // Continue fetching until we get less than 1000 (end of range) or reach end time
        while (batch.length === 1000 && cursor < end.getTime()) {
          batch = await fetchBatch(actualSymbol, cursor);
          if (batch.length === 0) break;
          allOhlcv = allOhlcv.concat(batch);
          cursor = batch[batch.length - 1][0] + 1;
        }
      }
    } catch (error: any) {
      // If /USD pair doesn't exist on Binance, try /USDT instead
      if (actualSymbol.endsWith('/USD') && error?.message?.includes('does not have market symbol') && allOhlcv.length === 0) {
        const usdtSymbol = actualSymbol.replace('/USD', '/USDT');
        this.logger.warn(`💱 ${actualSymbol} not found on Binance history, trying ${usdtSymbol}`);
        cursor = start.getTime();
        let batch = await fetchBatch(usdtSymbol, cursor);
        allOhlcv = allOhlcv.concat(batch);
        cursor = batch.length > 0 ? batch[batch.length - 1][0] + 1 : cursor;
        while (batch.length === 1000 && cursor < end.getTime()) {
          batch = await fetchBatch(usdtSymbol, cursor);
          if (batch.length === 0) break;
          allOhlcv = allOhlcv.concat(batch);
          cursor = batch[batch.length - 1][0] + 1;
        }
      } else {
        throw error;
      }
    }

    this.logger.debug(`💱 Binance history: fetched ${allOhlcv.length} candles for ${symbol} (${interval})`);

    return allOhlcv.map((candle) => ({
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

  // ── Private: Symbol Normalization ──

  /**
   * Normalize symbol for Binance.
   * Binance spot market primarily uses /USDT pairs, not /USD.
   * This method converts known crypto /USD pairs to /USDT format.
   * The original symbol is preserved in the response for UI consistency.
   */
  private _normalizeSymbol(symbol: string): string {
    // Crypto pairs ending in /USD should be tried as /USDT on Binance
    // Binance spot has BTC/USDT, ETH/USDT, XRP/USDT, etc.
    // but NOT XRP/USD, ADA/USD, DOGE/USD, etc.
    // We try the original symbol first, then fall back to /USDT in the caller.
    return symbol;
  }

  // ── Private: Interval Mapping ──

  private _mapInterval(interval: string): string {
    const mapping: Record<string, string> = {
      // Full format (from API docs)
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
      // Short format (from mobile app / CCXT standard)
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1d': '1d',
      '1w': '1w',
      '1M': '1M',
    };
    return mapping[interval] || '1d';
  }
}
