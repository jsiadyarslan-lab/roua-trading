import { Injectable, Logger, Inject } from '@nestjs/common';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from './exchange.types';

/**
 * Exchange Service — Multi-Adapter Market Data
 * 
 * Routes requests to the appropriate exchange adapter based on:
 * 1. Explicit source parameter (e.g., 'Binance', 'TwelveData')
 * 2. Auto-detection: crypto pairs (X/USDT) → Binance, else → TwelveData
 */
@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);
  private readonly adapters: Record<string, IExchangeAdapter>;

  constructor(@Inject('EXCHANGE_ADAPTERS') adapters: Record<string, IExchangeAdapter>) {
    this.adapters = adapters;
    this.logger.log(`📊 Exchange Service initialized with adapters: ${Object.keys(adapters).join(', ')}`);
  }

  /**
   * Fetch real-time quote for a symbol
   * Auto-selects the best adapter based on the symbol
   * Falls back to FreeFallback if primary adapter fails
   */
  async getQuote(symbol: string, source?: string): Promise<UnifiedQuoteDto> {
    const adapter = this._selectAdapter(symbol, source);
    try {
      return await adapter.fetchQuote(symbol);
    } catch (error: any) {
      // If primary adapter fails (rate limit, 503, etc.), try fallback
      if (adapter.name !== 'FreeFallback' && this.adapters['FreeFallback']) {
        this.logger.warn(`⚠️ ${adapter.name} failed for ${symbol}: ${error.message}. Trying FreeFallback...`);
        try {
          return await this.adapters['FreeFallback'].fetchQuote(symbol);
        } catch (fallbackError: any) {
          this.logger.error(`FreeFallback also failed for ${symbol}: ${fallbackError.message}`);
        }
      }
      throw error;
    }
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

    // Default to TwelveData for stocks, forex, indices, commodities
    if (this.adapters['TwelveData']) {
      return this.adapters['TwelveData'];
    }

    // Fallback to first available adapter
    const firstKey = Object.keys(this.adapters)[0];
    if (firstKey) {
      return this.adapters[firstKey];
    }

    throw new Error('No exchange adapters available');
  }

  /**
   * Determine if a symbol is a crypto pair supported by Binance.
   * Crypto pairs have the form BASE/QUOTE where both are known crypto currencies.
   * Forex pairs like EUR/USD, GBP/USD, USD/JPY are NOT crypto.
   * Commodities like XAU/USD, XAG/USD are NOT crypto.
   */
  private _isCryptoSymbol(symbol: string): boolean {
    if (!symbol.includes('/')) {
      return false; // Stocks like AAPL, TSLA — not crypto
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
