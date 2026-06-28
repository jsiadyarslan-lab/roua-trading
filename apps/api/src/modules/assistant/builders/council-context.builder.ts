// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Council Context Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// يجمع سياق المجلس الاستراتيجي: briefs نشطة + حديثة + إحصائيات الإجماع
// يعتمد على StrategicCouncilService الموجود
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StrategicCouncilService } from '../../ai/strategic-council/strategic-council.service';
import { CouncilContext, CouncilBriefDTO } from '../types/context.types';

@Injectable()
export class CouncilContextBuilder {
  private readonly logger = new Logger(CouncilContextBuilder.name);

  // RC-2: تتبع آخر خطأ
  private _lastError: string | null = null;
  get lastError(): string | null { return this._lastError; }

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => StrategicCouncilService))
    private readonly councilService?: StrategicCouncilService,
  ) {
    this.logger.log('🏛️ CouncilContextBuilder initialized');
  }

  async build(userId: string, language?: string): Promise<CouncilContext> {
    // RC-2: إعادة التهيئة قبل كل build
    this._lastError = null;
    const startTime = Date.now();
    try {
      // استخدم getActiveBriefs من StrategicCouncilService
      const activeBriefsRaw = await this._getActiveBriefsSafe(userId, language);
      const recentBriefsRaw = await this._getRecentBriefsSafe(userId, 10);

      const activeBriefs: CouncilBriefDTO[] = activeBriefsRaw.map((b: any) =>
        this._mapBrief(b),
      );
      const recentBriefs: CouncilBriefDTO[] = recentBriefsRaw.map((b: any) =>
        this._mapBrief(b),
      );

      // إحصائيات الإجماع
      const consensusStats = this._calculateConsensusStats(activeBriefs);

      const durationMs = Date.now() - startTime;
      this.logger.debug(
        `✅ CouncilContext built in ${durationMs}ms — ${activeBriefs.length} active, ${recentBriefs.length} recent`,
      );

      return {
        activeBriefs,
        recentBriefs,
        consensusStats,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to build CouncilContext: ${error.message}`);
      return { activeBriefs: [], recentBriefs: [], consensusStats: this._emptyStats() };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async _getActiveBriefsSafe(userId: string, language?: string): Promise<any[]> {
    if (!this.councilService) {
      this._lastError = 'councilService unavailable';
      return [];
    }
    try {
      return await this.councilService.getActiveBriefs(userId, language);
    } catch (e: any) {
      // RC-2: سجّل الخطأ
      this._lastError = `getActiveBriefs: ${e?.message || 'unknown'}`;
      this.logger.warn(`getActiveBriefs failed: ${this._lastError}`);
      return [];
    }
  }

  private async _getRecentBriefsSafe(userId: string, limit: number): Promise<any[]> {
    try {
      // V458: TradingBrief schema (من prisma/schema.prisma):
      //   pair (وليس symbol), direction, entryPrice, stopLoss, takeProfit,
      //   confidence (Int 0-100), timeframe, issuedAt, expiresAt, isActive,
      //   strictRules (JSON string), reviewStatus (وليس status),
      //   analysisSummary (وليس summary), createdAt, updatedAt
      // ملاحظة: consensusScore, expectedRr, councilVotes, aiReasoning, rejectionReasons
      // ليست في TradingBrief — هذه تأتي من TradeJournal أو تُحسب لاحقًا.
      // RC-11: استخدم فحص صارم لـ userId — empty string ('') يعتبر falsy في `if (userId)`
      // لكنه يُمرّر للـ Prisma كـ '' فيتجاوز الفلتر. يجب فحص null/undefined فقط.
      const where: any = {};
      if (userId !== undefined && userId !== null && userId !== '') {
        where.userId = userId;
      }

      return await this.prisma.tradingBrief.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          pair: true,
          direction: true,
          confidence: true,
          timeframe: true,
          issuedAt: true,
          expiresAt: true,
          isActive: true,
          strictRules: true,
          reviewStatus: true,
          analysisSummary: true,
          entryPrice: true,
          stopLoss: true,
          takeProfit: true,
          createdAt: true,
          userId: true,
        },
      });
    } catch (e: any) {
      // RC-2: سجّل الخطأ
      this._lastError = `getRecentBriefsSafe: ${e?.message || 'unknown'}`;
      this.logger.warn(`getRecentBriefsSafe failed: ${this._lastError}`);
      return [];
    }
  }

  private _mapBrief(b: any): CouncilBriefDTO {
    // V458: التأقلم مع schema الفعلي لـ TradingBrief
    // strictRules و analysisSummary stored as JSON strings
    let parsedStrictRules: Record<string, any> | undefined;
    if (b.strictRules) {
      try {
        parsedStrictRules =
          typeof b.strictRules === 'string'
            ? JSON.parse(b.strictRules)
            : b.strictRules;
      } catch {
        parsedStrictRules = undefined;
      }
    }

    return {
      id: b.id,
      symbol: b.pair ?? b.symbol, // pair في schema
      direction: b.direction,
      confidence: Number(b.confidence) || 0,
      consensusScore: 0, // غير موجود في TradingBrief — يُحسب لاحقًا من councilVotes
      timeframe: b.timeframe ?? 'unknown',
      createdAt: new Date(b.createdAt ?? b.issuedAt),
      status: b.reviewStatus ?? b.isActive ? 'ACTIVE' : 'INACTIVE',
      strictRules: parsedStrictRules,
      summary: b.analysisSummary ?? b.summary,
    };
  }

  private _calculateConsensusStats(briefs: CouncilBriefDTO[]) {
    const bullish = briefs.filter((b) => b.direction === 'BUY').length;
    const bearish = briefs.filter((b) => b.direction === 'SELL').length;
    const neutral = briefs.filter((b) => b.direction === 'NEUTRAL').length;
    const avgConfidence =
      briefs.length > 0
        ? briefs.reduce((sum, b) => sum + b.confidence, 0) / briefs.length
        : 0;
    const avgConsensus =
      briefs.length > 0
        ? briefs.reduce((sum, b) => sum + b.consensusScore, 0) / briefs.length
        : 0;

    return {
      bullishCount: bullish,
      bearishCount: bearish,
      neutralCount: neutral,
      avgConfidence: Math.round(avgConfidence * 10) / 10,
      avgConsensus: Math.round(avgConsensus * 10) / 10,
    };
  }

  private _emptyStats() {
    return {
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      avgConfidence: 0,
      avgConsensus: 0,
    };
  }
}
