export declare class UnifiedQuoteDto {
    symbol: string;
    name: string;
    exchange: string;
    currency: string;
    price: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    marketCap: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    timestamp: Date;
    source: string;
}
export declare class UnifiedCandleDto {
    symbol: string;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    source: string;
}
export interface IExchangeAdapter {
    readonly name: string;
    fetchQuote(symbol: string): Promise<UnifiedQuoteDto>;
    fetchHistoricalData(symbol: string, interval: string, start: Date, end: Date): Promise<UnifiedCandleDto[]>;
}
export type HistoricalInterval = '1min' | '5min' | '15min' | '30min' | '45min' | '1h' | '2h' | '4h' | '1day' | '1week' | '1month';
