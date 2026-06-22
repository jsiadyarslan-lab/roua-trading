import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from './exchange.types';

/**
 * Exchange Service — Multi-Adapter Market Data
 * 
 * Routes requests to the appropriate exchange adapter based on:
 * 1. Explicit source parameter (e.g., 'Binance', 'TwelveData')
 * 2. Auto-detection: crypto pairs (X/USDT) → Binance, else → FreeFallback or TwelveData
 *
 * FIX: Added ConfigService to detect DISABLE_TWELVE_DATA env var.
 * FIX: When TwelveData is disabled or key is missing, skip directly to FreeFallback.
 */
@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);
  private readonly adapters: Record<string, IExchangeAdapter>;
  private readonly disableTwelveData: boolean;

  /** Price sanity ranges — reject obviously wrong prices (e.g., $34.98 for BTC) */
  private static readonly PRICE_SANITY: Record<string, { min: number; max: number }> = {
    'BTC/USDT':  { min: 20000, max: 200000 },
    'BTC/USD':   { min: 20000, max: 200000 },
    'ETH/USDT':  { min: 1000, max: 20000 },
    'ETH/USD':   { min: 1000, max: 20000 },
    'BNB/USDT':  { min: 100, max: 5000 },
    'BNB/USD':   { min: 100, max: 5000 },
    'SOL/USDT':  { min: 10, max: 1000 },
    'SOL/USD':   { min: 10, max: 1000 },
    'XRP/USDT':  { min: 0.1, max: 100 },
    'XRP/USD':   { min: 0.1, max: 100 },
    'ADA/USDT':  { min: 0.05, max: 50 },
    'ADA/USD':   { min: 0.05, max: 50 },
    'DOGE/USDT': { min: 0.01, max: 10 },
    'DOGE/USD':  { min: 0.01, max: 10 },
    'XAU/USD':   { min: 1000, max: 5000 },
  };

  /** Known crypto base currencies — for _isCryptoSymbol without slash */
  private static readonly CRYPTO_BASES = new Set([
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'DOT', 'AVAX',
    'MATIC', 'SHIB', 'LINK', 'UNI', 'ATOM',
  ]);

  // FIX: Quote cache — prevents hitting external APIs on every request.
  // Before this cache, getOpenPositions() fetched quotes for ALL positions on EVERY
  // page load, causing /api/trading/positions/summary to take 10+ seconds.
  // Now: first request fetches from exchange, subsequent requests within TTL use cache.
  private readonly quoteCache = new Map<string, { data: UnifiedQuoteDto; timestamp: number }>();
  private readonly QUOTE_CACHE_TTL_MS = 2_000; // V139: reduced from 5s to 2s — faster price updates for SL/TP and P&L
  private readonly QUOTE_CACHE_MAX_SIZE = 200;   // Max symbols to cache

  constructor(
    @Inject('EXCHANGE_ADAPTERS') adapters: Record<string, IExchangeAdapter>,
    private readonly configService: ConfigService,
  ) {
    this.adapters = adapters;
    this.disableTwelveData = this.configService.get('DISABLE_TWELVE_DATA', 'false') === 'true';
    const twelveKey = this.configService.get('TWELVE_DATA_API_KEY', '');
    const noKey = !twelveKey || !twelveKey.trim();
    if (this.disableTwelveData || noKey) {
      this.logger.warn(`⚠️ TwelveData is DISABLED (${this.disableTwelveData ? 'via DISABLE_TWELVE_DATA' : 'no API key'}). Using FreeFallback for all non-crypto symbols.`);
    }
    this.logger.log(`📊 Exchange Service initialized with adapters: ${Object.keys(adapters).join(', ')}`);
  }

  /**
   * Fetch real-time quote for a symbol
   * Auto-selects the best adapter based on the symbol
   * Falls back to FreeFallback if primary adapter fails
   * 
   * FIX: Added in-memory quote cache with 30s TTL.
   * This reduces /api/trading/positions/summary from 10+ seconds to <100ms
   * on repeated requests (same page load, navigation, etc.)
   */
  async getQuote(symbol: string, source?: string): Promise<UnifiedQuoteDto> {
    const cacheKey = `${symbol}:${source || 'auto'}`;

    // V382: For OANDA pairs, skip in-memory cache — OANDA stream writes to Redis every <1s.
    // Caching here adds 2s delay. Stream prices should flow through without caching.
    const isOandaSymbol = this._isForexOrMetalSymbol(symbol);
    if (!isOandaSymbol) {
      const cached = this.quoteCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.QUOTE_CACHE_TTL_MS) {
        return cached.data;
      }
    }

    // Collect adapters to try: primary first, then fallbacks
    const adapterOrder: IExchangeAdapter[] = [];
    const primaryAdapter = this._selectAdapter(symbol, source);
    adapterOrder.push(primaryAdapter);
    // Add FreeFallback as a fallback option if it's not already the primary
    if (primaryAdapter.name !== 'FreeFallback' && this.adapters['FreeFallback']) {
      adapterOrder.push(this.adapters['FreeFallback']);
    }

    let lastError: any;
    for (const adapter of adapterOrder) {
      try {
        const quote = await adapter.fetchQuote(symbol);

        // Price sanity check — reject obviously wrong prices (e.g., $34.98 for BTC)
        const sanity = ExchangeService.PRICE_SANITY[symbol] || ExchangeService.PRICE_SANITY[symbol.replace('USD', 'USDT')];
        if (sanity && (quote.price < sanity.min || quote.price > sanity.max)) {
          this.logger.warn(`⚠️ Price sanity check FAILED for ${symbol}: ${quote.price} outside [${sanity.min}, ${sanity.max}] — rejecting and trying next adapter`);
          // Try next adapter instead of returning wrong price
          continue;
        }

        // Store in cache
        this._setQuoteCache(cacheKey, quote);
        return quote;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(`⚠️ ${adapter.name} failed for ${symbol}: ${error.message}. Trying next...`);
      }
    }

    // All adapters failed or sanity checks failed
    throw lastError || new Error(`All adapters failed sanity checks for ${symbol}`);
  }

  /**
   * Store quote in cache with size limit
   */
  private _setQuoteCache(key: string, data: UnifiedQuoteDto): void {
    // Evict oldest entries if cache is full
    if (this.quoteCache.size >= this.QUOTE_CACHE_MAX_SIZE) {
      const oldestKey = this.quoteCache.keys().next().value;
      if (oldestKey) this.quoteCache.delete(oldestKey);
    }
    this.quoteCache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetch historical OHLCV data for a symbol
   * Falls back to FreeFallback if primary adapter fails
   */
  async getHistoricalData(
    symbol: string,
    interval: string = '1day',
    start?: Date,
    end?: Date,
    source?: string,
  ): Promise<UnifiedCandleDto[]> {
    const adapter = this._selectAdapter(symbol, source);
    const endDate = end || new Date();
    // 60 days default to ensure MACD (26+9=35 bars minimum) and other indicators have enough data
    const startDate = start || new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000);
    try {
      const candles = await adapter.fetchHistoricalData(symbol, interval, startDate, endDate);
      if (candles.length > 0) return candles;
    } catch (error: any) {
      this.logger.warn(`⚠️ ${adapter.name} history failed for ${symbol}: ${error.message}`);
    }
    // Try fallback if primary returned empty or failed
    if (adapter.name !== 'FreeFallback' && this.adapters['FreeFallback']) {
      try {
        const fallbackCandles = await this.adapters['FreeFallback'].fetchHistoricalData(symbol, interval, startDate, endDate);
        if (fallbackCandles.length > 0) return fallbackCandles;
      } catch (fallbackError: any) {
        this.logger.warn(`FreeFallback history also failed for ${symbol}: ${fallbackError.message}`);
      }
    }
    return [];
  }

  /**
   * Get all available adapters
   */
  getAdapters(): string[] {
    return Object.keys(this.adapters);
  }

  /** Crypto quote currencies that Binance supports */
  private static readonly CRYPTO_QUOTE_CURRENCIES = new Set([
    'USDT', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB', 'DAI', 'TUSD', 'FDUSD', 'USDC',
  ]);

  /** Well-known crypto base currencies (top 100 by market cap) */
  private static readonly CRYPTO_BASE_CURRENCIES = new Set([
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LTC',
    'AVAX', 'LINK', 'UNI', 'ATOM', 'ETC', 'XLM', 'BCH', 'ALGO', 'VET', 'ICP',
    'FIL', 'TRX', 'NEAR', 'FTM', 'AAVE', 'GRT', 'EOS', 'AXS', 'SAND', 'MANA',
    'SHIB', 'APE', 'CRV', 'MKR', 'COMP', 'SNX', 'DYDX', 'OP', 'ARB', 'PEPE',
    'WIF', 'SUI', 'SEI', 'TIA', 'INJ', 'STX', 'IMX', 'RUNE', 'KAVA', '1INCH',
  ]);

  /**
   * Select the best adapter for a given symbol
   * Crypto pairs (BTC/USDT, ETH/USDT, etc.) → Binance
   * Forex (EUR/USD, GBP/USD) → TwelveData only
   * Commodities (XAU/USD) → TwelveData only
   * Stocks (AAPL, TSLA) → TwelveData only
   */
  private _selectAdapter(symbol: string, source?: string): IExchangeAdapter {
    // Explicit source override
    if (source && this.adapters[source]) {
      return this.adapters[source];
    }

    // Auto-detect: route to Binance ONLY for crypto pairs
    if (this._isCryptoSymbol(symbol)) {
      if (this.adapters['Binance']) {
        return this.adapters['Binance'];
      }
    }

    // V323: Route forex/metals/indices to OANDA if available
    // Forex: EUR/USD, GBP/USD, USD/JPY — contains "/" but not "USDT"
    // Metals: XAU/USD, XAG/USD
    // Indices: US30/USD, NAS100/USD, SPX500/USD
    if (this._isForexOrMetalSymbol(symbol) && this.adapters['OANDA']) {
      return this.adapters['OANDA'];
    }

    // FIX: Skip TwelveData when disabled or no API key — go straight to FreeFallback
    const twelveKey = this.configService.get('TWELVE_DATA_API_KEY', '');
    const noKey = !twelveKey || !twelveKey.trim();
    if (this.disableTwelveData || noKey) {
      if (this.adapters['FreeFallback']) {
        return this.adapters['FreeFallback'];
      }
    }

    // Default to TwelveData for stocks, forex, indices, commodities
    if (this.adapters['TwelveData']) {
      return this.adapters['TwelveData'];
    }

    // Last resort: FreeFallback or first available adapter
    if (this.adapters['FreeFallback']) {
      return this.adapters['FreeFallback'];
    }

    const firstKey = Object.keys(this.adapters)[0];
    if (firstKey) {
      return this.adapters[firstKey];
    }

    throw new Error('No exchange adapters available');
  }

  /**
   * V323: Check if symbol is a forex pair, metal, or index
   * These should be routed to OANDA if available.
   *
   * Forex: EUR/USD, GBP/USD, USD/JPY, AUD/USD, etc.
   * Metals: XAU/USD, XAG/USD
   * Indices: US30/USD, NAS100/USD, SPX500/USD
   * Commodities: WTI/USD, BRENT/USD
   *
   * NOT crypto: BTC/USDT, ETH/USDT (those use "USDT" not "USD")
   */
  private _isForexOrMetalSymbol(symbol: string): boolean {
    const upper = symbol.toUpperCase();
    // Crypto uses /USDT, /BTC, /ETH — not forex
    if (upper.includes('USDT') || upper.includes('/BTC') || upper.includes('/ETH')) {
      return false;
    }
    // Forex/metals/indices use /USD, /JPY, /GBP, /EUR, /CHF, /CAD, /AUD, /NZD
    const forexQuoteCurrencies = ['/USD', '/JPY', '/GBP', '/EUR', '/CHF', '/CAD', '/AUD', '/NZD'];
    return forexQuoteCurrencies.some(qc => upper.includes(qc));
  }

  /**
   * Determine if a symbol is a crypto pair supported by Binance.
   * Crypto pairs have the form BASE/QUOTE where both are known crypto currencies.
   * Forex pairs like EUR/USD, GBP/USD, USD/JPY are NOT crypto.
   * Commodities like XAU/USD, XAG/USD are NOT crypto.
   */
  private _isCryptoSymbol(symbol: string): boolean {
    if (!symbol.includes('/')) {
      // Check if it's a crypto symbol without slash (e.g., "BTC", "ETHUSDT")
      const base = symbol.replace(/USDT?$/i, '');
      return ExchangeService.CRYPTO_BASES.has(base.toUpperCase());
    }

    const [base, quote] = symbol.split('/');

    // Forex fiat currencies — NOT crypto
    const fiatCurrencies = new Set([
      'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK',
      'DKK', 'ZAR', 'HKD', 'SGD', 'MXN', 'PLN', 'CZK', 'HUF', 'TRY', 'KRW',
    ]);

    // Commodities — NOT crypto
    const commodityBases = new Set(['XAU', 'XAG', 'XPT', 'XPD', 'CL', 'NG', 'HG']);

    // If base is a commodity → not crypto
    if (commodityBases.has(base)) return false;

    // If base is a fiat currency (forex pair like EUR/USD) → not crypto
    if (fiatCurrencies.has(base)) return false;

    // If base is a known crypto and quote is a supported crypto quote → crypto
    const isCryptoBase = ExchangeService.CRYPTO_BASE_CURRENCIES.has(base);
    const isCryptoQuote = ExchangeService.CRYPTO_QUOTE_CURRENCIES.has(quote);

    return isCryptoBase && isCryptoQuote;
  }
}
