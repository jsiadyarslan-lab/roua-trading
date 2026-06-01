"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
describe('ExecutorStatus', () => {
    it('should create a valid ExecutorStatus object with all fields', () => {
        const status = {
            isRunning: true,
            startedAt: new Date(),
            totalExecutions: 42,
            todayExecutions: 5,
            todayPnL: 150.50,
            openPositions: 3,
            lastCheckAt: new Date(),
            dailyLossLimitReached: false,
            lastError: null,
            activeBriefs: 2,
        };
        expect(status.isRunning).toBe(true);
        expect(status.totalExecutions).toBe(42);
        expect(status.todayPnL).toBe(150.50);
        expect(status.openPositions).toBe(3);
        expect(status.dailyLossLimitReached).toBe(false);
        expect(status.lastError).toBeNull();
        expect(status.activeBriefs).toBe(2);
    });
    it('should allow null for nullable date fields', () => {
        const status = {
            isRunning: false,
            startedAt: null,
            totalExecutions: 0,
            todayExecutions: 0,
            todayPnL: 0,
            openPositions: 0,
            lastCheckAt: null,
            dailyLossLimitReached: false,
            lastError: null,
            activeBriefs: 0,
        };
        expect(status.startedAt).toBeNull();
        expect(status.lastCheckAt).toBeNull();
        expect(status.lastError).toBeNull();
    });
    it('should reflect a daily loss limit reached state', () => {
        const status = {
            isRunning: false,
            startedAt: null,
            totalExecutions: 10,
            todayExecutions: 8,
            todayPnL: -500,
            openPositions: 2,
            lastCheckAt: new Date(),
            dailyLossLimitReached: true,
            lastError: 'Daily loss limit reached',
            activeBriefs: 0,
        };
        expect(status.dailyLossLimitReached).toBe(true);
        expect(status.todayPnL).toBeLessThan(0);
        expect(status.isRunning).toBe(false);
    });
});
describe('ExecutionResult', () => {
    it('should create a successful ExecutionResult', () => {
        const result = {
            success: true,
            briefId: 'brief-123',
            pair: 'BTC/USDT',
            direction: 'BUY',
            entryPrice: 50000,
            orderId: 'order-456',
            userId: 'user-789',
            executedAt: new Date(),
        };
        expect(result.success).toBe(true);
        expect(result.briefId).toBe('brief-123');
        expect(result.direction).toBe('BUY');
        expect(result.entryPrice).toBe(50000);
        expect(result.error).toBeUndefined();
    });
    it('should create a failed ExecutionResult with error', () => {
        const result = {
            success: false,
            briefId: 'brief-123',
            pair: 'ETH/USDT',
            direction: 'SELL',
            entryPrice: 0,
            error: 'Insufficient balance',
            executedAt: new Date(),
        };
        expect(result.success).toBe(false);
        expect(result.error).toBe('Insufficient balance');
        expect(result.orderId).toBeUndefined();
    });
});
describe('ExecutorConfig', () => {
    it('should create a valid ExecutorConfig with default-like values', () => {
        const config = {
            tickIntervalMs: 2000,
            maxOpenPositions: 5,
            maxDailyLossPercent: 5,
            defaultSlippage: 0.001,
            riskPerTradePercent: 1,
            minConfidence: 70,
        };
        expect(config.tickIntervalMs).toBe(2000);
        expect(config.maxOpenPositions).toBe(5);
        expect(config.maxDailyLossPercent).toBe(5);
        expect(config.defaultSlippage).toBe(0.001);
        expect(config.riskPerTradePercent).toBe(1);
        expect(config.minConfidence).toBe(70);
    });
});
describe('UserExecutorState', () => {
    it('should create a valid UserExecutorState without active credential', () => {
        const state = {
            enabled: true,
            dailyPnL: 0,
            dailyTrades: 0,
            dailyResetAt: new Date().toISOString(),
            lastTradeAt: null,
            consecutiveLosses: 0,
            maxOpenPositions: 5,
            riskPerTradePercent: 1,
        };
        expect(state.enabled).toBe(true);
        expect(state.dailyPnL).toBe(0);
        expect(state.consecutiveLosses).toBe(0);
        expect(state.lastTradeAt).toBeNull();
        expect(state.activeCredentialId).toBeUndefined();
    });
    it('should support activeCredentialId for user-selected account', () => {
        const state = {
            enabled: true,
            dailyPnL: 50,
            dailyTrades: 3,
            dailyResetAt: new Date().toISOString(),
            lastTradeAt: new Date().toISOString(),
            consecutiveLosses: 0,
            maxOpenPositions: 5,
            riskPerTradePercent: 1,
            activeCredentialId: 'cred-abc-123',
        };
        expect(state.activeCredentialId).toBe('cred-abc-123');
        expect(state.enabled).toBe(true);
    });
});
//# sourceMappingURL=smart-executor.types.spec.js.map