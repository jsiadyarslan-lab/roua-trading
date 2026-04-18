import { Injectable, Logger, Inject } from '@nestjs/common';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from './exchange.types';

@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);

  constructor(
    @Inject('IExchangeAdapter') private readonly adapter: IExchangeAdapter,
  ) {
    this.logger.log(`📊 Exchange Service initialized with adapter: ${adapter.name}`);
  }

  /**
   * Fetch real-time quote for a symbol
   */
  async getQuote(symbol: string): Promise<UnifiedQuoteDto> {
    this.logger.debug(`Fetching quote for ${symbol}`);
    return this.adapter.fetchQuote(symbol);
  }

  /**
   * Fetch historical OHLCV data for a symbol
   */
  async getHistoricalData(
    symbol: string,
    interval: string = '1day',
    start?: Date,
    end?: Date,
  ): Promise<UnifiedCandleDto[]> {
    // Default to last 30 days if no range specified
    const endDate = end || new Date();
    const startDate = start || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    this.logger.debug(`Fetching history for ${symbol} (${interval})`);
    return this.adapter.fetchHistoricalData(symbol, interval, startDate, endDate);
  }
}
