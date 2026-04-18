import { Controller, Get, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('exchange')
@UseGuards(AuthGuard)
export class ExchangeController {
  private readonly logger = new Logger(ExchangeController.name);

  constructor(private readonly exchangeService: ExchangeService) {}

  /**
   * GET /api/exchange/quote/:symbol
   * Fetch real-time quote for a symbol
   * Requires authentication
   */
  @Get('quote/:symbol')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getQuote(@Param('symbol') symbol: string) {
    this.logger.debug(`Quote request: ${symbol}`);
    const quote = await this.exchangeService.getQuote(symbol);
    return { success: true, data: quote };
  }

  /**
   * GET /api/exchange/history/:symbol
   * Fetch historical OHLCV data for a symbol
   * Query params: interval, startDate, endDate
   */
  @Get('history/:symbol')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getHistoricalData(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1day',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const data = await this.exchangeService.getHistoricalData(
      symbol,
      interval,
      start,
      end,
    );

    return { success: true, data };
  }
}
