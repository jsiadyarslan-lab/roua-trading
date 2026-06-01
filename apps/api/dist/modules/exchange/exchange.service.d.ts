import { ConfigService } from '@nestjs/config';
import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from './exchange.types';
export declare class ExchangeService {
    private readonly configService;
    private readonly logger;
    private readonly adapters;
    private readonly disableTwelveData;
    private static readonly PRICE_SANITY;
    private static readonly CRYPTO_BASES;
    private readonly quoteCache;
    private readonly QUOTE_CACHE_TTL_MS;
    private readonly QUOTE_CACHE_MAX_SIZE;
    constructor(adapters: Record<string, IExchangeAdapter>, configService: ConfigService);
    getQuote(symbol: string, source?: string): Promise<UnifiedQuoteDto>;
    private _setQuoteCache;
    getHistoricalData(symbol: string, interval?: string, start?: Date, end?: Date, source?: string): Promise<UnifiedCandleDto[]>;
    getAdapters(): string[];
    private static readonly CRYPTO_QUOTE_CURRENCIES;
    private static readonly CRYPTO_BASE_CURRENCIES;
    private _selectAdapter;
    private _isCryptoSymbol;
}
