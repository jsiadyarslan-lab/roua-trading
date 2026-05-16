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

/** Per-user executor state stored in Redis */
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
}
