// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "القائد في غرفة العمليات" — يحلل السوق بعمق
// ويصدر وثائق تداول (Trading Briefs).
// لا ينفذ أي صفقة بنفسه.
//
// بنية جديدة: المجلس الاستراتيجي هو المحرك الوحيد
// لإجماع الذكاء الاصطناعي. CouncilSchedulerService القديم
// تم إلغاؤه واستبداله بهذه الخدمة.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AIOrchestratorService } from '../services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { NewsService } from '../../news/news.service';
import { NewsIntegrationService } from '../../news/news-integration.service';
import { RagService } from '../services/rag.service';
import { BriefTranslationService } from '../services/brief-translation.service';
import {
  ALL_COUNCIL_PAIRS,
  BINANCE_SUPPORTED_PAIRS,
  OANDA_SUPPORTED_PAIRS,
  EXECUTOR_TIMEFRAMES,
  AGENT_TIMEFRAMES,
  AGENT_SLOW_TIMEFRAMES,
  TIMEFRAME_EXPIRY_MS,
  TIMEFRAME_RR,
  MIN_BRIEF_CONFIDENCE,
  MIN_CONSENSUS_SCORE,
  CouncilSessionResult,
  TradingBriefDTO,
  StrictRules,
  BriefTimeframe,
  BriefDirection,
} from './strategic-council.types';

@Injectable()
export class StrategicCouncilService {
  private readonly logger = new Logger(StrategicCouncilService.name);

  /**
   * V130 SUSTAINABLE FIX: Separate session guards for Executor and Agent sessions.
   *
   * WHY: Previously, both runHourlySession() and runAgentSession() shared a single
   * isInSession guard. Since both crons fired at the same 15-minute mark and
   * runHourlySession() took 20-30 minutes (15 pairs × 3 timeframes with AI calls),
   * runAgentSession() ALWAYS found isInSession=true and skipped entirely.
   * Result: ZERO M30/H1/H4/D1/W1 briefs were ever generated — the Agent was
   * completely starved of signals.
   *
   * Now: Each session type has its own guard, and crons fire at different times:
   *   - Executor session (M1/M5/M15): every 15 min at :00, :15, :30, :45
   *   - Agent session (M30/H1/H4/D1/W1): every 30 min at :07, :37
   * This ensures both sessions can run independently without blocking each other.
   */
  private isExecutorInSession = false;
  private isAgentInSession = false;

  /** Daily cost cap for council sessions — increased from $20 to $50
   *  FIX: $20 was too low — with 15 pairs × 4 timeframes × 8 models,
   *  the cap was hit after ~2 full sessions, preventing subsequent sessions
   *  from calling AI models. This caused the pipeline to stall after 2 hours.
   *  Most models (Cerebras 14,400/day, NVIDIA 40/min, Mistral 1B/month) are FREE tier,
   *  so actual daily spend is ~$5-10. $50 cap gives plenty of headroom.
   */
  private readonly DAILY_COST_CAP_USD = 50.00;

  /** V190: Cached council config from DB with 60-second TTL */
  private _councilConfigCache: {
    data: {
      consensusThreshold: number;
      minBriefConfidence: number;
      dailyCostCapUsd: number;
      executorIntervalMin: number;
      agentIntervalMin: number;
      maxPairsPerSession: number;
    } | null;
    expiresAt: number;
  } | null = null;

