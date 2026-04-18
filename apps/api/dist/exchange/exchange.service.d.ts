import { IExchangeAdapter, UnifiedQuoteDto, UnifiedCandleDto } from './exchange.types';
export declare class ExchangeService {
    private readonly adapter;
    private readonly logger;
    constructor(adapter: IExchangeAdapter);
    getQuote(symbol: string): Promise<UnifiedQuoteDto>;
    getHistoricalData(symbol: string, interval?: string, start?: Date, end?: Date): Promise<UnifiedCandleDto[]>;
}
