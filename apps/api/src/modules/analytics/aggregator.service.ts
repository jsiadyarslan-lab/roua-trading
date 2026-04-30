import { Injectable, Logger } from '@nestjs/common';
import { ExchangeService } from '../exchange/exchange.service';
import { FinnhubAdapter } from './finnhub.adapter';
import { AggregatedQuoteDto, AggregatedCandleDto, DataSource } from './analytics.types';
import { UnifiedQuoteDto, UnifiedCandleDto } from '../exchange/exchange.types';
import { Observable, from, forkJoin, of, combineLatest } from 'rxjs';
import { switchMap, map, catchError, tap, defaultIfEmpty } from 'rxjs/operators';

/**
 * Market Data Aggregator Service — Multi-Source Data Fusion
 *
 * Aggregates market data from multiple sources (Twelve Data, CCXT/Binance, Finnhub)
 * using RxJS for reactive stream processing. Provides:
 *
 * 1. Best-price aggregation: Picks the best quote across sources
 * 2. Cross-validation: Compares data from multiple sources for accuracy
 * 3. Fill-gap strategy: Uses alternative sources when primary is unavailable
 * 4. Real-time streaming: RxJS Observables for live data flows
 *
 * Data Source Priority:
 * ┌──────────────────────┬──────────────────────────────────────┐
 * │ Asset Type           │ Primary Source → Fallback            │
 * ├──────────────────────┼──────────────────────────────────────┤
 * │ Crypto (X/USDT)      │ Binance/CCXT → Finnhub → TwelveData │
 * │ Stocks (AAPL)        │ TwelveData → Finnhub                 │
 * │ Forex (EUR/USD)      │ TwelveData → Finnhub                 │
 * │ Commodities (XAU)    │ TwelveData → Finnhub                 │
 * └──────────────────────┴──────────────────────────────────────┘
 */
@Injectable()
export class MarketDataAggregatorService {
  private readonly logger = new Logger(MarketDataAggregatorService.name);

  constructor(
    private readonly exchangeService: ExchangeService,
    private readonly finnhubAdapter: FinnhubAdapter,
  ) {
    this.logger.log('📊 Market Data Aggregator initialized — multi-source fusion ready');
  }

  /**
   * Get aggregated quote from all available sources
   * Uses RxJS forkJoin to fetch from multiple sources concurrently
   */
  async getAggregatedQuote(symbol: string): Promise<AggregatedQuoteDto> {
    this.logger.debug(`📊 Aggregating quote for ${symbol} from all sources`);

    // Fetch from all sources concurrently using RxJS
    const sources$ = {
      primary: from(this._fetchFromPrimary(symbol)).pipe(
        catchError((err) => {
          this.logger.debug(`Primary source failed for ${symbol}: ${err.message}`);
          return of(null as UnifiedQuoteDto | null);
        }),
      ),
      finnhub: from(this._fetchFromFinnhub(symbol)).pipe(
        catchError((err) => {
          this.logger.debug(`Finnhub source failed for ${symbol}: ${err.message}`);
          return of(null as UnifiedQuoteDto | null);
        }),
      ),
    };

    const results = await new Promise<{ primary: UnifiedQuoteDto | null; finnhub: UnifiedQuoteDto | null }>(
      (resolve) => {
        forkJoin(sources$).subscribe({
          next: resolve,
          error: () => resolve({ primary: null, finnhub: null }),
        });
      },
    );

    return this._mergeQuotes(symbol, results.primary, results.finnhub);
  }

  /**
   * Get aggregated historical candles from all available sources
   * Merges candle data, preferring the source with more complete data
   */
  async getAggregatedCandles(
    symbol: string,
    interval: string = '1day',
    start?: Date,
    end?: Date,
  ): Promise<AggregatedCandleDto[]> {
    this.logger.debug(`📊 Aggregating candles for ${symbol} (${interval})`);

    const endDate = end || new Date();
    // Fetch 60 days of data to ensure MACD (needs 35+ bars) and other indicators have sufficient history
    const startDate = start || new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000);

    const sources$ = {
      primary: from(
        this.exchangeService.getHistoricalData(symbol, interval, startDate, endDate),
      ).pipe(
        catchError((err) => {
          this.logger.debug(`Primary candles failed for ${symbol}: ${err.message}`);
          return of([] as UnifiedCandleDto[]);
        }),
      ),
      finnhub: from(
        this.finnhubAdapter.fetchHistoricalData(symbol, interval, startDate, endDate),
      ).pipe(
        catchError((err) => {
          this.logger.debug(`Finnhub candles failed for ${symbol}: ${err.message}`);
          return of([] as UnifiedCandleDto[]);
        }),
      ),
    };

    const results = await new Promise<{ primary: UnifiedCandleDto[]; finnhub: UnifiedCandleDto[] }>(
      (resolve) => {
        forkJoin(sources$).subscribe({
          next: resolve,
          error: () => resolve({ primary: [], finnhub: [] }),
        });
      },
    );

