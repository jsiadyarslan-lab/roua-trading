import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MarketDataAggregatorService } from '../../analytics/aggregator.service';
import { PositionInfo, PortfolioSummary } from '../events/order.events';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: MarketDataAggregatorService,
  ) {
    this.logger.log('📊 Position Manager initialized — tracking across all exchanges');
  }

  /**
   * Get all open positions for a user
   * Aggregates positions from all linked exchanges
   */
  async getOpenPositions(userId: string): Promise<PositionInfo[]> {
    const positions = await this.prisma.position.findMany({
      where: { userId, status: 'OPEN' },
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

    // Calculate total unrealized P&L
    const unrealizedPnL = positions.reduce(
      (sum, p) => sum + p.unrealizedPnL,
      0,
    );

    // Calculate today's realized P&L
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
      openPositionsCount: positions.length,
      maxDrawdownPercent,
      unrealizedPnL,
      positions,
    };
  }
}
