export declare enum OrderSide {
    BUY = "BUY",
    SELL = "SELL"
}
export declare enum OrderType {
    MARKET = "MARKET",
    LIMIT = "LIMIT"
}
export declare enum OrderStatus {
    PENDING = "PENDING",
    ACCEPTED = "ACCEPTED",
    PARTIALLY_FILLED = "PARTIALLY_FILLED",
    FILLED = "FILLED",
    CANCELLED = "CANCELLED",
    REJECTED = "REJECTED"
}
export declare enum OrderEventType {
    CREATED = "CREATED",
    ACCEPTED = "ACCEPTED",
    RISK_REJECTED = "RISK_REJECTED",
    SENT_TO_EXCHANGE = "SENT_TO_EXCHANGE",
    FILLED = "FILLED",
    CANCELLED = "CANCELLED"
}
export declare enum PositionStatus {
    OPEN = "OPEN",
    CLOSED = "CLOSED",
    LIQUIDATED = "LIQUIDATED"
}
export declare enum TradeType {
    ENTRY = "ENTRY",
    EXIT = "EXIT",
    PARTIAL_EXIT = "PARTIAL_EXIT"
}
export declare class PlaceOrderDto {
    credentialId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    signalId?: string;
}
export declare class ClosePositionDto {
    positionId: string;
    quantity?: number;
}
export interface PlaceOrderRequest {
    credentialId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    signalId?: string;
    source?: 'user_manual' | 'smart_executor' | 'agent' | 'auto_paper';
    idempotencyKey?: string;
}
export interface ClosePositionRequest {
    positionId: string;
    quantity?: number;
    closeReason?: string;
}
export interface RiskCheckResult {
    allowed: boolean;
    reason?: string;
    riskScore?: number;
}
export interface OrderExecutionResult {
    success: boolean;
    orderId?: string;
    exchangeOrderId?: string;
    filledQuantity?: number;
    averagePrice?: number;
    fee?: number;
    feeCurrency?: string;
    error?: string;
}
export interface PositionSummary {
    totalPositions: number;
    totalValue: number;
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    positions: any[];
}
