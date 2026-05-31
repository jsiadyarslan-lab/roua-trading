import { Controller, Get, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('exchange')
@UseGuards(AuthGuard)
export class ExchangeController {
  private readonly logger = new Logger(ExchangeController.name);

  constructor(private readonly exchangeService: ExchangeService) {}

  /**
   * GET /api/exchange/quote/:symbol
   * Fetch real-time quote — auto-selects adapter (Binance for crypto, TwelveData for stocks)
   */
  @Get('quote/:symbol')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getQuote(
    @Param('symbol') symbol: string,
    @Query('source') source?: string,
  ) {
    this.logger.debug(`Quote request: ${symbol} (source: ${source || 'auto'})`);
    const quote = await this.exchangeService.getQuote(symbol, source);
    return { success: true, data: quote };
  }

  /**
   * GET /api/exchange/history/:symbol
   * Fetch historical OHLCV data
   */
  @Get('history/:symbol')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getHistoricalData(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1day',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('source') source?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const data = await this.exchangeService.getHistoricalData(
      symbol,
      interval,
      start,
      end,
      source,
    );

    return { success: true, data };
  }

  /**
   * GET /api/exchange/adapters
   * List available exchange adapters
   */
  @Get('adapters')
  async getAdapters() {
    return { success: true, data: this.exchangeService.getAdapters() };
  }
}
