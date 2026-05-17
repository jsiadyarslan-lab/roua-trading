// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExecutorStatus {
  isRunning: boolean;
  startedAt: Date | null;
  totalExecutions: number;
  todayExecutions: number;
  todayPnL: number;
  openPositions: number;
  lastCheckAt: Date | null;
  dailyLossLimitReached: boolean;
  lastError: string | null;
  activeBriefs: number;
}

export interface ExecutionResult {
  success: boolean;
  briefId: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  orderId?: string;
  userId?: string;
  error?: string;
  executedAt: Date;
}

export interface ExecutorConfig {
  tickIntervalMs: number;          // default 2000 (2 seconds — more reasonable than 1s)
  maxOpenPositions: number;        // default 5
  maxDailyLossPercent: number;     // default 5% of portfolio
  defaultSlippage: number;         // default 0.001 (0.1%)
  riskPerTradePercent: number;     // default 1% of portfolio
  minConfidence: number;           // default 70
}

/**
 * Per-user executor state stored in Redis
 *
 * V125 ARCHITECTURE: Multi-account execution
 *
 * Instead of choosing "paper" or "real" at enable time, the executor
 * now supports AUTOMATIC PER-TRADE routing across ALL connected accounts.
 *
 * routingMode:
 *   'auto'       — Route each trade to the best credential based on
 *                   symbol type (crypto→Binance, stocks→Alpaca, etc.)
 *                   Fallback: real → testnet → paper. DEFAULT MODE.
 *   'paper-only' — Force all trades to paper trading (for testing).
 *
 * isPaperTrading is kept for backward compatibility but its meaning changes:
 *   - In 'auto' mode: isPaperTrading=false (unless no real credentials exist)
 *   - In 'paper-only' mode: isPaperTrading=true
 *   - The actual execution path is determined PER TRADE in _executeBriefForUser()
 */
export type RoutingMode = 'auto' | 'paper-only';

export interface UserExecutorState {
  enabled: boolean;
  dailyPnL: number;
  dailyTrades: number;
  dailyResetAt: string;
  lastTradeAt: string | null;
  consecutiveLosses: number;
  maxOpenPositions: number;
  riskPerTradePercent: number;
  credentialId?: string;
  isPaperTrading: boolean;
  routingMode: RoutingMode;  // V125: auto = route per trade, paper-only = force paper
}
