// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Trade Journal Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "مجلة التداول" — تسجّل كل صفقة من الألف إلى الياء:
// من قرر، ماذا قال، ماذا حدث، من كان على حق
//
// V185: هذا هو الأساس لكل ميزات التعلم
// بدون مجلة = بدون بيانات = بدون تعلم
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

export interface CouncilVoteSnapshot {
  tech?: string;
  sent?: string;
  risk?: string;
  macro?: string;
  pattern?: string;
  exec?: string;
  diverge?: string;
  scenario?: string;
  'prediction-market'?: string;
  scanner?: string;
}

export interface JournalEntry {
  userId: string;
  positionId?: string;
  orderId?: string;
  briefId?: string;
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  pnl?: number;
  pnlPercent?: number;
  result?: 'WIN' | 'LOSS' | 'BREAKEVEN';
  councilVotes: CouncilVoteSnapshot;
  consensusScore: number;
  regimeAtEntry?: string;
  newsContext?: string[];
  rejectionReasons?: string[];
  aiReasoning?: Record<string, string>;
  source?: string;
  isPaper?: boolean;
}

@Injectable()
export class TradeJournalService {
  private readonly logger = new Logger(TradeJournalService.name);
  private readonly REDIS_JOURNAL_QUEUE = 'trade-journal:queue';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('📖 Trade Journal Service initialized — سجل كل صفقة');
  }

  /**
   * Record a trade when it's OPENED (before we know the result)
   * Called by SmartExecutor / Agent when a position is opened
   */
  async recordTradeOpen(entry: JournalEntry): Promise<string | null> {
    try {
      const journal = await this.prisma.tradeJournal.create({
        data: {
          userId: entry.userId,
          positionId: entry.positionId,
          orderId: entry.orderId,
          briefId: entry.briefId,
          symbol: entry.symbol,
          side: entry.side,
          entryPrice: entry.entryPrice,
          exitPrice: entry.exitPrice,
          quantity: entry.quantity,
          pnl: entry.pnl,
          pnlPercent: entry.pnlPercent,
          result: entry.result,
          councilVotes: JSON.stringify(entry.councilVotes),
          consensusScore: entry.consensusScore,
          regimeAtEntry: entry.regimeAtEntry,
          newsContext: JSON.stringify(entry.newsContext || []),
          rejectionReasons: JSON.stringify(entry.rejectionReasons || []),
          aiReasoning: JSON.stringify(entry.aiReasoning || {}),
          source: entry.source || 'COUNCIL',
          isPaper: entry.isPaper ?? true,
          openedAt: new Date(),
        },
      });

      this.logger.log(`📖 Trade OPEN recorded: ${entry.symbol} ${entry.side} | Journal=${journal.id}`);
      return journal.id;
    } catch (error) {
      this.logger.error(`Failed to record trade open: ${error.message}`);
      return null;
    }
  }

  /**
   * Update a trade when it's CLOSED (we now know the result)
   * Called by PositionMonitor when a position is closed
   */
  async recordTradeClose(
    positionId: string,
    exitPrice: number,
    pnl: number,
    pnlPercent: number,
    extra?: { lesson?: string; tags?: string[] },
  ): Promise<void> {
    try {
      // Find the journal entry by positionId
      const journal = await this.prisma.tradeJournal.findFirst({
        where: { positionId },
        orderBy: { createdAt: 'desc' },
      });

      if (!journal) {
        this.logger.warn(`No journal entry found for position ${positionId}`);
        return;
      }

      const result = this._classifyResult(pnlPercent);
      const wasRight = this._evaluateCouncilVotes(journal, result, pnlPercent);

      await this.prisma.tradeJournal.update({
        where: { id: journal.id },
        data: {
          exitPrice,
          pnl,
          pnlPercent,
          result,
          wasRight: JSON.stringify(wasRight),
          lesson: extra?.lesson || this._generateLesson(journal, result, pnlPercent),
          tags: JSON.stringify(extra?.tags || []),
          closedAt: new Date(),
          durationMs: Date.now() - new Date(journal.openedAt).getTime(),
        },
      });

      this.logger.log(
        `📖 Trade CLOSE recorded: ${journal.symbol} ${journal.side} | ` +
        `Result=${result} | PnL=${pnlPercent.toFixed(2)}% | Journal=${journal.id}`,
      );

      // After closing, trigger vote accuracy update
      await this._triggerVoteAccuracyUpdate(journal, wasRight, result);
    } catch (error) {
      this.logger.error(`Failed to record trade close: ${error.message}`);
    }
  }

  /**
   * Find journal entry by brief ID (for linking council → execution → result)
   */
  async findByBriefId(briefId: string): Promise<any | null> {
    try {
      return await this.prisma.tradeJournal.findFirst({
        where: { briefId },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      return null;
    }
  }

  /**
   * Get recent journals for a user
   */
  async getRecentJournals(userId: string, limit = 20): Promise<any[]> {
    return await this.prisma.tradeJournal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get trade statistics for a user
   */
  async getTradeStats(userId: string, days = 30): Promise<{
    totalTrades: number;
    wins: number;
    losses: number;
    breakevens: number;
    winRate: number;
    avgPnl: number;
    bestTrade: number;
    worstTrade: number;
    avgHoldingTimeMs: number;
    bySymbol: Record<string, { trades: number; winRate: number }>;
    byRegime: Record<string, { trades: number; winRate: number }>;
    bySource: Record<string, { trades: number; winRate: number }>;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const journals = await this.prisma.tradeJournal.findMany({
      where: {
        userId,
        closedAt: { not: null },
        createdAt: { gte: since },
      },
    });

    const closed = journals.filter(j => j.result);
    const wins = closed.filter(j => j.result === 'WIN').length;
    const losses = closed.filter(j => j.result === 'LOSS').length;
    const breakevens = closed.filter(j => j.result === 'BREAKEVEN').length;

    const pnlValues = closed.map(j => Number(j.pnlPercent || 0)).filter(v => !isNaN(v));

    const bySymbol: Record<string, { trades: number; winRate: number }> = {};
    const byRegime: Record<string, { trades: number; winRate: number }> = {};
    const bySource: Record<string, { trades: number; winRate: number }> = {};

    for (const j of closed) {
      // By symbol
      if (!bySymbol[j.symbol]) bySymbol[j.symbol] = { trades: 0, winRate: 0 };
      bySymbol[j.symbol].trades++;
      if (j.result === 'WIN') bySymbol[j.symbol].winRate++;

      // By regime
      const regime = j.regimeAtEntry || 'UNKNOWN';
      if (!byRegime[regime]) byRegime[regime] = { trades: 0, winRate: 0 };
      byRegime[regime].trades++;
      if (j.result === 'WIN') byRegime[regime].winRate++;

      // By source
      const source = j.source || 'UNKNOWN';
      if (!bySource[source]) bySource[source] = { trades: 0, winRate: 0 };
      bySource[source].trades++;
      if (j.result === 'WIN') bySource[source].winRate++;
    }

    // Convert winRate counts to percentages
    for (const key of Object.keys(bySymbol)) {
      bySymbol[key].winRate = bySymbol[key].trades > 0
        ? Math.round((bySymbol[key].winRate / bySymbol[key].trades) * 100) : 0;
    }
    for (const key of Object.keys(byRegime)) {
      byRegime[key].winRate = byRegime[key].trades > 0
        ? Math.round((byRegime[key].winRate / byRegime[key].trades) * 100) : 0;
    }
    for (const key of Object.keys(bySource)) {
      bySource[key].winRate = bySource[key].trades > 0
        ? Math.round((bySource[key].winRate / bySource[key].trades) * 100) : 0;
    }

    return {
      totalTrades: closed.length,
      wins,
      losses,
      breakevens,
      winRate: closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0,
      avgPnl: pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0,
      bestTrade: pnlValues.length > 0 ? Math.max(...pnlValues) : 0,
      worstTrade: pnlValues.length > 0 ? Math.min(...pnlValues) : 0,
      avgHoldingTimeMs: closed.length > 0
        ? closed.reduce((sum, j) => sum + (j.durationMs || 0), 0) / closed.length : 0,
      bySymbol,
      byRegime,
      bySource,
    };
  }

  // ── Private Methods ──

  private _classifyResult(pnlPercent: number): 'WIN' | 'LOSS' | 'BREAKEVEN' {
    if (pnlPercent > 0.5) return 'WIN';
    if (pnlPercent < -0.5) return 'LOSS';
    return 'BREAKEVEN';
  }

  private _evaluateCouncilVotes(
    journal: any,
    result: string,
    pnlPercent: number,
  ): Record<string, boolean> {
    try {
      const votes: CouncilVoteSnapshot = JSON.parse(journal.councilVotes || '{}');
      const wasRight: Record<string, boolean> = {};
      const actualDirection = pnlPercent > 0 ? journal.side : (journal.side === 'BUY' ? 'SELL' : 'BUY');

      for (const [roleId, vote] of Object.entries(votes)) {
        if (result === 'BREAKEVEN') {
          wasRight[roleId] = false; // Neutral — nobody was clearly right
        } else if (result === 'WIN') {
          wasRight[roleId] = vote === journal.side; // Voted same as trade direction
        } else {
          wasRight[roleId] = vote !== journal.side; // Voted opposite = was right to object
        }
      }

      return wasRight;
    } catch {
      return {};
    }
  }

  private _generateLesson(journal: any, result: string, pnlPercent: number): string {
    const direction = journal.side === 'BUY' ? 'شراء' : 'بيع';
    const symbol = journal.symbol;

    if (result === 'WIN') {
      return `صفقة ${direction} ${symbol} ناجحة (+${pnlPercent.toFixed(2)}%) — المجلس كان متفقاً على هذا الاتجاه`;
    } else if (result === 'LOSS') {
      return `صفقة ${direction} ${symbol} خاسرة (${pnlPercent.toFixed(2)}%) — تحتاج مراجعة الإشارات المضللة`;
    } else {
      return `صفقة ${direction} ${symbol} عند نقطة التعادل — لا درس واضح`;
    }
  }

  private async _triggerVoteAccuracyUpdate(
    journal: any,
    wasRight: Record<string, boolean>,
    result: string,
  ): Promise<void> {
    try {
      // Queue the accuracy update in Redis for async processing
      await this.redis.set(
        `council-accuracy:update:${journal.id}`,
        JSON.stringify({
          userId: journal.userId,
          journalId: journal.id,
          symbol: journal.symbol,
          regimeAtEntry: journal.regimeAtEntry,
          wasRight,
          result,
          timestamp: Date.now(),
        }),
        300 * 1000, // 5 min TTL for queue processing
      );
    } catch {
      // Non-critical — accuracy update can be deferred
    }
  }
}
