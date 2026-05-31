import { Controller, Get, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { AuthGuard, Public } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('exchange')
@UseGuards(AuthGuard)
export class ExchangeController {
  private readonly logger = new Logger(ExchangeController.name);

  constructor(private readonly exchangeService: ExchangeService) {}

  /**
   * GET /api/exchange/quote/:symbol
   * Fetch real-time quote — auto-selects adapter (Binance for crypto, TwelveData for stocks)
   * Public: market data should be accessible without authentication
   */
  @Public()
  @Get('quote/:symbol')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getQuote(
    @Param('symbol') symbol: string,
    @Query('source') source?: string,
  ) {
    // Decode URL-encoded symbols (e.g. BTC%2FUSDT → BTC/USDT)
    let decodedSymbol: string;
    try {
      decodedSymbol = decodeURIComponent(symbol);
    } catch {
      decodedSymbol = symbol;
    }
    this.logger.debug(`Quote request: ${decodedSymbol} (source: ${source || 'auto'})`);
    const quote = await this.exchangeService.getQuote(decodedSymbol, source);
    return { success: true, data: quote };
  }

  /**
   * GET /api/exchange/history/:symbol
   * Fetch historical OHLCV data
   * Public: market data should be accessible without authentication
   */
  @Public()
  @Get('history/:symbol')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getHistoricalData(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string = '1day',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('source') source?: string,
  ) {
    // Decode URL-encoded symbols (e.g. BTC%2FUSDT → BTC/USDT)
    let decodedSymbol: string;
    try {
      decodedSymbol = decodeURIComponent(symbol);
    } catch {
      decodedSymbol = symbol;
    }
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const data = await this.exchangeService.getHistoricalData(
      decodedSymbol,
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
  @Public()
  @Get('adapters')
  async getAdapters() {
    return { success: true, data: this.exchangeService.getAdapters() };
  }
}
