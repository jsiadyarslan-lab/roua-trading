// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Trading Engine E2E Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { OrderController } from '../../src/modules/trading/controllers/order.controller';
import { IdempotencyService } from '../../src/modules/trading/services/idempotency.service';
import { RiskGatekeeperService } from '../../src/modules/trading/services/risk-gatekeeper.service';
import { OrderStateManagerService } from '../../src/modules/trading/services/order-state-manager.service';
import { PositionManagerService } from '../../src/modules/trading/services/position-manager.service';
import { OrderProducerService } from '../../src/modules/trading/services/order-producer.service';
import { AuthGuard } from '../../src/common/guards/auth.guard';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { RedisService } from '../../src/common/redis/redis.service';
import { AuditService } from '../../src/audit/audit.service';
import { ExchangeService } from '../../src/modules/exchange/exchange.service';
import { CredentialsService } from '../../src/modules/portfolio/credentials/credentials.service';
import { MarketDataAggregatorService } from '../../src/modules/analytics/aggregator.service';
import { ConfigService } from '@nestjs/config';
import { OrderCommand, OrderSideEnum, OrderTypeEnum } from '../../src/modules/trading/events/order.events';

// ── CCXT Mock — simulates real exchange balance verification ──

const mockFetchBalance = jest.fn().mockResolvedValue({
  USDT: { free: 100000, used: 0, total: 100000 },
});

jest.mock('ccxt', () => ({
  binance: jest.fn().mockImplementation(() => ({
    fetchBalance: mockFetchBalance,
  })),
}));

/**
 * Trading Engine E2E Tests
 *
 * ┌───────────────────────────────────────────────────────────────┐
 * │ Suite 1: Stop-Loss Enforcement (3 tests)                     │
 * │ Suite 2: Balance Check — Fail-Closed (4 tests)               │
 * │ Suite 3: Idempotency (3 tests)                               │
 * │ Total: 10 tests                                              │
 * └───────────────────────────────────────────────────────────────┘
 */
