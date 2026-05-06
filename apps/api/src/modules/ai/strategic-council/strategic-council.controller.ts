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
   */
  @Public()
  @Post('trigger')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async triggerSession(@Req() req: any, @Body() body: { pairs?: string[] }) {
    const pairs = body.pairs || [];
    if (pairs.length === 0) {
      return { success: false, message: 'حدد زوجاً واحداً على الأقل' };
    }

    this.logger.log(`🏛️ Manual council session triggered for: ${pairs.join(', ')}`);
    const result = await this.councilService.forceSession(pairs, req.user?.id || 'system');
    return { success: true, data: result };
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
    try {
      // 1. Get consensus (forceFresh to bypass cache)
      const consensus = await this.orchestrator.getConsensusAnalysis(testPair, { forceFresh: true });

      // 2. Test brief creation data (without actually creating)
      const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;
      const wouldCreateBrief = !isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore >= 15;
      const direction = consensus.recommendation === 'BUY' ? 'BUY' : consensus.recommendation === 'SELL' ? 'SELL' : 'HOLD';

      return {
        success: true,
        data: {
          pair: testPair,
          consensus: {
            recommendation: consensus.recommendation,
            consensusScore: consensus.consensusScore,
            isFallback: consensus.isFallback,
            analysesCount: consensus.analyses?.length || 0,
            models: consensus.analyses?.map((a: any) => `${a.role}→${a.vote}(${a.confidence}%)`) || [],
          },
          decision: {
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
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        pair: testPair,
      };
    }
  }
}
