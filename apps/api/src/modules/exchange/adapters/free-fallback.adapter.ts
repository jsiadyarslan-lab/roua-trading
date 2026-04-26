import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';
import axios from 'axios';

/**
 * Free Fallback Adapter — No API key required
 *
 * Provides market data for forex and gold when the primary
 * TwelveData adapter is rate-limited or unavailable.
 *
 * Data sources:
 * - Forex: Frankfurter API (ECB official rates) — completely free, no key, no rate limit
 * - Gold (XAU/USD): metals.dev free tier or goldpricez.com scrape
 * - Stocks: Last known price from Redis cache (stale but better than "—")
 *
 * Cache TTLs are longer than primary sources since this is a fallback.
 */
@Injectable()
export class FreeFallbackAdapter implements IExchangeAdapter {
  readonly name = 'FreeFallback';
  private readonly logger = new Logger(FreeFallbackAdapter.name);

  private readonly QUOTE_CACHE_TTL = 300_000;  // 5 minutes (fallback — less frequent updates)
  private readonly HISTORY_CACHE_TTL = 3_600_000; // 1 hour (fallback — historical data rarely needed)

  constructor(private readonly redisService: RedisService) {
    this.logger.log('🆓 Free Fallback Adapter initialized (no API key required)');
  }

  async fetchQuote(symbol: string): Promise<UnifiedQuoteDto> {
    const cacheKey = `fallback:quote:${symbol}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedQuoteDto>(
        cacheKey,
        () => this._fetchQuoteFromFreeSource(symbol),
        this.QUOTE_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Fallback quote failed for ${symbol}: ${error.message}`);

      // Try to return cached price from previous successful fetch
      const lastKnownPrice = await this._getLastKnownPrice(symbol);
      if (lastKnownPrice) {
        this.logger.warn(`Returning last known price for ${symbol} from cache`);
        return lastKnownPrice;
      }

