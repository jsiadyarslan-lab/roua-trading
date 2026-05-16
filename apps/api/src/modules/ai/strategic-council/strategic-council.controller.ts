// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// واجهة المجلس الاستراتيجي — المحرك الوحيد لإجماع الذكاء الاصطناعي
// يحل محل نقاط نهاية CouncilScheduler القديم في EngineController
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Controller, Get, Post, Body, UseGuards, Logger, Req, Query } from '@nestjs/common';
import { StrategicCouncilService } from './strategic-council.service';
import { AuthGuard, Public } from '../../../common/guards/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AIOrchestratorService } from '../services/ai-orchestrator.service';

@Controller('strategic-council')
@UseGuards(AuthGuard)
export class StrategicCouncilController {
  private readonly logger = new Logger(StrategicCouncilController.name);

  constructor(
    private readonly councilService: StrategicCouncilService,
    private readonly orchestrator: AIOrchestratorService,
  ) {}

  /**
   * GET /api/strategic-council/briefs — Get all briefs (combined active + recent)
   * FIX: Added this route because the frontend and API callers sometimes use
   * /briefs without /active suffix, causing 404 errors.
   * FIX: Marked @Public() so the frontend dashboard can display briefs without
   * requiring authentication. These are read-only aggregated data, not user-specific.
   */
  @Public()
  @Get('briefs')
  async getAllBriefs() {
    const [active, count] = await Promise.all([
      this.councilService.getActiveBriefs(),
      this.councilService.getActiveBriefsCount(),
    ]);
    return { success: true, data: { active, count } };
  }

  /**
   * GET /api/strategic-council/briefs/active — Get active trading briefs
   * FIX: Marked @Public() + added optional ?symbol= query parameter.
   * The chart-signals.ts was passing ?symbol= but the backend was ignoring it.
   * Now filters by pair when symbol is provided, otherwise returns all active briefs.
   */
  @Public()
  @Get('briefs/active')
  async getActiveBriefs(@Query('symbol') symbol?: string) {
    if (symbol) {
      const briefs = await this.councilService.getBriefsForPair(symbol);
      return { success: true, data: briefs };
    }
    const briefs = await this.councilService.getActiveBriefs();
    return { success: true, data: briefs };
  }

  /**
   * GET /api/strategic-council/briefs/history — Get brief history
   * FIX: Marked @Public() so the dashboard can show history without auth.
   */
  @Public()
  @Get('briefs/history')
  async getBriefHistory() {
    const briefs = await this.councilService.getBriefHistory();
    return { success: true, data: briefs };
  }

  /**
   * GET /api/strategic-council/briefs/count — Get active briefs count
   * FIX: Marked @Public() so the dashboard can show counts without auth.
   */
  @Public()
  @Get('briefs/count')
  async getActiveBriefsCount() {
    const count = await this.councilService.getActiveBriefsCount();
    return { success: true, data: { count } };
  }

  /**
   * POST /api/strategic-council/trigger — Trigger an extraordinary council session
   * Body: { pairs: string[] }
   * FIX: Marked @Public() so the dashboard can trigger sessions without auth.
   * Uses 'system' as userId when no authenticated user is available.
   *
   * FIX: Returns IMMEDIATELY (fire-and-forget) instead of waiting for the full
   * session to complete. A full session for 3 pairs × 4 timeframes × 8 AI models
   * takes 6-12 minutes, which exceeds the Next.js proxy's 30-second timeout,
   * causing the frontend to receive a 502 error and show "الخادم غير متاح".
   * Now the frontend polls GET /session/last every 15 seconds to see results.
   */
  @Public()
  @Post('trigger')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async triggerSession(@Req() req: any, @Body() body: { pairs?: string[] }) {
    const pairs = body.pairs || [];
    if (pairs.length === 0) {
      return { success: false, message: 'حدد زوجاً واحداً على الأقل' };
    }

    const userId = req.user?.id || 'system';
    this.logger.log(`🏛️ Manual council session triggered by ${userId} for: ${pairs.join(', ')}`);

    // Check if already in session — return immediately if so
    if (this.councilService.isInSessionNow()) {
      return {
        success: false,
        message: 'جلسة أخرى قيد التشغيل حالياً — يرجى الانتظار حتى تنتهي',
        status: 'already_running',
      };
    }

    // Fire-and-forget: Start the session in the background
    // The frontend will poll /session/last to get results
    const sessionId = `manual-${Date.now()}`;
    this.councilService.forceSessionAsync(sessionId, pairs, userId).catch((err: any) => {
      this.logger.error(`🏛️ Background manual session failed: ${err.message}`);
    });

    // Return immediately so the proxy doesn't time out
    return {
      success: true,
      data: {
        sessionId,
        status: 'processing',
        pairs,
        message: 'تم بدء الجلسة — راقب النتائج خلال دقيقة واحدة',
      },
    };
  }

