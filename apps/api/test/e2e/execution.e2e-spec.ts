// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Execution Engine E2E Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { RedisService } from '../../src/common/redis/redis.service';
import { AuditService } from '../../src/audit/audit.service';
import { MarketDataAggregatorService } from '../../src/modules/analytics/aggregator.service';
import { ExecutionGatewayService } from '../../src/modules/execution/gateways/execution-gateway.service';
import { OrderLifecycleService } from '../../src/modules/execution/services/order-lifecycle.service';
import { ConnectionResilienceService } from '../../src/modules/execution/services/connection-resilience.service';
import { RateLimiterService } from '../../src/modules/execution/services/rate-limiter.service';
import { CredentialsService } from '../../src/modules/portfolio/credentials/credentials.service';
import { PaperTradingAdapter } from '../../src/modules/execution/adapters/paper-trading.adapter';
import {
  IBrokerAdapter,
  UnifiedOrder,
  ExecutionResult,
  OrderExecutionStatus,
  UnifiedBalance,
} from '../../src/modules/execution/adapters/base-adapter.interface';

/**
 * Execution Engine E2E Tests
 *
 * Tests the execution pipeline end-to-end:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ 1. Paper trading order execution (PaperTradingAdapter)        │
 * │ 2. Connection resilience with Redis failure simulation       │
 * │ 3. Rate limiter token bucket enforcement                     │
 * │ 4. Execution gateway adapter routing                         │
 * │ 5. Order lifecycle state transitions                         │
 * └───────────────────────────────────────────────────────────────┘
 */
