import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { PositionInfo, PortfolioSummary } from '../events/order.events';
import { RedisService } from '../../../common/redis/redis.service';
import { calculateMargin } from './symbol-metadata';

/**
 * Position Manager Service — Portfolio & Position Tracking
 *
 * Manages open positions across all exchanges and provides:
 * - Real-time unrealized P&L calculation
 * - Portfolio summary with daily P&L
 * - Position aggregation across multiple exchanges
 * - Risk exposure metrics
 *
 * Integration:
 * - MarketDataAggregatorService: Live prices for P&L calculation
 * - PrismaService: Position data from database
 * - CredentialsService: Multi-exchange credential resolution
 *
 * Features:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ getOpenPositions      — All open positions across exchanges │
 * │ calculateUnrealizedPnL — Real-time P&L per position        │
 * │ getPortfolioSummary   — Complete portfolio overview        │
 * └─────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class PositionManagerService {
  private readonly logger = new Logger(PositionManagerService.name);

  /** BUG 9 FIX: Redis cache TTL for daily P&L — 60 seconds.
   *  Multiple services (PositionManager, RiskGatekeeper, RiskCalculator) independently
   *  query the database for today's trades to calculate daily P&L. This shared
   *  Redis cache ensures the DB is only queried once per minute per user.
   */
  private readonly DAILY_PNL_TTL_MS = 60_000; // 60 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: MarketDataAggregatorService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger.log('📊 Position Manager initialized — tracking across all exchanges');
  }

  /**
   * Get all open positions for a user
   * Aggregates positions from all linked exchanges
   */
  async getOpenPositions(userId: string): Promise<PositionInfo[]> {
    // FIX: Filter out phantom/paper-trading positions at the DB query level.
    // Previously, ALL open positions were returned including phantom positions
    // created by the Smart Executor and Autonomous Trader Agent. These phantom
    // positions have exchange='paper-trading' or source in ['smart_executor', 'agent', 'auto_paper'].
    const positions = await this.prisma.position.findMany({
      where: {
        userId,
        status: 'OPEN',
        // FIX: Include ALL positions including paper trading.
        // Paper positions are real simulated trades — should appear in portfolio.
        // Previously excluded, causing portfolioValue = 0 for paper traders.
      },
      orderBy: { openedAt: 'desc' },
    });

    if (positions.length === 0) return [];

    // Batch: Fetch all quotes in parallel using Promise.allSettled
    const quoteResults = await Promise.allSettled(
      positions.map((position) =>
        this.aggregator.getAggregatedQuote(position.symbol),
      ),
    );

    const positionInfos: PositionInfo[] = [];
    const dbUpdates: { id: string; currentPrice: number; highestPrice: number; lowestPrice: number }[] = [];

    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      const result = quoteResults[i];

      if (result.status === 'fulfilled') {
        const currentPrice = result.value.price;

        // Queue DB update
        dbUpdates.push({
          id: position.id,
          currentPrice,
          highestPrice: Math.max(Number(position.highestPrice || currentPrice), currentPrice),
          lowestPrice: Math.min(Number(position.lowestPrice || currentPrice), currentPrice),
        });

        const unrealizedPnL = this.calculateUnrealizedPnL({
          side: position.side,
          entryPrice: Number(position.entryPrice),
          currentPrice,
          quantity: Number(position.quantity),
        });

        positionInfos.push({
          id: position.id,
          symbol: position.symbol,
          side: position.side,
          quantity: Number(position.quantity),
          entryPrice: Number(position.entryPrice),
          currentPrice,
          unrealizedPnL,
          stopLoss: position.stopLoss != null ? Number(position.stopLoss) : null,
          takeProfit: position.takeProfit != null ? Number(position.takeProfit) : null,
          exchange: position.exchange,
          credentialId: position.credentialId,
          source: position.source,
          openedAt: position.openedAt,
        });
      } else {
        // If we can't get current price, use last known price
        const unrealizedPnL = this.calculateUnrealizedPnL({
          side: position.side,
          entryPrice: Number(position.entryPrice),
          currentPrice: Number(position.currentPrice || position.entryPrice),
          quantity: Number(position.quantity),
        });

        positionInfos.push({
          id: position.id,
          symbol: position.symbol,
          side: position.side,
          quantity: Number(position.quantity),
          entryPrice: Number(position.entryPrice),
          currentPrice: Number(position.currentPrice || position.entryPrice),
          unrealizedPnL,
          stopLoss: position.stopLoss != null ? Number(position.stopLoss) : null,
          takeProfit: position.takeProfit != null ? Number(position.takeProfit) : null,
          exchange: position.exchange,
          credentialId: position.credentialId,
          source: position.source,
          openedAt: position.openedAt,
        });
      }
    }

    // Batch DB updates in a transaction
    if (dbUpdates.length > 0) {
      await this.prisma.$transaction(
        dbUpdates.map((u) =>
          this.prisma.position.update({
            where: { id: u.id },
            data: {
              currentPrice: u.currentPrice,
              highestPrice: u.highestPrice,
              lowestPrice: u.lowestPrice,
            },
          }),
        ),
      );
    }

    return positionInfos;
  }

  /**
   * Calculate Unrealized P&L for a position
   *
   * BUY positions: PnL = (currentPrice - entryPrice) × quantity
   * SELL positions: PnL = (entryPrice - currentPrice) × quantity
   *
   * @param position Object with side, entryPrice, currentPrice, quantity
   * @returns Unrealized profit/loss amount
   */
  calculateUnrealizedPnL(position: {
    side: string;
    entryPrice: number;
    currentPrice: number;
    quantity: number;
  }): number {
    if (position.side === 'BUY') {
      return (position.currentPrice - position.entryPrice) * position.quantity;
    } else {
      return (position.entryPrice - position.currentPrice) * position.quantity;
    }
  }

  /**
   * Get complete portfolio summary
   *
   * Returns:
   * - totalBalance: Sum of all portfolio values + positions
   * - dailyPnL: Today's realized P&L
   * - dailyPnLPercent: Daily P&L as percentage
   * - totalExposure: Total value of open positions
   * - openPositionsCount: Number of open positions
   * - maxDrawdownPercent: Maximum drawdown from peak
   * - unrealizedPnL: Sum of all unrealized P&L
   * - positions: Detailed position list
   */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
    // Get portfolio value from Portfolio table
    const portfolios = await this.prisma.portfolio.aggregate({
      where: { userId },
      _sum: { totalValue: true },
    });
    const baseBalance = Number(portfolios._sum.totalValue || 0);

    // Get open positions with current prices
    const positions = await this.getOpenPositions(userId);

    // Calculate total exposure
    const totalExposure = positions.reduce(
      (sum, p) => sum + p.quantity * p.currentPrice,
      0,
    );

    // V148 FIX: Calculate leverage-aware used margin.
    // totalExposure is the FULL NOTIONAL (qty × price) which is WRONG for margin.
    // For forex at 50:1, $108K exposure only needs $2,160 margin.
    // Using totalExposure as "usedMargin" caused the dashboard to show
    // "مستخدم: $19,548" instead of the correct "~$390" for a $10K account.
    const usedMargin = positions.reduce(
      (sum, p) => sum + calculateMargin(p.quantity, p.currentPrice, p.symbol),
      0,
    );

    // Calculate total unrealized P&L
    const unrealizedPnL = positions.reduce(
      (sum, p) => sum + p.unrealizedPnL,
      0,
    );

    // Calculate today's realized P&L (BUG 9 FIX: use shared cached method)
    const dailyPnL = await this.getDailyPnL(userId);

    // Calculate daily P&L percentage
    const totalBalance = baseBalance + totalExposure;
    const dailyPnLPercent = totalBalance > 0
      ? (dailyPnL / totalBalance) * 100
      : 0;

    // Calculate max drawdown
    const allTimeTrades = await this.prisma.trade.findMany({
      where: { userId, type: { in: ['EXIT', 'PARTIAL_EXIT'] } },
      orderBy: { executedAt: 'asc' },
    });

    let peak = 0;
    let cumulativePnL = 0;
    let maxDrawdown = 0;

    for (const trade of allTimeTrades) {
      cumulativePnL += Number(trade.pnl || 0);
      peak = Math.max(peak, cumulativePnL);
      const drawdown = peak - cumulativePnL;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    const maxDrawdownPercent = totalBalance > 0
      ? (maxDrawdown / totalBalance) * 100
      : 0;

    return {
      totalBalance,
      dailyPnL,
      dailyPnLPercent,
      totalExposure,
      usedMargin,
      openPositionsCount: positions.length,
      maxDrawdownPercent,
      unrealizedPnL,
      positions,
    };
  }

  /**
   * BUG 9 FIX: Shared daily P&L calculation with Redis cache.
   * Key: `daily:pnl:{userId}`, TTL: 60 seconds.
   * Other services (RiskGatekeeper, RiskCalculator) should use this
   * instead of independently querying the trades table.
   *
   * Usage from other services:
   *   import { PositionManagerService } from '../trading/services/position-manager.service';
   *   const dailyPnL = await positionManager.getDailyPnL(userId);
   */
  async getDailyPnL(userId: string): Promise<number> {
    const cacheKey = `daily:pnl:${userId}`;

    // Try Redis cache first
    try {
      const cached = await this.redis?.get(cacheKey);
      if (cached !== null && cached !== undefined) {
        const parsed = parseFloat(cached);
        if (!isNaN(parsed)) return parsed;
      }
    } catch { /* cache miss */ }

    // Cache miss — calculate from DB
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTrades = await this.prisma.trade.findMany({
      where: {
        userId,
        executedAt: { gte: todayStart },
        type: { in: ['EXIT', 'PARTIAL_EXIT'] },
      },
    });

    const dailyPnL = todayTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);

    // Store in Redis with 60-second TTL
    try {
      await this.redis?.set(cacheKey, dailyPnL.toString(), this.DAILY_PNL_TTL_MS);
    } catch { /* non-critical */ }

    return dailyPnL;
  }
}
