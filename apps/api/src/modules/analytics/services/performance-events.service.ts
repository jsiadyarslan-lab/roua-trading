// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Performance Events Service — Real-time Trade Tracking (V176)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Emits events whenever a trade is closed, enabling real-time
// performance monitoring. Replaces the need for dashboard polling
// and unifies Sharpe ratio / max drawdown calculations.
//
// Features:
// - Records trade closure events with running totals
// - Generates performance snapshots (cached in Redis)
// - Single source of truth for Sharpe / max drawdown calculations
// - Fail-safe: all errors are logged and never block trading

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface TradeClosedEvent {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  source: string; // 'smart_executor' | 'agent' | 'user_manual'
  pnl: number;
  pnlPercent: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  openedAt: Date;
  closedAt: Date;
  holdingDurationMs: number;
  closeReason: string;
  // Running totals after this trade
  runningDailyPnL: number;
  runningWinRate: number;
  runningTotalTrades: number;
}

export interface PerformanceSnapshot {
  userId: string;
  timestamp: Date;
  smartExecutor: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    dailyPnL: number;
    kellyPercent: number;
  };
  agent: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    dailyPnL: number;
    kellyPercent: number;
  };
  combined: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    dailyPnL: number;
    maxDrawdown: number;
    sharpeRatio: number | null;
  };
  autoStopActive: boolean;
  openPositions: number;
}

