// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Base Exchange Adapter Interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Unified Order — Standardized order representation
 * Used across ALL exchange adapters for consistent order handling
 */
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
  /** FIX: Source of the trade — propagated from OrderDispatcher.
   * Values: 'smart_executor' | 'agent' | 'auto_paper' | 'user_manual' */
  source?: string;
}

/**
 * Execution Result — Standardized result from exchange execution
 * Every adapter must return this shape for consistent handling
 */
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

/**
 * Order Execution Status — Granular status from the exchange
 */
export enum OrderExecutionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Unified Balance — Standardized balance representation
 * Normalizes balance data across different exchanges
 */
export interface UnifiedBalance {
  totalEquity: number;
  availableBalance: number;
  usedMargin: number;
  currency: string;
  balances: Record<string, { free: number; used: number; total: number }>;
  timestamp: Date;
}

/**
 * IExchangeAdapter — Base Interface for All Exchange Adapters
 *
 * Every exchange adapter (Binance, Alpaca, PaperTrading)
 * MUST implement this interface to ensure uniform behavior.
 *
 * This enables the ExecutionGatewayService to swap adapters
 * transparently based on the user's exchange credential.
 *
 * Design Principles:
 * ┌───────────────────────────────────────────────────────────┐
 * │ 1. Unified types — no adapter leaks exchange specifics    │
 * │ 2. Error normalization — all errors become ExecutionResult│
 * │ 3. Audit integration — every call logged via AuditService │
 * │ 4. Rate limit awareness — each adapter declares its limits│
 * └───────────────────────────────────────────────────────────┘
 */
export interface IExchangeAdapter {
  // ── Order Execution ──

  /**
   * Place an order on the exchange
   * @param order The unified order to execute
   * @returns ExecutionResult with fill details or error
   */
  placeOrder(order: UnifiedOrder): Promise<ExecutionResult>;

  /**
   * Cancel an existing order on the exchange
   * @param orderId The exchange order ID to cancel
   * @param symbol The trading pair symbol (required by some exchanges)
   * @returns true if cancellation succeeded
   */
  cancelOrder(orderId: string, symbol: string): Promise<boolean>;

  /**
   * Get the current status of an order from the exchange
   * @param orderId The exchange order ID
   * @param symbol The trading pair symbol
   * @returns Current execution status
   */
  getOrderStatus(orderId: string, symbol: string): Promise<OrderExecutionStatus>;

  // ── Market Data ──

  /**
   * Fetch all open orders, optionally filtered by symbol
   * @param symbol Optional symbol filter
   * @returns Array of unified orders currently open on the exchange
   */
  fetchOpenOrders(symbol?: string): Promise<UnifiedOrder[]>;

  /**
   * Fetch the current balance from the exchange
   * @returns Unified balance across all held currencies
   */
  fetchBalance(): Promise<UnifiedBalance>;

  // ── Adapter Metadata ──

  /**
   * Get the exchange identifier (e.g., 'binance', 'alpaca', 'paper')
   */
  getExchangeId(): string;

  /**
   * Whether this adapter supports WebSocket streaming
   * Used by ConnectionResilienceService for connection strategy
   */
  supportsWebSocket(): boolean;

  /**
   * Get rate limits for this exchange
   * Used by RateLimiterService for token bucket configuration
   */
  getRateLimits(): { maxRequestsPerSecond: number; maxRequestsPerMinute: number };
}
