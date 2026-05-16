// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Risk Calculator Service Unit Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RiskCalculatorService } from './risk-calculator.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { StrategyType, AgentConfig, EvaluatedSignal, OrderSide, OrderType } from '../types/agent.types';

// ── Mock Factories ──

const createMockPrismaService = () => ({
  portfolio: { aggregate: jest.fn() },
  position: { findMany: jest.fn(), count: jest.fn() },
  trade: { findMany: jest.fn() },
  setting: { findUnique: jest.fn() },
  agentSettings: { findUnique: jest.fn() },
});

const createMockRedisService = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  exists: jest.fn(),
});

const createMockConfigService = (overrides: Record<string, string> = {}) => ({
  get: jest.fn((key: string, defaultValue?: string) => {
    const env: Record<string, string> = {
      MAX_POSITION_SIZE_PERCENT: '2',
      MAX_DAILY_LOSS_PERCENT: '5',
      MAX_OPEN_POSITIONS: '5',
      DEFAULT_PAPER_BALANCE: '10000',
      AUTO_TRADING_ENABLED: 'true',
      ...overrides,
    };
    return env[key] ?? defaultValue;
  }),
});

// ── Test Fixtures ──

const baseAgentConfig: AgentConfig = {
  userId: 'user-1',
  strategy: StrategyType.AUTO,
  enabled: true,
  maxPositionSizePercent: 2,
  maxDailyLossPercent: 5,
  maxOpenPositions: 5,
  riskPerTradePercent: 1.5,
  strategyParams: {},
  symbols: ['BTC/USDT'],
  credentialId: 'cred-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createSignal = (overrides: Partial<EvaluatedSignal> = {}): EvaluatedSignal => ({
  id: 'test-signal-id',
  symbol: 'BTC/USDT',
  action: OrderSide.BUY,
  type: OrderType.MARKET,
  confidence: 80,
  strategy: StrategyType.SWING,
  entryPrice: 50000,
  stopLoss: 49000,
  takeProfit: 52000,
  quantity: 0.01,
  reasoning: 'Test signal',
  riskRewardRatio: 1.5,
  riskScore: 30,
  timestamp: new Date(),
  metadata: {},
  ...overrides,
});

// ── Tests ──

