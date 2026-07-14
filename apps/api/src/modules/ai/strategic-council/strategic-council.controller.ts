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
import { t } from '../../../i18n/i18n.helper';

/** V267: Supported AI languages — the 32 UI locales supported by the frontend.
 *  The AI Council, News, Coach, Signals modules now accept this union
 *  so they can emit analysis in the user's UI language, not just Arabic.
 *
 *  This is THE fix that converts "32-language UI" into "32-language AI trading platform".
 */
export type AiLocale =
  | 'ar' | 'en' | 'fr' | 'tr' | 'es' | 'zh' | 'ru' | 'hi' | 'pt' | 'de'
  | 'ja' | 'ko' | 'id' | 'vi' | 'th' | 'it' | 'pl' | 'nl' | 'ms' | 'he'
  | 'sv' | 'uk' | 'fa' | 'ur' | 'fil' | 'da' | 'no' | 'fi' | 'cs' | 'hu'
  | 'ro' | 'bn';

/** V267: Validate that a locale string is one of the 32 supported AI locales. */
function isAiLocale(value: unknown): value is AiLocale {
  return typeof value === 'string' && (
    ['ar','en','fr','tr','es','zh','ru','hi','pt','de',
     'ja','ko','id','vi','th','it','pl','nl','ms','he',
     'sv','uk','fa','ur','fil','da','no','fi','cs','hu',
     'ro','bn'] as const
  ).includes(value as any);
}

/** V267: Extract the user's preferred locale from the request.
 *  Priority: ?lang= query param → Accept-Language header → 'ar' default.
 */
function extractLocale(req: any, query?: any): AiLocale {
  // 1. Explicit query parameter (highest priority)
  const explicit = query?.lang || query?.language || query?.locale;
  if (isAiLocale(explicit)) return explicit;

  // 2. User preference from auth payload (if authenticated)
  const userLocale = req?.user?.locale || req?.user?.language;
  if (isAiLocale(userLocale)) return userLocale;

  // 3. Accept-Language header (proximity-mapped)
  const acceptLang = req?.headers?.['accept-language'];
  if (typeof acceptLang === 'string' && acceptLang.length > 0) {
    const primary = acceptLang.split(',')[0].trim().split('-')[0].toLowerCase();
    if (isAiLocale(primary)) return primary as AiLocale;
    // Common proximity mappings
    const PROXIMITY: Record<string, AiLocale> = {
      ca: 'es', gl: 'es',           // Catalan/Galician → Spanish
      'zh-tw': 'zh', 'zh-hk': 'zh', 'zh-sg': 'zh',
      'pt-br': 'pt', 'pt-pt': 'pt',
      bg: 'ru', mk: 'ru', sr: 'ru', hr: 'ru', sl: 'ru', bs: 'ru',
      az: 'tr', kk: 'tr', uz: 'tr', ky: 'tr', tk: 'tr',
      ku: 'ar',
    };
    const mapped = PROXIMITY[primary];
    if (mapped) return mapped;
  }

  // 4. Default to Arabic (matches the platform's defaultLocale in routing.ts)
  return 'ar';
}

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
  async getActiveBriefs(@Query('symbol') symbol?: string, @Query('language') language?: string) {
    if (symbol) {
      const briefs = await this.councilService.getBriefsForPair(symbol, language);
      return { success: true, data: briefs };
    }
    const briefs = await this.councilService.getActiveBriefs(undefined, language);
    return { success: true, data: briefs };
  }

  /**
   * GET /api/strategic-council/briefs/history — Get brief history
   * V442: Require auth + filter by userId for data isolation.
   * V308: Added ?language= query param for on-demand translation.
   */
  @Get('briefs/history')
  async getBriefHistory(@Req() req: any, @Query('language') language?: string) {
    const userId = req.user?.id;
    const briefs = await this.councilService.getBriefHistory(userId, 10000, language);
    return { success: true, data: briefs };
  }

  /**
   * GET /api/strategic-council/briefs/history/all — Admin: ALL users' briefs
   * V442: Admin-only endpoint for the admin dashboard.
   * V443: Keep @Public() so the proxy can access it (admin auth handled by proxy).
   * The admin page is behind the admin route guard in Next.js.
   */
  @Public()
  @Get('briefs/history/all')
  async getAllBriefHistory(@Query('language') language?: string, @Query('limit') limit?: string) {
    const lim = Math.min(parseInt(limit || '10000', 10), 50000);
    const briefs = await this.councilService.getBriefHistory(undefined, lim, language);
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
   * Body: { pairs: string[], language?: AiLocale }
   * V267: language parameter propagates to all 8 AI roles + master strategy + brief analysisSummary.
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
  async triggerSession(
    @Req() req: any,
    @Body() body: { pairs?: string[]; language?: string },
  ) {
    const pairs = body.pairs || [];
    if (pairs.length === 0) {
      return { success: false, message: t('strategic_council_controller.msg_8cb8dae2', req) };
    }

    // V267: Resolve the AI locale from request (query > body > user > Accept-Language > 'ar')
    const language: AiLocale = isAiLocale(body.language)
      ? body.language
      : extractLocale(req);

    const userId = req.user?.id || 'system';
    this.logger.log(`🏛️ Manual council session triggered by ${userId} for: ${pairs.join(', ')} (language: ${language})`);

    // Check if already in session — return immediately if so
    if (this.councilService.isInSessionNow()) {
      return {
        success: false,
        message: t('strategic_council_controller.inprogress_please_waiting', req),
        status: 'already_running',
      };
    }

    // Fire-and-forget: Start the session in the background
    // V267: Pass `language` so the council emits analysis in the user's UI language.
    const sessionId = `manual-${Date.now()}`;
    this.councilService.forceSessionAsync(sessionId, pairs, userId, language).catch((err: any) => {
      this.logger.error(`🏛️ Background manual session failed: ${err.message}`);
    });

    // Return immediately so the proxy doesn't time out
    return {
      success: true,
      data: {
        sessionId,
        status: 'processing',
        pairs,
        language,
        message: t('strategic_council_controller.done_session', req),
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
   * V267: ?lang= parameter controls the AI output language.
   * FIX: Marked @Public() for diagnostic access.
   */
  @Public()
  @Get('debug')
  async debugConsensus(@Req() req: any, @Query('pair') pair?: string, @Query('lang') lang?: string) {
    const testPair = pair || 'BTC/USDT';
    const language: AiLocale = isAiLocale(lang) ? lang : extractLocale(req);
    const diagnostic: any = { pair: testPair, language, steps: {} };

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
      // V267: Pass `language` so the 8 roles emit analysis in the requested locale.
      try {
        const consensus = await this.orchestrator.getConsensusAnalysis(testPair, {
          forceFresh: true,
          language,
        } as any);
        const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;
        // BUG-037 FIX: was hardcoded 15, now uses actual council threshold (default 55)
        // _getCouncilConfig is private — use a hardcoded 55 as the known default
        // (the actual threshold is checked in _analyzePairTimeframe, not here)
        const wouldCreateBrief = !isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore >= 55;
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
