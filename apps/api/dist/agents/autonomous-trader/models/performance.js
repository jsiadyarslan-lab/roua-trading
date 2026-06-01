"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceTracker = void 0;
const agent_types_1 = require("../types/agent.types");
class PerformanceTracker {
    constructor() {
        this.trades = [];
    }
    addTrade(trade) {
        this.trades.push(trade);
    }
    calculateMetrics(period = 'ALL_TIME') {
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
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
        const { maxDrawdown, maxDrawdownPercent } = this._calculateMaxDrawdown(filteredTrades);
        const sharpeRatio = this._calculateSharpeRatio(filteredTrades);
        const holdingTimes = filteredTrades
            .filter((t) => t.holdingDurationMs)
            .map((t) => t.holdingDurationMs);
        const averageHoldingTime = holdingTimes.length > 0
            ? holdingTimes.reduce((sum, h) => sum + h, 0) / holdingTimes.length / 60000
            : 0;
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
    getByStrategy() {
        const strategies = [agent_types_1.StrategyType.SCALPING, agent_types_1.StrategyType.SWING, agent_types_1.StrategyType.GRID];
        const result = {};
        for (const strategy of strategies) {
            const strategyTrades = this.trades.filter((t) => t.strategy === strategy);
            const tracker = new PerformanceTracker();
            tracker.trades = strategyTrades;
            result[strategy] = tracker.calculateMetrics();
        }
        return result;
    }
    getEquityCurve() {
        const points = [];
        let runningPnL = 0;
        const sorted = [...this.trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
        for (const trade of sorted) {
            runningPnL += trade.pnl;
            points.push({
                timestamp: trade.closedAt,
                equity: runningPnL,
            });
        }
        return points;
    }
    _filterByPeriod(period) {
        const now = new Date();
        let startDate;
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
                startDate = new Date(0);
        }
        return this.trades.filter((t) => t.closedAt >= startDate && t.pnl !== undefined);
    }
    _calculateMaxDrawdown(trades) {
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
    _calculateSharpeRatio(trades) {
        if (trades.length < 2)
            return 0;
        const returns = trades.map((t) => t.pnl);
        const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
            (returns.length - 1);
        const stdDev = Math.sqrt(variance);
        return stdDev > 0 ? meanReturn / stdDev : 0;
    }
    _calculateStreaks(trades) {
        let maxWins = 0;
        let maxLosses = 0;
        let currentWins = 0;
        let currentLosses = 0;
        for (const trade of trades) {
            if (trade.pnl > 0) {
                currentWins++;
                currentLosses = 0;
                maxWins = Math.max(maxWins, currentWins);
            }
            else if (trade.pnl < 0) {
                currentLosses++;
                currentWins = 0;
                maxLosses = Math.max(maxLosses, currentLosses);
            }
            else {
                currentWins = 0;
                currentLosses = 0;
            }
        }
        return { consecutiveWins: maxWins, consecutiveLosses: maxLosses };
    }
    _emptyMetrics(period) {
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
            period: period,
        };
    }
}
exports.PerformanceTracker = PerformanceTracker;
//# sourceMappingURL=performance.js.map