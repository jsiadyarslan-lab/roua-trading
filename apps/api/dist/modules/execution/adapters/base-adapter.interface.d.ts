export interface UnifiedOrder {
    id?: string;
    userId: string;
    exchangeCredentialId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    quantity: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    idempotencyKey: string;
    clientOrderId?: string;
    source?: string;
}
export interface ExecutionResult {
    success: boolean;
    exchangeOrderId?: string;
    filledQuantity?: number;
    averagePrice?: number;
    fee?: number;
    feeCurrency?: string;
    status?: OrderExecutionStatus;
    error?: string;
    timestamp?: Date;
}
export declare enum OrderExecutionStatus {
    PENDING = "PENDING",
    ACCEPTED = "ACCEPTED",
    PARTIALLY_FILLED = "PARTIALLY_FILLED",
    FILLED = "FILLED",
    CANCELLED = "CANCELLED",
    REJECTED = "REJECTED",
    EXPIRED = "EXPIRED"
}
export interface UnifiedBalance {
    totalEquity: number;
    availableBalance: number;
    usedMargin: number;
    currency: string;
    balances: Record<string, {
        free: number;
        used: number;
        total: number;
    }>;
    timestamp: Date;
}
export interface IExchangeAdapter {
    placeOrder(order: UnifiedOrder): Promise<ExecutionResult>;
    cancelOrder(orderId: string, symbol: string): Promise<boolean>;
    getOrderStatus(orderId: string, symbol: string): Promise<OrderExecutionStatus>;
    fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]>;
    fetchBalance(): Promise<UnifiedBalance>;
    getExchangeId(): string;
    supportsWebSocket(): boolean;
    getRateLimits(): {
        maxRequestsPerSecond: number;
        maxRequestsPerMinute: number;
    };
}
