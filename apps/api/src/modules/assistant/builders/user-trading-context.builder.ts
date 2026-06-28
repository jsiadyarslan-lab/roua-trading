// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — User Trading Context Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// يجمع سياق صفقات المستخدم: المفتوحة + المغلقة + الإحصائيات اليومية
// يعتمد على TradingService الموجود (لا إعادة كتابة)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TradingService } from '../../trading/trading.service';
import { getSymbolMetadata, AssetClass } from '../../trading/services/symbol-metadata';
import {
  UserTradingContext,
  OpenPositionDTO,
  ClosedTradeDTO,
} from '../types/context.types';

@Injectable()
export class UserTradingContextBuilder {
  private readonly logger = new Logger(UserTradingContextBuilder.name);

  // RC-2: تتبع آخر خطأ — يُفحص من ContextAggregator بعد كل build()
  private _lastError: string | null = null;
  get lastError(): string | null { return this._lastError; }

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => TradingService))
    private readonly tradingService?: TradingService,
  ) {
    this.logger.log('📊 UserTradingContextBuilder initialized');
  }

  async build(userId: string): Promise<UserTradingContext> {
    // RC-2: إعادة التهيئة قبل كل build لتفادي تسرّب الأخطاء بين الطلبات
    this._lastError = null;
    const startTime = Date.now();
    try {
      // تنفيذ متوازي لجميع الاستعلامات
      const [openPositionsRaw, positionSummary, recentClosedTradesRaw, todayStats] =
        await Promise.all([
          this._getOpenPositionsSafe(userId),
          this._getPositionSummarySafe(userId),
          this._getRecentClosedTrades(userId, 10),
          this._getTodayStats(userId),
        ]);

      const openPositions: OpenPositionDTO[] = openPositionsRaw.map((p: any) =>
        this._mapOpenPosition(p),
      );

      const recentClosedTrades: ClosedTradeDTO[] = recentClosedTradesRaw.map((t: any) =>
        this._mapClosedTrade(t),
      );

      const durationMs = Date.now() - startTime;
      this.logger.debug(
        `✅ UserTradingContext built in ${durationMs}ms — ${openPositions.length} open, ${recentClosedTrades.length} recent`,
      );

      return {
        userId,
        openPositions,
        positionSummary: {
          count: positionSummary?.count ?? openPositions.length,
          totalValue: positionSummary?.totalValue ?? 0,
          totalUnrealizedPnl: positionSummary?.totalUnrealizedPnl ?? 0,
          totalRealizedPnl: positionSummary?.totalRealizedPnl ?? 0,
          usedMargin: positionSummary?.usedMargin ?? 0,
          paperBalance: positionSummary?.paperBalance ?? 0,
          displayedBalance: positionSummary?.displayedBalance ?? 0,
          riskExposurePercent: positionSummary?.riskExposurePercent ?? 0,
        },
        recentClosedTrades,
        todayStats,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to build UserTradingContext: ${error.message}`);
      return this._emptyContext(userId);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async _getOpenPositionsSafe(userId: string): Promise<any[]> {
    if (!this.tradingService) {
      this._lastError = 'tradingService unavailable';
      return [];
    }
    try {
      return await this.tradingService.getOpenPositions(userId);
    } catch (e: any) {
      // RC-2: سجّل الخطأ بدل ابتلاعه صامتاً — ContextAggregator سيفحص lastError
      this._lastError = `getOpenPositions: ${e?.message || 'unknown'}`;
      this.logger.warn(`getOpenPositions failed: ${this._lastError}`);
      return [];
    }
  }

  private async _getPositionSummarySafe(userId: string): Promise<any | null> {
    if (!this.tradingService) {
      this._lastError = 'tradingService unavailable';
      return null;
    }
    try {
      const summary = await this.tradingService.getPositionSummary(userId);
      // V458: getPositionSummary returns:
      //   { totalPositions, totalValue, totalUnrealizedPnl, totalRealizedPnl,
      //     usedMargin, paperBalance (= displayedBalance = dbBalance + usedMargin), positions }
      const usedMargin = Number(summary?.usedMargin) || 0;
      const displayedBalance = Number(summary?.paperBalance) || 0; // paperBalance = displayedBalance
      const paperBalanceDb = Math.max(0, displayedBalance - usedMargin);
      const riskExposurePercent = displayedBalance > 0
        ? (usedMargin / displayedBalance) * 100
        : 0;
      return {
        count: summary?.positions?.length ?? summary?.totalPositions ?? 0,
        totalValue: Number(summary?.totalValue) || 0,
        totalUnrealizedPnl: Number(summary?.totalUnrealizedPnl) || 0,
        totalRealizedPnl: Number(summary?.totalRealizedPnl) || 0,
        usedMargin,
        paperBalance: paperBalanceDb, // DB balance (without margin)
        displayedBalance, // DB balance + usedMargin
        riskExposurePercent,
      };
    } catch (e: any) {
      // RC-2: سجّل الخطأ — لا تبتلعه صامتاً
      this._lastError = `getPositionSummary: ${e?.message || 'unknown'}`;
      this.logger.warn(`getPositionSummary failed: ${this._lastError}`);
      return null;
    }
  }

  private async _getRecentClosedTrades(
    userId: string,
    limit: number,
  ): Promise<any[]> {
    try {
      // V458: استخدم Position (status=CLOSED) لأن Trade model لا يحتوي
      // على result/closedAt/pnlPercent. Position يحتوي على closeReason,
      // realizedPnl, exitPrice, closedAt.
      const positions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'CLOSED',
        },
        orderBy: { closedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          symbol: true,
          side: true,
          entryPrice: true,
          exitPrice: true,
          realizedPnl: true,
          closeReason: true,
          openedAt: true,
          closedAt: true,
        },
      });
      // حوّل إلى صيغة ClosedTradeDTO مع حساب pnlPercent وresult
      // RC-2: لو positions.length === 0 لكن الاستعلام نجح، لا نعتبره خطأ
      return positions.map((p: any) => {
        const entry = Number(p.entryPrice) || 0;
        const exit = p.exitPrice ? Number(p.exitPrice) : entry;
        const pnl = Number(p.realizedPnl) || 0;
        // pnlPercent = (exit-entry)/entry * 100 (للـ BUY) أو العكس للـ SELL
        let pnlPercent = 0;
        if (entry > 0) {
          if (p.side === 'BUY') {
            pnlPercent = ((exit - entry) / entry) * 100;
          } else {
            pnlPercent = ((entry - exit) / entry) * 100;
          }
        }
        const result: 'WIN' | 'LOSS' | 'BREAKEVEN' =
          pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN';
        return {
          id: p.id,
          symbol: p.symbol,
          side: p.side,
          entryPrice: entry,
          exitPrice: exit,
          pnl,
          pnlPercent,
          result,
          openedAt: p.openedAt,
          closedAt: p.closedAt,
          closeReason: p.closeReason,
        };
      });
    } catch (e: any) {
      // RC-2: سجّل الخطأ
      this._lastError = `getRecentClosedTrades: ${e?.message || 'unknown'}`;
      this.logger.warn(`getRecentClosedTrades failed: ${this._lastError}`);
      return [];
    }
  }

  private async _getTodayStats(userId: string): Promise<any> {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // V458: استخدم Position للإحصائيات (status CLOSED + closedAt اليوم)
      const [openedToday, closedToday] = await Promise.all([
        this.prisma.position.count({
          where: {
            userId,
            openedAt: { gte: startOfDay },
          },
        }),
        this.prisma.position.findMany({
          where: {
            userId,
            status: 'CLOSED',
            closedAt: { gte: startOfDay },
          },
          select: { realizedPnl: true },
        }),
      ]);

      // صنّف بناءً على realizedPnl
      const wins = closedToday.filter((t) => Number(t.realizedPnl) > 0).length;
      const losses = closedToday.filter((t) => Number(t.realizedPnl) < 0).length;
      const breakeven = closedToday.filter((t) => Number(t.realizedPnl) === 0).length;
      const netPnl = closedToday.reduce(
        (sum, t) => sum + (Number(t.realizedPnl) || 0),
        0,
      );
      const total = wins + losses + breakeven;
      const winRate = total > 0 ? (wins / total) * 100 : 0;

      return {
        tradesOpened: openedToday,
        tradesClosed: closedToday.length,
        wins,
        losses,
        breakeven,
        winRate,
        netPnl,
      };
    } catch (e: any) {
      // RC-2: سجّل الخطأ
      this._lastError = `getTodayStats: ${e?.message || 'unknown'}`;
      this.logger.warn(`getTodayStats failed: ${this._lastError}`);
      return {
        tradesOpened: 0,
        tradesClosed: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        winRate: 0,
        netPnl: 0,
      };
    }
  }

  private _mapOpenPosition(p: any): OpenPositionDTO {
    const entryPrice = Number(p.entryPrice) || 0;
    const currentPrice = Number(p.currentPrice) || entryPrice;
    const quantity = Number(p.quantity) || 0;
    const unrealizedPnl = Number(p.unrealizedPnl) || 0;
    const meta = getSymbolMetadata(p.symbol);
    const pnlPercent = entryPrice > 0 && quantity > 0
      ? (unrealizedPnl / (entryPrice * Math.abs(quantity))) * 100
      : 0;

    return {
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      entryPrice,
      currentPrice,
      quantity,
      unrealizedPnl,
      unrealizedPnlPercent: pnlPercent,
      stopLoss: p.stopLoss ? Number(p.stopLoss) : null,
      takeProfit: p.takeProfit ? Number(p.takeProfit) : null,
      openedAt: p.openedAt,
      durationMs: Date.now() - new Date(p.openedAt).getTime(),
      assetClass: meta.assetClass as any,
      source: p.source ?? null,
      briefId: p.briefId ?? null,
    };
  }

  private _mapClosedTrade(t: any): ClosedTradeDTO {
    const entryPrice = Number(t.entryPrice) || 0;
    const exitPrice = t.exitPrice ? Number(t.exitPrice) : undefined;
    const pnl = Number(t.pnl) || 0;
    const pnlPercent = Number(t.pnlPercent) || 0;
    const openedAt = new Date(t.openedAt);
    const closedAt = new Date(t.closedAt);

    return {
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      entryPrice,
      exitPrice,
      pnl,
      pnlPercent,
      result: t.result || 'BREAKEVEN',
      openedAt,
      closedAt,
      durationMs: closedAt.getTime() - openedAt.getTime(),
      closeReason: t.closeReason ?? null,
    };
  }

  private _emptyContext(userId: string): UserTradingContext {
    return {
      userId,
      openPositions: [],
      positionSummary: {
        count: 0,
        totalValue: 0,
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        usedMargin: 0,
        paperBalance: 0,
        displayedBalance: 0,
        riskExposurePercent: 0,
      },
      recentClosedTrades: [],
      todayStats: {
        tradesOpened: 0,
        tradesClosed: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        winRate: 0,
        netPnl: 0,
      },
    };
  }
}
