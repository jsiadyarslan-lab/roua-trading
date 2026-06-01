import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';
export declare class TwelveDataAdapter implements IExchangeAdapter {
    private readonly configService;
    private readonly redisService;
    readonly name = "TwelveData";
    private readonly logger;
    private readonly apiKey;
    private readonly baseUrl;
    private readonly QUOTE_CACHE_TTL;
    private readonly HISTORY_CACHE_TTL;
    private readonly RATE_LIMIT_WINDOW;
    private readonly RATE_LIMIT_MAX;
    private readonly DAILY_CREDIT_LIMIT;
    private readonly DAILY_CREDIT_WINDOW;
    constructor(configService: ConfigService, redisService: RedisService);
    fetchQuote(symbol: string): Promise<UnifiedQuoteDto>;
    fetchHistoricalData(symbol: string, interval: string, start: Date, end: Date): Promise<UnifiedCandleDto[]>;
    private _fetchQuoteFromApi;
    private _fetchHistoricalFromApi;
    private _mapQuoteResponse;
    private _mapCandleResponse;
    private _checkRateLimit;
    private _activateDailyCircuitBreaker;
    private _getKeyHash;
    private _toNumber;
}