@Injectable()
export class PerformanceEventsService {
  private readonly logger = new Logger(PerformanceEventsService.name);
  private readonly EVENT_CHANNEL = 'performance:events';
  private readonly SNAPSHOT_PREFIX = 'performance:snapshot:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('📊 Performance Events Service initialized — real-time trade tracking');
  }

  /**
   * Record a trade closure event and update running totals.
   * Called by PositionMonitor when a position is closed.
   */
  async recordTradeClosed(params: {
    userId: string;
    symbol: string;
    side: string;
    source: string;
    pnl: number;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    openedAt: Date;
    closedAt: Date;
    closeReason: string;
  }): Promise<TradeClosedEvent> {
    const holdingDurationMs = params.closedAt.getTime() - params.openedAt.getTime();

    // Calculate running totals for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTrades = await this.prisma.trade.findMany({
      where: {
        userId: params.userId,
        executedAt: { gte: today },
        pnl: { not: null },
      },
      select: { pnl: true, source: true },
    });

    const dailyPnL = todayTrades.reduce((s, t) => s + Number(t.pnl || 0), 0);
    const winners = todayTrades.filter(t => Number(t.pnl || 0) > 0).length;
    const winRate = todayTrades.length > 0 ? (winners / todayTrades.length) * 100 : 0;

    const event: TradeClosedEvent = {
      userId: params.userId,
      symbol: params.symbol,
      side: params.side as 'BUY' | 'SELL',
      source: params.source,
      pnl: params.pnl,
      pnlPercent: params.entryPrice > 0 ? ((params.exitPrice - params.entryPrice) / params.entryPrice) * 100 : 0,
      entryPrice: params.entryPrice,
      exitPrice: params.exitPrice,
      quantity: params.quantity,
      openedAt: params.openedAt,
      closedAt: params.closedAt,
      holdingDurationMs,
      closeReason: params.closeReason,
      runningDailyPnL: Math.round(dailyPnL * 100) / 100,
      runningWinRate: Math.round(winRate * 10) / 10,
      runningTotalTrades: todayTrades.length,
    };

    // Publish event to Redis for real-time subscribers
    try {
      await this.redis.set(
        `${this.EVENT_CHANNEL}:last:${params.userId}`,
        JSON.stringify(event),
        3600000, // 1 hour TTL
      );
    } catch { /* non-critical */ }

    // Update performance snapshot
    try {
      await this._updateSnapshot(params.userId);
    } catch (err: any) {
      this.logger.debug(`Failed to update snapshot for user ${params.userId}: ${err.message}`);
    }

    this.logger.debug(
      `📊 Trade closed: ${params.symbol} ${params.side} PnL=${params.pnl.toFixed(2)} (${params.source}) — daily PnL: ${dailyPnL.toFixed(2)}`
    );

    return event;
  }

  /**
   * Get the latest performance snapshot for a user.
   * Returns cached snapshot or generates a fresh one.
   */
  async getPerformanceSnapshot(userId: string): Promise<PerformanceSnapshot> {
    // Try cache first
    try {
      const cached = await this.redis.get(`${this.SNAPSHOT_PREFIX}${userId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch { /* non-critical */ }

    // Generate fresh snapshot
    return this._updateSnapshot(userId);
  }

  /**
   * Get recent trade events for a user (last 24h).
   */
  async getRecentTradeEvents(userId: string, limit: number = 50): Promise<TradeClosedEvent[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        executedAt: { gte: since },
        pnl: { not: null },
      },
      orderBy: { executedAt: 'desc' },
      take: limit,
      select: {
        symbol: true,
        side: true,
        source: true,
        pnl: true,
        price: true,
        quantity: true,
        executedAt: true,
      },
    });

    return trades.map(t => ({
      userId,
      symbol: t.symbol,
      side: t.side as 'BUY' | 'SELL',
      source: t.source || 'unknown',
      pnl: Number(t.pnl || 0),
      pnlPercent: 0, // Would need entry/exit prices from position
      entryPrice: Number(t.price || 0),
      exitPrice: Number(t.price || 0),
      quantity: Number(t.quantity || 0),
      openedAt: t.executedAt,
      closedAt: t.executedAt,
      holdingDurationMs: 0,
      closeReason: 'unknown',
      runningDailyPnL: 0,
      runningWinRate: 0,
      runningTotalTrades: 0,
    }));
  }

  /**
   * Generate and cache a performance snapshot for a user.
   * SINGLE SOURCE OF TRUTH for Sharpe ratio and max drawdown.
   */
  private async _updateSnapshot(userId: string): Promise<PerformanceSnapshot> {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch 30-day trades by source
    const [seTrades, agentTrades, allTrades, todayTrades, openPositions] = await Promise.all([
      this.prisma.trade.findMany({
        where: { userId, source: { in: ['smart_executor', 'auto_paper'] }, executedAt: { gte: since30d }, pnl: { not: null } },
        select: { pnl: true },
      }),
      this.prisma.trade.findMany({
        where: { userId, source: 'agent', executedAt: { gte: since30d }, pnl: { not: null } },
        select: { pnl: true },
      }),
      this.prisma.trade.findMany({
        where: { userId, executedAt: { gte: since30d }, pnl: { not: null } },
        select: { pnl: true },
      }),
      this.prisma.trade.findMany({
        where: { userId, executedAt: { gte: today }, pnl: { not: null } },
        select: { pnl: true, source: true },
      }),
      this.prisma.position.count({
        where: { userId, status: 'OPEN', entryPrice: { gt: 0 } },
      }),
    ]);

    const calcStats = (trades: { pnl: any }[]) => {
      const pnls = trades.map(t => Number(t.pnl || 0));
      const total = pnls.reduce((s, p) => s + p, 0);
      const wins = pnls.filter(p => p > 0).length;
      return {
        totalTrades: pnls.length,
        winRate: pnls.length > 0 ? Math.round((wins / pnls.length) * 1000) / 10 : 0,
        totalPnL: Math.round(total * 100) / 100,
      };
    };

    const seStats = calcStats(seTrades);
    const agentStats = calcStats(agentTrades);
    const allStats = calcStats(allTrades);
    const dailyPnL = todayTrades.reduce((s, t) => s + Number(t.pnl || 0), 0);

    // ── Max Drawdown (single unified calculation) ──
    let peak = 0, maxDrawdown = 0, cumPnl = 0;
    const allPnls = allTrades.map(t => Number(t.pnl || 0));
    for (const pnl of allPnls) {
      cumPnl += pnl;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // ── Sharpe Ratio (single unified calculation) ──
    let sharpeRatio: number | null = null;
    if (allPnls.length >= 10) {
      const mean = allPnls.reduce((s, p) => s + p, 0) / allPnls.length;
      const variance = allPnls.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / allPnls.length;
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? Math.round((mean / stdDev) * Math.sqrt(252) * 100) / 100 : null;
    }

    // ── Auto-stop check ──
    const portfolio = await this.prisma.portfolio.findFirst({ where: { userId } });
    const portfolioValue = Number(portfolio?.totalValue || 10000);
    const dailyPnLPercent = portfolioValue > 0 ? dailyPnL / portfolioValue : 0;
    const autoStopActive = dailyPnLPercent <= -0.05;

    // ── Kelly criterion per source ──
    const calcKelly = (trades: { pnl: any }[]) => {
      const pnls = trades.map(t => Number(t.pnl || 0));
      const wins = pnls.filter(p => p > 0);
      const losses = pnls.filter(p => p < 0);
      if (pnls.length < 20 || losses.length === 0) return 2; // default safe 2%
      const winRate = wins.length / pnls.length;
      const avgWin = wins.reduce((s, p) => s + p, 0) / wins.length;
      const avgLoss = Math.abs(losses.reduce((s, p) => s + p, 0) / losses.length);
      const R = avgWin / avgLoss;
      return Math.max(0, Math.min(25, (winRate - (1 - winRate) / R) * 50)); // Half Kelly
    };

    const snapshot: PerformanceSnapshot = {
      userId,
      timestamp: new Date(),
      smartExecutor: {
        ...seStats,
        dailyPnL: Math.round(todayTrades.filter(t => t.source === 'smart_executor' || t.source === 'auto_paper').reduce((s, t) => s + Number(t.pnl || 0), 0) * 100) / 100,
        kellyPercent: calcKelly(seTrades),
      },
      agent: {
        ...agentStats,
        dailyPnL: Math.round(todayTrades.filter(t => t.source === 'agent').reduce((s, t) => s + Number(t.pnl || 0), 0) * 100) / 100,
        kellyPercent: calcKelly(agentTrades),
      },
      combined: {
        ...allStats,
        dailyPnL: Math.round(dailyPnL * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        sharpeRatio,
      },
      autoStopActive,
      openPositions,
    };

    // Cache for 5 minutes
    try {
      await this.redis.set(
        `${this.SNAPSHOT_PREFIX}${userId}`,
        JSON.stringify(snapshot),
        300000, // 5 min
      );
    } catch { /* non-critical */ }

    return snapshot;
  }
}
