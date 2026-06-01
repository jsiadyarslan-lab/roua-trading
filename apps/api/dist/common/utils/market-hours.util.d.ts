export type MarketType = 'crypto' | 'forex' | 'stock' | 'commodity' | 'unknown';
export declare function detectMarketType(symbol: string): MarketType;
export declare function isMarketOpen(symbol: string, now?: Date): {
    open: boolean;
    reason: string;
    marketType: MarketType;
    nextOpen: Date | null;
};
