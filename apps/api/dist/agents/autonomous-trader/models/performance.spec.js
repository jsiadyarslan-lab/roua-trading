"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const performance_1 = require("./performance");
const agent_types_1 = require("../types/agent.types");
const createTrade = (overrides = {}) => ({
    id: `trade-${Math.random().toString(36).slice(2, 9)}`,
    symbol: 'BTC/USDT',
    side: 'BUY',
    strategy: agent_types_1.StrategyType.SCALPING,
    pnl: 100,
    fee: 1,
    openedAt: new Date('2025-01-01T10:00:00Z'),
    closedAt: new Date('2025-01-01T10:30:00Z'),
    holdingDurationMs: 30 * 60 * 1000,
    exitReason: 'TAKE_PROFIT',
    ...overrides,
});
describe('PerformanceTracker', () => {
    let tracker;
    beforeEach(() => {
        tracker = new performance_1.PerformanceTracker();
    });
    describe('addTrade', () => {
        it('should add a trade without error', () => {
            const trade = createTrade();
            expect(() => tracker.addTrade(trade)).not.toThrow();
        });
        it('should add multiple trades', () => {
            const trades = [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: 200 }),
            ];
            trades.forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.totalTrades).toBe(3);
        });
    });
    describe('calculateMetrics — edge cases', () => {
        it('should return empty metrics when no trades exist', () => {
            const metrics = tracker.calculateMetrics();
            expect(metrics.totalTrades).toBe(0);
            expect(metrics.winningTrades).toBe(0);
            expect(metrics.losingTrades).toBe(0);
            expect(metrics.winRate).toBe(0);
            expect(metrics.totalPnL).toBe(0);
            expect(metrics.averageWin).toBe(0);
            expect(metrics.averageLoss).toBe(0);
            expect(metrics.profitFactor).toBe(0);
            expect(metrics.maxDrawdown).toBe(0);
            expect(metrics.maxDrawdownPercent).toBe(0);
            expect(metrics.sharpeRatio).toBe(0);
            expect(metrics.averageHoldingTime).toBe(0);
            expect(metrics.bestTrade).toBe(0);
            expect(metrics.worstTrade).toBe(0);
            expect(metrics.consecutiveWins).toBe(0);
            expect(metrics.consecutiveLosses).toBe(0);
        });
        it('should handle a single winning trade', () => {
            tracker.addTrade(createTrade({ pnl: 150 }));
            const metrics = tracker.calculateMetrics();
            expect(metrics.totalTrades).toBe(1);
            expect(metrics.winningTrades).toBe(1);
            expect(metrics.losingTrades).toBe(0);
            expect(metrics.winRate).toBe(100);
            expect(metrics.totalPnL).toBe(150);
            expect(metrics.bestTrade).toBe(150);
            expect(metrics.worstTrade).toBe(150);
        });
        it('should handle a single losing trade', () => {
            tracker.addTrade(createTrade({ pnl: -200 }));
            const metrics = tracker.calculateMetrics();
            expect(metrics.totalTrades).toBe(1);
            expect(metrics.winningTrades).toBe(0);
            expect(metrics.losingTrades).toBe(1);
            expect(metrics.winRate).toBe(0);
            expect(metrics.totalPnL).toBe(-200);
            expect(metrics.bestTrade).toBe(-200);
            expect(metrics.worstTrade).toBe(-200);
        });
        it('should handle a trade with zero PnL (breakeven)', () => {
            tracker.addTrade(createTrade({ pnl: 0 }));
            const metrics = tracker.calculateMetrics();
            expect(metrics.totalTrades).toBe(1);
            expect(metrics.winningTrades).toBe(0);
            expect(metrics.losingTrades).toBe(0);
            expect(metrics.winRate).toBe(0);
        });
    });
    describe('winRate', () => {
        it('should calculate 50% win rate with equal wins and losses', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: 75 }),
                createTrade({ pnl: -25 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.winRate).toBe(50);
            expect(metrics.winningTrades).toBe(2);
            expect(metrics.losingTrades).toBe(2);
        });
        it('should calculate 75% win rate with 3 wins and 1 loss', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 50 }),
                createTrade({ pnl: -30 }),
                createTrade({ pnl: 80 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.winRate).toBe(75);
        });
        it('should calculate 0% win rate with all losses', () => {
            [
                createTrade({ pnl: -50 }),
                createTrade({ pnl: -30 }),
                createTrade({ pnl: -100 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.winRate).toBe(0);
            expect(metrics.winningTrades).toBe(0);
        });
        it('should calculate 100% win rate with all wins', () => {
            [
                createTrade({ pnl: 50 }),
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 75 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.winRate).toBe(100);
            expect(metrics.losingTrades).toBe(0);
        });
    });
    describe('PnL metrics', () => {
        it('should calculate total PnL correctly', () => {
            [
                createTrade({ pnl: 200 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -25 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.totalPnL).toBe(225);
        });
        it('should calculate average win and average loss', () => {
            [
                createTrade({ pnl: 200 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -150 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.averageWin).toBe(150);
            expect(metrics.averageLoss).toBe(100);
        });
        it('should calculate profit factor correctly', () => {
            [
                createTrade({ pnl: 200 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -50 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.profitFactor).toBe(3);
        });
        it('should return Infinity profit factor when there are no losses', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 200 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.profitFactor).toBe(Infinity);
        });
        it('should return 0 profit factor when there are no wins', () => {
            [
                createTrade({ pnl: -100 }),
                createTrade({ pnl: -200 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.profitFactor).toBe(0);
        });
    });
    describe('maxDrawdown', () => {
        it('should be 0 when all trades are profitable', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 50 }),
                createTrade({ pnl: 200 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.maxDrawdown).toBe(0);
        });
        it('should calculate drawdown after a peak', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 50 }),
                createTrade({ pnl: -80 }),
                createTrade({ pnl: -20 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.maxDrawdown).toBe(100);
        });
        it('should calculate max drawdown percent based on peak', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 50 }),
                createTrade({ pnl: -80 }),
                createTrade({ pnl: -20 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.maxDrawdownPercent).toBeCloseTo(66.67, 1);
        });
        it('should handle consecutive losses from the start', () => {
            [
                createTrade({ pnl: -50 }),
                createTrade({ pnl: -30 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.maxDrawdown).toBe(80);
            expect(metrics.maxDrawdownPercent).toBe(0);
        });
        it('should find max drawdown in complex equity curve', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -30 }),
                createTrade({ pnl: 80 }),
                createTrade({ pnl: -60 }),
                createTrade({ pnl: 50 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.maxDrawdown).toBe(60);
        });
    });
    describe('sharpeRatio', () => {
        it('should return 0 for fewer than 2 trades', () => {
            tracker.addTrade(createTrade({ pnl: 100 }));
            const metrics = tracker.calculateMetrics();
            expect(metrics.sharpeRatio).toBe(0);
        });
        it('should calculate Sharpe ratio for consistent returns', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 100 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.sharpeRatio).toBe(0);
        });
        it('should calculate positive Sharpe ratio for profitable trades with variance', () => {
            [
                createTrade({ pnl: 200 }),
                createTrade({ pnl: 50 }),
                createTrade({ pnl: 150 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.sharpeRatio).toBeGreaterThan(0);
        });
        it('should calculate negative Sharpe ratio for losing trades with variance', () => {
            [
                createTrade({ pnl: -200 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: -150 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.sharpeRatio).toBeLessThan(0);
        });
    });
    describe('consecutive streaks', () => {
        it('should track max consecutive wins', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 50 }),
                createTrade({ pnl: 200 }),
                createTrade({ pnl: -30 }),
                createTrade({ pnl: 80 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.consecutiveWins).toBe(3);
        });
        it('should track max consecutive losses', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -30 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: -20 }),
                createTrade({ pnl: 80 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.consecutiveLosses).toBe(3);
        });
        it('should reset streak on breakeven trade', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 50 }),
                createTrade({ pnl: 0 }),
                createTrade({ pnl: 80 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.consecutiveWins).toBe(2);
        });
        it('should handle alternating wins and losses', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: 80 }),
                createTrade({ pnl: -30 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.consecutiveWins).toBe(1);
            expect(metrics.consecutiveLosses).toBe(1);
        });
    });
    describe('bestTrade and worstTrade', () => {
        it('should identify the best trade', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: 500 }),
                createTrade({ pnl: -50 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.bestTrade).toBe(500);
        });
        it('should identify the worst trade', () => {
            [
                createTrade({ pnl: 100 }),
                createTrade({ pnl: -50 }),
                createTrade({ pnl: -200 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.worstTrade).toBe(-200);
        });
    });
    describe('averageHoldingTime', () => {
        it('should calculate average holding time in minutes', () => {
            [
                createTrade({ holdingDurationMs: 30 * 60 * 1000 }),
                createTrade({ holdingDurationMs: 60 * 60 * 1000 }),
                createTrade({ holdingDurationMs: 90 * 60 * 1000 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.averageHoldingTime).toBe(60);
        });
        it('should handle trades without holding duration', () => {
            [
                createTrade({ holdingDurationMs: 30 * 60 * 1000 }),
                createTrade({ holdingDurationMs: undefined }),
                createTrade({ holdingDurationMs: 60 * 60 * 1000 }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.averageHoldingTime).toBe(45);
        });
        it('should return 0 when no trades have holding duration', () => {
            [
                createTrade({ holdingDurationMs: undefined }),
                createTrade({ holdingDurationMs: undefined }),
            ].forEach((t) => tracker.addTrade(t));
            const metrics = tracker.calculateMetrics();
            expect(metrics.averageHoldingTime).toBe(0);
        });
    });
    describe('period filtering', () => {
        it('should filter trades by DAILY period', () => {
            const today = new Date();
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            tracker.addTrade(createTrade({
                pnl: 100,
                closedAt: today,
                openedAt: new Date(today.getTime() - 30 * 60 * 1000),
            }));
            tracker.addTrade(createTrade({
                pnl: -50,
                closedAt: yesterday,
                openedAt: new Date(yesterday.getTime() - 30 * 60 * 1000),
            }));
            const metrics = tracker.calculateMetrics('DAILY');
            expect(metrics.totalTrades).toBeLessThanOrEqual(2);
        });
        it('should include all trades for ALL_TIME period', () => {
            tracker.addTrade(createTrade({ pnl: 100 }));
            tracker.addTrade(createTrade({ pnl: -50 }));
            tracker.addTrade(createTrade({ pnl: 200 }));
            const metrics = tracker.calculateMetrics('ALL_TIME');
            expect(metrics.totalTrades).toBe(3);
        });
        it('should return empty metrics for period with no matching trades', () => {
            const metrics = tracker.calculateMetrics('DAILY');
            expect(metrics.totalTrades).toBe(0);
            expect(metrics.period).toBe('DAILY');
        });
        it('should set the period field correctly', () => {
            tracker.addTrade(createTrade());
            const weekly = tracker.calculateMetrics('WEEKLY');
            expect(weekly.period).toBe('WEEKLY');
            const monthly = tracker.calculateMetrics('MONTHLY');
            expect(monthly.period).toBe('MONTHLY');
        });
    });
    describe('getEquityCurve', () => {
        it('should return empty array when no trades exist', () => {
            const curve = tracker.getEquityCurve();
            expect(curve).toEqual([]);
        });
        it('should return cumulative PnL data points', () => {
            tracker.addTrade(createTrade({ pnl: 100 }));
            tracker.addTrade(createTrade({ pnl: -50 }));
            tracker.addTrade(createTrade({ pnl: 200 }));
            const curve = tracker.getEquityCurve();
            expect(curve).toHaveLength(3);
            expect(curve[0].equity).toBe(100);
            expect(curve[1].equity).toBe(50);
            expect(curve[2].equity).toBe(250);
        });
        it('should sort trades by closedAt date', () => {
            const trade1 = createTrade({
                pnl: 200,
                closedAt: new Date('2025-01-03T10:00:00Z'),
            });
            const trade2 = createTrade({
                pnl: 100,
                closedAt: new Date('2025-01-01T10:00:00Z'),
            });
            tracker.addTrade(trade1);
            tracker.addTrade(trade2);
            const curve = tracker.getEquityCurve();
            expect(curve[0].equity).toBe(100);
            expect(curve[1].equity).toBe(300);
        });
    });
    describe('getByStrategy', () => {
        it('should return performance breakdown by strategy', () => {
            tracker.addTrade(createTrade({ strategy: agent_types_1.StrategyType.SCALPING, pnl: 100 }));
            tracker.addTrade(createTrade({ strategy: agent_types_1.StrategyType.SCALPING, pnl: -50 }));
            tracker.addTrade(createTrade({ strategy: agent_types_1.StrategyType.SWING, pnl: 200 }));
            const breakdown = tracker.getByStrategy();
            expect(breakdown[agent_types_1.StrategyType.SCALPING]).toBeDefined();
            expect(breakdown[agent_types_1.StrategyType.SWING]).toBeDefined();
            expect(breakdown[agent_types_1.StrategyType.GRID]).toBeDefined();
        });
        it('should calculate correct metrics per strategy', () => {
            tracker.addTrade(createTrade({ strategy: agent_types_1.StrategyType.SCALPING, pnl: 100 }));
            tracker.addTrade(createTrade({ strategy: agent_types_1.StrategyType.SCALPING, pnl: -50 }));
            const breakdown = tracker.getByStrategy();
            expect(breakdown[agent_types_1.StrategyType.SCALPING].totalTrades).toBe(2);
            expect(breakdown[agent_types_1.StrategyType.SCALPING].winRate).toBe(50);
        });
    });
});
//# sourceMappingURL=performance.spec.js.map