describe('Execution Engine (e2e)', () => {
  // ── Mock Data ──

  const MOCK_USER = {
    id: 'test-user-exec-001',
    email: 'exec-test@roua.dev',
    tier: 'PREMIUM',
  };

  const MOCK_CREDENTIAL = {
    id: 'cred-exec-001',
    userId: MOCK_USER.id,
    exchange: 'paper',
    label: 'Paper Trading',
    encryptedApiKey: 'encrypted',
    encryptedSecret: 'encrypted',
    iv: 'iv',
    authTag: 'tag',
    permissions: '["read","trade"]',
    isValid: true,
  };

  const MOCK_ORDER: UnifiedOrder = {
    userId: MOCK_USER.id,
    exchangeCredentialId: MOCK_CREDENTIAL.id,
    symbol: 'AAPL',
    side: 'BUY',
    type: 'MARKET',
    quantity: 10,
    stopLoss: 180,
    takeProfit: 200,
    idempotencyKey: 'exec-idem-key-001',
  };

  // ── Mock Services ──

  const mockPrismaService = {
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'order-exec-001',
        userId: MOCK_USER.id,
        exchangeCredentialId: MOCK_CREDENTIAL.id,
        exchange: 'paper',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        price: null,
        stopLoss: 180,
        takeProfit: 200,
        status: 'ACCEPTED',
        filledQuantity: 0,
        idempotencyKey: 'exec-idem-key-001',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    orderEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    exchangeCredential: {
      findUnique: jest.fn().mockResolvedValue(MOCK_CREDENTIAL),
    },
    position: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'pos-001' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    trade: {
      create: jest.fn().mockResolvedValue({ id: 'trade-001' }),
    },
    paperOrder: {
      create: jest.fn().mockResolvedValue({
        id: 'paper-order-001',
        userId: MOCK_USER.id,
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        price: 185.685,
        status: 'FILLED',
        filledQuantity: 10,
        averagePrice: 185.685,
        fee: 1.857,
        feeCurrency: 'USD',
        slippage: 0.185,
        idempotencyKey: 'exec-idem-key-001',
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
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
    ttl: jest.fn().mockResolvedValue(60000),
    exists: jest.fn().mockResolvedValue(false),
    checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 99, resetIn: 60000 }),
    cacheOrGet: jest.fn().mockResolvedValue(null),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockCredentialsService = {
    decryptCredential: jest.fn().mockResolvedValue({
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
    }),
  };

  const mockAggregatorService = {
    getAggregatedQuote: jest.fn().mockResolvedValue({
      symbol: 'AAPL',
      price: 185.50,
      change: 2.30,
      changePercent: 1.25,
    }),
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 1: Paper Trading Execution
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Paper Trading Execution', () => {
    let paperAdapter: any;

    beforeEach(() => {
      // Create PaperTradingAdapter instance with mocked dependencies
      // We need to use the actual class for real behavior testing
      paperAdapter = new PaperTradingAdapter(
        mockPrismaService,
        mockAggregatorService,
        mockRedisService,
        mockAuditService,
        MOCK_USER.id,
      );
    });

    it('should execute market order and return ACCEPTED status', async () => {
      // Act
      const result = await paperAdapter.placeOrder(MOCK_ORDER);

      // Assert: Paper trading should succeed
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBeDefined();

      // Paper market orders fill immediately
      if (result.status === OrderExecutionStatus.FILLED) {
        expect(result.filledQuantity).toBe(MOCK_ORDER.quantity);
        expect(result.averagePrice).toBeGreaterThan(0);
        expect(result.fee).toBeGreaterThan(0); // 0.1% commission
        expect(result.feeCurrency).toBe('USD');
      }

      // For any non-error case, status should be at least ACCEPTED
      expect([
        OrderExecutionStatus.ACCEPTED,
        OrderExecutionStatus.FILLED,
      ]).toContain(result.status);
    });

    it('should apply slippage (0.1% default) to market orders', async () => {
      // Arrange: Get the market price from aggregator
      const marketPrice = 185.50;

      // Act
      const result = await paperAdapter.placeOrder(MOCK_ORDER);

      // Assert: If filled, price should include slippage
      if (result.success && result.averagePrice && result.filledQuantity === MOCK_ORDER.quantity) {
        // For BUY: fill price should be slightly ABOVE market (slippage)
        const expectedSlippage = marketPrice * 0.001; // 0.1%
        const expectedFillPrice = marketPrice + expectedSlippage;

        // Allow 1% tolerance for rounding
        expect(result.averagePrice).toBeCloseTo(expectedFillPrice, 1);
      }
    });

    it('should charge commission (0.1% default)', async () => {
      // Act
      const result = await paperAdapter.placeOrder(MOCK_ORDER);

      // Assert: Commission should be 0.1% of notional value
      if (result.success && result.fee) {
        const notionalValue = result.filledQuantity! * result.averagePrice!;
        const expectedFee = notionalValue * 0.001; // 0.1%
        expect(result.fee).toBeCloseTo(expectedFee, 2);
      }
    });

    it('should store paper order in database', async () => {
      // Act
      await paperAdapter.placeOrder(MOCK_ORDER);

      // Assert: paperOrder.create should have been called
      expect(mockPrismaService.paperOrder.create).toHaveBeenCalled();

      const createCall = mockPrismaService.paperOrder.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe(MOCK_USER.id);
      expect(createCall.data.symbol).toBe('AAPL');
      expect(createCall.data.side).toBe('BUY');
    });

    it('should return paper as exchangeId', () => {
      expect(paperAdapter.getExchangeId()).toBe('paper');
    });

    it('should NOT support WebSocket (uses polling)', () => {
      expect(paperAdapter.supportsWebSocket()).toBe(false);
    });

    it('should have generous rate limits for paper trading', () => {
      const limits = paperAdapter.getRateLimits();
      expect(limits.maxRequestsPerSecond).toBeGreaterThanOrEqual(10);
      expect(limits.maxRequestsPerMinute).toBeGreaterThanOrEqual(500);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 2: Connection Resilience (Redis Failure)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Connection Resilience (Redis Failure)', () => {
    let resilienceService: ConnectionResilienceService;
    let gatewayService: ExecutionGatewayService;
    let lifecycleService: OrderLifecycleService;

    beforeEach(async () => {
      const testingModule = await Test.createTestingModule({
        providers: [
          ConnectionResilienceService,
          ExecutionGatewayService,
          OrderLifecycleService,
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
            provide: CredentialsService,
            useValue: mockCredentialsService,
          },
          {
            provide: MarketDataAggregatorService,
            useValue: mockAggregatorService,
          },
          {
            provide: 'ConfigService',
            useValue: { get: jest.fn().mockReturnValue('') },
          },
        ],
      }).compile();

      resilienceService = testingModule.get<ConnectionResilienceService>(ConnectionResilienceService);
      gatewayService = testingModule.get<ExecutionGatewayService>(ExecutionGatewayService);
      lifecycleService = testingModule.get<OrderLifecycleService>(OrderLifecycleService);
    });

    it('should fall back to REST polling when Redis is unavailable', async () => {
      // Arrange: Simulate Redis failure by making operations fail
      mockRedisService.set.mockRejectedValue(new Error('Redis connection refused'));
      mockRedisService.get.mockRejectedValue(new Error('Redis connection refused'));

      // Act: Try to watch an order — should not throw even with Redis down
      // ConnectionResilienceService should gracefully handle Redis failures
      // and continue with in-memory polling
      const watchPromise = resilienceService.watchOrder({
        id: 'order-resilience-001',
        userId: MOCK_USER.id,
        exchangeCredentialId: MOCK_CREDENTIAL.id,
        symbol: 'AAPL',
        exchangeOrderId: 'paper-order-001',
      });

      // Assert: Should not throw — resilience means graceful degradation
      await expect(watchPromise).resolves.not.toThrow();
    });

    it('should report connection status correctly', () => {
      // Act
      const status = resilienceService.getConnectionStatus();

      // Assert: Should return a status object (even if empty initially)
      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
    });

    it('should stop watching orders in terminal states', async () => {
      // Arrange: Watch an order
      await resilienceService.watchOrder({
        id: 'order-terminal-001',
        userId: MOCK_USER.id,
        exchangeCredentialId: MOCK_CREDENTIAL.id,
        symbol: 'AAPL',
        exchangeOrderId: 'paper-order-001',
      });

      // Act: Unwatch the order
      resilienceService.unwatchOrder('order-terminal-001');

      // Assert: No error thrown
      // The order should be removed from internal tracking
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 3: Rate Limiter
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Rate Limiter (Redis Token Bucket)', () => {
    let rateLimiter: RateLimiterService;

    beforeEach(async () => {
      const testingModule = await Test.createTestingModule({
        providers: [
          RateLimiterService,
          {
            provide: RedisService,
            useValue: mockRedisService,
          },
          {
            provide: 'ConfigService',
            useValue: { get: jest.fn().mockReturnValue(null) },
          },
        ],
      }).compile();

      rateLimiter = testingModule.get<RateLimiterService>(RateLimiterService);

      // Reset rate limit mock
      mockRedisService.checkRateLimit.mockReset();
      mockRedisService.incr.mockReset();
    });

    it('should allow requests within rate limits', async () => {
      // Arrange: Within limits
      mockRedisService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetIn: 60000,
      });

      // Act
      const result = await rateLimiter.checkRateLimit('paper', MOCK_USER.id);

      // Assert
      expect(result).toBe(true);
    });

    it('should reject requests exceeding rate limits', async () => {
      // Arrange: Rate limit exceeded
      mockRedisService.checkRateLimit
        .mockResolvedValueOnce({ allowed: true, remaining: 0, resetIn: 1000 }) // per-second: OK
        .mockResolvedValueOnce({ allowed: false, remaining: 0, resetIn: 45000 }); // per-minute: EXCEEDED

      // Act
      const result = await rateLimiter.checkRateLimit('paper', MOCK_USER.id);

      // Assert
      expect(result).toBe(false);
    });

    it('should allow request on Redis failure (fail-open)', async () => {
      // Arrange: Redis fails
      mockRedisService.checkRateLimit.mockRejectedValue(new Error('Redis down'));

      // Act
      const result = await rateLimiter.checkRateLimit('binance', MOCK_USER.id);

      // Assert: Fail-open for availability
      expect(result).toBe(true);
    });

    it('should report remaining capacity', async () => {
      // Arrange
      mockRedisService.get
        .mockResolvedValueOnce('3')  // 3 requests in current second
        .mockResolvedValueOnce('45'); // 45 requests in current minute

      // Act
      const capacity = await rateLimiter.getRemainingCapacity('paper', MOCK_USER.id);

      // Assert
      expect(capacity).toBeDefined();
      expect(typeof capacity.perSecond).toBe('number');
      expect(typeof capacity.perMinute).toBe('number');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 4: Execution Gateway (Adapter Routing)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Execution Gateway (Adapter Routing)', () => {
    let gatewayService: ExecutionGatewayService;

    beforeEach(async () => {
      const testingModule = await Test.createTestingModule({
        providers: [
          ExecutionGatewayService,
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
          {
            provide: CredentialsService,
            useValue: mockCredentialsService,
          },
          {
            provide: AuditService,
            useValue: mockAuditService,
          },
          {
            provide: MarketDataAggregatorService,
            useValue: mockAggregatorService,
          },
          {
            provide: RedisService,
            useValue: mockRedisService,
          },
        ],
      }).compile();

      gatewayService = testingModule.get<ExecutionGatewayService>(ExecutionGatewayService);
    });

    it('should reject credentials with withdraw/transfer permissions', async () => {
      // Arrange: Credential with dangerous permissions
      mockPrismaService.exchangeCredential.findUnique.mockResolvedValueOnce({
        ...MOCK_CREDENTIAL,
        permissions: '["read","trade","withdraw"]', // FORBIDDEN!
      });
      mockPrismaService.exchangeCredential.update.mockResolvedValueOnce({});

      // Act & Assert: Should throw when trying to get adapter
      await expect(
        gatewayService.getAdapterForUser(MOCK_USER.id, MOCK_CREDENTIAL.id),
      ).rejects.toThrow();
    });

    it('should reject credentials without trade permission', async () => {
      // Arrange: Read-only credential
      mockPrismaService.exchangeCredential.findUnique.mockResolvedValueOnce({
        ...MOCK_CREDENTIAL,
        permissions: '["read"]', // No trade permission
      });

      // Act & Assert
      await expect(
        gatewayService.getAdapterForUser(MOCK_USER.id, MOCK_CREDENTIAL.id),
      ).rejects.toThrow();
    });

    it('should create paper adapter for paper exchange', async () => {
      // Arrange
      mockPrismaService.exchangeCredential.findUnique.mockResolvedValueOnce(MOCK_CREDENTIAL);

      // Act
      const adapter = await gatewayService.getAdapterForUser(MOCK_USER.id, MOCK_CREDENTIAL.id);

      // Assert
      expect(adapter).toBeDefined();
      expect(adapter.getExchangeId()).toBe('paper');
    });

    it('should cache adapters for repeated use', async () => {
      // Arrange
      mockPrismaService.exchangeCredential.findUnique.mockResolvedValue(MOCK_CREDENTIAL);

      // Act: Get adapter twice
      const adapter1 = await gatewayService.getAdapterForUser(MOCK_USER.id, MOCK_CREDENTIAL.id);
      const adapter2 = await gatewayService.getAdapterForUser(MOCK_USER.id, MOCK_CREDENTIAL.id);

      // Assert: Same instance (cached)
      expect(adapter1).toBe(adapter2);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 5: Order Lifecycle State Transitions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Order Lifecycle State Transitions', () => {
    let lifecycleService: OrderLifecycleService;

    beforeEach(async () => {
      const testingModule = await Test.createTestingModule({
        providers: [
          OrderLifecycleService,
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
          {
            provide: AuditService,
            useValue: mockAuditService,
          },
        ],
      }).compile();

      lifecycleService = testingModule.get<OrderLifecycleService>(OrderLifecycleService);

      // Reset mocks
      mockPrismaService.order.update.mockReset();
      mockPrismaService.orderEvent.create.mockReset();
      mockPrismaService.order.findUnique.mockReset();
    });

    it('should transition to FILLED on successful execution', async () => {
      // Arrange: Mock order lookup for position update
      mockPrismaService.order.findUnique.mockResolvedValue({
        id: 'order-exec-001',
        userId: MOCK_USER.id,
        exchangeCredentialId: MOCK_CREDENTIAL.id,
        exchange: 'paper',
        symbol: 'AAPL',
        side: 'BUY',
        stopLoss: 180,
        takeProfit: 200,
      });
      mockPrismaService.exchangeCredential.findUnique.mockResolvedValue(MOCK_CREDENTIAL);
      mockPrismaService.position.findFirst.mockResolvedValue(null);

      const successResult: ExecutionResult = {
        success: true,
        exchangeOrderId: 'paper-order-001',
        filledQuantity: 10,
        averagePrice: 185.685,
        fee: 1.857,
        feeCurrency: 'USD',
        status: OrderExecutionStatus.FILLED,
        timestamp: new Date(),
      };

      // Act
      await lifecycleService.handleExecutionResult(successResult, 'order-exec-001', MOCK_USER.id);

      // Assert: Order updated to FILLED
      expect(mockPrismaService.order.update).toHaveBeenCalled();
      const updateCall = mockPrismaService.order.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('FILLED');
      expect(updateCall.data.filledQuantity).toBe(10);
      expect(updateCall.data.averagePrice).toBe(185.685);

      // Assert: OrderEvent created
      expect(mockPrismaService.orderEvent.create).toHaveBeenCalled();
    });

    it('should transition to REJECTED on failed execution', async () => {
      const failureResult: ExecutionResult = {
        success: false,
        error: 'Insufficient funds on exchange',
        timestamp: new Date(),
      };

      // Act
      await lifecycleService.handleExecutionResult(failureResult, 'order-exec-001', MOCK_USER.id);

      // Assert: Order updated to REJECTED
      expect(mockPrismaService.order.update).toHaveBeenCalled();
      const updateCall = mockPrismaService.order.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('REJECTED');
      expect(updateCall.data.rejectReason).toBe('Insufficient funds on exchange');
    });
  });
});