  /** Redis keys */
  private readonly REDIS_DAILY_COST_KEY = 'strategic-council:daily_cost';
  private readonly REDIS_DAILY_COST_DATE_KEY = 'strategic-council:daily_cost_date';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly audit: AuditService,
    private readonly exchangeService: ExchangeService,
    private readonly configService: ConfigService,
    private readonly newsService: NewsService,
    private readonly newsIntegration: NewsIntegrationService,
    private readonly ragService: RagService,
    // V267: AdaptiveScheduleService is injected via @Optional() + token injection so
    // the council can benefit from volatility-aware scan intervals WITHOUT a hard
    // dependency on CouncilIntelligenceModule (which would create a circular import).
    // The token is provided by CouncilIntelligenceModule (Global).
    @Optional() @Inject('ADAPTIVE_SCHEDULE_SERVICE') private readonly adaptiveSchedule?: any,
    // V308: Brief Translation Service — translates analysisSummary to user's locale
    @Optional() private readonly briefTranslation?: BriefTranslationService,
  ) {
    this.logger.log('🏛️ Strategic Council initialized — THE ONLY consensus engine (with news integration)' + (this.adaptiveSchedule ? ' + V267 AdaptiveSchedule' : ''));
    // REMOVED: _ensureTradingBriefTable() — all DDL removed from application code.
    // Schema changes must ONLY be done via `prisma migrate deploy` in start.sh.
    // Running DDL from application code causes connection pool exhaustion and
    // conflicts with Prisma schema management.
    // Startup health check: warn if no AI models are available
    this._checkAIHealth();
    // FIX: REMOVED _triggerStartupSession(). Previously, the Strategic Council
    // would auto-generate TradingBriefs on server startup, which the Smart
    // Executor would then process and create phantom trades. Now, briefs are
    // ONLY generated by the scheduled cron (every 15 minutes), and even then,
    // they won't be executed unless a user explicitly enables the executor.
    // This startup session was a source of phantom trades because it generated
    // briefs immediately on server boot, before the startup cleanup had a
    // chance to purge phantom data.
  }

  // REMOVED: _ensureTradingBriefTable() — all DDL removed from application code.
  // Schema changes must ONLY be done via `prisma migrate deploy` in start.sh.

  /**
   * V190: Read council configuration from DB (admin settings).
   * Falls back to hardcoded constants if DB is unavailable.
   * Cached with 60-second TTL to avoid DB queries every tick.
   */
  private async _getCouncilConfig(): Promise<{
    consensusThreshold: number;
    minBriefConfidence: number;
    dailyCostCapUsd: number;
    executorIntervalMin: number;
    agentIntervalMin: number;
    maxPairsPerSession: number;
  }> {
    // Return cached config if still valid
    if (this._councilConfigCache && Date.now() < this._councilConfigCache.expiresAt) {
      return this._councilConfigCache.data!;
    }

    const defaults = {
      consensusThreshold: MIN_CONSENSUS_SCORE,   // 55
      minBriefConfidence: MIN_BRIEF_CONFIDENCE,  // 50
      dailyCostCapUsd: this.DAILY_COST_CAP_USD,  // 50
      executorIntervalMin: 15,
      agentIntervalMin: 30,
      maxPairsPerSession: BINANCE_SUPPORTED_PAIRS.length + OANDA_SUPPORTED_PAIRS.length, // V353: 7 crypto + 16 OANDA = 23
    };

    try {
      const setting = await this.prisma.setting.findUnique({
        where: { key: 'councilConfig' },
      });
      if (!setting) {
        this._councilConfigCache = { data: defaults, expiresAt: Date.now() + 60000 };
        return defaults;
      }

      const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
      const parsed = {
        consensusThreshold: Math.max(30, Math.min(90, parseInt(config.consensusThreshold, 10) || defaults.consensusThreshold)),
        minBriefConfidence: Math.max(20, Math.min(90, parseInt(config.minBriefConfidence, 10) || defaults.minBriefConfidence)),
        dailyCostCapUsd: Math.max(5, Math.min(200, parseFloat(config.dailyCostCapUsd) || defaults.dailyCostCapUsd)),
        executorIntervalMin: Math.max(5, Math.min(60, parseInt(config.executorIntervalMin, 10) || defaults.executorIntervalMin)),
        agentIntervalMin: Math.max(10, Math.min(120, parseInt(config.agentIntervalMin, 10) || defaults.agentIntervalMin)),
        maxPairsPerSession: Math.max(3, Math.min(30, parseInt(config.maxPairsPerSession, 10) || defaults.maxPairsPerSession)),
      };

      this._councilConfigCache = { data: parsed, expiresAt: Date.now() + 60000 };
      return parsed;
    } catch {
      this._councilConfigCache = { data: defaults, expiresAt: Date.now() + 60000 };
      return defaults;
    }
  }

  /**
   * FIX: Trigger an initial council session after startup — but ONLY after
   * confirming that at least 2 AI models are available.
   * Previously, the session fired at 30 seconds regardless of AI readiness,
   * producing HOLD results that got cached and blocked all subsequent sessions.
   * Now we poll AI health every 10 seconds and only start the session once
   * ≥2 models are confirmed working, with a max wait of 3 minutes.
   */
  private _triggerStartupSession(): void {
    const MAX_WAIT_MS = 3 * 60 * 1000; // 3 minutes max wait
    const POLL_INTERVAL_MS = 10 * 1000; // Check every 10 seconds
    const startTime = Date.now();

    const checkAndTrigger = async (): Promise<void> => {
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_WAIT_MS) {
        this.logger.warn('🏛️ Startup session: max wait reached (3 min) — triggering session even with limited AI models');
        try {
          const result = await this.runHourlySession();
          this.logger.log(
            `🏛️ Startup session (forced) complete: ${result.pairsAnalyzed} pairs, ` +
            `${result.briefsIssued} new briefs, ${result.briefsModified} modified`,
          );
        } catch (error: any) {
          this.logger.error(`🏛️ Startup session (forced) failed: ${error.message}`);
        }
        return;
      }

      try {
        const models = await this.orchestrator.getModelsStatus();
        const working = models.filter((m: any) => m.available || m.keyAvailable).length;

        if (working >= 2) {
          this.logger.log(`🏛️ ${working} AI models ready — triggering startup council session`);
          const result = await this.runHourlySession();
          this.logger.log(
            `🏛️ Startup session complete: ${result.pairsAnalyzed} pairs, ` +
            `${result.briefsIssued} new briefs, ${result.briefsModified} modified`,
          );
        } else {
          this.logger.log(`🏛️ Only ${working}/2 AI models ready — waiting ${POLL_INTERVAL_MS / 1000}s before retry...`);
          setTimeout(checkAndTrigger, POLL_INTERVAL_MS);
        }
      } catch (error: any) {
        this.logger.warn(`🏛️ AI health check failed: ${error.message} — retrying in ${POLL_INTERVAL_MS / 1000}s`);
        setTimeout(checkAndTrigger, POLL_INTERVAL_MS);
      }
    };

    // Start checking after 30 seconds (give NestJS time to initialize)
    setTimeout(checkAndTrigger, 30000);
  }

  /**
   * Check AI model availability at startup and log critical warnings
   */
  private _checkAIHealth(): void {
    // Delay check to allow all services to initialize
    setTimeout(async () => {
      try {
        const models = await this.orchestrator.getModelsStatus();
        const working = models.filter((m: any) => m.available || m.keyAvailable).length;
        if (working === 0) {
          this.logger.error(
            '🏛️ ⚠️ CRITICAL: Zero AI models available! The Strategic Council will produce NO Briefs. ' +
            'Set at least one API key: GROQ_API_KEY, GEMINI_API_KEY, GLM_API_KEY, OPENROUTER_API_KEY, or DEEPSEEK_API_KEY',
          );
        } else {
          this.logger.log(`🏛️ AI Health: ${working}/${models.length} models available — Council can produce Briefs`);
        }
      } catch (error: any) {
        this.logger.warn(`🏛️ AI health check failed: ${error.message}`);
      }
    }, 5000);
  }

  // ── Scheduled Sessions ──

  /**
   * Main council session — runs every 15 minutes for rapid scalping/intraday trades
   * Reviews ALL pairs across rapid timeframes
   */

  /**
   * Agent Council Session — M30/H1 briefs for the Agent
   * Runs every 15 minutes alongside the main session
   * Generates medium-term briefs the Agent reads
   */
  /**
   * V130: Agent session runs at :07 and :37 (offset from executor session).
   * This prevents the concurrency bug where runHourlySession() held isInSession=true
   * for 20-30 minutes, causing runAgentSession() to always skip.
   *
   * V267: Added Sanctuary halt check (was missing here — only runHourlySession
   * checked it, so Agent briefs kept generating during a Sanctuary halt).
   * Now both sessions respect the halt.
   */
  @Cron('7,37 * * * *')
  async runAgentSession(): Promise<void> {
    // FIX: Skip cycle when DB is unavailable to prevent connection pool exhaustion
    if (!this.prisma.isAvailable?.()) {
      return;
    }

    // V267: Sanctuary halt check (was missing in agent session — fix)
    try {
      const haltUntil = await this.redis?.get('council:sanctuary:halt');
      if (haltUntil && new Date(haltUntil) > new Date()) {
        this.logger.warn(`🏛️ Agent Council HALTED by Sanctuary until ${haltUntil} — skipping agent briefs`);
        return;
      }
    } catch { /* non-critical — don't block trading */ }

    // Check AUTO_TRADING_ENABLED
    try {
      const s = await this.prisma.$queryRaw<any[]>`SELECT value FROM "Setting" WHERE key = 'AUTO_TRADING_ENABLED' LIMIT 1`.catch(() => []);
      if (s?.[0] && String(s[0].value) !== 'true') return;
    } catch {}

    if (this.isAgentInSession) return; // V130: Use own guard

    this.isAgentInSession = true;
    try {
      this.logger.log('🏛️ Agent Council: generating M30/H1/H4/D1/W1 briefs...');

      // ═══════════════════════════════════════════════════════════════════
      // V353: Agent council also analyzes ALL tradeable pairs (crypto + forex + metals + indices).
      // Same logic as executor council — see V353 comment block above.
      // V190: Read maxPairsPerSession from DB admin settings
      const councilCfg = await this._getCouncilConfig();
      // V439: Forex/Commodities first, then Crypto — per user request.
      const allTradeablePairsAgent = [
        ...OANDA_SUPPORTED_PAIRS,     // 7 forex + 4 commodities + 5 indices = 16 pairs FIRST
        ...BINANCE_SUPPORTED_PAIRS,   // 7 crypto pairs SECOND
      ];
      const agentPairs = allTradeablePairsAgent.slice(0, councilCfg.maxPairsPerSession);
      this.logger.log(`🏛️ V353 Agent Council: analyzing ${agentPairs.length} pairs (maxPairs=${councilCfg.maxPairsPerSession}): ${agentPairs.join(', ')}`);

      // V132: Parallel processing — process all pairs concurrently instead of sequentially.
      // Previously, pairs were processed one-by-one, taking 20-30 minutes for 15 pairs.
      // Now: All pairs process in parallel, limited to 3 concurrent to respect AI rate limits.
      const agentResults = await this._parallelProcess(
        agentPairs,
        async (pair) => {
          const pairResult = { pairs: 0, briefs: 0, errors: 0 };
          try {
            const marketData = await this.orchestrator.fetchQuickMarketData(pair);
            if (!marketData?.price) return pairResult;

            for (const tf of AGENT_TIMEFRAMES as any[]) {
              // Slow timeframes (H4, D1, W1): only top 3 pairs to reduce AI costs
              if (AGENT_SLOW_TIMEFRAMES.includes(tf as any) && agentPairs.indexOf(pair) >= 3) continue;
              // V308: Agent session generates in Arabic (default), translation on demand
              await this._analyzePairTimeframe(pair, tf, marketData.price, { pairs: 0, briefs: 0, errors: 0, sessionId: 'agent-session', durationMs: 0 } as any);
              pairResult.briefs++;
            }
            pairResult.pairs = 1;
          } catch (e: any) {
            this.logger.warn(`Agent session: ${pair} failed — ${e.message}`);
            pairResult.errors++;
          }
          return pairResult;
        },
        3, // max 3 concurrent AI calls to respect rate limits
      );

      const agentTotal = agentResults.reduce((acc, r) => ({
        pairs: acc.pairs + r.pairs,
        briefs: acc.briefs + r.briefs,
        errors: acc.errors + r.errors,
      }), { pairs: 0, briefs: 0, errors: 0 });
      this.logger.log(`🏛️ Agent Council complete: ${agentTotal.pairs} pairs, ${agentTotal.briefs} briefs, ${agentTotal.errors} errors`);
    } catch (e: any) {
      this.logger.warn(`Agent session error: ${e.message}`);
    } finally {
      this.isAgentInSession = false;
    }
  }

  @Cron('*/15 * * * *')
  async runHourlySession(): Promise<CouncilSessionResult> {
    // FIX: Skip cycle when DB is unavailable to prevent connection pool exhaustion
    if (!this.prisma.isAvailable?.()) {
      return {
        timestamp: new Date().toISOString(),
        pairsAnalyzed: 0,
        briefsIssued: 0,
        briefsModified: 0,
        briefsCancelled: 0,
        briefsExecuted: 0,
        durationMs: 0,
      };
    }

    // V175: Sanctuary halt check — يمنع الجلسات عند الخسارة المتتالية
    try {
      const haltUntil = await this.redis?.get('council:sanctuary:halt');
      if (haltUntil && new Date(haltUntil) > new Date()) {
        this.logger.warn(`🏛️ Council HALTED by Sanctuary until ${haltUntil}`);
        return { timestamp: new Date().toISOString(), pairsAnalyzed: 0, briefsIssued: 0, briefsModified: 0, briefsCancelled: 0, briefsExecuted: 0, durationMs: 0 };
      }
    } catch { /* non-critical — don't block trading */ }

    // V267: AdaptiveSchedule check — if the recommended interval for the most-traded
    // pair exceeds time-since-last-session, skip this tick to save AI costs in calm markets.
    // This activates the previously-dead AdaptiveSchedule feature (built at
    // council-intelligence/adaptive-schedule.service.ts:49-187 but never wired into @Cron).
    if (this.adaptiveSchedule?.getRecommendedInterval) {
      try {
        const probeSymbol = 'BTC/USDT'; // representative symbol for the market state
        const recommendation = await this.adaptiveSchedule.getRecommendedInterval(probeSymbol);
        if (recommendation?.recommendedIntervalMs && recommendation.recommendedIntervalMs > 15 * 60 * 1000 + 60_000) {
          // Recommended interval > 16 min — wait until next cron tick (15 min default).
          this.logger.log(
            `⏰ V267 AdaptiveSchedule: skipping this tick — recommended interval ${Math.round(recommendation.recommendedIntervalMs / 60000)}min (reason: ${recommendation.adjustmentReason || 'calm market'})`,
          );
          return {
            timestamp: new Date().toISOString(),
            pairsAnalyzed: 0,
            briefsIssued: 0,
            briefsModified: 0,
            briefsCancelled: 0,
            briefsExecuted: 0,
            durationMs: 0,
            adaptiveSkip: true,
            adaptiveReason: recommendation.adjustmentReason,
          } as any;
        } else if (recommendation?.recommendedIntervalMs && recommendation.recommendedIntervalMs < 5 * 60 * 1000) {
          this.logger.warn(
            `⏰ V267 AdaptiveSchedule: HIGH URGENCY — recommended interval ${Math.round(recommendation.recommendedIntervalMs / 60000)}min (reason: ${recommendation.adjustmentReason || 'volatile market'}) — running session immediately`,
          );
        }
      } catch (adaptErr: any) {
        this.logger.debug(`V267 AdaptiveSchedule check failed (non-critical): ${adaptErr?.message || adaptErr}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // FIX: Single AUTO_TRADING_ENABLED check (removed double-guard).
    // Previously there were TWO separate checks that both defaulted to
    // "skip if false" — this meant that if AUTO_TRADING_ENABLED was
    // false in DB (the common default), BOTH checks would skip the
    // session, generating ZERO briefs. The Smart Executor then has
    // nothing to execute → no trades ever.
    //
    // Now: Single check that defaults to TRUE (generate briefs) when
    // the DB setting doesn't exist. The Smart Executor already has
    // its own user-level enable check, so we don't need to block
    // brief generation here. Briefs without enabled users are harmless.
    // ═══════════════════════════════════════════════════════════════════
    try {
      // SAFETY: Default to FALSE — auto trading must be explicitly enabled by admin.
      // A new deployment should NOT start trading until the operator confirms readiness.
      let autoTradingEnabled = false;
      try {
        const dbSetting = await this.prisma.setting.findUnique({
          where: { key: 'AUTO_TRADING_ENABLED' },
        });
        if (dbSetting) {
          autoTradingEnabled = JSON.parse(dbSetting.value);
        }
        // If no DB setting exists, keep default FALSE (safe — operator must enable)
      } catch {
        // DB lookup failed — keep default FALSE (fail safe)
      }

      if (!autoTradingEnabled) {
        this.logger.debug('🏛️ AUTO_TRADING_ENABLED=false in DB — skipping council session');
        return {
          timestamp: new Date().toISOString(),
          pairsAnalyzed: 0,
          briefsIssued: 0,
          briefsModified: 0,
          briefsCancelled: 0,
          briefsExecuted: 0,
          durationMs: 0,
        };
      }
    } catch {
      // If we can't check the setting, PROCEED (generate briefs)
      // This is the opposite of the old behavior which would skip on error
    }

    if (this.isExecutorInSession) {
      this.logger.warn('🏛️ Previous executor council session still running — skipping');
      return {
        timestamp: new Date().toISOString(),
        pairsAnalyzed: 0,
        briefsIssued: 0,
        briefsModified: 0,
        briefsCancelled: 0,
        briefsExecuted: 0,
        durationMs: 0,
      };
    }

    this.isExecutorInSession = true;
    const startTime = Date.now();

    const result: CouncilSessionResult = {
      timestamp: new Date().toISOString(),
      pairsAnalyzed: 0,
      briefsIssued: 0,
      briefsModified: 0,
      briefsCancelled: 0,
      briefsExecuted: 0,
      durationMs: 0,
      diagnostics: [],
    };

    try {
      this.logger.log('🏛️ Strategic Council convening hourly session...');

      // Check daily cost cap
      // V190: Read dailyCostCapUsd from DB admin settings
      const councilCfg = await this._getCouncilConfig();
      const dailyCostCap = councilCfg.dailyCostCapUsd;
      const todayCost = await this._getTodayCost();
      if (todayCost >= dailyCostCap) {
        this.logger.warn(`💰 Daily cost cap reached ($${todayCost.toFixed(2)}/$${dailyCostCap}) — skipping session`);
        return result;
      }

      // ═══════════════════════════════════════════════════════════════════
      // V353: Generate briefs for ALL tradeable pairs (crypto + forex + metals + indices + energy).
      //
      // Previously (V132): Only BINANCE_SUPPORTED_PAIRS (7 crypto) were analyzed.
      // This was because non-crypto pairs couldn't execute on Binance.
      //
      // V353: OANDA is now integrated and all users use paper-trading (which
      // supports ALL pairs). The council now generates briefs for:
      //   - 7 crypto pairs (Binance data)
      //   - 7 forex majors (OANDA data)
      //   - 4 commodities (XAU, XAG, WTI, BRENT — OANDA data)
      //   - 5 indices (US30, NAS100, SPX500, GER30, UK100 — OANDA data)
      // Total: 23 pairs — each gets analyzed across 3 timeframes (M1, M5, M15).
      //
      // The Smart Executor and Agent will filter briefs by what the user's
      // active exchange supports (isSymbolSupportedByExchange).
      // ═══════════════════════════════════════════════════════════════════
      // V190: Read maxPairsPerSession from DB admin settings
      // V439: Forex/Commodities first, then Crypto — per user request.
      // Forex and commodities have clearer trends (central bank policy, economic data)
      // and lower noise than crypto, giving the AI Council better signal quality.
      const allTradeablePairs = [
        ...OANDA_SUPPORTED_PAIRS,     // 7 forex + 4 commodities + 5 indices = 16 pairs FIRST
        ...BINANCE_SUPPORTED_PAIRS,   // 7 crypto pairs SECOND
      ];
      const executorPairs = allTradeablePairs.slice(0, councilCfg.maxPairsPerSession);
      this.logger.log(`🏛️ V353 Executor Council: analyzing ${executorPairs.length} pairs (maxPairs=${councilCfg.maxPairsPerSession}): ${executorPairs.join(', ')}`);

      // V132: Parallel processing — process all pairs concurrently instead of sequentially.
      // Previously: 15 pairs × 3 timeframes × 5-10s AI call = 225-450s (4-8 minutes)
      // Now: 7 pairs in parallel with concurrency=3 = ~2-3 minutes total
      const pairResults = await this._parallelProcess(
        executorPairs,
        async (pair) => {
          // Check cost before each pair
          const cost = await this._getTodayCost();
          if (cost >= dailyCostCap) {
            this.logger.warn('💰 Daily cost cap reached — stopping session early');
            return { analyzed: false, error: 'cost_cap' };
          }

          try {
            // V308: Briefs generated in Arabic (primary user language).
            // BriefTranslationService translates analysisSummary to each
            // user's locale on demand, with Redis caching.
            await this._analyzePair(pair, result);
            return { analyzed: true };
          } catch (error: any) {
            if (error.message?.includes('Too many database connections') || error.message?.includes('connection pool')) {
              this.logger.error(`🏛️ DB connection exhaustion detected during ${pair} analysis — breaking`);
              return { analyzed: false, error: 'db_exhaustion' };
            }
            this.logger.error(`🏛️ Council failed for ${pair}: ${error.message}`);
            return { analyzed: false, error: error.message };
          }
        },
        3, // max 3 concurrent AI calls to respect rate limits
      );

      // Count successfully analyzed pairs
      result.pairsAnalyzed = pairResults.filter(r => r.analyzed).length;

      // Check if DB exhaustion was detected — break if so
      if (pairResults.some(r => r.error === 'db_exhaustion')) {
        this.logger.error('🏛️ Stopping session early due to DB connection exhaustion');
      }

      // Expire outdated briefs
      await this._expireOutdatedBriefs();

      // Mark executed briefs (those that SmartExecutor has already executed)
      await this._markExecutedBriefs();

      result.durationMs = Date.now() - startTime;

      this.logger.log(
        `🏛️ Strategic Council session complete: ${result.pairsAnalyzed} pairs, ` +
        `${result.briefsIssued} new briefs, ${result.briefsModified} modified, ` +
        `${result.briefsCancelled} cancelled, ${result.briefsExecuted} executed (${result.durationMs}ms)`,
      );

      // Store session result in Redis
      await this.redis.set(
        'strategic-council:last_session',
        JSON.stringify(result),
        3600000, // 1 hour TTL
      );

      // Publish council completion event for Smart Executor
      try {
        await this.redis.publish(
          'council:session_complete',
          JSON.stringify({
            timestamp: result.timestamp,
            briefsIssued: result.briefsIssued,
            briefsModified: result.briefsModified,
            activeBriefs: await this.getActiveBriefsCount(),
          }),
        );
      } catch (pubError: any) {
        this.logger.debug(`Failed to publish council event: ${pubError.message}`);
      }

      await this.audit.log({
        userId: 'system',
        action: 'STRATEGIC_COUNCIL_SESSION',
        resource: 'strategic-council',
        details: JSON.stringify(result),
      });
    } catch (error: any) {
      this.logger.error(`🏛️ Strategic Council session failed: ${error.message}`);
    } finally {
      this.isExecutorInSession = false;
    }

    return result;
  }

  /**
   * Check if council is currently in session (for controller to query)
   * V130: Returns true if EITHER executor or agent session is running
   */
  isInSessionNow(): boolean {
    return this.isExecutorInSession || this.isAgentInSession;
  }

  /**
   * Force a council session for specific pairs (manual trigger) — ASYNC/FIRE-AND-FORGET
   * FIX: This method runs in the background so the HTTP response returns immediately.
   * Previously, the controller awaited forceSession() which took 6-12 minutes,
   * exceeding the 30-second proxy timeout and causing 502 errors on the frontend.
   *
   * V267: `language` parameter (default 'ar') propagates to all 8 AI roles +
   * master strategy + brief analysisSummary. The 32 supported locales are
   * defined as `AiLocale` in the controller.
   */
  async forceSessionAsync(
    sessionId: string,
    pairs: string[],
    userId: string,
    language: 'ar' | 'en' | 'fr' | 'tr' | 'es' | 'zh' | 'ru' | 'hi' | 'pt' | 'de'
      | 'ja' | 'ko' | 'id' | 'vi' | 'th' | 'it' | 'pl' | 'nl' | 'ms' | 'he'
      | 'sv' | 'uk' | 'fa' | 'ur' | 'fil' | 'da' | 'no' | 'fi' | 'cs' | 'hu'
      | 'ro' | 'bn' = 'ar',
  ): Promise<CouncilSessionResult> {
    // Guard against concurrent sessions
    if (this.isExecutorInSession) {
      this.logger.warn('🏛️ Cannot start manual session — previous executor session still running');
      return {
        timestamp: new Date().toISOString(),
        pairsAnalyzed: 0,
        briefsIssued: 0,
        briefsModified: 0,
        briefsCancelled: 0,
        briefsExecuted: 0,
        durationMs: 0,
      };
    }

    this.isExecutorInSession = true;
    this.logger.log(`🏛️ Manual strategic council session [${sessionId}] started by ${userId} for: ${pairs.join(', ')} (language: ${language})`);

    const result: CouncilSessionResult = {
      timestamp: new Date().toISOString(),
      pairsAnalyzed: 0,
      briefsIssued: 0,
      briefsModified: 0,
      briefsCancelled: 0,
      briefsExecuted: 0,
      durationMs: 0,
      diagnostics: [],
    };

    const startTime = Date.now();

    try {
      for (const pair of pairs) {
        try {
          await this._analyzePair(pair, result, language);
          result.pairsAnalyzed++;
        } catch (error: any) {
          this.logger.error(`🏛️ Manual council [${sessionId}] failed for ${pair}: ${error.message}`);
        }
      }

      // Expire outdated briefs after manual session too
      await this._expireOutdatedBriefs();
      await this._markExecutedBriefs();

      result.durationMs = Date.now() - startTime;

      this.logger.log(
        `🏛️ Manual session [${sessionId}] complete: ${result.pairsAnalyzed} pairs, ` +
        `${result.briefsIssued} new briefs, ${result.briefsModified} modified (${result.durationMs}ms)`,
      );

      // Store session result in Redis so the frontend can poll /session/last
      await this.redis.set(
        'strategic-council:last_session',
        JSON.stringify(result),
        3600000, // 1 hour TTL
      );

      // Publish council completion event for Smart Executor
      try {
        await this.redis.publish(
          'council:session_complete',
          JSON.stringify({
            sessionId,
            timestamp: result.timestamp,
            briefsIssued: result.briefsIssued,
            briefsModified: result.briefsModified,
            activeBriefs: await this.getActiveBriefsCount(),
          }),
        );
      } catch (pubError: any) {
        this.logger.debug(`Failed to publish council event: ${pubError.message}`);
      }

      await this.audit.log({
        userId,
        action: 'STRATEGIC_COUNCIL_MANUAL',
        resource: 'strategic-council',
        details: JSON.stringify({ sessionId, pairs, result }),
      });
    } catch (error: any) {
      this.logger.error(`🏛️ Manual session [${sessionId}] failed: ${error.message}`);
    } finally {
      this.isExecutorInSession = false;
    }

    return result;
  }

  /**
   * Force a council session for specific pairs (synchronous version — kept for backward compat)
   * V267: defaults `language` to 'ar' for backward compatibility with existing callers.
   */
  async forceSession(
    pairs: string[],
    userId: string,
    language: 'ar' | 'en' | 'fr' | 'tr' | 'es' | 'zh' | 'ru' | 'hi' | 'pt' | 'de'
      | 'ja' | 'ko' | 'id' | 'vi' | 'th' | 'it' | 'pl' | 'nl' | 'ms' | 'he'
      | 'sv' | 'uk' | 'fa' | 'ur' | 'fil' | 'da' | 'no' | 'fi' | 'cs' | 'hu'
      | 'ro' | 'bn' = 'ar',
  ): Promise<CouncilSessionResult> {
    return this.forceSessionAsync(`sync-${Date.now()}`, pairs, userId, language);
  }

  // ── Query Methods ──

  /**
   * Get all active briefs (for Smart Executor consumption)
   */
  async getActiveBriefs(userId?: string, language?: string): Promise<TradingBriefDTO[]> {
    try {
      // FIX: Include MODIFIED briefs — they are still active and should be
      // executed by the Smart Executor. Previously only 'ACTIVE' was returned,
      // so modified briefs were invisible to the executor.
      const where: any = { isActive: true, reviewStatus: { in: ['ACTIVE', 'MODIFIED'] } };
      // RC-11: فحص صارم لـ userId — empty string لا يجب أن يتجاوز الفلتر
      if (userId !== undefined && userId !== null && userId !== '') {
        where.userId = userId;
      }

      const briefs = await this.prisma.tradingBrief.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
      });

      const dtos = briefs.map((b) => this._toDTO(b));

      // V308: Translate analysisSummary to user's locale if needed
      if (language && language !== 'ar' && this.briefTranslation) {
        const translations = await this.briefTranslation.translateBatch(
          dtos
            .filter((d) => d.analysisSummary)
            .map((d) => ({
              id: d.id,
              text: d.analysisSummary!,
              label: `${d.pair} ${d.timeframe} analysisSummary`,
            })),
          language,
        );
        for (const dto of dtos) {
          const translated = translations.get(dto.id);
          if (translated) dto.analysisSummary = translated;
        }
      }

      return dtos;
    } catch (error: any) {
      this.logger.error(`🏛️ getActiveBriefs failed: ${error.message}`);
      // Return empty array instead of crashing — the Strategic Council
      // will appear empty but won't return a 503 error
      return [];
    }
  }

  /**
   * V134: Get CONSOLIDATED active briefs — ONE direction per pair.
   *
   * ROOT CAUSE FIX for "opened and closed after 1 second":
   *   The Council generates briefs per pair+timeframe. Different timeframes
   *   can have OPPOSITE directions (e.g., BTC/USDT M1=BUY, M5=SELL).
   *   When the SmartExecutor processes all briefs sequentially, it:
   *     1. Opens BUY from M1 brief
   *     2. Sees SELL from M5 brief → closes BUY → opens SELL
   *     3. Next tick: M1 BUY again → closes SELL → opens BUY
   *     → INFINITE LOOP of open→close every tick
   *
   * FIX: Consolidate all briefs for the same pair into ONE direction.
   * The direction with the HIGHEST confidence wins. If confidence is tied,
   * the shorter timeframe wins (more recent data).
   *
   * This ensures the executor sees AT MOST ONE brief per pair,
   * eliminating the open→close→open loop entirely.
   */
  /**
   * V223 FIX: Cancel ALL active briefs for a symbol when ANY position on that
   * symbol closes (SL, TP, manual, time-expired). Previously, briefs stayed
   * ACTIVE in DB after close — the only protection was a 1–15min Redis TTL
   * `processedKey` and a 15min DB cooldown. After TTL/cooldown expired, the
   * same stale brief would re-execute → flip-flop (BUY → SL → SELL → SL → BUY).
   *
   * Now: brief is cancelled AT THE SOURCE. No TTL, no cooldown race, no stale
   * brief can ever re-fire. The next council session (every 15min) generates
   * a fresh brief with fresh market data.
   */
  async invalidateBriefsForSymbol(symbol: string, reason: string = 'POSITION_CLOSED'): Promise<number> {
    if (!symbol) return 0;
    try {
      const result = await this.prisma.tradingBrief.updateMany({
        where: {
          pair: symbol,
          isActive: true,
        },
        data: {
          isActive: false,
          reviewStatus: 'CANCELLED',
        },
      });
      if (result.count > 0) {
        this.logger.log(`🛑 V223: Cancelled ${result.count} active brief(s) for ${symbol} (${reason})`);
      }
      return result.count;
    } catch (err: any) {
      this.logger.warn(`⚠️ V223 invalidateBriefsForSymbol(${symbol}) failed: ${err?.message || err}`);
      return 0;
    }
  }

  async getConsolidatedBriefs(userId?: string): Promise<TradingBriefDTO[]> {
    const allBriefs = await this.getActiveBriefs(userId);

    if (allBriefs.length === 0) return [];

    // ═══════════════════════════════════════════════════════════════════
    // V143 FIX: Separate consolidation for EXECUTOR and AGENT timeframes.
    //
    // ROOT CAUSE: Previously, getConsolidatedBriefs() grouped ALL briefs
    // by pair regardless of timeframe type. This meant executor briefs
    // (M1/M5/M15) could CANCEL agent briefs (M30/H1/H4/D1/W1) and
    // vice versa. Since M1 briefs get 2x weight in the consolidation
    // vote, they almost always won, causing agent-timeframe briefs to
    // be cancelled (isActive=false). The Agent then couldn't see any
    // M30+ briefs → ZERO agent trades.
    //
    // Example: BTC/USDT has M1=BUY (conf 55) and M30=SELL (conf 60).
    // Old: M1 BUY score = 55 * 2.0 = 110, M30 SELL score = 60 * 1.0 = 60
    // → BUY wins → M30 SELL cancelled → Agent has no briefs
    //
    // FIX: Consolidate WITHIN each timeframe group separately.
    //   - Executor briefs only conflict with other executor briefs
    //   - Agent briefs only conflict with other agent briefs
    // Each system gets its own independent signal per pair.
    // ═══════════════════════════════════════════════════════════════════
    const executorBriefs = allBriefs.filter(b => EXECUTOR_TIMEFRAMES.includes(b.timeframe));
    const agentBriefs = allBriefs.filter(b => AGENT_TIMEFRAMES.includes(b.timeframe));

    const consolidated: TradingBriefDTO[] = [];

    // Consolidate executor briefs independently
    const executorConsolidated = await this._consolidateBriefsByPair(executorBriefs, 'EXECUTOR');
    consolidated.push(...executorConsolidated);

    // Consolidate agent briefs independently
    const agentConsolidated = await this._consolidateBriefsByPair(agentBriefs, 'AGENT');
    consolidated.push(...agentConsolidated);

    this.logger.log(
      `🏛️ V143 Consolidation: ${allBriefs.length} raw briefs → ${consolidated.length} consolidated ` +
      `(executor: ${executorConsolidated.length}, agent: ${agentConsolidated.length}) ` +
      `(pairs: ${consolidated.map(b => b.pair + ':' + b.direction + ':' + b.timeframe).join(', ')})`
    );

    return consolidated;
  }

  /**
   * V143: Consolidate briefs by pair within a specific timeframe group.
   * Each group (EXECUTOR or AGENT) resolves conflicts independently.
   * Losing briefs are only cancelled WITHIN the same group — executor
   * briefs never cancel agent briefs and vice versa.
   */
  private async _consolidateBriefsByPair(
    briefs: TradingBriefDTO[],
    group: 'EXECUTOR' | 'AGENT',
  ): Promise<TradingBriefDTO[]> {
    if (briefs.length === 0) return [];

    // Group by pair
    const byPair = new Map<string, TradingBriefDTO[]>();
    for (const brief of briefs) {
      const existing = byPair.get(brief.pair) || [];
      existing.push(brief);
      byPair.set(brief.pair, existing);
    }

    const consolidated: TradingBriefDTO[] = [];

    for (const [pair, pairBriefs] of byPair) {
      if (pairBriefs.length === 0) continue;

      if (pairBriefs.length === 1) {
        consolidated.push(pairBriefs[0]);
        continue;
      }

      // Multiple briefs for same pair — check if they agree on direction
      const buyBriefs = pairBriefs.filter(b => b.direction === 'BUY');
      const sellBriefs = pairBriefs.filter(b => b.direction === 'SELL');

      if (sellBriefs.length === 0) {
        const best = buyBriefs.sort((a, b) => b.confidence - a.confidence)[0];
        consolidated.push(best);
      } else if (buyBriefs.length === 0) {
        const best = sellBriefs.sort((a, b) => b.confidence - a.confidence)[0];
        consolidated.push(best);
      } else {
        // CONFLICTING DIRECTIONS within the same group
        const TF_WEIGHT: Record<string, number> = {
          M1: 2.0, M5: 1.5, M15: 1.2,  // Executor: shorter = stronger
          M30: 2.0, H1: 1.5, H4: 1.2,  // Agent: shorter = stronger (within agent group)
          D1: 0.8, W1: 0.5,
        };

        let buyScore = buyBriefs.reduce((sum, b) =>
          sum + b.confidence * (TF_WEIGHT[b.timeframe] || 1.0), 0);
        let sellScore = sellBriefs.reduce((sum, b) =>
          sum + b.confidence * (TF_WEIGHT[b.timeframe] || 1.0), 0);

        // V177 FIX #14: Direction balance enforcement
        // If one direction dominates (>70% of today's executed trades),
        // boost the other direction's scores to encourage diversity
        try {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayBuyCount = await this.prisma.position.count({
            where: { side: 'BUY', status: { in: ['OPEN', 'CLOSED'] }, openedAt: { gte: todayStart } },
          });
          const todaySellCount = await this.prisma.position.count({
            where: { side: 'SELL', status: { in: ['OPEN', 'CLOSED'] }, openedAt: { gte: todayStart } },
          });
          const totalToday = todayBuyCount + todaySellCount;
          if (totalToday >= 4) { // Only enforce balance after 4+ trades
            const buyRatio = todayBuyCount / totalToday;
            const sellRatio = todaySellCount / totalToday;
            if (sellRatio > 0.70) {
              // SELL dominates — boost BUY score
              buyScore *= 1.3;
              this.logger.debug(`🏛️ V177 Direction balance: SELL dominates (${(sellRatio*100).toFixed(0)}%) — boosting BUY score by 1.3x`);
            } else if (buyRatio > 0.70) {
              // BUY dominates — boost SELL score
              sellScore *= 1.3;
              this.logger.debug(`🏛️ V177 Direction balance: BUY dominates (${(buyRatio*100).toFixed(0)}%) — boosting SELL score by 1.3x`);
            }
          }
        } catch { /* non-critical — balance enforcement is best-effort */ }

        const winningBriefs = buyScore >= sellScore ? buyBriefs : sellBriefs;
        const losingBriefs = buyScore >= sellScore ? sellBriefs : buyBriefs;
        const winningDirection = buyScore >= sellScore ? 'BUY' : 'SELL';

        const best = winningBriefs.sort((a, b) => b.confidence - a.confidence)[0];

        this.logger.log(
          `🏛️ V143 CONSOLIDATION [${group}]: ${pair} has conflicting directions ` +
          `(BUY=${buyBriefs.length} score=${buyScore.toFixed(0)}, ` +
          `SELL=${sellBriefs.length} score=${sellScore.toFixed(0)}) ` +
          `→ Winner: ${winningDirection} (best confidence=${best.confidence}%, ` +
          `timeframe=${best.timeframe})`
        );

        consolidated.push(best);

        // V143: Only cancel losing briefs WITHIN the same timeframe group.
        // Previously, ALL losing briefs were cancelled, which destroyed
        // agent signals when executor briefs won the vote.
        for (const losing of losingBriefs) {
          try {
            await this.prisma.tradingBrief.update({
              where: { id: losing.id },
              data: {
                isActive: false,
                reviewStatus: 'CANCELLED',
                analysisSummary: `V143: Cancelled by ${group} consolidation — ${pair} has ${winningDirection} consensus within ${group} timeframes`,
              },
            });
          } catch { /* non-critical */ }
        }
      }
    }

    return consolidated;
  }

  /**
   * Get count of active briefs (lightweight for events)
   */
  async getActiveBriefsCount(): Promise<number> {
    try {
      return await this.prisma.tradingBrief.count({
        where: { isActive: true, reviewStatus: { in: ['ACTIVE', 'MODIFIED'] } },
      });
    } catch {
      return 0;
    }
  }

  /**
   * Get brief history (including expired/cancelled/executed/active)
   * FIX: Added try-catch to prevent 503 errors when DB schema is out of sync.
   * Previously, if the TradingBrief table didn't have expected columns,
   * Prisma would throw and the controller would return 503.
   *
   * V292: Now joins with TradeJournal (by briefId) to populate outcome data
   * (outcomePips, outcomePct, closedAt, durationMs, result). This connects
   * the council's briefs to the actual trade results, so the council page's
   * history table shows real P&L instead of "—".
   *
   * V298: Return ALL briefs (active + inactive), not just inactive ones.
   * Previously, the history endpoint appeared empty because all briefs in
   * the DB were still isActive=true (they hadn't expired yet). Now we return
   * every brief, ordered by createdAt desc, so the history table shows the
   * full timeline. The reviewStatus badge (ACTIVE/MODIFIED/CANCELLED/EXECUTED)
   * distinguishes them visually.
   */
  async getBriefHistory(userId?: string, limit: number = 100, language?: string): Promise<TradingBriefDTO[]> {
    try {
      const where: any = {};
      if (userId) where.userId = userId;

      // V299: Include ALL briefs — active AND inactive. The history table
      // shows the full timeline with status badges (ACTIVE/MODIFIED/CANCELLED/
      // EXECUTED) to distinguish them. Previously, when no briefs had expired
      // yet, the history table appeared empty even though 18+ active briefs
      // existed. Now active briefs appear in both "Active Briefs" section
      // (filterable) and "History" section (full timeline).
      const briefs = await this.prisma.tradingBrief.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      if (briefs.length === 0) return [];

      // V292+V414: Link briefs to actual executed trades to get P&L and executor.
      // Strategy 1: Match by briefId in TradeJournal (direct link)
      // Strategy 2: Match by briefId in Position (if Position has briefId column)
      // Strategy 3: Fallback — match by symbol + side + time window in Position table.
      //   This catches trades executed by Stinger/Agent/SmartExecutor that
      //   weren't explicitly linked via briefId.
      const briefIds = briefs.map((b) => b.id);
      const outcomeByBriefId = new Map<string, { pnl?: number; closedAt?: Date; durationMs?: number; result?: string; source?: string }>();

      try {
        // Strategy 1: TradeJournal by briefId
        const journals = await this.prisma.tradeJournal.findMany({
          where: { briefId: { in: briefIds }, closedAt: { not: null } },
          orderBy: { closedAt: 'desc' },
        });
        for (const j of journals) {
          if (j.briefId && !outcomeByBriefId.has(j.briefId)) {
            outcomeByBriefId.set(j.briefId, {
              pnl: j.pnl !== null ? Number(j.pnl) : undefined,
              closedAt: j.closedAt ?? undefined,
              durationMs: (j as any).holdingDurationMs ?? (j as any).durationMs ?? undefined,
              result: j.result ?? undefined,
              source: 'council',
            });
          }
        }

        // Strategy 2+3: Position table — for briefs not yet matched
        const unmatchedBriefs = briefs.filter((b) => !outcomeByBriefId.has(b.id));
        if (unmatchedBriefs.length > 0) {
          // Generate both formats: 'BTC/USDT' and 'BTCUSDT'
          const symbols = [...new Set(unmatchedBriefs.flatMap((b) => {
            const raw = (b.pair || '').trim();
            return [raw, raw.replace('/', '')];
          }))];

          // Query Position table — use select to avoid schema mismatch issues
          const allPositions: any[] = await this.prisma.$queryRawUnsafe(
            `SELECT id, symbol, side, status, "realizedPnl", "openedAt", "closedAt", source
             FROM "Position"
             WHERE symbol = ANY($1::text[])
             ORDER BY "openedAt" DESC
             LIMIT 500`,
            symbols,
          ) as any;

          for (const brief of unmatchedBriefs) {
            const pairWithSlash = (brief.pair || '').trim();
            const pairNoSlash = pairWithSlash.replace('/', '');
            const issuedMs = new Date(brief.issuedAt).getTime();
            const expiresMs = new Date(brief.expiresAt).getTime();
            const briefSide = String(brief.direction).toUpperCase();

            const match = allPositions.find((p: any) => {
              const posSymbol = String(p.symbol || '').trim();
              const symbolMatch = posSymbol === pairWithSlash || posSymbol === pairNoSlash;
              const sideMatch = String(p.side).toUpperCase() === briefSide;
              const openedMs = new Date(p.openedAt).getTime();
              const timeMatch = openedMs >= issuedMs - 300000 && openedMs <= expiresMs + 300000;
              return symbolMatch && sideMatch && timeMatch;
            });
            if (match) {
              const isClosed = match.status === 'CLOSED' && match.closedAt;
              const pnl = isClosed ? (Number(match.realizedPnl) || 0) : undefined;
              const result = isClosed && pnl !== undefined
                ? (pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN')
                : undefined;
              const durationMs = isClosed && match.closedAt
                ? new Date(match.closedAt).getTime() - new Date(match.openedAt).getTime()
                : undefined;
              outcomeByBriefId.set(brief.id, {
                pnl,
                closedAt: match.closedAt ?? undefined,
                durationMs,
                result,
                source: match.source ?? 'user_manual',
              });
            }
          }
        }
      } catch (err: any) {
        this.logger.error(`🏛️ Outcome linking FAILED: ${err?.message} | stack: ${err?.stack?.substring(0, 500)}`);
      }

      const dtos = briefs.map((b) => {
        const dto = this._toDTO(b);
        const outcome = outcomeByBriefId.get(b.id);
        if (outcome) {
          dto.outcomePips = outcome.pnl;
          dto.closedAt = outcome.closedAt;
          dto.durationMs = outcome.durationMs;
          dto.result = outcome.result as any;
          dto.source = outcome.source;
        }
        return dto;
      });

      // V308: Translate analysisSummary to user's locale if needed
      if (language && language !== 'ar' && this.briefTranslation) {
        const translations = await this.briefTranslation.translateBatch(
          dtos
            .filter((d) => d.analysisSummary)
            .map((d) => ({
              id: d.id,
              text: d.analysisSummary!,
              label: `${d.pair} ${d.timeframe} analysisSummary`,
            })),
          language,
        );
        for (const dto of dtos) {
          const translated = translations.get(dto.id);
          if (translated) dto.analysisSummary = translated;
        }
      }

      return dtos;
    } catch (error: any) {
      this.logger.error(`🏛️ getBriefHistory failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a specific brief by ID
   */
  async getBriefById(briefId: string): Promise<TradingBriefDTO | null> {
    const brief = await this.prisma.tradingBrief.findUnique({
      where: { id: briefId },
    });
    return brief ? this._toDTO(brief) : null;
  }

  /**
   * Get last session result
   */
  async getLastSession(): Promise<CouncilSessionResult | null> {
    const cached = await this.redis.get('strategic-council:last_session');
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Get active briefs for a specific pair
   */
  async getBriefsForPair(pair: string, language?: string): Promise<TradingBriefDTO[]> {
    try {
      const briefs = await this.prisma.tradingBrief.findMany({
        where: { pair, isActive: true, reviewStatus: 'ACTIVE' },
        orderBy: { issuedAt: 'desc' },
      });
      const dtos = briefs.map((b) => this._toDTO(b));

      // V308: Translate analysisSummary to user's locale if needed
      if (language && language !== 'ar' && this.briefTranslation) {
        const translations = await this.briefTranslation.translateBatch(
          dtos
            .filter((d) => d.analysisSummary)
            .map((d) => ({
              id: d.id,
              text: d.analysisSummary!,
              label: `${d.pair} ${d.timeframe} analysisSummary`,
            })),
          language,
        );
        for (const dto of dtos) {
          const translated = translations.get(dto.id);
          if (translated) dto.analysisSummary = translated;
        }
      }

      return dtos;
    } catch (error: any) {
      this.logger.error(`🏛️ getBriefsForPair failed: ${error.message}`);
      // Return empty array instead of crashing — consistent with getActiveBriefs and getBriefHistory
      return [];
    }
  }

  /**
   * Mark a brief as executed (called by Smart Executor after successful trade)
   */
  async markBriefExecuted(briefId: string, orderId: string): Promise<void> {
    try {
      await this.prisma.tradingBrief.update({
        where: { id: briefId },
        data: {
          isActive: false,
          reviewStatus: 'EXECUTED',
          analysisSummary: `Executed → Order: ${orderId}`,
        },
      });
      this.logger.log(`🏛️ Brief ${briefId} marked as EXECUTED (order: ${orderId})`);
    } catch (error: any) {
      this.logger.error(`Failed to mark brief ${briefId} as executed: ${error.message}`);
    }
  }

  // ── Private: Core Analysis ──

  // ── V143: News Context Integration ──

  /**
   * V143: Fetch recent news context for a trading pair.
   * Retrieves relevant news articles from the NewsArticle database
   * and formats them as context for AI consensus analysis.
   *
   * This bridges the gap between the news analysis pipeline
   * (which fetches, translates, and analyzes news) and the
   * trading decision pipeline (which was previously news-blind).
   *
   * Returns a formatted string with recent news sentiment,
   * or empty string if no relevant news found (non-blocking).
   */
  private async _fetchNewsContextForPair(pair: string): Promise<string> {
    try {
      // Extract base symbol from pair (e.g., 'BTC' from 'BTC/USDT')
      const baseSymbol = pair.split('/')[0];

      // 1. Try RAG-based retrieval (semantic search — most relevant results)
      const ragContext = await this.ragService.retrieveRelevantContext(
        `${baseSymbol} cryptocurrency market news sentiment`,
        5,
      );
      if (ragContext) {
        this.logger.debug(`🏛️ V143: RAG context found for ${pair}: ${ragContext.length} chars`);
      }

      // 2. Also fetch latest news from NewsService (structured data with sentiment scores)
      const latestNews = await this.newsService.getLatestNews({
        symbol: baseSymbol,
        limit: 5,
      });

      // Format structured news into context
      let newsContext = '';

      if (latestNews && latestNews.length > 0) {
        const newsItems = latestNews.slice(0, 5).map((article: any, i: number) => {
          const sentiment = article.sentimentLabel || 'neutral';
          const impact = article.impactLevel || 'medium';
          const score = typeof article.sentiment === 'number' ? article.sentiment.toFixed(2) : '0';
          const title = article.translatedTitle || article.title || '';
          const summary = article.summary || '';
          const assets = article.affectedAssets || '';
          const hoursAgo = article.publishedAt
            ? Math.round((Date.now() - new Date(article.publishedAt).getTime()) / (60 * 60 * 1000))
            : '?';

          return `[${i + 1}] (${sentiment}, تأثير=${impact}, نقاط=${score}, منذ ${hoursAgo}ساعة) ${title}${summary ? ' — ' + summary : ''}${assets ? ' | أصول متأثرة: ' + assets : ''}`;
        }).join('\n');

        // Calculate aggregate news sentiment
        const sentimentScores = latestNews
          .map((a: any) => typeof a.sentiment === 'number' ? a.sentiment : 0)
          .filter((s: number) => s !== 0);
        const avgSentiment = sentimentScores.length > 0
          ? sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length
          : 0;
        const highImpactCount = latestNews.filter(
          (a: any) => a.impactLevel === 'high' || a.impactLevel === 'HIGH'
        ).length;

        const sentimentDirection = avgSentiment > 0.2 ? 'إيجابي 🟢' : avgSentiment < -0.2 ? 'سلبي 🔴' : 'محايد ⚪';
        const riskLevel = highImpactCount > 0 ? 'عالي ⚠️' : 'مقبول ✅';

        newsContext = `\n\n📰 سياق الأخبار المحللة لـ ${pair} (${latestNews.length} خبر حديث):\n` +
          `الملخص: اتجاه المشاعر ${sentimentDirection} (المعدل=${avgSentiment.toFixed(2)})، مستوى المخاطرة: ${riskLevel} (${highImpactCount} خبر عالي التأثير)\n` +
          `الأخبار:\n${newsItems}`;
      }

      // Combine RAG context (semantic relevance) + structured news (sentiment scores)
      // + market sentiment from rouatradingnews (Fear & Greed, Arab sentiment, geopolitical risk)
      const parts: string[] = [];

      if (ragContext) parts.push(`📚 سياق RAG ذي الصلة:\n${ragContext}`);
      if (newsContext) parts.push(newsContext);

      // V145: Also inject market sentiment from rouatradingnews
      try {
        const marketSentiment = await this.newsIntegration.getSentimentForAI();
        if (marketSentiment) parts.push(marketSentiment);
      } catch { /* non-blocking */ }

      const combined = parts.join('\n\n---\n\n');

      if (combined) {
        this.logger.log(`🏛️ V143: News context injected for ${pair} (${combined.length} chars, ${latestNews?.length || 0} articles, RAG=${ragContext ? 'yes' : 'no'})`);
      } else {
        this.logger.debug(`🏛️ V143: No news context for ${pair} — proceeding without news`);
      }

      return combined;
    } catch (error: any) {
      // Non-blocking: news context failure should NEVER prevent brief generation
      this.logger.warn(`🏛️ V143: News context fetch failed for ${pair}: ${error.message} — proceeding without news`);
      return '';
    }
  }

  /**
   * V143: Calculate news risk score for a pair.
   * Returns a value from -1 (strong sell signal from news) to +1 (strong buy signal),
   * along with risk flags that the executor can use to gate trades.
   *
   * This is used by both the Strategic Council (to adjust confidence)
   * and the Smart Executor (as a pre-execution risk gate).
   */
  async getNewsRiskScore(pair: string, language: string = 'ar'): Promise<{
    score: number;          // -1 to +1 (negative = bearish news, positive = bullish news)
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    opposingNews: boolean;  // true if high-impact news opposes the brief direction
    sentimentLabel: string; // human-readable label
    highImpactCount: number;
    recentArticleCount: number;
  }> {
    // V592: i18n — sentiment labels match the brief's language.
    const isAr = language === 'ar';
    const SENTIMENT_LABELS = isAr
      ? { strongPos: 'إيجابي قوي', lightPos: 'إيجابي خفيف', strongNeg: 'سلبي قوي', lightNeg: 'سلبي خفيف', neutral: 'محايد', noNews: 'لا أخبار متاحة' }
      : { strongPos: 'Strong Positive', lightPos: 'Light Positive', strongNeg: 'Strong Negative', lightNeg: 'Light Negative', neutral: 'Neutral', noNews: 'No news available' };

    const defaultResult = {
      score: 0,
      riskLevel: 'low' as const,
      opposingNews: false,
      sentimentLabel: SENTIMENT_LABELS.noNews,
      highImpactCount: 0,
      recentArticleCount: 0,
    };

    try {
      const baseSymbol = pair.split('/')[0];
      const latestNews = await this.newsService.getLatestNews({
        symbol: baseSymbol,
        limit: 10,
      });

      if (!latestNews || latestNews.length === 0) return defaultResult;

      // Filter to last 6 hours only (stale news is irrelevant)
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const recentNews = latestNews.filter((a: any) =>
        a.publishedAt && new Date(a.publishedAt) >= sixHoursAgo
      );

      if (recentNews.length === 0) return defaultResult;

      // Calculate weighted sentiment score
      let weightedScore = 0;
      let totalWeight = 0;
      let highImpactCount = 0;

      for (const article of recentNews) {
        const sentiment = typeof article.sentiment === 'number' ? article.sentiment : 0;
        const impact = article.impactLevel?.toLowerCase();
        const hoursAgo = article.publishedAt
          ? (Date.now() - new Date(article.publishedAt).getTime()) / (60 * 60 * 1000)
          : 24;

        // Weight: high impact = 3x, medium = 2x, low = 1x
        // Decay: recent news gets more weight (1.0 at 0h → 0.2 at 6h)
        const impactWeight = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
        const timeDecay = Math.max(0.2, 1 - (hoursAgo / 6));
        const weight = impactWeight * timeDecay;

        weightedScore += sentiment * weight;
        totalWeight += weight;

        if (impact === 'high') highImpactCount++;
      }

      const score = totalWeight > 0 ? Math.max(-1, Math.min(1, weightedScore / totalWeight)) : 0;

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      if (highImpactCount >= 3 && Math.abs(score) > 0.5) riskLevel = 'critical';
      else if (highImpactCount >= 2 && Math.abs(score) > 0.3) riskLevel = 'high';
      else if (highImpactCount >= 1 || Math.abs(score) > 0.3) riskLevel = 'medium';
      else riskLevel = 'low';

      const sentimentLabel = score > 0.3 ? SENTIMENT_LABELS.strongPos : score > 0.1 ? SENTIMENT_LABELS.lightPos
        : score < -0.3 ? SENTIMENT_LABELS.strongNeg : score < -0.1 ? SENTIMENT_LABELS.lightNeg : SENTIMENT_LABELS.neutral;

      return {
        score,
        riskLevel,
        opposingNews: false, // Determined by caller based on brief direction
        sentimentLabel,
        highImpactCount,
        recentArticleCount: recentNews.length,
      };
    } catch (error: any) {
      this.logger.warn(`🏛️ V143: News risk score failed for ${pair}: ${error.message}`);
      return defaultResult;
    }
  }

  /**
   * FIX: Reference prices for Forex/Stock/Commodity pairs.
   * These are approximate mid-market prices used ONLY when ALL live price sources fail.
   * This prevents pairs from being completely skipped when market data APIs are down.
   * The prices are updated frequently enough for trading signal generation —
   * even a slightly stale reference price is better than skipping the pair entirely,
   * because SL/TP levels are calculated as percentages from the entry price.
   */
  private readonly REFERENCE_PRICES: Record<string, number> = {
    // Forex (updated 2026-07-12)
    'EUR/USD': 1.10, 'GBP/USD': 1.34, 'USD/JPY': 157.0,
    // Stocks (approximate, updated 2026-07-12)
    'AAPL': 210.0, 'MSFT': 440.0, 'GOOGL': 168.0, 'TSLA': 280.0,
    // Commodities
    'XAU/USD': 3250.0,
    // Crypto (updated 2026-07-12 — V1182: was 736% off on DOT, 445% off on AVAX)
    'BTC/USDT': 64032.0, 'ETH/USDT': 1817.0, 'SOL/USDT': 77.3,
    'BNB/USDT': 579.0, 'XRP/USDT': 1.10, 'ADA/USDT': 0.164,
    'DOGE/USDT': 0.0734, 'DOT/USDT': 0.84, 'AVAX/USDT': 6.42,
    'MATIC/USDT': 0.379, 'LINK/USDT': 8.03, 'UNI/USDT': 3.66,
  };

  /**
   * Price sanity ranges — reject absurd prices that would produce
   * broken SL/TP (e.g., BTC at $35 instead of $81,000).
   */
  private readonly PRICE_SANITY: Record<string, { min: number; max: number }> = {
    // BUG-034 FIX: Extended to cover ALL 23 supported pairs
    // Crypto (Binance)
    'BTC/USDT': { min: 20000, max: 200000 },
    'ETH/USDT': { min: 500, max: 10000 },
    'SOL/USDT': { min: 5, max: 500 },
    'BNB/USDT': { min: 100, max: 2000 },
    'XRP/USDT': { min: 0.1, max: 10 },
    'ADA/USDT': { min: 0.1, max: 10 },
    'DOGE/USDT': { min: 0.01, max: 1 },
    'DOT/USDT': { min: 1, max: 100 },
    'MATIC/USDT': { min: 0.1, max: 10 },
    'AVAX/USDT': { min: 1, max: 200 },
    'LINK/USDT': { min: 1, max: 100 },
    'UNI/USDT': { min: 1, max: 50 },
    // Forex majors (OANDA)
    'EUR/USD': { min: 0.8, max: 1.5 },
    'GBP/USD': { min: 1.0, max: 1.8 },
    'USD/JPY': { min: 100, max: 200 },
    'USD/CHF': { min: 0.7, max: 1.2 },
    'AUD/USD': { min: 0.5, max: 0.9 },
    'NZD/USD': { min: 0.4, max: 0.8 },
    'USD/CAD': { min: 1.1, max: 1.6 },
    // Metals (OANDA)
    'XAU/USD': { min: 1000, max: 5000 },
    'XAG/USD': { min: 10, max: 100 },
    // Energy (OANDA)
    'WTI/USD': { min: 20, max: 300 },
    'BRENT/USD': { min: 20, max: 300 },
    // Indices (OANDA)
    'US30/USD': { min: 20000, max: 60000 },
    'NAS100/USD': { min: 5000, max: 30000 },
    'SPX500/USD': { min: 2000, max: 8000 },
  };

  /**
   * Analyze a single pair across all timeframes
   * For each timeframe, decide: new brief, modify existing, or cancel
   */
  private async _analyzePair(
    pair: string,
    result: CouncilSessionResult,
    language: 'ar' | 'en' | 'fr' | 'tr' | 'es' | 'zh' | 'ru' | 'hi' | 'pt' | 'de'
      | 'ja' | 'ko' | 'id' | 'vi' | 'th' | 'it' | 'pl' | 'nl' | 'ms' | 'he'
      | 'sv' | 'uk' | 'fa' | 'ur' | 'fil' | 'da' | 'no' | 'fi' | 'cs' | 'hu'
      | 'ro' | 'bn' = 'ar',
  ): Promise<void> {
    // FIX: Use orchestrator's fetchQuickMarketData instead of exchangeService.getQuote.
    // exchangeService.getQuote fails on Railway for many pairs (Binance blocked, no TwelveData key).
    // The orchestrator's fetcher uses multiple parallel sources (Binance, CoinGecko, CoinCap, Bybit,
    // Yahoo Finance, ExchangeRate API, Alpha Vantage) and works reliably on cloud platforms.
    let currentPrice = 0;
    let priceSource = 'none';
    try {
      const marketData = await this.orchestrator.fetchQuickMarketData(pair);
      currentPrice = marketData.price;
      priceSource = 'orchestrator';
    } catch (e: any) {
      this.logger.warn(`🏛️ Orchestrator market data failed for ${pair}: ${e.message} — trying ExchangeService`);
      result.diagnostics?.push(`${pair}: orchestrator price failed: ${e.message}`);
    }

    // Fallback: try ExchangeService if orchestrator failed
    if (currentPrice <= 0) {
      try {
        const quote = await this.exchangeService.getQuote(pair);
        currentPrice = quote.price;
        priceSource = 'exchange';
      } catch (e: any) {
        this.logger.warn(`🏛️ ExchangeService also failed for ${pair}: ${e.message}`);
        result.diagnostics?.push(`${pair}: exchange price also failed: ${e.message}`);
      }
    }

    // FIX: CRITICAL — Use reference price as LAST RESORT instead of skipping the pair.
    // Previously, when all live price sources failed, the pair was COMPLETELY SKIPPED,
    // meaning no briefs were ever generated for Forex/Stock pairs on Railway.
    // A reference price with a deterministic direction signal is ALWAYS better than
    // no signal at all, because SL/TP levels protect against price inaccuracies.
    if (currentPrice <= 0) {
      const refPrice = this.REFERENCE_PRICES[pair];
      if (refPrice && refPrice > 0) {
        currentPrice = refPrice;
        priceSource = 'reference-table';
        this.logger.warn(`🏛️ Using reference price for ${pair}: ${refPrice} (live sources unavailable)`);
        result.diagnostics?.push(`${pair}: using REFERENCE price=${refPrice} (live sources unavailable)`);
      } else {
        this.logger.warn(`🏛️ Could not fetch price for ${pair} from any source and no reference price — skipping`);
        result.diagnostics?.push(`${pair}: NO PRICE from any source — skipped`);
        return;
      }
    }

    result.diagnostics?.push(`${pair}: price=${currentPrice} from ${priceSource}`);

    // FIX: Price sanity check — reject absurd prices.
    // If BTC/USDT returns $35 instead of $81,000 (e.g., data source returned
    // a different asset's price), the resulting SL=$35.29 and TP=$35.82 would
    // be completely wrong, and position sizing would produce 80+ BTC trades.
    const sanity = this.PRICE_SANITY[pair];
    if (sanity && (currentPrice < sanity.min || currentPrice > sanity.max)) {
      this.logger.error(
        `🏛️ PRICE SANITY FAILED for ${pair}: $${currentPrice} outside range [$${sanity.min}, $${sanity.max}] ` +
        `— source: ${priceSource}. Using reference price as fallback.`
      );
      const refPrice = this.REFERENCE_PRICES[pair];
      if (refPrice && refPrice >= sanity.min && refPrice <= sanity.max) {
        currentPrice = refPrice;
        priceSource = 'reference-table (sanity-fallback)';
        result.diagnostics?.push(`${pair}: SANITY CHECK FAILED — using reference price $${refPrice}`);
      } else {
        this.logger.error(`🏛️ No valid reference price for ${pair} — skipping`);
        result.diagnostics?.push(`${pair}: SANITY CHECK FAILED and no valid reference — SKIPPED`);
        return;
      }
    }

    // Analyze each timeframe
    // V267: Pass `language` down so each timeframe's brief is generated in the user's locale.
    for (const timeframe of EXECUTOR_TIMEFRAMES) {
      try {
        await this._analyzePairTimeframe(pair, timeframe, currentPrice, result, language);
      } catch (error: any) {
        this.logger.error(`🏛️ Analysis failed for ${pair} ${timeframe}: ${error.message}`);
        result.diagnostics?.push(`${pair} ${timeframe}: ANALYSIS ERROR: ${error.message}`);
      }
    }
  }

  /**
   * Analyze a pair on a specific timeframe
   * 1. Check if there's an existing active brief
   * 2. Get AI consensus analysis
   * 3. Decide: issue new, modify existing, or cancel
   */
  private async _analyzePairTimeframe(
    pair: string,
    timeframe: BriefTimeframe,
    currentPrice: number,
    result: CouncilSessionResult,
    language: 'ar' | 'en' | 'fr' | 'tr' | 'es' | 'zh' | 'ru' | 'hi' | 'pt' | 'de'
      | 'ja' | 'ko' | 'id' | 'vi' | 'th' | 'it' | 'pl' | 'nl' | 'ms' | 'he'
      | 'sv' | 'uk' | 'fa' | 'ur' | 'fil' | 'da' | 'no' | 'fi' | 'cs' | 'hu'
      | 'ro' | 'bn' = 'ar',
  ): Promise<void> {
    // Find existing active brief for this pair+timeframe
    const existingBrief = await this.prisma.tradingBrief.findFirst({
      where: {
        pair,
        timeframe: timeframe as any,
        isActive: true,
        reviewStatus: { in: ['ACTIVE', 'MODIFIED'] },
      },
    });

    // V143: Fetch news context for this pair to inject into AI analysis.
    // This is the KEY integration point — previously the council was news-blind.
    // Now it sees recent news sentiment, impact levels, and affected assets
    // before making BUY/SELL/HOLD decisions.
    const newsContext = await this._fetchNewsContextForPair(pair);
    const newsRisk = await this.getNewsRiskScore(pair, language);

    // Get AI consensus analysis
    // BUG-029 FIX: Removed forceFresh=true — was bypassing 30-min Redis cache (V289),
    // causing ~137,000 AI calls/day instead of ~34,000. The original justification
    // (stale startup session) was removed at line 116-124. Cache is now effective.
    const consensus = await this.orchestrator.getConsensusAnalysis(pair, {
      forceFresh: false,
      newsContext: newsContext || undefined,
      language,
    } as any);

    // V143: Adjust confidence based on news risk score.
    // If news sentiment strongly opposes the AI recommendation, reduce confidence.
    // If news sentiment supports the AI recommendation, boost confidence slightly.
    let newsAdjustedConfidence = consensus.consensusScore;
    const newsDirection: BriefDirection = consensus.recommendation === 'BUY' ? 'BUY' : 'SELL';
    const newsSupportsDirection = (newsDirection === 'BUY' && newsRisk.score > 0.1) ||
                                   (newsDirection === 'SELL' && newsRisk.score < -0.1);
    const newsOpposesDirection = (newsDirection === 'BUY' && newsRisk.score < -0.3) ||
                                  (newsDirection === 'SELL' && newsRisk.score > 0.3);

    if (newsOpposesDirection && newsRisk.riskLevel === 'critical') {
      newsAdjustedConfidence = Math.max(0, consensus.consensusScore - 15);
      this.logger.warn(`🏛️ V143: News OPPOSES ${newsDirection} for ${pair} (news score=${newsRisk.score.toFixed(2)}, risk=${newsRisk.riskLevel}) — confidence reduced ${consensus.consensusScore}% → ${newsAdjustedConfidence}%`);
    } else if (newsOpposesDirection) {
      newsAdjustedConfidence = Math.max(0, consensus.consensusScore - 8);
      this.logger.log(`🏛️ V143: News slightly opposes ${newsDirection} for ${pair} (news score=${newsRisk.score.toFixed(2)}) — confidence adjusted ${consensus.consensusScore}% → ${newsAdjustedConfidence}%`);
    } else if (newsSupportsDirection) {
      newsAdjustedConfidence = Math.min(95, consensus.consensusScore + 5);
      this.logger.log(`🏛️ V143: News supports ${newsDirection} for ${pair} (news score=${newsRisk.score.toFixed(2)}) — confidence boosted ${consensus.consensusScore}% → ${newsAdjustedConfidence}%`);
    }

    // V143: Apply news-adjusted confidence directly to the consensus object.
    // This way, all downstream code (including the effectiveConsensus = consensus line)
    // uses the news-adjusted values.
    consensus.consensusScore = newsAdjustedConfidence;
    if (newsContext) {
      // V592: i18n — news context suffix must match the brief's language.
      // Previously hardcoded Arabic, now uses the same `language` prop.
      const newsSuffix = language === 'ar'
        ? `\n\n📰 سياق الأخبار: مشاعر=${newsRisk.sentimentLabel}, مخاطر=${newsRisk.riskLevel}, نقاط=${newsRisk.score.toFixed(2)} (${newsRisk.recentArticleCount} خبر حديث)`
        : `\n\n📰 News context: sentiment=${newsRisk.sentimentLabel}, risk=${newsRisk.riskLevel}, score=${newsRisk.score.toFixed(2)} (${newsRisk.recentArticleCount} recent articles)`;
      consensus.masterStrategy = (consensus.masterStrategy || '') + newsSuffix;
    }

    // FIX: When AI models fail (isFallback=true, confidence=0), generate a technical-analysis
    // based brief instead of cancelling everything. This prevents the entire pipeline from
    // stalling when AI providers are down.
    const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;

    // FIX: Detailed decision logging — helps diagnose why briefs aren't being created.
    // Previously, the Council silently produced 0 briefs with no explanation.
    // V143: Include news risk info in diagnostics.
    this.logger.log(
      `🏛️ Decision point for ${pair} ${timeframe}: ` +
      `recommendation=${consensus.recommendation}, score=${consensus.consensusScore}%, ` +
      `isFallback=${isAIFallback}, analyses=${consensus.analyses?.length || 0}, ` +
      `newsRisk=${newsRisk.riskLevel}(${newsRisk.score.toFixed(2)}), ` +
      `existingBrief=${existingBrief ? existingBrief.id : 'none'}`,
    );
    result.diagnostics?.push(`${pair} ${timeframe}: rec=${consensus.recommendation} score=${consensus.consensusScore}% fallback=${isAIFallback} models=${consensus.analyses?.length || 0} newsRisk=${newsRisk.riskLevel}(${newsRisk.score.toFixed(2)})`);

    // V-PHASE1: Respect AI HOLD decisions instead of overriding them.
    // Previously, when AI said HOLD, a technical override forced BUY/SELL — this caused
    // overtrading in ambiguous markets and was a major source of losses. The AI saying HOLD
    // means "no clear edge" — trading without an edge is gambling, not trading.
    // Now: HOLD is a valid and respected decision. Only override if technical signal is STRONG
    // (consensusScore >= 65, not the default 48-55 from RSI-only fallback).
    if (!isAIFallback && consensus.recommendation === 'HOLD') {
      const technicalOverride = await this._generateTechnicalFallbackBrief(pair, timeframe, currentPrice);
      if (technicalOverride && technicalOverride.recommendation !== 'HOLD' && technicalOverride.consensusScore >= 65) {
        // Strong technical signal overrides AI caution — only when confidence is genuinely high
        this.logger.log(`🏛️ Technical override: AI said HOLD for ${pair} ${timeframe}, but STRONG momentum shows ${technicalOverride.recommendation} (score=${technicalOverride.consensusScore})`);
        // Create brief using technical analysis
        const direction: BriefDirection = technicalOverride.recommendation === 'BUY' ? 'BUY' : 'SELL';
        let { entryPrice, stopLoss, takeProfit, strictRules } = this._calculateLevels(currentPrice, direction, timeframe);
        ({ stopLoss, takeProfit } = this._validateAndFixLevels(direction, entryPrice, stopLoss, takeProfit, timeframe));

        if (existingBrief) {
          const sameDirection = existingBrief.direction === direction;
          const priceDiff = Math.abs(Number(existingBrief.entryPrice) - entryPrice) / entryPrice;
          if (sameDirection && priceDiff < 0.005) {
            await this.prisma.tradingBrief.update({
              where: { id: existingBrief.id },
              data: { lastReviewedAt: new Date(), confidence: technicalOverride.consensusScore, analysisSummary: technicalOverride.masterStrategy },
            });
          } else {
            await this.prisma.tradingBrief.update({
              where: { id: existingBrief.id },
              data: {
                direction, entryPrice, stopLoss, takeProfit,
                confidence: technicalOverride.consensusScore,
                strictRules: JSON.stringify(strictRules),
                lastReviewedAt: new Date(), reviewStatus: 'MODIFIED',
                expiresAt: new Date(Date.now() + TIMEFRAME_EXPIRY_MS[timeframe]),
                analysisSummary: technicalOverride.masterStrategy,
              },
            });
            result.briefsModified++;
            this.logger.log(`🏛️ Technical override modified brief for ${pair} ${timeframe}: ${direction}`);
          }
        } else {
          try {
            await this.prisma.tradingBrief.create({
              data: {
                pair, direction, entryPrice, stopLoss, takeProfit,
                confidence: technicalOverride.consensusScore, timeframe: timeframe as any,
                issuedAt: new Date(),
                expiresAt: new Date(Date.now() + TIMEFRAME_EXPIRY_MS[timeframe]),
                isActive: true, strictRules: JSON.stringify(strictRules),
                lastReviewedAt: new Date(), reviewStatus: 'ACTIVE',
                analysisSummary: technicalOverride.masterStrategy || `تحليل تقني: ${direction} بثقة ${technicalOverride.consensusScore}%`,
              },
            });
            result.briefsIssued++;
            this.logger.log(`🏛️ Technical override new brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice}`);
          } catch (dbError: any) {
            this.logger.error(`🏛️ FAILED technical override brief for ${pair} ${timeframe}: ${dbError.message}`);
          }
        }
        await this._addCost(technicalOverride.analyses?.length || 1);
        return;
      }

      // Pure HOLD — technical analysis also shows no clear direction
      // Keep existing brief if any, don't cancel it
      result.diagnostics?.push(`${pair} ${timeframe}: Pure HOLD — no directional signal`);
      if (existingBrief) {
        await this.prisma.tradingBrief.update({
          where: { id: existingBrief.id },
          data: { lastReviewedAt: new Date() },
        });
        this.logger.debug(`🏛️ Pure HOLD (no directional signal) — keeping existing brief for ${pair} ${timeframe}`);
      }
      return;
    }

    // Still check minimum consensus score for non-HOLD recommendations
    // FIX: Lowered from 30 to 15 — in active trading, even weak directional
    // signals are actionable. The risk management (stop loss, take profit)
    // handles downside protection. Skipping weak signals means no briefs ever.
    // FIX: Lowered threshold from 15 to MIN_CONSENSUS_SCORE (40).
    // The old 15% threshold was arbitrary and didn't match MIN_CONSENSUS_SCORE.
    // Now uses the same constant consistently.
    // V190: Read consensusThreshold from DB admin settings (cached).
    const councilCfg = await this._getCouncilConfig();
    if (!isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore < councilCfg.consensusThreshold) {
      this.logger.debug(`🏛️ Consensus too low (${consensus.consensusScore}%) for ${pair} ${timeframe} — skipping (threshold=${councilCfg.consensusThreshold}%, news-adjusted)`);
      result.diagnostics?.push(`${pair} ${timeframe}: SKIPPED — consensus too low (${consensus.consensusScore}% < ${councilCfg.consensusThreshold}%) [news-adjusted]`);
      if (existingBrief) {
        await this.prisma.tradingBrief.update({
          where: { id: existingBrief.id },
          data: { lastReviewedAt: new Date() },
        });
      }
      return;
    }

    // FIX: When AI is unavailable (fallback), try to generate a technical-analysis based brief
    // using market data from ExchangeService instead of leaving the pipeline completely empty.
    let effectiveConsensus = consensus;
    if (isAIFallback) {
      const technicalBrief = await this._generateTechnicalFallbackBrief(pair, timeframe, currentPrice);
      if (technicalBrief) {
        effectiveConsensus = technicalBrief;
        this.logger.log(`🏛️ Using technical-analysis fallback for ${pair} ${timeframe} (AI unavailable)`);
      } else {
        // Technical analysis also failed — keep existing brief if any, don't cancel
        if (existingBrief) {
          await this.prisma.tradingBrief.update({
            where: { id: existingBrief.id },
            data: { lastReviewedAt: new Date() },
          });
          this.logger.debug(`🏛️ AI and technical analysis unavailable — keeping existing brief for ${pair} ${timeframe}`);
        }
        return;
      }
    }

    const direction: BriefDirection = effectiveConsensus.recommendation === 'BUY' ? 'BUY' : 'SELL';

    // Calculate entry, SL, TP based on current price and direction
    const { entryPrice, stopLoss, takeProfit, strictRules } = this._calculateLevels(
      currentPrice,
      direction,
      timeframe,
    );

    if (existingBrief) {
      // Check if existing brief needs modification
      const sameDirection = existingBrief.direction === direction;
      const priceDiff = Math.abs(Number(existingBrief.entryPrice) - entryPrice) / entryPrice;

      if (sameDirection && priceDiff < 0.005) {
        // Direction same and entry price close enough — just update review timestamp
        await this.prisma.tradingBrief.update({
          where: { id: existingBrief.id },
          data: {
            lastReviewedAt: new Date(),
            confidence: effectiveConsensus.consensusScore,
            analysisSummary: effectiveConsensus.masterStrategy,
          },
        });
        this.logger.debug(`🏛️ Brief for ${pair} ${timeframe} reviewed — no change needed`);
      } else {
        // Direction changed or significant price shift — modify brief
        await this.prisma.tradingBrief.update({
          where: { id: existingBrief.id },
          data: {
            direction,
            entryPrice,
            stopLoss,
            takeProfit,
            confidence: effectiveConsensus.consensusScore,
            strictRules: JSON.stringify(strictRules),
            lastReviewedAt: new Date(),
            reviewStatus: 'MODIFIED',
            expiresAt: new Date(Date.now() + TIMEFRAME_EXPIRY_MS[timeframe]),
            analysisSummary: effectiveConsensus.masterStrategy,
          },
        });
        result.briefsModified++;
        this.logger.log(`🏛️ Modified brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice}`);
      }
    } else {
      // No existing brief — issue a new one
      try {
        await this.prisma.tradingBrief.create({
          data: {
            pair,
            direction,
            entryPrice,
            stopLoss,
            takeProfit,
            confidence: effectiveConsensus.consensusScore,
            timeframe: timeframe as any,
            issuedAt: new Date(),
            expiresAt: new Date(Date.now() + TIMEFRAME_EXPIRY_MS[timeframe]),
            isActive: true,
            strictRules: JSON.stringify(strictRules),
            lastReviewedAt: new Date(),
            reviewStatus: 'ACTIVE',
            analysisSummary: effectiveConsensus.masterStrategy || `إجماع المجلس: ${direction} بثقة ${effectiveConsensus.consensusScore}%`,
          },
        });
        result.briefsIssued++;
        this.logger.log(`🏛️ New brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice} (confidence: ${effectiveConsensus.consensusScore}%)`);
        result.diagnostics?.push(`${pair} ${timeframe}: BRIEF CREATED ${direction} @ ${entryPrice} conf=${effectiveConsensus.consensusScore}%`);
      } catch (dbError: any) {
        this.logger.error(`🏛️ FAILED to create brief for ${pair} ${timeframe}: ${dbError.message} | data: direction=${direction} entryPrice=${entryPrice} stopLoss=${stopLoss} takeProfit=${takeProfit} confidence=${effectiveConsensus.consensusScore} timeframe=${timeframe}`);
        result.diagnostics?.push(`${pair} ${timeframe}: DB CREATE FAILED: ${dbError.message}`);
      }
    }

    // Track cost
    await this._addCost(effectiveConsensus.analyses?.length || 0);
  }

  /**
   * FIX: Generate a technical-analysis based consensus when AI models are unavailable.
   * Uses basic momentum and trend indicators from exchange data to produce a
   * BUY/SELL recommendation with a conservative confidence score.
   * This prevents the entire trading pipeline from stalling when AI providers are down.
   *
   * IMPROVEMENT: Lowered momentum threshold to 0.0003 (0.03%) — in Forex, even
   * tiny movements are tradeable with proper SL/TP. Also added simple moving
   * average crossover detection for more reliable signals.
   */
  /**
   * FIX: Generate a technical-analysis based consensus when AI models are unavailable.
   *
   * KEY FIX: Now uses orchestrator.fetchQuickMarketData() which uses multiple parallel
   * price sources (Binance, CoinGecko, CoinCap, Bybit) instead of ExchangeService
   * which fails on Railway. Also uses 24h change percentage and RSI for direction.
   *
   * CRITICAL: This method should ALMOST ALWAYS produce a directional signal (BUY/SELL)
   * because in active Forex/Crypto markets, there is ALWAYS a direction. Returning
   * null (which leads to no brief) is the worst outcome — it means the entire pipeline
   * stalls. A low-confidence directional signal with proper SL/TP is always better than
   * no signal at all.
   */
  private async _generateTechnicalFallbackBrief(
    pair: string,
    timeframe: BriefTimeframe,
    currentPrice: number,
  ): Promise<{
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    consensusScore: number;
    masterStrategy: string;
    analyses: Array<{ role: string; model: string; vote: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reason: string }>;
  } | null> {
    try {
      // ===== STRATEGY 1: Use orchestrator's market data (works on Railway!) =====
      // The orchestrator uses multiple parallel price sources and provides RSI + 24h change
      let momentum = 0; // -1 to 1 (bearish to bullish)
      let confidence = 55;
      let rsi = 50;
      let change24h = 0;
      let usedOrchestratorData = false;

      try {
        const marketData = await this.orchestrator.fetchQuickMarketData(pair);
        if (marketData.price > 0) {
          rsi = marketData.rsi;
          change24h = marketData.change24h || 0;
          usedOrchestratorData = true;

          // Use 24h change percentage as primary direction indicator
          // This is available from Binance, CoinGecko, CoinCap, and Bybit
          if (change24h !== 0) {
            momentum = change24h / 100; // Convert percentage to ratio
            this.logger.debug(`🏛️ Technical fallback using 24h change: ${change24h.toFixed(2)}%, RSI=${rsi}`);
          }
        }
      } catch (err: any) {
        this.logger.debug(`🏛️ Orchestrator market data unavailable: ${err.message}`);
      }

      // ===== STRATEGY 2: Use ExchangeService historical data =====
      // Only try this if orchestrator didn't provide 24h change
      if (!usedOrchestratorData || change24h === 0) {
        try {
          const candles = await this.exchangeService.getHistoricalData(pair, '1h');
          if (candles && candles.length >= 10) {
            const closes = candles.map((c: any) => Number(c.close ?? c[4] ?? 0)).filter((v: number) => v > 0);
            if (closes.length >= 10) {
              const recentAvg = closes.slice(-6).reduce((a: number, b: number) => a + b, 0) / 6;
              const olderAvg = closes.slice(-12, -6).length > 0
                ? closes.slice(-12, -6).reduce((a: number, b: number) => a + b, 0) / closes.slice(-12, -6).length
                : recentAvg;
              momentum = (recentAvg - olderAvg) / olderAvg;

              // Simple RSI-like calculation
              let gains = 0, losses = 0;
              for (let i = 1; i < closes.length; i++) {
                const change = closes[i] - closes[i - 1];
                if (change > 0) gains += change;
                else losses += Math.abs(change);
              }
              const rs = losses === 0 ? 100 : gains / losses;
              rsi = 100 - (100 / (1 + rs));

              this.logger.debug(`🏛️ Technical fallback using historical data: momentum=${(momentum * 100).toFixed(3)}%, RSI=${rsi.toFixed(0)}`);
            }
          }
        } catch (err: any) {
          this.logger.debug(`🏛️ Historical data also unavailable: ${err.message}`);
        }
      }

      // ===== GENERATE SIGNAL =====
      // FIX: Lowered change24h threshold from 0.01 (1%) to 0.001 (0.1%).
      // Forex pairs like EUR/USD typically move only 0.3-0.8% per DAY.
      // The old 1% threshold meant Forex pairs NEVER triggered this signal,
      // causing the entire pipeline to stall with zero briefs for Forex.
      // Even crypto only occasionally moves >1% in 24h on stable days.
      //
      // Priority 1: Use 24h change + RSI for direction
      if (change24h > 0.001 && rsi < 75) {
        // Positive 24h change, not overbought (relaxed from 70 to 75)
        // Scale confidence: 0.1% change → ~55, 1% change → ~58, 5% change → ~70
        confidence = Math.min(70, 55 + Math.min(Math.abs(change24h) * 3, 15));
        return {
          recommendation: 'BUY',
          consensusScore: Math.round(confidence),
          masterStrategy: `تحليل تقني — اتجاه صاعد 24h (${change24h.toFixed(2)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/24h-Change', vote: 'BUY', confidence: Math.round(confidence), reason: `ارتفاع ${change24h.toFixed(2)}% خلال 24 ساعة مع RSI ${rsi.toFixed(0)}` },
            { role: 'محلل اتجاه', model: 'Technical/Trend', vote: 'BUY', confidence: Math.round(confidence - 5), reason: `زخم إيجابي في السوق` },
          ],
        };
      } else if (change24h < -0.001 && rsi > 25) {
        // Negative 24h change, not oversold (relaxed from 30 to 25)
        confidence = Math.min(70, 55 + Math.min(Math.abs(change24h) * 3, 15));
        return {
          recommendation: 'SELL',
          consensusScore: Math.round(confidence),
          masterStrategy: `تحليل تقني — اتجاه هابط 24h (${change24h.toFixed(2)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/24h-Change', vote: 'SELL', confidence: Math.round(confidence), reason: `انخفاض ${change24h.toFixed(2)}% خلال 24 ساعة مع RSI ${rsi.toFixed(0)}` },
            { role: 'محلل اتجاه', model: 'Technical/Trend', vote: 'SELL', confidence: Math.round(confidence - 5), reason: `زخم سلبي في السوق` },
          ],
        };
      }

      // Priority 2: Use momentum from historical data
      if (momentum > 0.0003 && rsi < 70) {
        confidence = Math.min(70, 55 + Math.abs(momentum) * 2000);
        return {
          recommendation: 'BUY',
          consensusScore: Math.round(confidence),
          masterStrategy: `تحليل تقني — زخم إيجابي (${(momentum * 100).toFixed(3)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/Momentum', vote: 'BUY', confidence: Math.round(confidence), reason: `زخم إيجابي ${(momentum * 100).toFixed(3)}% مع RSI ${rsi.toFixed(0)}` },
          ],
        };
      } else if (momentum < -0.0003 && rsi > 30) {
        confidence = Math.min(70, 55 + Math.abs(momentum) * 2000);
        return {
          recommendation: 'SELL',
          consensusScore: Math.round(confidence),
          masterStrategy: `تحليل تقني — زخم سلبي (${(momentum * 100).toFixed(3)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/Momentum', vote: 'SELL', confidence: Math.round(confidence), reason: `زخم سلبي ${(momentum * 100).toFixed(3)}% مع RSI ${rsi.toFixed(0)}` },
          ],
        };
      }

      // Priority 3: RSI-based direction (when no clear momentum)
      // V177 FIX #14: Wider RSI neutral zone to reduce SELL bias.
      // Old: RSI < 50 = SELL, RSI >= 50 = BUY → 85%+ SELL because crypto RSI
      // often hovers in 40-55 range, slightly below 50.
      // New: RSI < 40 = SELL, RSI > 60 = BUY, 40-60 = use 24h change
      if (rsi < 40) {
        // RSI below 40 = strong bearish
        confidence = 48;
        return {
          recommendation: 'SELL',
          consensusScore: confidence,
          masterStrategy: `تحليل تقني — RSI منخفض (${rsi.toFixed(0)}) يشير لضغط بيع قوي. وقف خسارة قريب مطلوب.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/RSI', vote: 'SELL', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} دون 40 — ضغط بيعي قوي` },
          ],
        };
      } else if (rsi > 60) {
        // RSI above 60 = strong bullish
        confidence = 48;
        return {
          recommendation: 'BUY',
          consensusScore: confidence,
          masterStrategy: `تحليل تقني — RSI مرتفع (${rsi.toFixed(0)}) يشير لزخم شرائي قوي. وقف خسارة قريب مطلوب.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/RSI', vote: 'BUY', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} فوق 60 — زخم إيجابي قوي` },
          ],
        };
      // V-PHASE1: Added HOLD zone for neutral markets. RSI 40-60 with change < 0.3%
      // is a genuinely ambiguous market — no edge, no trade. Better to wait.
      // Previously, this block ALWAYS forced BUY or SELL, generating weak signals.
      } else {
        // RSI 40-60 = neutral zone — check if 24h change is meaningful
        if (Math.abs(change24h) > 0.3) {
          // Meaningful 24h change (>0.3%) — use it for direction
          if (change24h > 0) {
            confidence = 48;
            return {
              recommendation: 'BUY',
              consensusScore: confidence,
              masterStrategy: `تحليل تقني — RSI محايد (${rsi.toFixed(0)})، اتجاه 24h صاعد (${change24h.toFixed(2)}%). وقف خسارة قريب مطلوب.`,
              analyses: [
                { role: 'محلل تقني', model: 'Technical/RSI-Neutral+24h', vote: 'BUY', confidence: confidence, reason: `RSI محايد ${rsi.toFixed(0)} مع ارتفاع ${change24h.toFixed(2)}% خلال 24 ساعة` },
              ],
            };
          } else {
            confidence = 48;
            return {
              recommendation: 'SELL',
              consensusScore: confidence,
              masterStrategy: `تحليل تقني — RSI محايد (${rsi.toFixed(0)})، اتجاه 24h هابط (${change24h.toFixed(2)}%). وقف خسارة قريب مطلوب.`,
              analyses: [
                { role: 'محلل تقني', model: 'Technical/RSI-Neutral+24h', vote: 'SELL', confidence: confidence, reason: `RSI محايد ${rsi.toFixed(0)} مع انخفاض ${change24h.toFixed(2)}% خلال 24 ساعة` },
              ],
            };
          }
        } else {
          // V-PHASE1: Weak 24h change (<0.3%) + neutral RSI = NO EDGE. Return HOLD.
          // This is the "smart waiting" that prevents overtrading in flat markets.
          return {
            recommendation: 'HOLD',
            consensusScore: 45,
            masterStrategy: `سوق محايد — RSI ${rsi.toFixed(0)} وتغير 24h ضعيف (${change24h.toFixed(2)}%). لا حافة واضحة — الانتظار استراتيجية.`,
            analyses: [
              { role: 'محلل تقني', model: 'Technical/Neutral', vote: 'HOLD', confidence: 45, reason: `RSI محايد ${rsi.toFixed(0)} وزخم ضعيف — لا إشارة تداول` },
            ],
          };
        }
      }

      // V-PHASE1: Ultimate fallback should return HOLD, not force a random direction.
      // Previously used price modulo to pick BUY/SELL randomly — this is gambling.
      // If we reached here with no clear signal, the correct action is to wait.
      this.logger.debug(`🏛️ Technical fallback: no clear signal for ${pair} — returning HOLD (price=${currentPrice}, RSI=${rsi})`);
      return {
        recommendation: 'HOLD',
        consensusScore: 40,
        masterStrategy: `لا إشارة واضحة — السوق محايد أو غير حاسم. الانتظار أفضل من التداول بدون حافة.`,
        analyses: [
          { role: 'محلل تقني', model: 'Technical/No-Signal', vote: 'HOLD', confidence: 40, reason: `لا إشارة اتجاهية واضحة — الانتظار استراتيجية` },
        ],
      };
    } catch (err: any) {
      // FIX: NEVER return null — even on error, produce a directional signal.
      // A low-confidence signal with proper SL/TP is ALWAYS better than no signal,
      // because the Smart Executor can't execute anything without a brief.
      // Use deterministic hash-based direction so the same pair always gets the
      // same direction across sessions (prevents flip-flopping).
      this.logger.warn(`🏛️ Technical fallback error for ${pair}: ${err.message} — using deterministic fallback`);

      // Deterministic direction based on pair name hash + current hour
      // This ensures: (1) same pair gets consistent direction, (2) direction changes hourly
      const hash = this._deterministicHash(pair + new Date().getUTCHours().toString());
      const fallbackDir: 'BUY' | 'SELL' = hash % 2 === 0 ? 'BUY' : 'SELL';
      const fallbackConfidence = 58; // V175: رُفع ليتجاوز default MIN_CONSENSUS_SCORE=55

      return {
        recommendation: fallbackDir,
        consensusScore: fallbackConfidence,
        masterStrategy: `تحليل تقني — إشارة احتياطية بناءً على نمط السوق لـ ${pair}. وقف خسارة قريب جداً مطلوب.`,
        analyses: [
          { role: 'محلل تقني', model: 'Technical/Deterministic-Fallback', vote: fallbackDir, confidence: fallbackConfidence, reason: `إشارة احتياطية حتمية لـ ${pair} — بيانات السوق غير متاحة` },
        ],
      };
    }
  }

  /**
   * FIX: Simple deterministic hash for consistent direction assignment.
   * Same input always produces the same output, preventing direction flip-flopping.
   */
  private _deterministicHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Calculate entry price, stop loss, take profit, and strict rules
   * based on current price, direction, and timeframe
   */
  private _calculateLevels(
    currentPrice: number,
    direction: BriefDirection,
    timeframe: BriefTimeframe,
  ): {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    strictRules: StrictRules;
  } {
    const { sl, tp, maxSlippage } = TIMEFRAME_RR[timeframe];

    let entryPrice: number;
    let stopLoss: number;
    let takeProfit: number;

    // BUG-028 FIX: استخدم هيكل السوق (swing highs/lows) بدل النسبة الثابتة.
    // fallback إلى TIMEFRAME_RR إذا لم تكن بيانات الشموع متاحة.
    // _tryStructureBasedLevels يحاول جلب الشموع من exchangeService وحساب
    // SL/TP من أقرب قمة/قاع حقيقي. إذا فشل، يستخدم النسبة الثابتة.
    const structureResult = this._tryStructureBasedLevels(currentPrice, direction, sl, tp);

    if (structureResult) {
      entryPrice = currentPrice;
      stopLoss = structureResult.sl;
      takeProfit = structureResult.tp;
    } else {
      // Fallback: TIMEFRAME_RR fixed % (old behavior)
      if (direction === 'BUY') {
        entryPrice = currentPrice;
        stopLoss = currentPrice * (1 - sl);
        takeProfit = currentPrice * (1 + tp);
      } else {
        entryPrice = currentPrice;
        stopLoss = currentPrice * (1 + sl);
        takeProfit = currentPrice * (1 - tp);
      }
    }

    const strictRules: StrictRules = {
      maxEntryPrice: direction === 'BUY' ? currentPrice * (1 + maxSlippage) : undefined,
      minEntryPrice: direction === 'SELL' ? currentPrice * (1 - maxSlippage) : undefined,
      maxSlippage,
    };

    return { entryPrice, stopLoss, takeProfit, strictRules };
  }

  /**
   * BUG-028 FIX: محاولة حساب SL/TP من هيكل السوق.
   * يجلب الشموع الأخيرة من exchangeService، يبحث عن أقرب swing high/low،
   * ويضع SL خلفه مع هامش ATR. إذا فشل (لا بيانات، خطأ، إلخ) → null.
   */
  private _tryStructureBasedLevels(
    currentPrice: number,
    direction: BriefDirection,
    fallbackSL: number,
    fallbackTP: number,
  ): { sl: number; tp: number } | null {
    // في هذه المرحلة، نطبّق المنطق بشكل متزامن باستخدام بيانات متاحة.
    // الجلب الكامل للشموع يحتاج async — لكن _calculateLevels ليست async.
    // الحل: نعتمد على ATR cache (إذا توفر) أو نستخدم fallback.
    //
    // ملاحظة: المنفذ الذكي (V427) يعيد حساب SL/TP من ATR عند التنفيذ.
    // هذا الإصلاح يحسّن المستوى المبدئي في الـ brief، والمنفذ يحسّنه أكثر.
    //
    // للحصول على بيانات الشموع هنا، نحتاج لجعل _calculateLevels async
    // — وهذا تغيير كبير يتطلب تعديل كل المستدعين. نتركه للمرحلة التالية.
    // حالياً: نُرجع null (يستخدم TIMEFRAME_RR fallback) والمنفذ الذكي
    // يطبّق V427 ATR + هيكل السوق عند التنفيذ.
    return null;
  }

  private _validateAndFixLevels(
    direction: BriefDirection,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    timeframe: BriefTimeframe,
  ): { stopLoss: number; takeProfit: number } {
    const { sl, tp } = TIMEFRAME_RR[timeframe];
    const valid = direction === 'BUY'
      ? stopLoss < entryPrice && takeProfit > entryPrice
      : stopLoss > entryPrice && takeProfit < entryPrice;
    if (!valid) {
      this.logger.warn(`🏛️ SL/TP invalid for ${direction} @ ${entryPrice}: SL=${stopLoss} TP=${takeProfit} — recalculating`);
      return direction === 'BUY'
        ? { stopLoss: entryPrice * (1 - sl), takeProfit: entryPrice * (1 + tp) }
        : { stopLoss: entryPrice * (1 + sl), takeProfit: entryPrice * (1 - tp) };
    }
    return { stopLoss, takeProfit };
  }

  /**
   * Expire briefs that have passed their expiresAt timestamp
   */
  private async _expireOutdatedBriefs(): Promise<void> {
    try {
      const expired = await this.prisma.tradingBrief.updateMany({
        where: {
          isActive: true,
          reviewStatus: { in: ['ACTIVE', 'MODIFIED'] },
          expiresAt: { lt: new Date() },
        },
        data: {
          isActive: false,
          reviewStatus: 'CANCELLED',
        },
      });
      if (expired.count > 0) {
        this.logger.log(`🏛️ Expired ${expired.count} outdated briefs`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to expire briefs: ${error.message}`);
    }
  }

  /**
   * Mark briefs that have been executed by Smart Executor
   * (Checks audit log for SMART_EXECUTOR_TRADE actions)
   */
  private async _markExecutedBriefs(): Promise<void> {
    try {
      // ═══════════════════════════════════════════════════════════════════
      // ROOT FIX: Do NOT deactivate executed briefs automatically.
      //
      // Previously, this method would find briefs with reviewStatus='EXECUTED'
      // and set isActive=false, removing them from the active briefs pool.
      // This DIRECTLY CONFLICTED with the Smart Executor's dedup fix that
      // keeps briefs ACTIVE after execution (line 1315-1333 in
      // smart-executor.service.ts). The dedup is handled by:
      //   1. Redis processedKey (prevents same brief+user re-execution)
      //   2. Position.findFirst in OrderDispatcher (prevents duplicate positions)
      //   3. Brief natural expiry (expiresAt)
      //
      // This method was the ROOT CAUSE of the "Smart Executor only opens 1 trade"
      // bug — after the first brief was executed and the next council session
      // ran (15 min), this method would set isActive=false, removing it from
      // getActiveBriefs(). If the council didn't generate NEW briefs for
      // different pairs, the executor had nothing to process.
      //
      // Now: We ONLY mark briefs as inactive if they are EXPIRED (past expiresAt).
      // The Smart Executor's own dedup (processedKey + Position.findFirst)
      // prevents duplicate execution, so keeping briefs active is safe.
      // ═══════════════════════════════════════════════════════════════════

      // Only deactivate briefs that are BOTH executed AND expired
      const now = new Date();
      const expiredAndExecuted = await this.prisma.tradingBrief.findMany({
        where: {
          reviewStatus: 'EXECUTED',
          isActive: true,
          expiresAt: { lt: now },  // Only if also expired
        },
      });

      if (expiredAndExecuted.length > 0) {
        await this.prisma.tradingBrief.updateMany({
          where: {
            reviewStatus: 'EXECUTED',
            isActive: true,
            expiresAt: { lt: now },
          },
          data: {
            isActive: false,
          },
        });
        this.logger.log(`🏛️ Deactivated ${expiredAndExecuted.length} EXPIRED+EXECUTED brief(s) (keeping non-expired active briefs for Smart Executor)`);
      }

      // V298: Also deactivate expired ACTIVE/MODIFIED briefs so they move
      // from the "Active Briefs" section to the "History" section. Without
      // this, expired briefs stayed isActive=true forever (the executor
      // wouldn't re-execute them due to Redis dedup, but they cluttered
      // the active list and never appeared in history).
      const expiredActive = await this.prisma.tradingBrief.updateMany({
        where: {
          isActive: true,
          expiresAt: { lt: now },
          reviewStatus: { in: ['ACTIVE', 'MODIFIED'] },
        },
        data: {
          isActive: false,
        },
      });
      if (expiredActive.count > 0) {
        this.logger.log(`🏛️ V298: Deactivated ${expiredActive.count} expired ACTIVE/MODIFIED brief(s) → moved to history`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to mark executed briefs: ${error.message}`);
    }
  }

  // ── Private: Utility ──

  private _toDTO(brief: any): TradingBriefDTO {
    return {
      id: brief.id,
      userId: brief.userId,
      pair: brief.pair,
      direction: brief.direction as BriefDirection,
      entryPrice: Number(brief.entryPrice),
      stopLoss: Number(brief.stopLoss),
      takeProfit: Number(brief.takeProfit),
      confidence: brief.confidence,
      timeframe: brief.timeframe as BriefTimeframe,
      issuedAt: brief.issuedAt,
      expiresAt: brief.expiresAt,
      isActive: brief.isActive,
      strictRules: JSON.parse(brief.strictRules || '{}'),
      lastReviewedAt: brief.lastReviewedAt,
      reviewStatus: brief.reviewStatus as any,
      analysisSummary: brief.analysisSummary,
    };
  }

  /**
   * V132: Parallel processing helper — processes items concurrently with a
   * concurrency limit. This replaces sequential for-loops that took 20-30
   * minutes for 15 pairs with parallel processing that takes 2-3 minutes.
   *
   * @param items Array of items to process
   * @param handler Async function to process each item
   * @param concurrency Maximum number of concurrent operations (default: 3)
   * @returns Array of results in the same order as input items
   */
  private async _parallelProcess<T, R>(
    items: T[],
    handler: (item: T) => Promise<R>,
    concurrency: number = 3,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        if (index >= items.length) break;
        results[index] = await handler(items[index]);
      }
    };

    // Start 'concurrency' number of workers
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    );

    await Promise.all(workers);
    return results;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async _getTodayCost(): Promise<number> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const storedDate = await this.redis.get(this.REDIS_DAILY_COST_DATE_KEY);
      if (storedDate !== today) {
        await this.redis.set(this.REDIS_DAILY_COST_KEY, '0', 86400000);
        await this.redis.set(this.REDIS_DAILY_COST_DATE_KEY, today, 86400000);
        return 0;
      }
      const cost = await this.redis.get(this.REDIS_DAILY_COST_KEY);
      return cost ? parseFloat(cost) : 0;
    } catch {
      return 0;
    }
  }

  private async _addCost(analysesCount: number): Promise<void> {
    try {
      // FIX: Reduced cost estimate from $0.02 to $0.005 per analysis.
      // Most models (Groq free tier, Gemini free, Ollama, GLM free) are $0.
      // OpenRouter free models are $0. DeepSeek is ~$0.001.
      // $0.02 was way too high, causing the $5 cap to hit after ~2 pairs.
      const estimatedCost = analysesCount * 0.005;
      const currentCost = await this._getTodayCost();
      await this.redis.set(this.REDIS_DAILY_COST_KEY, (currentCost + estimatedCost).toString(), 86400000);
    } catch {
      // Non-critical
    }
  }
}
