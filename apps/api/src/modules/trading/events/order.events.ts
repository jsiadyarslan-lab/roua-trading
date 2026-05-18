// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Events & Commands
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { OrderSide, OrderType, OrderStatus, OrderEventType } from '@prisma/client';

/**
 * Order Command — The input object for creating a new order
 * Flows through: OrderController → IdempotencyCheck → RiskGatekeeper → OrderStateManager → ExecutionGateway
 */
export class OrderCommand {
  userId: string;
  exchangeCredentialId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopLoss: number;        // إجباري — Mandatory
  takeProfit?: number;
  idempotencyKey: string;
  clientOrderId?: string;
  ipAddress?: string;
  userAgent?: string;
  /** FIX: Indicates this is a paper/simulated trade — bypasses certain risk checks */
  isPaperTrading?: boolean;
  /** V145: Source of the trade — 'smart_executor' | 'agent' | 'auto_paper' | 'user_manual'.
   * Used by RiskGatekeeper to count positions per-source against per-source limits. */
  source?: string;
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

// ── Enums — use Prisma-generated enums as single source of truth ──
// Re-export from @prisma/client so all consumers import from one place.
export { OrderSide as OrderSideEnum, OrderType as OrderTypeEnum, OrderStatus as OrderStatusEnum, OrderEventType as OrderEventTypeEnum } from '@prisma/client';

// ── Queue Messages ──

/**
 * Order Queue Message — Sent to RabbitMQ order_queue
 */
export class OrderQueueMessage {
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
  /** FIX: Source of the trade — propagated from OrderDispatcher through BullMQ.
   * Values: 'smart_executor' | 'agent' | 'auto_paper' | 'user_manual'
   * Previously this field was missing, causing ALL positions to be labeled
   * 'auto_paper' or 'user_manual' regardless of actual source. */
  source?: string;
}
