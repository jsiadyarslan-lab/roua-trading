import { Controller, Get, Post, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { AuthGuard, Public } from '../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { OandaStreamingService } from './adapters/oanda-streaming.service';
import { ConfigService } from '@nestjs/config';

@Controller('exchange')
@UseGuards(AuthGuard)
export class ExchangeController {
  private readonly logger = new Logger(ExchangeController.name);

  constructor(
    private readonly exchangeService: ExchangeService,
    private readonly oandaStreaming: OandaStreamingService,
    private readonly configService: ConfigService,
  ) {}

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

  /**
   * V357: GET /api/exchange/streaming-status
   * Diagnostic endpoint — shows OANDA streaming connection status + env config.
   * Use this to verify OANDA streaming is actually working.
   */
  @Public()
  @Get('streaming-status')
  async getStreamingStatus() {
    const oandaToken = this.configService.get<string>('OANDA_API_TOKEN');
    const oandaAccountId = this.configService.get<string>('OANDA_ACCOUNT_ID');
    const oandaAccountType = this.configService.get<string>('OANDA_ACCOUNT_TYPE', 'practice');

    return {
      success: true,
      timestamp: new Date().toISOString(),
      oanda: {
        tokenConfigured: !!oandaToken,
        tokenLength: oandaToken?.length || 0,
        accountIdConfigured: !!oandaAccountId,
        accountIdPrefix: oandaAccountId ? oandaAccountId.substring(0, 8) + '...' : null,
        accountType: oandaAccountType,
      },
      streaming: this.oandaStreaming.getStatus(),
      socketIO: {
        note: 'Socket.IO gateway should be attached to NestJS HTTP server on /exchange namespace',
        proxyNote: 'Next.js proxy.ts rewrites /socket.io/* → NestJS backend',
      },
    };
  }

  /**
   * V357: POST /api/exchange/test-stream/:symbol
   * Manually subscribe to OANDA stream for a symbol and report if prices arrive.
   * Returns after 10 seconds with the prices received (if any).
   */
  @Public()
  @Post('test-stream/:symbol')
  async testStream(@Param('symbol') symbol: string) {
    let decodedSymbol: string;
    try { decodedSymbol = decodeURIComponent(symbol); } catch { decodedSymbol = symbol; }

    const result: any = {
      success: true,
      symbol: decodedSymbol,
      timestamp: new Date().toISOString(),
      streamingStatus: this.oandaStreaming.getStatus(),
      pricesReceived: [] as any[],
    };

    if (!this.oandaStreaming.isAvailable()) {
      result.error = 'OANDA streaming not available — OANDA_API_TOKEN or OANDA_ACCOUNT_ID not configured';
      return result;
    }

    // Subscribe and collect prices for 10 seconds
    const prices: any[] = [];
    const priceHandler = (update: any) => {
      if (update.symbol === decodedSymbol) {
        prices.push({
          price: update.price,
          bid: update.bid,
          ask: update.ask,
          time: update.time,
          timestamp: update.timestamp,
        });
      }
    };

    this.oandaStreaming.onPrice(priceHandler);
    this.oandaStreaming.subscribe(decodedSymbol);

    // Wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Cleanup
    this.oandaStreaming.offPrice(priceHandler);
    this.oandaStreaming.unsubscribe(decodedSymbol);

    result.pricesReceived = prices;
    result.priceCount = prices.length;
    result.status = prices.length > 0
      ? `✅ Received ${prices.length} price updates in 10 seconds — streaming WORKS`
      : '❌ Received 0 price updates in 10 seconds — streaming NOT working';

    return result;
  }
}
