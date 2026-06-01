import { OrderSide, OrderType } from '../trading.types';
export declare class OrderCommand {
    userId: string;
    exchangeCredentialId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    stopLoss: number;
    takeProfit?: number;
    idempotencyKey: string;
    clientOrderId?: string;
    ipAddress?: string;
    userAgent?: string;
    isPaperTrading?: boolean;
    source?: string;
}
export declare class RiskCheckResult {
    allowed: boolean;
    reason?: string;
    failedCheck?: string;
    riskScore?: number;
}
export declare class PortfolioSummary {
    totalBalance: number;
    dailyPnL: number;
    dailyPnLPercent: number;
    totalExposure: number;
    usedMargin: number;
    openPositionsCount: number;
    maxDrawdownPercent: number;
    unrealizedPnL: number;
    positions: PositionInfo[];
}
export declare class PositionInfo {
    id: string;
    symbol: string;
    side: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    stopLoss: number | null;
    takeProfit: number | null;
    exchange: string;
    openedAt: Date;
}
export declare class OrderQueueMessage {
    orderId: string;
    userId: string;
    exchangeCredentialId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    stopLoss: number;
    takeProfit?: number;
    clientOrderId?: string;
    idempotencyKey: string;
    submittedAt: Date;
    source?: string;
}
export { OrderSide as OrderSideEnum, OrderType as OrderTypeEnum, OrderStatus as OrderStatusEnum, OrderEventType as OrderEventTypeEnum } from '../trading.types';
