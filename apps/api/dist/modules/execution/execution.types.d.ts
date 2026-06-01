export declare enum ExchangeType {
    BINANCE = "binance",
    ALPACA = "alpaca",
    PAPER = "paper"
}
export declare enum ConnectionMode {
    WEBSOCKET = "WEBSOCKET",
    REST_POLLING = "REST_POLLING"
}
export interface RateLimitStatus {
    exchangeId: string;
    userId: string;
    perSecondRemaining: number;
    perMinuteRemaining: number;
    isLimited: boolean;
}
export interface ConnectionHealth {
    exchangeId: string;
    connected: boolean;
    mode: ConnectionMode;
    lastHeartbeat: Date | null;
    reconnectAttempts: number;
}
