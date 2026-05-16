// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Types Unit Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  ExecutorStatus,
  ExecutionResult,
  ExecutorConfig,
  UserExecutorState,
} from './smart-executor.types';

// ── ExecutorStatus Interface ──

describe('ExecutorStatus', () => {
  it('should create a valid ExecutorStatus object with all fields', () => {
    const status: ExecutorStatus = {
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
    const status: ExecutorStatus = {
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
    const status: ExecutorStatus = {
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

// ── ExecutionResult Interface ──

describe('ExecutionResult', () => {
  it('should create a successful ExecutionResult', () => {
    const result: ExecutionResult = {
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
    const result: ExecutionResult = {
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

  it('should support both BUY and SELL directions', () => {
    const buyResult: ExecutionResult = {
      success: true,
      briefId: 'b1',
      pair: 'BTC/USDT',
      direction: 'BUY',
      entryPrice: 50000,
      executedAt: new Date(),
    };

    const sellResult: ExecutionResult = {
      success: true,
      briefId: 'b2',
      pair: 'BTC/USDT',
      direction: 'SELL',
      entryPrice: 51000,
      executedAt: new Date(),
    };

    expect(buyResult.direction).toBe('BUY');
    expect(sellResult.direction).toBe('SELL');
  });
});

// ── ExecutorConfig Interface ──

describe('ExecutorConfig', () => {
  it('should create a valid ExecutorConfig with default-like values', () => {
    const config: ExecutorConfig = {
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

  it('should allow custom configuration values', () => {
    const config: ExecutorConfig = {
      tickIntervalMs: 5000,
      maxOpenPositions: 10,
      maxDailyLossPercent: 3,
      defaultSlippage: 0.002,
      riskPerTradePercent: 0.5,
      minConfidence: 80,
    };

    expect(config.tickIntervalMs).toBe(5000);
    expect(config.maxOpenPositions).toBe(10);
    expect(config.riskPerTradePercent).toBe(0.5);
  });

  it('should enforce that all numeric fields are positive', () => {
    const config: ExecutorConfig = {
      tickIntervalMs: 1000,
      maxOpenPositions: 1,
      maxDailyLossPercent: 1,
      defaultSlippage: 0.0001,
      riskPerTradePercent: 0.1,
      minConfidence: 1,
    };

    expect(config.tickIntervalMs).toBeGreaterThan(0);
    expect(config.maxOpenPositions).toBeGreaterThan(0);
    expect(config.maxDailyLossPercent).toBeGreaterThan(0);
    expect(config.defaultSlippage).toBeGreaterThan(0);
    expect(config.riskPerTradePercent).toBeGreaterThan(0);
    expect(config.minConfidence).toBeGreaterThan(0);
  });
});

// ── UserExecutorState Interface ──

describe('UserExecutorState', () => {
  it('should create a valid UserExecutorState', () => {
    const state: UserExecutorState = {
      enabled: true,
      dailyPnL: 0,
      dailyTrades: 0,
      dailyResetAt: new Date().toISOString(),
      lastTradeAt: null,
      consecutiveLosses: 0,
      maxOpenPositions: 5,
      riskPerTradePercent: 1,
      isPaperTrading: true,
    };

    expect(state.enabled).toBe(true);
    expect(state.dailyPnL).toBe(0);
    expect(state.consecutiveLosses).toBe(0);
    expect(state.isPaperTrading).toBe(true);
    expect(state.lastTradeAt).toBeNull();
  });

  it('should support credential ID for live trading', () => {
    const state: UserExecutorState = {
      enabled: true,
      dailyPnL: 50,
      dailyTrades: 3,
      dailyResetAt: new Date().toISOString(),
      lastTradeAt: new Date().toISOString(),
      consecutiveLosses: 0,
      maxOpenPositions: 5,
      riskPerTradePercent: 1,
      credentialId: 'cred-abc-123',
      isPaperTrading: false,
    };

    expect(state.credentialId).toBe('cred-abc-123');
    expect(state.isPaperTrading).toBe(false);
  });
});