      throw error;
    }
  }

  async fetchHistoricalData(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    const cacheKey = `fallback:history:${symbol}:${interval}:${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;

    try {
      return await this.redisService.cacheOrGet<UnifiedCandleDto[]>(
        cacheKey,
        () => this._fetchHistoricalFromFreeSource(symbol, interval, start, end),
        this.HISTORY_CACHE_TTL,
      );
    } catch (error: any) {
      this.logger.error(`Fallback history failed for ${symbol}: ${error.message}`);
      return [];
    }
  }

  // ── Private: Data Fetching ──

  private async _fetchQuoteFromFreeSource(symbol: string): Promise<UnifiedQuoteDto> {
    const [base, quote] = symbol.includes('/') ? symbol.split('/') : [symbol, 'USD'];

    // ── Gold (XAU/USD) ──
    if (base === 'XAU') {
      return this._fetchGoldQuote(symbol);
    }

    // ── Silver (XAG/USD) ──
    if (base === 'XAG') {
      return this._fetchSilverQuote(symbol);
    }

    // ── Forex pairs ──
    const fiatCurrencies = new Set([
      'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK',
    ]);
    if (fiatCurrencies.has(base) && fiatCurrencies.has(quote)) {
      return this._fetchForexQuote(symbol, base, quote);
    }

    // ── Stocks: Return last known price or a placeholder ──
    return this._fetchStockQuote(symbol);
  }

  /**
   * Fetch stock quote from Yahoo Finance (free, no API key required)
   * Uses the unofficial Yahoo Finance v8 API endpoint
   */
  private async _fetchStockQuote(symbol: string): Promise<UnifiedQuoteDto> {
    try {
      // Yahoo Finance v8 API — free, no key required
      const yahooSymbol = symbol.replace('/', '-');
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
        params: {
          range: '1d',
          interval: '1d',
        },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RouaTrading/1.0)',
        },
      });

      if (response.data?.chart?.result?.[0]?.meta) {
        const meta = response.data.chart.result[0].meta;
        const price = meta.regularMarketPrice ?? 0;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;

        if (price > 0) {
          const change = price - prevClose;
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
          const result: UnifiedQuoteDto = {
            symbol,
            name: meta.shortName || symbol,
            exchange: meta.exchangeName || 'Yahoo Finance',
            currency: meta.currency || 'USD',
            price,
            change,
            changePercent,
            open: meta.regularMarketDayOpen ?? price,
            high: meta.regularMarketDayHigh ?? price,
            low: meta.regularMarketDayLow ?? price,
            close: price,
            volume: meta.regularMarketVolume ?? 0,
            marketCap: null,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
            timestamp: new Date(meta.regularMarketTime * 1000 || Date.now()),
            source: 'Yahoo Finance',
          };
          await this._saveLastKnownPrice(symbol, result);
          return result;
        }
      }
    } catch (error: any) {
      this.logger.warn(`Yahoo Finance failed for ${symbol}: ${error.message}`);
    }

    // Try last known price from cache
    const lastKnown = await this._getLastKnownPrice(symbol);
    if (lastKnown) {
      this.logger.warn(`Returning cached price for stock ${symbol}`);
      return lastKnown;
    }

    throw new Error(`All free sources failed for stock (${symbol})`);
  }

  /**
   * Fetch gold price from free sources
   * Tries metals.dev first, then falls back to alternative
   */
  private async _fetchGoldQuote(symbol: string): Promise<UnifiedQuoteDto> {
    // Try metals.dev free endpoint
    try {
      const response = await axios.get('https://api.metals.dev/v1/latest', {
        params: {
          api_key: 'FREE',
          currency: 'USD',
          unit: 'toz',
        },
        timeout: 10000,
      });

      if (response.data && response.data.metals && response.data.metals.gold) {
        const price = parseFloat(response.data.metals.gold);
        if (price > 0) {
          const result: UnifiedQuoteDto = {
            symbol,
            name: 'Gold/US Dollar',
            exchange: 'Metals.dev',
            currency: 'USD',
            price,
            change: 0,
            changePercent: 0,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
            marketCap: null,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            timestamp: new Date(),
            source: 'Metals.dev',
          };
          await this._saveLastKnownPrice(symbol, result);
          return result;
        }
      }
    } catch (error: any) {
      this.logger.warn(`metals.dev failed for gold: ${error.message}`);
    }

    // Fallback: Try Yahoo Finance for GC=F (Gold Futures)
    try {
      const response = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF', {
        params: { range: '1d', interval: '1d' },
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RouaTrading/1.0)' },
      });

      if (response.data?.chart?.result?.[0]?.meta) {
        const meta = response.data.chart.result[0].meta;
        const price = meta.regularMarketPrice ?? 0;
        if (price > 0) {
          const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
          const change = price - prevClose;
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
          const result: UnifiedQuoteDto = {
            symbol,
            name: 'Gold/US Dollar',
            exchange: 'Yahoo Finance',
            currency: 'USD',
            price,
            change,
            changePercent,
            open: meta.regularMarketDayOpen ?? price,
            high: meta.regularMarketDayHigh ?? price,
            low: meta.regularMarketDayLow ?? price,
            close: price,
            volume: meta.regularMarketVolume ?? 0,
            marketCap: null,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
            timestamp: new Date(meta.regularMarketTime * 1000 || Date.now()),
            source: 'Yahoo Finance',
          };
          await this._saveLastKnownPrice(symbol, result);
          return result;
        }
      }
    } catch (error: any) {
      this.logger.warn(`Yahoo Finance gold failed: ${error.message}`);
    }

    // Try last known price from cache
    const lastKnown = await this._getLastKnownPrice(symbol);
    if (lastKnown) {
      this.logger.warn(`Returning cached price for gold ${symbol}`);
      return lastKnown;
    }

    throw new Error(`All free sources failed for gold (${symbol})`);
  }

  /**
   * Fetch silver price from free sources
   */
  private async _fetchSilverQuote(symbol: string): Promise<UnifiedQuoteDto> {
    try {
      const response = await axios.get('https://api.metals.dev/v1/latest', {
        params: {
          api_key: 'FREE',
          currency: 'USD',
          unit: 'toz',
        },
        timeout: 10000,
      });

      if (response.data && response.data.metals && response.data.metals.silver) {
        const price = parseFloat(response.data.metals.silver);
        if (price > 0) {
          const result: UnifiedQuoteDto = {
            symbol,
            name: 'Silver/US Dollar',
            exchange: 'Metals.dev',
            currency: 'USD',
            price,
            change: 0,
            changePercent: 0,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
            marketCap: null,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            timestamp: new Date(),
            source: 'Metals.dev',
          };
          await this._saveLastKnownPrice(symbol, result);
          return result;
        }
      }
    } catch (error: any) {
      this.logger.warn(`metals.dev failed for silver: ${error.message}`);
    }

    throw new Error(`All free sources failed for silver (${symbol})`);
  }

  /**
   * Fetch forex quote from Frankfurter API (ECB official rates)
   * Completely free, no API key, no rate limit
   */
  private async _fetchForexQuote(
    symbol: string,
    base: string,
    quote: string,
  ): Promise<UnifiedQuoteDto> {
    try {
      const response = await axios.get(`https://api.frankfurter.app/latest`, {
        params: {
          from: base,
          to: quote,
        },
        timeout: 10000,
      });

      if (response.data && response.data.rates && response.data.rates[quote]) {
        const price = parseFloat(response.data.rates[quote]);
        if (price > 0) {
          const result: UnifiedQuoteDto = {
            symbol,
            name: `${base}/${quote}`,
            exchange: 'ECB/Frankfurter',
            currency: quote,
            price,
            change: 0,
            changePercent: 0,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
            marketCap: null,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            timestamp: new Date(),
            source: 'ECB/Frankfurter',
          };
          await this._saveLastKnownPrice(symbol, result);
          return result;
        }
      }
    } catch (error: any) {
      this.logger.warn(`Frankfurter forex failed for ${symbol}: ${error.message}`);
    }

    throw new Error(`Free forex source failed for ${symbol}`);
  }

  /**
   * Fetch historical data from free sources
   * Frankfurter supports historical forex rates
   */
  private async _fetchHistoricalFromFreeSource(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]> {
    const [base, quote] = symbol.includes('/') ? symbol.split('/') : [symbol, 'USD'];

    // Only forex supported for historical data via Frankfurter
    const fiatCurrencies = new Set([
      'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK',
    ]);

    if (fiatCurrencies.has(base) && fiatCurrencies.has(quote)) {
      try {
        const startDate = start.toISOString().split('T')[0];
        const endDate = end.toISOString().split('T')[0];

        const response = await axios.get(
          `https://api.frankfurter.app/${startDate}..${endDate}`,
          {
            params: { from: base, to: quote },
            timeout: 15000,
          },
        );

        if (response.data && response.data.rates) {
          const candles: UnifiedCandleDto[] = [];
          for (const [dateStr, rates] of Object.entries(response.data.rates)) {
            const price = parseFloat((rates as any)[quote] || '0');
            if (price > 0) {
              candles.push({
                symbol,
                timestamp: new Date(dateStr),
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0,
                source: 'ECB/Frankfurter',
              });
            }
          }
          return candles;
        }
      } catch (error: any) {
        this.logger.warn(`Frankfurter history failed for ${symbol}: ${error.message}`);
      }
    }

    // No free historical data source available for this symbol
    return [];
  }

  // ── Private: Last Known Price Cache ──

  private async _saveLastKnownPrice(symbol: string, quote: UnifiedQuoteDto): Promise<void> {
    try {
      const key = `fallback:lastprice:${symbol}`;
      await this.redisService.set(
        key,
        JSON.stringify({ ...quote, timestamp: quote.timestamp.toISOString() }),
        86_400_000, // 24 hours
      );
    } catch {
      // Non-critical — ignore cache errors
    }
  }

  private async _getLastKnownPrice(symbol: string): Promise<UnifiedQuoteDto | null> {
    try {
      const key = `fallback:lastprice:${symbol}`;
      const cached = await this.redisService.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.timestamp = new Date(parsed.timestamp);
        parsed.source = `${parsed.source} (مخزّن)`;
        return parsed;
      }
    } catch {
      // Non-critical
    }
    return null;
  }
}
