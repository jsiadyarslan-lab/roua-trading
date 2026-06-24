// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Learning Context Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// يجمع سياق حلقة التعلم: TradeJournal + VoteAccuracy + SystemMemory
// يعتمد على council-intelligence services الموجودة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TradeJournalService } from '../../ai/council-intelligence/trade-journal.service';
import { CouncilVoteAccuracyService } from '../../ai/council-intelligence/council-vote-accuracy.service';
import { SystemMemoryService } from '../../ai/council-intelligence/system-memory.service';
import {
  LearningContext,
  JournalEntryDTO,
  VoteAccuracyDTO,
  MemoryDTO,
} from '../types/context.types';

@Injectable()
export class LearningContextBuilder {
  private readonly logger = new Logger(LearningContextBuilder.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tradeJournal?: TradeJournalService,
    @Optional() private readonly voteAccuracy?: CouncilVoteAccuracyService,
    @Optional() private readonly systemMemory?: SystemMemoryService,
  ) {
    this.logger.log('🧠 LearningContextBuilder initialized');
  }

  async build(userId: string, symbol?: string): Promise<LearningContext> {
    const startTime = Date.now();
    try {
      const [recentJournalsRaw, tradeStatsRaw, voteAccuracyRaw, memorySummary] =
        await Promise.all([
          this._getRecentJournalsSafe(userId, 20),
          this._getTradeStatsSafe(userId, 30),
          this._getVoteAccuracySafe(userId),
          this._getMemoryContextSafe(userId, symbol),
        ]);

      const recentJournalEntries: JournalEntryDTO[] = recentJournalsRaw.map((j: any) =>
        this._mapJournal(j),
      );

      const activeMemories: MemoryDTO[] = await this._getActiveMemories(userId, symbol);

      const voteAccuracy: VoteAccuracyDTO[] = voteAccuracyRaw.map((v: any) => ({
        roleId: v.roleId ?? v.role ?? 'unknown',
        totalVotes: Number(v.totalVotes) || 0,
        correctVotes: Number(v.correctVotes) || 0,
        accuracyPercent: Number(v.accuracyPercent ?? v.accuracy) || 0,
        weight: Number(v.weight) || 1,
      }));

      const durationMs = Date.now() - startTime;
      this.logger.debug(
        `✅ LearningContext built in ${durationMs}ms — ${recentJournalEntries.length} journals, ${activeMemories.length} memories`,
      );

      return {
        recentJournalEntries,
        tradeStats: this._normalizeTradeStats(tradeStatsRaw),
        voteAccuracy,
        activeMemories,
        memorySummary,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to build LearningContext: ${error.message}`);
      return {
        recentJournalEntries: [],
        tradeStats: this._emptyTradeStats(),
        voteAccuracy: [],
        activeMemories: [],
        memorySummary: '',
      };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async _getRecentJournalsSafe(userId: string, limit: number): Promise<any[]> {
    if (!this.tradeJournal) return [];
    try {
      return await this.tradeJournal.getRecentJournals(userId, limit);
    } catch (e) {
      this.logger.warn(`getRecentJournals failed: ${e.message}`);
      return [];
    }
  }

  private async _getTradeStatsSafe(userId: string, days: number): Promise<any | null> {
    if (!this.tradeJournal) return null;
    try {
      return await this.tradeJournal.getTradeStats(userId, days);
    } catch (e) {
      this.logger.warn(`getTradeStats failed: ${e.message}`);
      return null;
    }
  }

  private async _getVoteAccuracySafe(userId: string): Promise<any[]> {
    if (!this.voteAccuracy) return [];
    try {
      return await this.voteAccuracy.getAccuracyReport(userId);
    } catch (e) {
      this.logger.warn(`getAccuracyReport failed: ${e.message}`);
      return [];
    }
  }

  private async _getMemoryContextSafe(
    userId: string,
    symbol?: string,
  ): Promise<string> {
    if (!this.systemMemory) return '';
    try {
      return await this.systemMemory.getMemoryContext(userId, symbol);
    } catch (e) {
      this.logger.warn(`getMemoryContext failed: ${e.message}`);
      return '';
    }
  }

  private async _getActiveMemories(
    userId: string,
    symbol?: string,
  ): Promise<MemoryDTO[]> {
    try {
      const where: any = {
        isActive: true,
        OR: [{ userId }, { userId: null }],
      };
      if (symbol) where.symbol = symbol;

      const memories = await this.prisma.systemMemory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          type: true,
          content: true,
          symbol: true,
          confidence: true,
          createdAt: true,
          validUntil: true,
        },
      });

      return memories.map((m: any) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        symbol: m.symbol,
        confidence: Number(m.confidence) || 50,
        createdAt: new Date(m.createdAt),
        validUntil: m.validUntil ? new Date(m.validUntil) : null,
      }));
    } catch (e) {
      this.logger.warn(`getActiveMemories failed: ${e.message}`);
      return [];
    }
  }

  private _mapJournal(j: any): JournalEntryDTO {
    return {
      id: j.id,
      symbol: j.symbol,
      side: j.side,
      entryPrice: Number(j.entryPrice) || 0,
      exitPrice: j.exitPrice ? Number(j.exitPrice) : undefined,
      pnl: j.pnl ? Number(j.pnl) : undefined,
      pnlPercent: j.pnlPercent ? Number(j.pnlPercent) : undefined,
      result: j.result,
      councilVotes: j.councilVotes ?? {},
      consensusScore: Number(j.consensusScore) || 0,
      regimeAtEntry: j.regimeAtEntry,
      aiReasoning: j.aiReasoning,
      source: j.source,
      createdAt: new Date(j.createdAt ?? j.timestamp ?? Date.now()),
    };
  }

  private _normalizeTradeStats(stats: any | null) {
    if (!stats) return this._emptyTradeStats();

    const totalTrades = Number(stats.totalTrades ?? stats.total ?? 0) || 0;
    const wins = Number(stats.wins ?? 0) || 0;
    const losses = Number(stats.losses ?? 0) || 0;
    const breakeven = Number(stats.breakeven ?? 0) || 0;
    const totalPnl = Number(stats.totalPnl ?? stats.netPnl ?? 0) || 0;
    const avgWin = Number(stats.avgWin ?? 0) || 0;
    const avgLoss = Number(stats.avgLoss ?? 0) || 0;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor =
      avgLoss !== 0 && losses > 0
        ? Math.abs((wins * avgWin) / (losses * avgLoss))
        : wins > 0
        ? Infinity
        : 0;

    return {
      totalTrades,
      wins,
      losses,
      breakeven,
      winRate: Math.round(winRate * 10) / 10,
      totalPnl: Math.round(totalPnl * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: profitFactor === Infinity ? 99 : Math.round(profitFactor * 100) / 100,
      bestPair: stats.bestPair,
      worstPair: stats.worstPair,
    };
  }

  private _emptyTradeStats() {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      totalPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
    };
  }
}
