"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const config_1 = require("@nestjs/config");
const risk_calculator_service_1 = require("./risk-calculator.service");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const agent_types_1 = require("../types/agent.types");
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
const createMockConfigService = (overrides = {}) => ({
    get: jest.fn((key, defaultValue) => {
        const env = {
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
const baseAgentConfig = {
    userId: 'user-1',
    strategy: agent_types_1.StrategyType.AUTO,
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
const createSignal = (overrides = {}) => ({
    id: 'test-signal-id',
    symbol: 'BTC/USDT',
    action: agent_types_1.OrderSide.BUY,
    type: agent_types_1.OrderType.MARKET,
    confidence: 80,
    strategy: agent_types_1.StrategyType.SWING,
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
describe('RiskCalculatorService', () => {
    let service;
    let prismaMock;
    let redisMock;
    let configMock;
    beforeEach(async () => {
        prismaMock = createMockPrismaService();
        redisMock = createMockRedisService();
        configMock = createMockConfigService();
        const module = await testing_1.Test.createTestingModule({
            providers: [
                risk_calculator_service_1.RiskCalculatorService,
                { provide: prisma_service_1.PrismaService, useValue: prismaMock },
                { provide: redis_service_1.RedisService, useValue: redisMock },
                { provide: config_1.ConfigService, useValue: configMock },
            ],
        }).compile();
        service = module.get(risk_calculator_service_1.RiskCalculatorService);
    });
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
                { pnl: -300 },
            ]);
            prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });
            const result = await service.isDailyLimitReached('user-1', 5);
            expect(result).toBe(false);
        });
        it('should return true when daily loss equals the limit', async () => {
            prismaMock.trade.findMany.mockResolvedValue([
                { pnl: -500 },
            ]);
            prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });
            const result = await service.isDailyLimitReached('user-1', 5);
            expect(result).toBe(true);
        });
        it('should return true when daily loss exceeds the limit', async () => {
            prismaMock.trade.findMany.mockResolvedValue([
                { pnl: -600 },
            ]);
            prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });
            const result = await service.isDailyLimitReached('user-1', 5);
            expect(result).toBe(true);
        });
        it('should return false when portfolio value is zero (falls back to default balance)', async () => {
            prismaMock.trade.findMany.mockResolvedValue([{ pnl: -500 }]);
            prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 0 } });
            prismaMock.position.findMany.mockResolvedValue([]);
            const result = await service.isDailyLimitReached('user-1', 5);
            expect(result).toBe(true);
        });
        it('should handle multiple losing trades', async () => {
            prismaMock.trade.findMany.mockResolvedValue([
                { pnl: -200 },
                { pnl: -150 },
                { pnl: -200 },
            ]);
            prismaMock.portfolio.aggregate.mockResolvedValue({ _sum: { totalValue: 10000 } });
            const result = await service.isDailyLimitReached('user-1', 5);
            expect(result).toBe(true);
        });
    });
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
            const module = await testing_1.Test.createTestingModule({
                providers: [
                    risk_calculator_service_1.RiskCalculatorService,
                    { provide: prisma_service_1.PrismaService, useValue: prismaMock },
                    { provide: redis_service_1.RedisService, useValue: redisMock },
                    { provide: config_1.ConfigService, useValue: customConfig },
                ],
            }).compile();
            const customService = module.get(risk_calculator_service_1.RiskCalculatorService);
            const params = customService.getRiskParameters();
            expect(params.maxPositionSizePercent).toBe(1);
            expect(params.maxDailyLossPercent).toBe(3);
            expect(params.maxOpenPositions).toBe(3);
        });
    });
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
                strategy: agent_types_1.StrategyType.SWING,
            });
            const result = await service.assessRisk('user-1', signal, baseAgentConfig);
            expect(result.canTrade).toBe(true);
            expect(result.riskRewardRatio).toBe(2);
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
            prismaMock.trade.findMany.mockResolvedValue([{ pnl: -500 }]);
            const signal = createSignal();
            const result = await service.assessRisk('user-1', signal, baseAgentConfig);
            expect(result.canTrade).toBe(false);
            expect(result.dailyLossPercent).toBe(5);
        });
        it('should reject trade when max open positions reached', async () => {
            setupDefaultMocks();
            prismaMock.position.count.mockResolvedValue(5);
            const signal = createSignal();
            const result = await service.assessRisk('user-1', signal, baseAgentConfig);
            expect(result.canTrade).toBe(false);
        });
        it('should reject trade when risk/reward ratio is below strategy minimum', async () => {
            setupDefaultMocks();
            const signal = createSignal({
                entryPrice: 50000,
                stopLoss: 49900,
                takeProfit: 50050,
                strategy: agent_types_1.StrategyType.SWING,
            });
            const result = await service.assessRisk('user-1', signal, baseAgentConfig);
            expect(result.canTrade).toBe(false);
            expect(result.riskRewardRatio).toBeLessThan(1.5);
        });
        it('should allow DCA strategy with low risk/reward ratio', async () => {
            setupDefaultMocks();
            const signal = createSignal({
                entryPrice: 50000,
                stopLoss: 49500,
                takeProfit: 49700,
                strategy: agent_types_1.StrategyType.DCA,
            });
            const result = await service.assessRisk('user-1', signal, {
                ...baseAgentConfig,
                strategy: agent_types_1.StrategyType.DCA,
            });
            expect(result.canTrade).toBe(true);
        });
        it('should reject trade when duplicate position exists for same symbol', async () => {
            setupDefaultMocks();
            prismaMock.position.count
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(1);
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
                stopLoss: 49500,
            });
            const result = await service.assessRisk('user-1', signal, baseAgentConfig);
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
//# sourceMappingURL=risk-calculator.service.spec.js.map