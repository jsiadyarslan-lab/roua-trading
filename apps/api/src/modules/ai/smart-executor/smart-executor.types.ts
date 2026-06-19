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
  // V290: Set when a brief was skipped (not executed) due to a safety filter
  // (e.g. regime filter blocked BUY in BEAR market). The brief is marked
  // CANCELLED in the DB and won't be retried.
  skipped?: boolean;
}

export interface ExecutorConfig {
  tickIntervalMs: number;
  maxOpenPositions: number;
  maxDailyLossPercent: number;
  defaultSlippage: number;
  riskPerTradePercent: number;
  minConfidence: number;
}

/**
 * Per-user executor state stored in Redis
 *
 * V126 SUSTAINABLE ARCHITECTURE: User-driven account selection.
 *
 * The user selects which account to trade on from their settings page.
 * The executor simply executes on that account. No questions, no warnings,
 * no auto-routing, no paper/real mode logic.
 *
 * This is how all trading platforms work: the user activates an account,
 * and the system executes on it. Period.
 *
 * activeCredentialId:
 *   - Read from user settings (key: 'activeCredentialId')
 *   - The user chooses from their connected exchange accounts
 *   - The executor uses this credential for all trades
 *   - If no credential is set, the executor is still enabled but
 *     skips execution until the user selects one
 */
export interface UserExecutorState {
  enabled: boolean;
  dailyPnL: number;
  dailyTrades: number;
  dailyResetAt: string;
  lastTradeAt: string | null;
  consecutiveLosses: number;
  maxOpenPositions: number;
  riskPerTradePercent: number;
  activeCredentialId?: string;  // User's chosen account from settings
  // V135: Trading mode metadata — populated from the active credential
  isPaperTrading?: boolean;    // exchange='paper-trading' (locally simulated)
  isTestnet?: boolean;         // testnet=true on a real exchange (e.g., Binance testnet)
  exchangeName?: string;       // Exchange name for display (e.g., 'binance', 'alpaca')
}
