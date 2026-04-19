// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Trading Engine Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum PositionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  LIQUIDATED = 'LIQUIDATED',
}

export enum TradeType {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
  PARTIAL_EXIT = 'PARTIAL_EXIT',
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
}

export interface ClosePositionRequest {
  positionId: string;
  quantity?: number; // partial close if less than position quantity
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
