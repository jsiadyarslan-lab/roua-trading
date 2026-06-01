import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';
export declare class BinanceAdapter implements IExchangeAdapter {
    private readonly configService;
    private readonly redisService;
    readonly name = "Binance";
    private readonly logger;
    private readonly exchange;
    private readonly QUOTE_CACHE_TTL;
    private readonly HISTORY_CACHE_TTL;
    private readonly RATE_LIMIT_WINDOW;
    private readonly RATE_LIMIT_MAX;
    constructor(configService: ConfigService, redisService: RedisService);
    fetchQuote(symbol: string): Promise<UnifiedQuoteDto>;
    fetchHistoricalData(symbol: string, interval: string, start: Date, end: Date): Promise<UnifiedCandleDto[]>;
    private _fetchQuoteFromExchange;
    private _fetchHistoricalFromExchange;
    private _checkRateLimit;
    private _normalizeSymbol;
    private _mapInterval;
}
