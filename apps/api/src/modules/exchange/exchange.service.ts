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

  /**
   * Select the best adapter for a given symbol
   * Crypto pairs (BTC/USDT, ETH/USDT) → Binance
   * Everything else → TwelveData (stocks, forex, commodities)
   */
  private _selectAdapter(symbol: string, source?: string): IExchangeAdapter {
    // Explicit source override
    if (source && this.adapters[source]) {
      return this.adapters[source];
    }

    // Auto-detect: crypto pairs contain '/' like BTC/USDT
    if (symbol.includes('/')) {
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
}
