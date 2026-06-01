import { RedisService } from '../../../common/redis/redis.service';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from '../exchange.types';
export declare class FreeFallbackAdapter implements IExchangeAdapter {
    private readonly redisService;
    readonly name = "FreeFallback";
    private readonly logger;
    private readonly QUOTE_CACHE_TTL;
    private readonly HISTORY_CACHE_TTL;
    constructor(redisService: RedisService);
    fetchQuote(symbol: string): Promise<UnifiedQuoteDto>;
    fetchHistoricalData(symbol: string, interval: string, start: Date, end: Date): Promise<UnifiedCandleDto[]>;
    private _fetchQuoteFromFreeSource;
    private _fetchStockQuote;
    private _fetchGoldQuote;
    private _fetchSilverQuote;
    private _fetchForexQuote;
    private _fetchHistoricalFromFreeSource;
    private static readonly COINGECKO_IDS;
    private static readonly COINCAP_IDS;
    private _fetchCryptoQuote;
    private _saveLastKnownPrice;
    private _getLastKnownPrice;
}
