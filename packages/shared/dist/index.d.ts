export interface UnifiedQuote {
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
export interface UnifiedCandle {
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
    fetchQuote(symbol: string): Promise<UnifiedQuote>;
    fetchHistoricalData(symbol: string, interval: string, start: Date, end: Date): Promise<UnifiedCandle[]>;
}
export interface AuthUser {
    id: string;
    email: string;
    displayName: string | null;
    tier: 'FREE' | 'PRO' | 'PLUS' | 'PREMIUM' | 'INSTITUTIONAL';
}
export interface AuthSession {
    authenticated: boolean;
    user?: AuthUser;
}
export interface AuditLogEntry {
    userId?: string;
    action: string;
    resource: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
}
export declare enum AssetType {
    STOCK = "STOCK",
    FOREX = "FOREX",
    CRYPTO = "CRYPTO",
    COMMODITY = "COMMODITY",
    INDEX = "INDEX"
}
export declare enum Tier {
    FREE = "FREE",
    PRO = "PRO",
    PLUS = "PLUS",
    PREMIUM = "PREMIUM",
    INSTITUTIONAL = "INSTITUTIONAL"
}