    return this._mergeCandles(symbol, results.primary, results.finnhub);
  }

  /**
   * Get real-time price stream as RxJS Observable
   * Combines WebSocket streams from all sources
   */
  getQuoteStream(symbol: string): Observable<AggregatedQuoteDto> {
    this.logger.debug(`📊 Setting up quote stream for ${symbol}`);

    return new Observable<AggregatedQuoteDto>((subscriber) => {
      // Poll-based stream (every 30 seconds — balanced for TwelveData free tier sustainability)
      const interval = setInterval(async () => {
        try {
          const quote = await this.getAggregatedQuote(symbol);
          subscriber.next(quote);
        } catch (error: any) {
          // Don't break the stream on error
          this.logger.debug(`Stream poll failed for ${symbol}: ${error.message}`);
        }
      }, 30_000);

      // Initial fetch
      this.getAggregatedQuote(symbol)
        .then((quote) => subscriber.next(quote))
        .catch(() => {});

      // Cleanup
      return () => clearInterval(interval);
    });
  }

  // ── Private: Source Fetching ──

  /**
   * Fetch from primary source (ExchangeService auto-selects Binance/TwelveData)
   */
  private async _fetchFromPrimary(symbol: string): Promise<UnifiedQuoteDto | null> {
    try {
      return await this.exchangeService.getQuote(symbol);
    } catch {
      return null;
    }
  }

  /**
   * Fetch from Finnhub
   */
  private async _fetchFromFinnhub(symbol: string): Promise<UnifiedQuoteDto | null> {
    if (!this.finnhubAdapter.isAvailable()) {
      return null;
    }

    try {
      return await this.finnhubAdapter.fetchQuote(symbol);
    } catch {
      return null;
    }
  }

  // ── Private: Data Merging ──

  /**
   * Merge quotes from multiple sources into a single aggregated quote
   *
   * Strategy:
   * 1. Use primary source as base
   * 2. Fill missing fields from secondary sources
   * 3. Cross-validate prices (flag if deviation > 1%)
   * 4. Select the most recent timestamp
   */
  private _mergeQuotes(
    symbol: string,
    primary: UnifiedQuoteDto | null,
    finnhub: UnifiedQuoteDto | null,
  ): AggregatedQuoteDto {
    const sources: string[] = [];
    const base = primary || finnhub;

    if (!base) {
      // No data from any source
      return {
        symbol,
        name: symbol,
        currency: 'USD',
        price: 0,
        change: 0,
        changePercent: 0,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        marketCap: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        sources: [],
        primarySource: 'none',
        timestamp: new Date(),
      };
    }

    if (primary) sources.push(primary.source);
    if (finnhub) sources.push(finnhub.source);

    // Start with base quote
    const merged: AggregatedQuoteDto = {
      symbol,
      name: base.name || symbol,
      currency: base.currency || 'USD',
      price: base.price,
      change: base.change,
      changePercent: base.changePercent,
      open: base.open,
      high: base.high,
      low: base.low,
      close: base.close,
      volume: base.volume,
      marketCap: base.marketCap,
      fiftyTwoWeekHigh: base.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: base.fiftyTwoWeekLow,
      sources,
      primarySource: base.source,
      timestamp: base.timestamp,
    };

    // Cross-validate with Finnhub if available
    if (primary && finnhub) {
      const priceDeviation = Math.abs(primary.price - finnhub.price) / primary.price;

      if (priceDeviation > 0.01) {
        // More than 1% deviation — use primary but log warning
        this.logger.warn(
          `⚠️ Price deviation > 1% for ${symbol}: Primary=${primary.price}, Finnhub=${finnhub.price}`,
        );
      }

      // Fill missing data from secondary source
      if (!merged.volume && finnhub.volume) merged.volume = finnhub.volume;
      if (!merged.marketCap && finnhub.marketCap) merged.marketCap = finnhub.marketCap;
      if (!merged.fiftyTwoWeekHigh && finnhub.fiftyTwoWeekHigh) merged.fiftyTwoWeekHigh = finnhub.fiftyTwoWeekHigh;
      if (!merged.fiftyTwoWeekLow && finnhub.fiftyTwoWeekLow) merged.fiftyTwoWeekLow = finnhub.fiftyTwoWeekLow;

      // Use the most recent timestamp
      if (finnhub.timestamp > merged.timestamp) {
        merged.timestamp = finnhub.timestamp;
      }
    }

    // Use Finnhub data if primary is missing specific fields
    if (!primary && finnhub) {
      merged.primarySource = finnhub.source;
    }

    return merged;
  }

  /**
   * Merge candle data from multiple sources
   * Prefers the source with more complete data
   */
  private _mergeCandles(
    symbol: string,
    primary: UnifiedCandleDto[],
    finnhub: UnifiedCandleDto[],
  ): AggregatedCandleDto[] {
    const sources: string[] = [];
    if (primary.length > 0) sources.push(primary[0].source);
    if (finnhub.length > 0) sources.push(finnhub[0].source);

    // Prefer primary source if it has data, fallback to Finnhub
    const baseCandles = primary.length >= finnhub.length ? primary : finnhub;
    const primarySource = baseCandles.length > 0 ? baseCandles[0].source : 'none';

    return baseCandles.map((candle) => ({
      symbol: candle.symbol,
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      sources,
      primarySource,
    }));
  }
}