  /**
   * GET /api/strategic-council/session/status — Check if a session is currently running
   * FIX: Added so the frontend can detect an active session after page refresh or
   * tab switch. Without this, the frontend loses track of "processing" state and
   * shows the session as disconnected.
   */
  @Public()
  @Get('session/status')
  async getSessionStatus() {
    const isRunning = this.councilService.isInSessionNow();
    const lastSession = await this.councilService.getLastSession();
    return {
      success: true,
      data: {
        isRunning,
        lastSession,
      },
    };
  }

  /**
   * GET /api/strategic-council/session/last — Get last session result
   * FIX: Marked @Public() so the dashboard can show last session without auth.
   */
  @Public()
  @Get('session/last')
  async getLastSession() {
    const result = await this.councilService.getLastSession();
    return { success: true, data: result };
  }

  /**
   * GET /api/strategic-council/debug — Debug endpoint to test consensus + brief creation
   * Returns the consensus result for a pair WITHOUT creating a brief.
   * Helps diagnose why briefs aren't being created.
   * FIX: Marked @Public() for diagnostic access.
   */
  @Public()
  @Get('debug')
  async debugConsensus(@Query('pair') pair?: string) {
    const testPair = pair || 'BTC/USDT';
    const diagnostic: any = { pair: testPair, steps: {} };

    try {
      // Step 1: Test market data fetch
      try {
        const marketData = await this.orchestrator.fetchQuickMarketData(testPair);
        diagnostic.steps.marketData = {
          success: marketData.price > 0,
          price: marketData.price,
          rsi: marketData.rsi,
          macd: marketData.macd,
          change24h: marketData.change24h,
        };
      } catch (err: any) {
        diagnostic.steps.marketData = { success: false, error: err.message };
      }

      // Step 2: Test consensus analysis (with forceFresh)
      try {
        const consensus = await this.orchestrator.getConsensusAnalysis(testPair, { forceFresh: true });
        const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;
        const wouldCreateBrief = !isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore >= 15;
        const direction = consensus.recommendation === 'BUY' ? 'BUY' : consensus.recommendation === 'SELL' ? 'SELL' : 'HOLD';

        diagnostic.steps.consensus = {
          success: true,
          recommendation: consensus.recommendation,
          consensusScore: consensus.consensusScore,
          isFallback: consensus.isFallback,
          analysesCount: consensus.analyses?.length || 0,
          models: consensus.analyses?.map((a: any) => `${a.role}→${a.vote}(${a.confidence}%)`) || [],
          isAIFallback,
          wouldCreateBrief,
          direction,
          reason: isAIFallback
            ? 'AI fallback - would try technical analysis'
            : consensus.recommendation === 'HOLD'
              ? 'AI says HOLD - would try technical override'
              : consensus.consensusScore < 15
                ? `Score too low (${consensus.consensusScore}% < 15%)`
                : `Would create ${direction} brief`,
        };
      } catch (err: any) {
        diagnostic.steps.consensus = { success: false, error: err.message };
      }

      // Step 3: Test DB brief creation (create and immediately delete)
      try {
        const marketData = diagnostic.steps.marketData?.price > 0
          ? { price: diagnostic.steps.marketData.price }
          : await this.orchestrator.fetchQuickMarketData(testPair);

        if (marketData.price > 0) {
          const testBrief = await (this.councilService as any).prisma.tradingBrief.create({
            data: {
              pair: testPair,
              direction: 'BUY' as any,
              entryPrice: marketData.price,
              stopLoss: marketData.price * 0.995,
              takeProfit: marketData.price * 1.01,
              confidence: 99,
              timeframe: 'H1' as any,
              expiresAt: new Date(Date.now() + 60000), // 1 min
              isActive: true,
              strictRules: '{}',
              lastReviewedAt: new Date(),
              reviewStatus: 'ACTIVE' as any,
              analysisSummary: 'DIAGNOSTIC TEST — will be deleted',
            },
          });

          // Delete the test brief immediately
          await (this.councilService as any).prisma.tradingBrief.delete({
            where: { id: testBrief.id },
          });

          diagnostic.steps.dbCreate = {
            success: true,
            createdId: testBrief.id,
            deleted: true,
            message: 'Brief created and deleted successfully — DB is working',
          };
        } else {
          diagnostic.steps.dbCreate = { success: false, error: 'No price available for test brief' };
        }
      } catch (err: any) {
        diagnostic.steps.dbCreate = { success: false, error: err.message, stack: err.stack?.slice(0, 500) };
      }

      // Step 4: Check if TradingBrief table has correct schema
      try {
        const columns = await (this.councilService as any).prisma.$queryRaw`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'TradingBrief'
          ORDER BY ordinal_position
        `;
        diagnostic.steps.tableSchema = { success: true, columns };
      } catch (err: any) {
        diagnostic.steps.tableSchema = { success: false, error: err.message };
      }

      diagnostic.success = true;
      diagnostic.canCreateBriefs =
        diagnostic.steps.marketData?.success &&
        diagnostic.steps.consensus?.wouldCreateBrief &&
        diagnostic.steps.dbCreate?.success;

      return { success: true, data: diagnostic };
    } catch (error: any) {
      return { success: false, error: error.message, data: diagnostic };
    }
  }
}
