import { ExchangeService } from './exchange.service';
export declare class ExchangeController {
    private readonly exchangeService;
    private readonly logger;
    constructor(exchangeService: ExchangeService);
    getQuote(symbol: string, source?: string): Promise<{
        success: boolean;
        data: import("./exchange.types").UnifiedQuoteDto;
    }>;
    getHistoricalData(symbol: string, interval?: string, startDate?: string, endDate?: string, source?: string): Promise<{
        success: boolean;
        data: import("./exchange.types").UnifiedCandleDto[];
    }>;
    getAdapters(): Promise<{
        success: boolean;
        data: string[];
    }>;
}
