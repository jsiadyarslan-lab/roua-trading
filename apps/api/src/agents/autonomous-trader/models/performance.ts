// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Performance Model
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { PerformanceMetrics, StrategyType } from '../types/agent.types';

/**
 * PerformanceTracker — Tracks and calculates agent performance metrics
 *
 * Provides real-time and historical performance analysis including:
 * - Win rate and profit factor
 * - Maximum drawdown
 * - Sharpe ratio
 * - Average holding time
 * - Streak analysis
 * - Period-based reporting (daily, weekly, monthly)
 */
export class PerformanceTracker {
  private trades: TradeRecord[] = [];

  /**
   * Add a completed trade to the tracker
   */
  addTrade(trade: TradeRecord): void {
    this.trades.push(trade);
  }

  /**
   * Calculate full performance metrics
   */
  calculateMetrics(period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME' = 'ALL_TIME'): PerformanceMetrics {
    const filteredTrades = this._filterByPeriod(period);

    if (filteredTrades.length === 0) {
      return this._emptyMetrics(period);
    }

    const winningTrades = filteredTrades.filter((t) => t.pnl > 0);
    const losingTrades = filteredTrades.filter((t) => t.pnl < 0);

    const totalPnL = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const averageWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;

    // Profit Factor = Gross Profit / Gross Loss
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Max Drawdown calculation
    const { maxDrawdown, maxDrawdownPercent } = this._calculateMaxDrawdown(filteredTrades);

    // Sharpe Ratio (simplified, assuming risk-free rate = 0)
    const sharpeRatio = this._calculateSharpeRatio(filteredTrades);

    // Average holding time
    const holdingTimes = filteredTrades
      .filter((t) => t.holdingDurationMs)
      .map((t) => t.holdingDurationMs!);
    const averageHoldingTime =
      holdingTimes.length > 0
        ? holdingTimes.reduce((sum, h) => sum + h, 0) / holdingTimes.length / 60000 // Convert ms to minutes
        : 0;

    // Streak analysis
    const { consecutiveWins, consecutiveLosses } = this._calculateStreaks(filteredTrades);

    return {
      totalTrades: filteredTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: (winningTrades.length / filteredTrades.length) * 100,
      totalPnL,
      averageWin,
      averageLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      averageHoldingTime,
      bestTrade: Math.max(...filteredTrades.map((t) => t.pnl)),
      worstTrade: Math.min(...filteredTrades.map((t) => t.pnl)),
      consecutiveWins,
      consecutiveLosses,
      startDate: filteredTrades[0]?.openedAt ?? new Date(),
      period,
    };
  }

  /**
   * Get performance breakdown by strategy
   */
  getByStrategy(): Record<StrategyType, PerformanceMetrics> {
    const strategies = [StrategyType.SCALPING, StrategyType.SWING, StrategyType.GRID];
    const result = {} as Record<StrategyType, PerformanceMetrics>;

    for (const strategy of strategies) {
      const strategyTrades = this.trades.filter((t) => t.strategy === strategy);
      const tracker = new PerformanceTracker();
      tracker.trades = strategyTrades;
      result[strategy] = tracker.calculateMetrics();
    }

    return result;
  }

  /**
   * Get equity curve data points
   */
  getEquityCurve(): { timestamp: Date; equity: number }[] {
    const points: { timestamp: Date; equity: number }[] = [];
    let runningPnL = 0;

    const sorted = [...this.trades].sort(
      (a, b) => a.closedAt.getTime() - b.closedAt.getTime(),
    );

    for (const trade of sorted) {
      runningPnL += trade.pnl;
      points.push({
        timestamp: trade.closedAt,
        equity: runningPnL,
      });
    }

    return points;
  }

  // ── Private Helpers ──

  private _filterByPeriod(period: string): TradeRecord[] {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'DAILY':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'WEEKLY':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'MONTHLY':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      default:
        startDate = new Date(0); // All time
    }

    return this.trades.filter(
      (t) => t.closedAt >= startDate && t.pnl !== undefined,
    );
  }

  private _calculateMaxDrawdown(trades: TradeRecord[]): {
    maxDrawdown: number;
    maxDrawdownPercent: number;
  } {
    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let runningPnL = 0;

    for (const trade of trades) {
      runningPnL += trade.pnl;

      if (runningPnL > peak) {
        peak = runningPnL;
      }

      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  private _calculateSharpeRatio(trades: TradeRecord[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map((t) => t.pnl);
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
      (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? meanReturn / stdDev : 0;
  }

  private _calculateStreaks(trades: TradeRecord[]): {
    consecutiveWins: number;
    consecutiveLosses: number;
  } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const trade of trades) {
      if (trade.pnl > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else if (trade.pnl < 0) {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      } else {
        currentWins = 0;
        currentLosses = 0;
      }
    }

    return { consecutiveWins: maxWins, consecutiveLosses: maxLosses };
  }

  private _emptyMetrics(period: string): PerformanceMetrics {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      averageHoldingTime: 0,
      bestTrade: 0,
      worstTrade: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      startDate: new Date(),
      period: period as any,
    };
  }
}

// ── Trade Record for Performance Tracking ──

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
