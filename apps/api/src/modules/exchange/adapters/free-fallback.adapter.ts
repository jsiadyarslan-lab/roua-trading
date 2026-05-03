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

    // ── Crypto: CoinGecko free API (CRITICAL FIX - was missing!) ──
    // This is the #1 reason the autonomous trader never executed trades:
    // Binance CCXT often fails on Railway/cloud IPs, and FreeFallback had no
    // crypto support, so ALL market data requests for BTC/USDT, ETH/USDT etc.
    // returned null → no analysis → no signals → no trades.
    const cryptoBases = new Set([
      'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LTC',
      'AVAX', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM', 'BCH', 'ALGO', 'VET', 'ICP',
      'FIL', 'TRX', 'NEAR', 'FTM', 'AAVE', 'SHIB', 'SUI', 'SEI', 'TIA', 'INJ',
      'STX', 'IMX', 'RUNE', 'PEPE', 'WIF', 'ARB', 'OP',
    ]);
    const cryptoQuotes = new Set(['USDT', 'USD', 'BUSD', 'USDC', 'DAI', 'TUSD']);
    if (cryptoBases.has(base) && cryptoQuotes.has(quote)) {
      return this._fetchCryptoQuote(symbol, base, quote);
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
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
   * Tries metals.dev first, then Yahoo Finance Gold Futures, then goldpricez
   */
  private async _fetchGoldQuote(symbol: string): Promise<UnifiedQuoteDto> {
    // Try Yahoo Finance for GC=F (Gold Futures) FIRST — most reliable free source
    try {
      const response = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF', {
        params: { range: '1d', interval: '1d' },
        timeout: 10000,
        headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
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

    // Try metals.dev free endpoint as fallback
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
    // FIX: Try Yahoo Finance for SI=F (Silver Futures) FIRST — most reliable free source
    try {
      const response = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/SI%3DF', {
        params: { range: '1d', interval: '1d' },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
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
            name: 'Silver/US Dollar',
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
      this.logger.warn(`Yahoo Finance silver failed: ${error.message}`);
    }

    // Try metals.dev as fallback
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
      const response = await axios.get(`https://api.frankfurter.dev/v1/latest`, {
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

    // ── Crypto: CoinGecko OHLC data ──
    const cryptoBases = new Set([
      'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LTC',
      'AVAX', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM', 'BCH', 'ALGO', 'VET', 'ICP',
      'FIL', 'TRX', 'NEAR', 'FTM', 'AAVE', 'SHIB', 'SUI', 'SEI', 'TIA', 'INJ',
      'STX', 'IMX', 'RUNE', 'PEPE', 'WIF', 'ARB', 'OP',
    ]);
    const cryptoQuotes = new Set(['USDT', 'USD', 'BUSD', 'USDC', 'DAI', 'TUSD']);
    if (cryptoBases.has(base) && cryptoQuotes.has(quote)) {
      const coinId = FreeFallbackAdapter.COINGECKO_IDS[base];
      if (coinId) {
        const vsCurrency = quote.toLowerCase() === 'usdt' ? 'usd' : quote.toLowerCase();
        const days = Math.max(1, Math.min(90, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))));

        // ── Approach 1: CoinGecko /coins/{id}/ohlc — returns real OHLC data ──
        // Returns [timestamp, open, high, low, close] arrays
        // Free tier, no API key. Granularity: 30min (1d), 4h (7-90d), 4h (180-365d)
        try {
          const ohlcResponse = await axios.get(
            `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc`,
            {
              params: {
                vs_currency: vsCurrency,
                days: days.toString(),
              },
              timeout: 15000,
            },
          );

          if (ohlcResponse.data && Array.isArray(ohlcResponse.data) && ohlcResponse.data.length > 0) {
            // Fetch volume data separately from market_chart to enrich OHLC candles
            const volumeMap = new Map<number, number>();
            try {
              const mcResponse = await axios.get(
                `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`,
                {
                  params: {
                    vs_currency: vsCurrency,
                    days: days.toString(),
                    interval: 'daily',
                  },
                  timeout: 10000,
                },
              );
              if (mcResponse.data?.total_volumes) {
                for (const [ts, vol] of mcResponse.data.total_volumes as [number, number][]) {
                  // Key by date (midnight UTC) so we can match OHLC candles to their day's volume
                  const dayKey = new Date(ts).toISOString().split('T')[0];
                  volumeMap.set(new Date(dayKey).getTime(), vol);
                }
              }
            } catch {
              // Volume enrichment is optional — continue with volume=0
            }

            const candles: UnifiedCandleDto[] = [];
            for (const ohlc of ohlcResponse.data) {
              const [timestamp, open, high, low, close] = ohlc as [number, number, number, number, number];
              const ts = new Date(timestamp);
              if (ts >= start && ts <= end && close > 0) {
                // Find closest volume entry by date
                const dayKey = new Date(timestamp).toISOString().split('T')[0];
                const vol = volumeMap.get(new Date(dayKey).getTime()) ?? 0;
                candles.push({
                  symbol,
                  timestamp: ts,
                  open,
                  high,
                  low,
                  close,
                  volume: vol,
                  source: 'CoinGecko',
                });
              }
            }
            if (candles.length > 0) {
              this.logger.log(`CoinGecko OHLC: ${candles.length} candles for ${symbol} (real OHLC, not flat)`);
              return candles;
            }
          }
        } catch (error: any) {
          this.logger.warn(`CoinGecko OHLC endpoint failed for ${symbol}: ${error.message}, falling back to market_chart aggregation`);
        }

        // ── Approach 2: Aggregate OHLC from market_chart hourly prices ──
        // Group consecutive hourly price points into proper candles
        // Each candle = one hour window: open=first, close=last, high=max, low=min
        try {
          const mcResponse = await axios.get(
            `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`,
            {
              params: {
                vs_currency: vsCurrency,
                days: days.toString(),
                interval: 'hourly',
              },
              timeout: 15000,
            },
          );

          if (mcResponse.data?.prices && mcResponse.data.prices.length > 0) {
            const prices = mcResponse.data.prices as [number, number][];
            const volumes = (mcResponse.data.total_volumes || []) as [number, number][];

            // Filter to requested date range
            const filteredPrices: { ts: number; price: number; vol: number }[] = [];
            for (let i = 0; i < prices.length; i++) {
              const [timestamp, price] = prices[i];
              const tsDate = new Date(timestamp);
              if (tsDate >= start && tsDate <= end && price > 0) {
                const vol = volumes[i] ? volumes[i][1] : 0;
                filteredPrices.push({ ts: timestamp, price, vol });
              }
            }

            if (filteredPrices.length === 0) return [];

            // Group into hourly candles by truncating to the hour
            const candleMap = new Map<string, { open: number; close: number; high: number; low: number; volume: number; ts: number }>();
            for (const point of filteredPrices) {
              const dt = new Date(point.ts);
              // Key by YYYY-MM-DD HH:00
              const hourKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}:00:00Z`;

              const existing = candleMap.get(hourKey);
              if (!existing) {
                candleMap.set(hourKey, {
                  open: point.price,
                  close: point.price,
                  high: point.price,
                  low: point.price,
                  volume: point.vol,
                  ts: point.ts,
                });
              } else {
                existing.close = point.price;            // last price in the hour
                existing.high = Math.max(existing.high, point.price);
                existing.low = Math.min(existing.low, point.price);
                existing.volume += point.vol;
              }
            }

            const candles: UnifiedCandleDto[] = [];
            for (const [hourKey, data] of candleMap) {
              candles.push({
                symbol,
                timestamp: new Date(hourKey),
                open: data.open,
                high: data.high,
                low: data.low,
                close: data.close,
                volume: data.volume,
                source: 'CoinGecko',
              });
            }

            // Sort by timestamp ascending
            candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            if (candles.length > 0) {
              this.logger.log(`CoinGecko market_chart aggregation: ${candles.length} candles for ${symbol} (OHLC aggregated from hourly points)`);
              return candles;
            }
          }
        } catch (error: any) {
          this.logger.warn(`CoinGecko market_chart aggregation failed for ${symbol}: ${error.message}`);
        }
      }
    }

    // ── Forex: Frankfurter supports historical forex rates ──
    const fiatCurrencies = new Set([
      'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK',
    ]);

    if (fiatCurrencies.has(base) && fiatCurrencies.has(quote)) {
      try {
        const startDate = start.toISOString().split('T')[0];
        const endDate = end.toISOString().split('T')[0];

        const response = await axios.get(
          `https://api.frankfurter.dev/v1/${startDate}..${endDate}`,
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

  // ── Private: Crypto via CoinGecko (FREE, no API key) ──

  /**
   * CoinGecko free API coin ID mapping.
   * CoinGecko uses lowercase IDs (e.g., "bitcoin" not "BTC").
   * This is the most reliable free fallback when Binance CCXT fails on cloud IPs.
   */
  private static readonly COINGECKO_IDS: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    BNB: 'binancecoin',
    XRP: 'ripple',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    DOT: 'polkadot',
    MATIC: 'matic-network',
    LTC: 'litecoin',
    AVAX: 'avalanche-2',
    LINK: 'chainlink',
    UNI: 'uniswap',
    ATOM: 'cosmos',
    ETC: 'ethereum-classic',
    XLM: 'stellar',
    BCH: 'bitcoin-cash',
    ALGO: 'algorand',
    VET: 'vechain',
    ICP: 'internet-computer',
    FIL: 'filecoin',
    TRX: 'tron',
    NEAR: 'near',
    FTM: 'fantom',
    AAVE: 'aave',
    SHIB: 'shiba-inu',
    SUI: 'sui',
    SEI: 'sei-network',
    TIA: 'celestia',
    INJ: 'injective-protocol',
    STX: 'blockstack',
    IMX: 'immutable-x',
    RUNE: 'thorchain',
    PEPE: 'pepe',
    WIF: 'dogwifcoin',
    ARB: 'arbitrum',
    OP: 'optimism',
  };

  /**
   * Fetch crypto quote from CoinGecko (completely free, no API key).
   * This is the critical fallback when Binance CCXT fails on Railway/cloud.
   *
   * CoinGecko /simple/price endpoint:
   * - Free tier: ~30 calls/minute
   * - No API key required
   * - Returns current price, 24h change, market cap, volume
   */
  private async _fetchCryptoQuote(symbol: string, base: string, quote: string): Promise<UnifiedQuoteDto> {
    const coinId = FreeFallbackAdapter.COINGECKO_IDS[base];
    if (!coinId) {
      this.logger.warn(`No CoinGecko ID mapping for ${base}`);
      throw new Error(`No CoinGecko mapping for ${base}`);
    }

    // Map quote currency to CoinGecko's vs_currency format
    const vsCurrency = quote.toLowerCase() === 'usdt' ? 'usd' : quote.toLowerCase();

    // Try CoinGecko /simple/price with 24h change data
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: coinId,
          vs_currencies: vsCurrency,
          include_24hr_change: 'true',
          include_24hr_vol: 'true',
          include_market_cap: 'true',
        },
        timeout: 10000,
      });

      if (response.data && response.data[coinId]) {
        const data = response.data[coinId];
        const price = data[vsCurrency] ?? 0;

        if (price > 0) {
          const changePercent = data[`${vsCurrency}_24h_change`] ?? 0;
          const change = price * (changePercent / 100);
          const volume = data[`${vsCurrency}_24h_vol`] ?? 0;
          const marketCap = data[`${vsCurrency}_market_cap`] ?? null;

          const result: UnifiedQuoteDto = {
            symbol,
            name: `${base}/${quote}`,
            exchange: 'CoinGecko',
            currency: quote,
            price,
            change,
            changePercent,
            open: price - change, // Approximate
            high: price * 1.01,   // Approximate
            low: price * 0.99,    // Approximate
            close: price,
            volume,
            marketCap,
            fiftyTwoWeekHigh: null,
            fiftyTwoWeekLow: null,
            timestamp: new Date(),
            source: 'CoinGecko',
          };
          await this._saveLastKnownPrice(symbol, result);
          return result;
        }
      }
    } catch (error: any) {
      this.logger.warn(`CoinGecko failed for ${symbol}: ${error.message}`);
    }

    // Try Yahoo Finance as secondary fallback (works for major cryptos like BTC-USD)
    try {
      const yahooSymbol = `${base}-USD`;
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
        params: { range: '1d', interval: '1d' },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
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
            name: `${base}/${quote}`,
            exchange: 'Yahoo Finance',
            currency: quote,
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
      this.logger.warn(`Yahoo Finance crypto failed for ${symbol}: ${error.message}`);
    }

    // Try last known price from cache
    const lastKnown = await this._getLastKnownPrice(symbol);
    if (lastKnown) {
      this.logger.warn(`Returning cached price for crypto ${symbol}`);
      return lastKnown;
    }

    throw new Error(`All free crypto sources failed for ${symbol}`);
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
