import { ExchangeService } from '../exchange/exchange.service';
import { FinnhubAdapter } from './finnhub.adapter';
import { AggregatedQuoteDto, AggregatedCandleDto } from './analytics.types';
import { Observable } from 'rxjs';
export declare class MarketDataAggregatorService {
    private readonly exchangeService;
    private readonly finnhubAdapter;
    private readonly logger;
    constructor(exchangeService: ExchangeService, finnhubAdapter: FinnhubAdapter);
    getAggregatedQuote(symbol: string): Promise<AggregatedQuoteDto>;
    getAggregatedCandles(symbol: string, interval?: string, start?: Date, end?: Date): Promise<AggregatedCandleDto[]>;
    getQuoteStream(symbol: string): Observable<AggregatedQuoteDto>;
    private _fetchFromPrimary;
    private _fetchFromFinnhub;
    private _mergeQuotes;
    private _mergeCandles;
}
