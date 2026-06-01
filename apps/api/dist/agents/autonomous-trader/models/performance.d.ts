import { PerformanceMetrics, StrategyType } from '../types/agent.types';
export declare class PerformanceTracker {
    private trades;
    addTrade(trade: TradeRecord): void;
    calculateMetrics(period?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME'): PerformanceMetrics;
    getByStrategy(): Record<StrategyType, PerformanceMetrics>;
    getEquityCurve(): {
        timestamp: Date;
        equity: number;
    }[];
    private _filterByPeriod;
    private _calculateMaxDrawdown;
    private _calculateSharpeRatio;
    private _calculateStreaks;
    private _emptyMetrics;
}
export interface TradeRecord {
    id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    strategy: StrategyType;
    pnl: number;
    fee: number;
    openedAt: Date;
    closedAt: Date;
    holdingDurationMs?: number;
    exitReason?: string;
}