describe('Trading Engine (e2e)', () => {
  let app: INestApplication;
  let riskGatekeeper: RiskGatekeeperService;
  let idempotencyService: IdempotencyService;

  // ── Mock Data ──

  const MOCK_USER = {
    id: 'test-user-trading-001',
    email: 'trading-test@roua.dev',
    tier: 'PREMIUM',
  };

  const MOCK_CREDENTIAL_PAPER = {
    id: 'cred-paper-001',
    userId: MOCK_USER.id,
    exchange: 'paper',
    label: 'Paper Trading',
    permissions: '["read","trade"]',
    isValid: true,
  };

  const MOCK_CREDENTIAL_BINANCE = {
    id: 'cred-binance-001',
    userId: MOCK_USER.id,
    exchange: 'binance',
    label: 'Binance Live',
    permissions: '["read","trade"]',
    isValid: true,
  };

  const BASE_ORDER: OrderCommand = {
    userId: MOCK_USER.id,
    exchangeCredentialId: MOCK_CREDENTIAL_BINANCE.id,
    symbol: 'BTC/USDT',
    side: OrderSideEnum.BUY,
    type: OrderTypeEnum.MARKET,
    quantity: 1,
    price: undefined,
    stopLoss: 50000,
    takeProfit: 70000,
    idempotencyKey: 'test-idem-key-001',
    clientOrderId: 'client-order-001',
    ipAddress: '127.0.0.1',
    userAgent: 'Jest/Test',
  };

  // ── Mock Services ──

  const mockPrismaService = {
    order: {
      create: jest.fn().mockResolvedValue({
        id: 'order-test-001',
        ...BASE_ORDER,
        status: 'PENDING',
        filledQuantity: 0,
        events: [{ eventType: 'CREATED', payload: '{}' }],
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'order-test-001',
        userId: MOCK_USER.id,
        status: 'PENDING',
        exchangeCredentialId: MOCK_CREDENTIAL_BINANCE.id,
        symbol: 'BTC/USDT',
        side: 'BUY',
      }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    orderEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    exchangeCredential: {
      findUnique: jest.fn().mockResolvedValue(MOCK_CREDENTIAL_BINANCE),
    },
    position: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalValue: 100000 } }),
    },
    trade: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    portfolio: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalValue: 100000 } }),
    },
    session: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'session-trading-001',
        userId: MOCK_USER.id,
        token: 'test-session-token',
        expiresAt: new Date(Date.now() + 86400000),
        user: MOCK_USER,
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };

  const mockRedisService = {
    setIfNotExists: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
    ttl: jest.fn().mockResolvedValue(86400000),
    exists: jest.fn().mockResolvedValue(false),
    checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99, resetIn: 60000 }),
    cacheOrGet: jest.fn().mockResolvedValue(null),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockExchangeService = {
    getQuote: jest.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      price: 60000,
      change: 500,
      changePercent: 0.84,
      source: 'binance',
    }),
  };

  const mockCredentialsService = {
    decryptCredential: jest.fn().mockResolvedValue({
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
    }),
  };

  const mockAggregatorService = {
    getAggregatedQuote: jest.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      price: 60000,
      change: 500,
      changePercent: 0.84,
    }),
  };

  const mockOrderProducerService = {
    sendOrder: jest.fn().mockResolvedValue(true),
  };

  const mockExecutionQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-001' }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        RiskGatekeeperService,
        IdempotencyService,
        OrderStateManagerService,
        PositionManagerService,
        {
          provide: OrderProducerService,
          useValue: mockOrderProducerService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ExchangeService,
          useValue: mockExchangeService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: MarketDataAggregatorService,
          useValue: mockAggregatorService,
        },
        {
          provide: 'BullQueue_execution_queue',
          useValue: mockExecutionQueue,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                RISK_MAX_POSITION_PERCENT: '20',
                RISK_MAX_OPEN_POSITIONS: '10',
                RISK_MAX_DAILY_LOSS_PERCENT: '5',
                RISK_MIN_ORDER_SIZE: '10',
                RISK_MAX_ORDER_SIZE: '50000',
                RISK_CIRCUIT_BREAKER_THRESHOLD: '10',
              };
              return config[key] ?? defaultValue ?? '';
            }),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: jest.fn().mockImplementation((context) => {
          const request = context.switchToHttp().getRequest();
          request.user = MOCK_USER;
          return true;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();

    riskGatekeeper = moduleFixture.get<RiskGatekeeperService>(RiskGatekeeperService);
    idempotencyService = moduleFixture.get<IdempotencyService>(IdempotencyService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Suite 1: Stop-Loss Enforcement (3 tests)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Stop-Loss Enforcement', () => {
    it('1. should reject order without stopLoss', () => {
      const command: OrderCommand = {
        ...BASE_ORDER,
        stopLoss: 0,
      };

      const result = riskGatekeeper.enforceStopLoss(command);

      expect(result.allowed).toBe(false);
      expect(result.failedCheck).toBe('STOPLOSS_ENFORCEMENT');
      expect(result.reason).toContain('وقف الخسارة');
    });

    it('2. should reject BUY order where stopLoss >= price', () => {
      const command: OrderCommand = {
        ...BASE_ORDER,
        side: OrderSideEnum.BUY,
        price: 50000,
        stopLoss: 55000,
      };

      const result = riskGatekeeper.enforceStopLoss(command);

      expect(result.allowed).toBe(false);
      expect(result.failedCheck).toContain('STOPLOGIC');
    });

    it('3. should accept order with valid stopLoss', () => {
      const command: OrderCommand = {
        ...BASE_ORDER,
        side: OrderSideEnum.BUY,
        price: 60000,
        stopLoss: 55000,
      };

      const result = riskGatekeeper.enforceStopLoss(command);

      expect(result.allowed).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Suite 2: Balance Check — Fail-Closed (4 tests)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Balance Check (Fail-Closed)', () => {
    beforeEach(() => {
      // Default: Binance credential with CCXT mock returning sufficient balance
      mockPrismaService.exchangeCredential.findUnique.mockResolvedValue(MOCK_CREDENTIAL_BINANCE);
      mockExchangeService.getQuote.mockResolvedValue({
        symbol: 'BTC/USDT',
        price: 60000,
        change: 500,
        changePercent: 0.84,
        source: 'binance',
      });
      mockFetchBalance.mockResolvedValue({
        USDT: { free: 100000, used: 0, total: 100000 },
      });
    });

    it('4. should reject order below minimum size', async () => {
      const tinyOrder: OrderCommand = {
        ...BASE_ORDER,
        quantity: 0.0001,
        stopLoss: 55000,
      };

      const result = await riskGatekeeper.checkSufficientBalance(tinyOrder);

      expect(result.allowed).toBe(false);
      expect(result.failedCheck).toBe('BALANCE_CHECK');
      expect(result.reason).toContain('الحد الأدنى');
    });

    it('5. should reject when price fetch fails (fail-closed)', async () => {
      mockExchangeService.getQuote.mockRejectedValueOnce(new Error('Price API unreachable'));

      const command: OrderCommand = {
        ...BASE_ORDER,
        price: undefined,
        stopLoss: 55000,
      };

      const result = await riskGatekeeper.checkSufficientBalance(command);

      expect(result.allowed).toBe(false);
      expect(result.failedCheck).toBe('BALANCE_CHECK');
      expect(result.reason).toContain('حماية رأس المال');
    });

    it('6. should reject when CCXT balance fetch fails (fail-closed)', async () => {
      mockFetchBalance.mockRejectedValueOnce(new Error('Network timeout'));

      const command: OrderCommand = {
        ...BASE_ORDER,
        quantity: 0.5,
        price: 60000,
        stopLoss: 55000,
      };

      const result = await riskGatekeeper.checkSufficientBalance(command);

      expect(result.allowed).toBe(false);
      expect(result.failedCheck).toBe('BALANCE_CHECK');
      expect(result.reason).toContain('حماية رأس المال');
    });

    it('7. should accept order with sufficient verified balance', async () => {
      const command: OrderCommand = {
        ...BASE_ORDER,
        quantity: 0.5,
        price: 60000,
        stopLoss: 55000,
      };

      const result = await riskGatekeeper.checkSufficientBalance(command);

      expect(result.allowed).toBe(true);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Suite 3: Idempotency (3 tests)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Idempotency (Duplicate Prevention)', () => {
    beforeEach(() => {
      mockRedisService.setIfNotExists.mockReset();
      mockRedisService.get.mockReset();
      mockRedisService.del.mockReset();
    });

    it('8. should accept first request with unique idempotencyKey', async () => {
      mockRedisService.setIfNotExists.mockResolvedValueOnce(true);

      const result = await idempotencyService.checkAndLock('unique-key-001');

      expect(result).toBe(true);
      expect(mockRedisService.setIfNotExists).toHaveBeenCalledWith(
        'idempotency:unique-key-001',
        expect.any(String),
        86400,
      );
    });

    it('9. should reject duplicate request with same idempotencyKey (409)', async () => {
      mockRedisService.setIfNotExists.mockResolvedValueOnce(false);

      const result = await idempotencyService.checkAndLock('duplicate-key-001');

      expect(result).toBe(false);
    });

    it('10. should simulate full flow: first request 201, then duplicate 409', async () => {
      // Step 1: First request → 201 Created
      mockRedisService.setIfNotExists.mockResolvedValueOnce(true);
      const first = await idempotencyService.checkAndLock('flow-key-001');
      expect(first).toBe(true);

      // Step 2: Duplicate request → 409 Conflict
      mockRedisService.setIfNotExists.mockResolvedValueOnce(false);
      const second = await idempotencyService.checkAndLock('flow-key-001');
      expect(second).toBe(false);
    });
  });
});
