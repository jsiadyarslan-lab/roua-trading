// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Events & Commands
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Order Command — The input object for creating a new order
 * Flows through: OrderController → IdempotencyCheck → RiskGatekeeper → OrderStateManager → ExecutionGateway
 */
export class OrderCommand {
  userId: string;
  exchangeCredentialId: string;
  symbol: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  quantity: number;
  price?: number;
  stopLoss: number;        // إجباري — Mandatory
  takeProfit?: number;
  idempotencyKey: string;
  clientOrderId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Risk Check Result — Output of RiskGatekeeperService
 */
export class RiskCheckResult {
  allowed: boolean;
  reason?: string;
  failedCheck?: string;
  riskScore?: number;
}

/**
 * Portfolio Summary — Output of PositionManager
 */
export class PortfolioSummary {
  totalBalance: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  totalExposure: number;
  openPositionsCount: number;
  maxDrawdownPercent: number;
  unrealizedPnL: number;
  positions: PositionInfo[];
}

/**
 * Position Info — Current position details
 */
export class PositionInfo {
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

// ── Enums (must match Prisma schema exactly) ──

export enum OrderSideEnum {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderTypeEnum {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatusEnum {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum OrderEventTypeEnum {
  CREATED = 'CREATED',
  RISK_REJECTED = 'RISK_REJECTED',
  SENT_TO_EXCHANGE = 'SENT_TO_EXCHANGE',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
}

// ── Queue Messages ──

/**
 * Order Queue Message — Sent to RabbitMQ order_queue
 */
export class OrderQueueMessage {
  orderId: string;
  userId: string;
  exchangeCredentialId: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
  stopLoss: number;
  takeProfit?: number;
  clientOrderId?: string;
  idempotencyKey: string;
  submittedAt: Date;
}
