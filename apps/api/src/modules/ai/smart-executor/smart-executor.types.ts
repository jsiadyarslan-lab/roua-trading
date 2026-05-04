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
}

export interface ExecutionResult {
  success: boolean;
  briefId: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  orderId?: string;
  error?: string;
  executedAt: Date;
}

export interface ExecutorConfig {
  tickIntervalMs: number;          // default 1000 (1 second)
  maxOpenPositions: number;        // default 5
  maxDailyLossPercent: number;     // default 5% of portfolio
  defaultSlippage: number;         // default 0.001 (0.1%)
}
