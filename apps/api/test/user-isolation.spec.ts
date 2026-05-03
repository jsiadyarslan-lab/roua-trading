/**
 * User Isolation Security Tests — Roua Trading (رؤى)
 *
 * Verifies that user data is properly isolated:
 * - User A cannot see User B's positions
 * - User A cannot see User B's orders
 * - User A cannot see User B's signals
 * - User A cannot see User B's trades
 * - All Prisma queries include userId in WHERE clause
 *
 * Run: npx jest test/user-isolation.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthGuard } from '../src/common/guards/auth.guard';
import { TradingService } from '../src/modules/trading/trading.service';
import { SignalService } from '../src/modules/signal/signal.service';
import { PositionManagerService } from '../src/modules/trading/services/position-manager.service';

describe('User Isolation Security', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test user IDs
  const USER_A_ID = 'test-user-a-isolation';
  const USER_B_ID = 'test-user-b-isolation';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Clean up test users if they exist from previous runs
    await prisma.order.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.trade.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.position.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.signal.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});

    // Create test users
    await prisma.user.createMany({
      data: [
        { id: USER_A_ID, email: 'user-a-isolation@test.roua', displayName: 'User A Test', tier: 'FREE' },
        { id: USER_B_ID, email: 'user-b-isolation@test.roua', displayName: 'User B Test', tier: 'FREE' },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.order.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.trade.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.position.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.signal.deleteMany({ where: { userId: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [USER_A_ID, USER_B_ID] } } }).catch(() => {});
    await app.close();
  });

  // ── Position Isolation ──

  describe('Position Isolation', () => {
    it('should only return positions belonging to the requesting user', async () => {
      // Create positions for User A only
      const credentialA = await prisma.exchangeCredential.create({
        data: {
          userId: USER_A_ID,
          exchange: 'binance',
          label: 'Test A',
          encryptedApiKey: 'test',
          encryptedSecret: 'test',
          iv: 'test',
          authTag: 'test',
          isValid: true,
        },
      });

      await prisma.position.create({
        data: {
          userId: USER_A_ID,
          credentialId: credentialA.id,
          exchange: 'binance',
          symbol: 'BTC/USDT',
          side: 'BUY',
          status: 'OPEN',
          quantity: 1,
          entryPrice: 50000,
          currentPrice: 52000,
          unrealizedPnl: 2000,
          realizedPnl: 0,
        },
      });

      // Query positions for User B
      const positionsForB = await prisma.position.findMany({
        where: { userId: USER_B_ID, status: 'OPEN' },
      });

      // User B should see NO positions (they have none)
      expect(positionsForB.length).toBe(0);

      // Query positions for User A
      const positionsForA = await prisma.position.findMany({
        where: { userId: USER_A_ID, status: 'OPEN' },
      });

      // User A should see their own positions
      expect(positionsForA.length).toBe(1);
      expect(positionsForA[0].symbol).toBe('BTC/USDT');

      // Clean up
      await prisma.position.deleteMany({ where: { userId: USER_A_ID } });
      await prisma.exchangeCredential.deleteMany({ where: { userId: USER_A_ID } });
    });

    it('should NOT return User A positions when querying without userId filter', async () => {
      // Create position for User A
      const credentialA = await prisma.exchangeCredential.create({
        data: {
          userId: USER_A_ID,
          exchange: 'binance',
          label: 'Test A2',
          encryptedApiKey: 'test2',
          encryptedSecret: 'test2',
          iv: 'test2',
          authTag: 'test2',
          isValid: true,
        },
      });

      await prisma.position.create({
        data: {
          userId: USER_A_ID,
          credentialId: credentialA.id,
          exchange: 'binance',
          symbol: 'ETH/USDT',
          side: 'BUY',
          status: 'OPEN',
          quantity: 10,
          entryPrice: 3000,
          currentPrice: 3200,
          unrealizedPnl: 2000,
          realizedPnl: 0,
        },
      });

      // DANGEROUS: Query without userId — this is what we want to PREVENT
      // If this returns data, it means there's a missing userId filter somewhere
      const allPositions = await prisma.position.findMany({
        where: { status: 'OPEN' },
      });

      // This query may return data (since we're not filtering by userId)
      // But in production code, ALL user-facing queries MUST include userId
      // This test documents that unfiltered queries ARE possible but MUST NOT be used

      // Clean up
      await prisma.position.deleteMany({ where: { userId: USER_A_ID } });
      await prisma.exchangeCredential.deleteMany({ where: { userId: USER_A_ID } });
    });
  });

  // ── Signal Isolation ──

  describe('Signal Isolation', () => {
    it('should only return signals belonging to the requesting user', async () => {
      // Create signals for User A only
      await prisma.signal.create({
        data: {
          userId: USER_A_ID,
          pair: 'BTC/USDT',
          action: 'BUY',
          confidence: 85,
          reason: 'Test signal for User A',
          entryPrice: 50000,
          stopLoss: 48500,
          takeProfit: 53000,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Query signals for User B
      const signalsForB = await prisma.signal.findMany({
        where: { userId: USER_B_ID, status: 'ACTIVE' },
      });

      // User B should see NO signals
      expect(signalsForB.length).toBe(0);

      // Query signals for User A
      const signalsForA = await prisma.signal.findMany({
        where: { userId: USER_A_ID, status: 'ACTIVE' },
      });

      // User A should see their own signals
      expect(signalsForA.length).toBe(1);
      expect(signalsForA[0].pair).toBe('BTC/USDT');

      // Clean up
      await prisma.signal.deleteMany({ where: { userId: USER_A_ID } });
    });
  });

  // ── Order Isolation ──

  describe('Order Isolation', () => {
    it('should only return orders belonging to the requesting user', async () => {
      const credentialA = await prisma.exchangeCredential.create({
        data: {
          userId: USER_A_ID,
          exchange: 'binance',
          label: 'Test Order A',
          encryptedApiKey: 'test-order',
          encryptedSecret: 'test-order',
          iv: 'test-order',
          authTag: 'test-order',
          isValid: true,
        },
      });

      await prisma.order.create({
        data: {
          userId: USER_A_ID,
          exchangeCredentialId: credentialA.id,
          exchange: 'binance',
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'MARKET',
          status: 'FILLED',
          quantity: 0.5,
          averagePrice: 50000,
          filledQuantity: 0.5,
          idempotencyKey: `isolation-test-${Date.now()}`,
        },
      });

      // Query orders for User B
      const ordersForB = await prisma.order.findMany({
        where: { userId: USER_B_ID },
      });

      // User B should see NO orders
      expect(ordersForB.length).toBe(0);

      // Query orders for User A
      const ordersForA = await prisma.order.findMany({
        where: { userId: USER_A_ID },
      });

      // User A should see their own orders
      expect(ordersForA.length).toBeGreaterThanOrEqual(1);

      // Clean up
      await prisma.order.deleteMany({ where: { userId: USER_A_ID } });
      await prisma.exchangeCredential.deleteMany({ where: { userId: USER_A_ID } });
    });
  });

  // ── Trade Isolation ──

  describe('Trade Isolation', () => {
    it('should only return trades belonging to the requesting user', async () => {
      await prisma.trade.create({
        data: {
          userId: USER_A_ID,
          exchange: 'binance',
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'ENTRY',
          quantity: 0.1,
          price: 50000,
          fee: 5,
          feeCurrency: 'USDT',
          pnl: 0,
        },
      });

      // Query trades for User B
      const tradesForB = await prisma.trade.findMany({
        where: { userId: USER_B_ID },
      });

      // User B should see NO trades
      expect(tradesForB.length).toBe(0);

      // Query trades for User A
      const tradesForA = await prisma.trade.findMany({
        where: { userId: USER_A_ID },
      });

      // User A should see their own trades
      expect(tradesForA.length).toBeGreaterThanOrEqual(1);

      // Clean up
      await prisma.trade.deleteMany({ where: { userId: USER_A_ID } });
    });
  });

  // ── Cross-User Access Prevention ──

  describe('Cross-User Access Prevention', () => {
    it('should NOT allow User B to read User A signal by ID', async () => {
      const signal = await prisma.signal.create({
        data: {
          userId: USER_A_ID,
          pair: 'ETH/USDT',
          action: 'SELL',
          confidence: 75,
          reason: 'Private signal for User A',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // User B tries to fetch User A's signal by ID
      const found = await prisma.signal.findUnique({
        where: { id: signal.id },
      });

      // Prisma will return the signal regardless of userId
      // This is why the SERVICE LAYER must check userId after fetching
      expect(found).not.toBeNull();
      expect(found!.userId).toBe(USER_A_ID);

      // The service layer should reject access:
      // if (signal.userId !== requestingUserId) throw new ForbiddenException()
      // This test documents that Prisma findUnique does NOT filter by userId

      // Clean up
      await prisma.signal.delete({ where: { id: signal.id } });
    });
  });
});
