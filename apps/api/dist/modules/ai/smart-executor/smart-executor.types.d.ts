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
    tickIntervalMs: number;
    maxOpenPositions: number;
    maxDailyLossPercent: number;
    defaultSlippage: number;
    riskPerTradePercent: number;
    minConfidence: number;
}
export interface UserExecutorState {
    enabled: boolean;
    dailyPnL: number;
    dailyTrades: number;
    dailyResetAt: string;
    lastTradeAt: string | null;
    consecutiveLosses: number;
    maxOpenPositions: number;
    riskPerTradePercent: number;
    activeCredentialId?: string;
    isPaperTrading?: boolean;
    isTestnet?: boolean;
    exchangeName?: string;
}