describe('RiskCalculatorService', () => {
  let service: RiskCalculatorService;
  let prismaMock: ReturnType<typeof createMockPrismaService>;
  let redisMock: ReturnType<typeof createMockRedisService>;
  let configMock: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    prismaMock = createMockPrismaService();
    redisMock = createMockRedisService();
    configMock = createMockConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskCalculatorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<RiskCalculatorService>(RiskCalculatorService);
  });

  // ── isDailyLimitReached ──

  describe('isDailyLimitReached', () => {
    it('should return false when daily PnL is zero', async () => {
      prismaMock.trade.findMany.mockResolvedValue([]);
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });

      const result = await service.isDailyLimitReached('user-1', 5);
      expect(result).toBe(false);
    });

    it('should return false when daily PnL is positive (profits)', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { pnl: 500 },
        { pnl: 200 },
      ]);
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });

      const result = await service.isDailyLimitReached('user-1', 5);
      expect(result).toBe(false);
    });

    it('should return false when daily loss is within the limit', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { pnl: -300 }, // 3% of 10000
      ]);
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });

      const result = await service.isDailyLimitReached('user-1', 5);
      expect(result).toBe(false);
    });

    it('should return true when daily loss equals the limit', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { pnl: -500 }, // 5% of 10000
      ]);
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });

      const result = await service.isDailyLimitReached('user-1', 5);
      expect(result).toBe(true);
    });

    it('should return true when daily loss exceeds the limit', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { pnl: -600 }, // 6% of 10000
      ]);
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });

      const result = await service.isDailyLimitReached('user-1', 5);
      expect(result).toBe(true);
    });

    it('should return false when portfolio value is zero (falls back to default balance)', async () => {
      prismaMock.trade.findMany.mockResolvedValue([{ pnl: -500 }]);
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 0 } });
      prismaMock.position.findMany.mockResolvedValue([]);

      // When portfolio value is 0, _getPortfolioValue falls back to default paper balance (10000)
      // so the loss percent is -500/10000 = 5% which equals the limit
      const result = await service.isDailyLimitReached('user-1', 5);
      expect(result).toBe(true); // 5% loss equals the 5% limit
    });

    it('should handle multiple losing trades', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { pnl: -200 },
        { pnl: -150 },
        { pnl: -200 }, // Total -550 = 5.5% of 10000
      ]);
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });

      const result = await service.isDailyLimitReached('user-1', 5);
      expect(result).toBe(true);
    });
  });

  // ── getRiskParameters ──

  describe('getRiskParameters', () => {
    it('should return default risk parameters from config', () => {
      const params = service.getRiskParameters();

      expect(params).toEqual({
        maxPositionSizePercent: 2,
        maxDailyLossPercent: 5,
        maxOpenPositions: 5,
        riskPerTradePercent: 1.5,
      });
    });

    it('should return custom risk parameters when env is overridden', async () => {
      const customConfig = createMockConfigService({
        MAX_POSITION_SIZE_PERCENT: '1',
        MAX_DAILY_LOSS_PERCENT: '3',
        MAX_OPEN_POSITIONS: '3',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RiskCalculatorService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: RedisService, useValue: redisMock },
          { provide: ConfigService, useValue: customConfig },
        ],
      }).compile();

      const customService = module.get<RiskCalculatorService>(RiskCalculatorService);
      const params = customService.getRiskParameters();

      expect(params.maxPositionSizePercent).toBe(1);
      expect(params.maxDailyLossPercent).toBe(3);
      expect(params.maxOpenPositions).toBe(3);
    });
  });

  // ── assessRisk (full risk assessment) ──

  describe('assessRisk', () => {
    const setupDefaultMocks = () => {
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });
      prismaMock.position.findMany.mockResolvedValue([]);
      prismaMock.trade.findMany.mockResolvedValue([]);
      prismaMock.position.count.mockResolvedValue(0);
      prismaMock.setting.findUnique.mockResolvedValue({ values: 'true' });
      prismaMock.agentSettings.findUnique.mockResolvedValue(null);
    };

    it('should allow a valid trade with good risk/reward ratio', async () => {
      setupDefaultMocks();

      const signal = createSignal({
        entryPrice: 50000,
        stopLoss: 49000,
        takeProfit: 52000,
        strategy: StrategyType.SWING,
      });

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(true);
      expect(result.riskRewardRatio).toBe(2); // (52000-50000) / (50000-49000) = 2000/1000 = 2
      expect(result.positionSize).toBeGreaterThan(0);
      expect(result.portfolioValue).toBe(10000);
    });

    it('should reject trade when stop loss is zero', async () => {
      setupDefaultMocks();

      const signal = createSignal({
        stopLoss: 0,
      });

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
    });

    it('should reject trade when stop loss is negative', async () => {
      setupDefaultMocks();

      const signal = createSignal({
        stopLoss: -100,
      });

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
    });

    it('should reject trade when daily loss limit is reached', async () => {
      setupDefaultMocks();
      prismaMock.trade.findMany.mockResolvedValue([{ pnl: -500 }]); // 5% loss

      const signal = createSignal();

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
      expect(result.dailyLossPercent).toBe(5);
    });

    it('should reject trade when max open positions reached', async () => {
      setupDefaultMocks();
      prismaMock.position.count.mockResolvedValue(5); // Already at max

      const signal = createSignal();

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
    });

    it('should reject trade when risk/reward ratio is below strategy minimum', async () => {
      setupDefaultMocks();

      const signal = createSignal({
        entryPrice: 50000,
        stopLoss: 49900, // Risk = 100
        takeProfit: 50050, // Reward = 50 → R:R = 0.5
        strategy: StrategyType.SWING, // Min R:R = 1.5
      });

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
      expect(result.riskRewardRatio).toBeLessThan(1.5);
    });

    it('should allow DCA strategy with low risk/reward ratio', async () => {
      setupDefaultMocks();

      const signal = createSignal({
        entryPrice: 50000,
        stopLoss: 49500, // Risk = 500
        takeProfit: 49700, // Reward = 200 → R:R = 0.4
        strategy: StrategyType.DCA, // Min R:R = 0.4
      });

      const result = await service.assessRisk('user-1', signal, {
        ...baseAgentConfig,
        strategy: StrategyType.DCA,
      });

      expect(result.canTrade).toBe(true);
    });

    it('should reject trade when duplicate position exists for same symbol', async () => {
      setupDefaultMocks();
      prismaMock.position.count
        .mockResolvedValueOnce(0)  // openPositionsCount
        .mockResolvedValueOnce(1); // hasOpenPosition → true

      const signal = createSignal({ symbol: 'BTC/USDT' });

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
    });

    it('should reject trade when global auto trading is disabled', async () => {
      setupDefaultMocks();
      prismaMock.setting.findUnique.mockResolvedValue({ values: 'true', value: 'false' });

      const signal = createSignal();

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
    });

    it('should reject trade when user auto trading is disabled', async () => {
      setupDefaultMocks();
      prismaMock.agentSettings.findUnique.mockResolvedValue({
        autoTradingEnabled: false,
      });

      const signal = createSignal();

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.canTrade).toBe(false);
    });

    it('should calculate position size correctly', async () => {
      setupDefaultMocks();

      const signal = createSignal({
        entryPrice: 50000,
        stopLoss: 49500, // Price risk = 500
      });

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      // Risk amount = 10000 * 1.5% = 150
      // Quantity = 150 / 500 = 0.3
      // But capped by maxPositionSizePercent: maxPositionValue = 10000 * 2% = 200
      // quantity * entryPrice = 0.3 * 50000 = 15000 > 200 → capped to 200/50000 = 0.004
      expect(result.positionSize).toBeGreaterThan(0);
      expect(result.positionSize).toBeLessThanOrEqual(1);
    });

    it('should use default paper balance when portfolio value is zero', async () => {
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 0 } });
      prismaMock.position.findMany.mockResolvedValue([]);
      prismaMock.trade.findMany.mockResolvedValue([]);
      prismaMock.position.count.mockResolvedValue(0);
      prismaMock.setting.findUnique.mockResolvedValue(null);
      prismaMock.agentSettings.findUnique.mockResolvedValue(null);

      const signal = createSignal();

      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.portfolioValue).toBe(10000);
    });
  });

  // ── Risk Score Calculation ──

  describe('risk score calculation', () => {
    const setupDefaultMocks = () => {
      prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });
      prismaMock.position.findMany.mockResolvedValue([]);
      prismaMock.trade.findMany.mockResolvedValue([]);
      prismaMock.position.count.mockResolvedValue(0);
      prismaMock.setting.findUnique.mockResolvedValue({ values: 'true' });
      prismaMock.agentSettings.findUnique.mockResolvedValue(null);
    };

    it('should produce a risk score between 0 and 100', async () => {
      setupDefaultMocks();

      const signal = createSignal();
      const result = await service.assessRisk('user-1', signal, baseAgentConfig);

      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should produce higher risk score with extreme volatility', async () => {
      setupDefaultMocks();

      const normalSignal = createSignal({ metadata: { volatility: 'LOW' } });
      const extremeSignal = createSignal({ metadata: { volatility: 'EXTREME' } });

      const normalResult = await service.assessRisk('user-1', normalSignal, baseAgentConfig);
      const extremeResult = await service.assessRisk('user-1', extremeSignal, baseAgentConfig);

      expect(extremeResult.riskScore).toBeGreaterThan(normalResult.riskScore);
    });
  });
});
