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
   */
  async getQuote(symbol: string, source?: string): Promise<UnifiedQuoteDto> {
    const adapter = this._selectAdapter(symbol, source);
    return adapter.fetchQuote(symbol);
  }

  /**
   * Fetch historical OHLCV data for a symbol
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
    const startDate = start || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return adapter.fetchHistoricalData(symbol, interval, startDate, endDate);
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
