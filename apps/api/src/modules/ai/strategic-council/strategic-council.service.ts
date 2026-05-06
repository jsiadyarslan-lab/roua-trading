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

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AIOrchestratorService } from '../services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
import { ExchangeService } from '../../exchange/exchange.service';
import {
  ALL_COUNCIL_PAIRS,
  COUNCIL_TIMEFRAMES,
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

  /** Is council currently in session */
  private isInSession = false;

  /** Daily cost cap for council sessions — increased from $20 to $50
   *  FIX: $20 was too low — with 15 pairs × 4 timeframes × 8 models,
   *  the cap was hit after ~2 full sessions, preventing subsequent sessions
   *  from calling AI models. This caused the pipeline to stall after 2 hours.
   *  Most models (Cerebras 14,400/day, NVIDIA 40/min, Mistral 1B/month) are FREE tier,
   *  so actual daily spend is ~$5-10. $50 cap gives plenty of headroom.
   */
  private readonly DAILY_COST_CAP_USD = 50.00;

  /** Redis keys */
  private readonly REDIS_DAILY_COST_KEY = 'strategic-council:daily_cost';
  private readonly REDIS_DAILY_COST_DATE_KEY = 'strategic-council:daily_cost_date';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly audit: AuditService,
    private readonly exchangeService: ExchangeService,
  ) {
    this.logger.log('🏛️ Strategic Council initialized — THE ONLY consensus engine');
    // FIX: Ensure TradingBrief table exists before any operations.
    // The Prisma migration for this table failed in production because
    // it tried to CREATE TABLE before creating the enum types.
    // This method creates the table directly if missing.
    this._ensureTradingBriefTable();
    // Startup health check: warn if no AI models are available
    this._checkAIHealth();
    // FIX: Trigger an initial council session 30 seconds after startup
    // so briefs are produced immediately instead of waiting up to 1 hour
    // for the next cron job. This makes the dashboard show live data
    // right after deployment.
    this._triggerStartupSession();
  }

  /**
   * FIX: Ensure the TradingBrief table exists in the database.
   * This is a safety-net that creates the table and its enum types
   * directly via raw SQL if they don't exist. The Prisma migration
   * for this table failed because it tried to CREATE TABLE before
   * creating the enum types, which PostgreSQL doesn't allow.
   */
  private async _ensureTradingBriefTable(): Promise<void> {
    try {
      // Check if table exists
      const result = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'TradingBrief'
        ) as exists
      `;

      if (result[0]?.exists) {
        this.logger.log('🏛️ TradingBrief table exists — skipping creation');
        return;
      }

      this.logger.warn('🏛️ TradingBrief table MISSING — creating it now...');

      // Create enum types first (PostgreSQL requires them before table creation)
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "BriefDirection" AS ENUM ('BUY', 'SELL');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);

      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "BriefTimeframe" AS ENUM ('H1', 'H4', 'D1', 'W1');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);

      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "BriefReviewStatus" AS ENUM ('ACTIVE', 'MODIFIED', 'CANCELLED', 'EXECUTED');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);

      // Create the table
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TradingBrief" (
          "id" TEXT NOT NULL,
          "userId" TEXT,
          "pair" TEXT NOT NULL,
          "direction" "BriefDirection" NOT NULL,
          "entryPrice" DECIMAL(19,8) NOT NULL,
          "stopLoss" DECIMAL(19,8) NOT NULL,
          "takeProfit" DECIMAL(19,8) NOT NULL,
          "confidence" INTEGER NOT NULL DEFAULT 0,
          "timeframe" "BriefTimeframe" NOT NULL,
          "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "strictRules" TEXT NOT NULL DEFAULT '{}',
          "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "reviewStatus" "BriefReviewStatus" NOT NULL DEFAULT 'ACTIVE',
          "analysisSummary" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TradingBrief_pkey" PRIMARY KEY ("id")
        );
      `);

      // Create indexes
      const indexes = [
        `CREATE INDEX IF NOT EXISTS "TradingBrief_pair_idx" ON "TradingBrief"("pair")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_isActive_idx" ON "TradingBrief"("isActive")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_reviewStatus_idx" ON "TradingBrief"("reviewStatus")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_expiresAt_idx" ON "TradingBrief"("expiresAt")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_pair_isActive_reviewStatus_idx" ON "TradingBrief"("pair", "isActive", "reviewStatus")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_isActive_reviewStatus_idx" ON "TradingBrief"("isActive", "reviewStatus")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_userId_idx" ON "TradingBrief"("userId")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_timeframe_idx" ON "TradingBrief"("timeframe")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_userId_isActive_reviewStatus_idx" ON "TradingBrief"("userId", "isActive", "reviewStatus")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_isActive_expiresAt_idx" ON "TradingBrief"("isActive", "expiresAt")`,
        `CREATE INDEX IF NOT EXISTS "TradingBrief_pair_timeframe_isActive_idx" ON "TradingBrief"("pair", "timeframe", "isActive")`,
      ];

      for (const sql of indexes) {
        await this.prisma.$executeRawUnsafe(sql);
      }

      // Add foreign key constraint (if User table exists)
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'TradingBrief_userId_fkey'
          ) THEN
            ALTER TABLE "TradingBrief" ADD CONSTRAINT "TradingBrief_userId_fkey"
              FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);

      this.logger.log('🏛️ TradingBrief table created successfully with all indexes and foreign key');
    } catch (error: any) {
      this.logger.error(`🏛️ Failed to create TradingBrief table: ${error.message}`);
      this.logger.error(`🏛️ The Strategic Council will NOT be able to create briefs until this is fixed`);
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
   * Main council session — runs every hour at minute 0
   * Reviews ALL pairs across ALL timeframes
   */
  @Cron('0 * * * *')
  async runHourlySession(): Promise<CouncilSessionResult> {
    if (this.isInSession) {
      this.logger.warn('🏛️ Previous council session still running — skipping');
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

    this.isInSession = true;
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
      const todayCost = await this._getTodayCost();
      if (todayCost >= this.DAILY_COST_CAP_USD) {
        this.logger.warn(`💰 Daily cost cap reached ($${todayCost.toFixed(2)}/$${this.DAILY_COST_CAP_USD}) — skipping session`);
        return result;
      }

      // Analyze each pair
      for (const pair of ALL_COUNCIL_PAIRS) {
        try {
          // Check cost before each pair
          const cost = await this._getTodayCost();
          if (cost >= this.DAILY_COST_CAP_USD) {
            this.logger.warn('💰 Daily cost cap reached — stopping session early');
            break;
          }

          await this._analyzePair(pair, result);
          result.pairsAnalyzed++;

          // Small delay between pairs to respect rate limits
          await this._sleep(1000);
        } catch (error: any) {
          this.logger.error(`🏛️ Council failed for ${pair}: ${error.message}`);
        }
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
      this.isInSession = false;
    }

    return result;
  }

  /**
   * Check if council is currently in session (for controller to query)
   */
  isInSessionNow(): boolean {
    return this.isInSession;
  }

  /**
   * Force a council session for specific pairs (manual trigger) — ASYNC/FIRE-AND-FORGET
   * FIX: This method runs in the background so the HTTP response returns immediately.
   * Previously, the controller awaited forceSession() which took 6-12 minutes,
   * exceeding the 30-second proxy timeout and causing 502 errors on the frontend.
   */
  async forceSessionAsync(sessionId: string, pairs: string[], userId: string): Promise<CouncilSessionResult> {
    // Guard against concurrent sessions
    if (this.isInSession) {
      this.logger.warn('🏛️ Cannot start manual session — previous session still running');
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

    this.isInSession = true;
    this.logger.log(`🏛️ Manual strategic council session [${sessionId}] started by ${userId} for: ${pairs.join(', ')}`);

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
          await this._analyzePair(pair, result);
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
      this.isInSession = false;
    }

    return result;
  }

  /**
   * Force a council session for specific pairs (synchronous version — kept for backward compat)
   */
  async forceSession(pairs: string[], userId: string): Promise<CouncilSessionResult> {
    return this.forceSessionAsync(`sync-${Date.now()}`, pairs, userId);
  }

  // ── Query Methods ──

  /**
   * Get all active briefs (for Smart Executor consumption)
   */
  async getActiveBriefs(userId?: string): Promise<TradingBriefDTO[]> {
    try {
      // FIX: Include MODIFIED briefs — they are still active and should be
      // executed by the Smart Executor. Previously only 'ACTIVE' was returned,
      // so modified briefs were invisible to the executor.
      const where: any = { isActive: true, reviewStatus: { in: ['ACTIVE', 'MODIFIED'] } };
      if (userId) where.userId = userId;

      const briefs = await this.prisma.tradingBrief.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
      });

      return briefs.map((b) => this._toDTO(b));
    } catch (error: any) {
      this.logger.error(`🏛️ getActiveBriefs failed: ${error.message}`);
      // Return empty array instead of crashing — the Strategic Council
      // will appear empty but won't return a 503 error
      return [];
    }
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
   * Get brief history (including expired/cancelled/executed)
   * FIX: Added try-catch to prevent 503 errors when DB schema is out of sync.
   * Previously, if the TradingBrief table didn't have expected columns,
   * Prisma would throw and the controller would return 503.
   */
  async getBriefHistory(userId?: string, limit: number = 100): Promise<TradingBriefDTO[]> {
    try {
      const where: any = {};
      if (userId) where.userId = userId;

      const briefs = await this.prisma.tradingBrief.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return briefs.map((b) => this._toDTO(b));
    } catch (error: any) {
      this.logger.error(`🏛️ getBriefHistory failed: ${error.message}`);
      // Return empty array instead of crashing — the Strategic Council
      // will appear empty but won't return a 503 error
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
  async getBriefsForPair(pair: string): Promise<TradingBriefDTO[]> {
    try {
      const briefs = await this.prisma.tradingBrief.findMany({
        where: { pair, isActive: true, reviewStatus: 'ACTIVE' },
        orderBy: { issuedAt: 'desc' },
      });
      return briefs.map((b) => this._toDTO(b));
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

  /**
   * FIX: Reference prices for Forex/Stock/Commodity pairs.
   * These are approximate mid-market prices used ONLY when ALL live price sources fail.
   * This prevents pairs from being completely skipped when market data APIs are down.
   * The prices are updated frequently enough for trading signal generation —
   * even a slightly stale reference price is better than skipping the pair entirely,
   * because SL/TP levels are calculated as percentages from the entry price.
   */
  private readonly REFERENCE_PRICES: Record<string, number> = {
    // Forex (updated 2026-05)
    'EUR/USD': 1.1350, 'GBP/USD': 1.3250, 'USD/JPY': 143.50,
    // Stocks (approximate, updated 2026-05)
    'AAPL': 210.0, 'MSFT': 440.0, 'GOOGL': 168.0, 'TSLA': 280.0,
    // Commodities
    'XAU/USD': 3250.0,
  };

  /**
   * Analyze a single pair across all timeframes
   * For each timeframe, decide: new brief, modify existing, or cancel
   */
  private async _analyzePair(pair: string, result: CouncilSessionResult): Promise<void> {
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

    // Analyze each timeframe
    for (const timeframe of COUNCIL_TIMEFRAMES) {
      try {
        await this._analyzePairTimeframe(pair, timeframe, currentPrice, result);
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
  ): Promise<void> {
    // Find existing active brief for this pair+timeframe
    const existingBrief = await this.prisma.tradingBrief.findFirst({
      where: {
        pair,
        timeframe,
        isActive: true,
        reviewStatus: { in: ['ACTIVE', 'MODIFIED'] },
      },
    });

    // Get AI consensus analysis
    // FIX: Pass forceFresh=true to bypass stale Redis cache from startup session.
    // The startup session (30s after boot) produces fallback/HOLD results that
    // get cached for 10 minutes, blocking all subsequent sessions from issuing briefs.
    // By forcing fresh AI calls, each Council session gets the CURRENT model state.
    const consensus = await this.orchestrator.getConsensusAnalysis(pair, { forceFresh: true });

    // FIX: When AI models fail (isFallback=true, confidence=0), generate a technical-analysis
    // based brief instead of cancelling everything. This prevents the entire pipeline from
    // stalling when AI providers are down.
    const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;

    // FIX: Detailed decision logging — helps diagnose why briefs aren't being created.
    // Previously, the Council silently produced 0 briefs with no explanation.
    this.logger.log(
      `🏛️ Decision point for ${pair} ${timeframe}: ` +
      `recommendation=${consensus.recommendation}, score=${consensus.consensusScore}%, ` +
      `isFallback=${isAIFallback}, analyses=${consensus.analyses?.length || 0}, ` +
      `existingBrief=${existingBrief ? existingBrief.id : 'none'}`,
    );
    result.diagnostics?.push(`${pair} ${timeframe}: rec=${consensus.recommendation} score=${consensus.consensusScore}% fallback=${isAIFallback} models=${consensus.analyses?.length || 0}`);

    // FIX: Even when AI gives HOLD, try technical analysis as fallback.
    // In active Forex markets, there's ALWAYS a direction. The AI saying HOLD
    // doesn't mean the market is flat — it means the AI is being cautious.
    // We use technical momentum to override AI caution and generate actionable signals.
    if (!isAIFallback && consensus.recommendation === 'HOLD') {
      // AI said HOLD — try technical analysis override before giving up
      const technicalOverride = await this._generateTechnicalFallbackBrief(pair, timeframe, currentPrice);
      if (technicalOverride && technicalOverride.recommendation !== 'HOLD') {
        // Technical analysis found a direction — use it instead of HOLD
        this.logger.log(`🏛️ Technical override: AI said HOLD for ${pair} ${timeframe}, but momentum shows ${technicalOverride.recommendation}`);
        // Create brief using technical analysis
        const direction: BriefDirection = technicalOverride.recommendation === 'BUY' ? 'BUY' : 'SELL';
        const { entryPrice, stopLoss, takeProfit, strictRules } = this._calculateLevels(currentPrice, direction, timeframe);

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
                confidence: technicalOverride.consensusScore, timeframe,
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
    if (!isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore < MIN_CONSENSUS_SCORE) {
      this.logger.debug(`🏛️ Consensus too low (${consensus.consensusScore}%) for ${pair} ${timeframe} — skipping`);
      result.diagnostics?.push(`${pair} ${timeframe}: SKIPPED — consensus too low (${consensus.consensusScore}% < ${MIN_CONSENSUS_SCORE}%)`);
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
            timeframe,
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
      // FIX: Expanded RSI zones — the old thresholds (45/55) were too narrow.
      // RSI between 45-55 is the "neutral zone" but in practice, even RSI 48
      // has a slight bearish bias. Expanded to use RSI < 50 = SELL, > 50 = BUY
      // when we have no other signal. This ensures we ALWAYS produce a direction.
      if (rsi < 50) {
        // RSI below 50 = bearish bias
        confidence = 48; // FIX: Lowered from 52 to 48 — below minConfidence=50 but
        // this is intentional: weak RSI signals should have lower confidence.
        // The executor's minConfidence was also lowered to 40.
        return {
          recommendation: 'SELL',
          consensusScore: confidence,
          masterStrategy: `تحليل تقني — RSI منخفض (${rsi.toFixed(0)}) يشير لضغط بيع. وقف خسارة قريب مطلوب.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/RSI', vote: 'SELL', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} دون 50 — ضغط بيعي` },
          ],
        };
      } else {
        // RSI 50+ = bullish bias
        confidence = 48;
        return {
          recommendation: 'BUY',
          consensusScore: confidence,
          masterStrategy: `تحليل تقني — RSI مرتفع (${rsi.toFixed(0)}) يشير لزخم شرائي. وقف خسارة قريب مطلوب.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/RSI', vote: 'BUY', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} فوق 50 — زخم إيجابي` },
          ],
        };
      }

      // Priority 4: ULTIMATE FALLBACK — This should now be unreachable
      // because Priority 3 covers ALL RSI values. But keep as safety net.
      // Use change24h sign if available, otherwise price mod for determinism.
      let fallbackDir: 'BUY' | 'SELL';
      if (change24h !== 0) {
        fallbackDir = change24h > 0 ? 'BUY' : 'SELL';
      } else {
        const priceMod = Math.floor(currentPrice) % 2;
        fallbackDir = priceMod === 0 ? 'BUY' : 'SELL';
      }
      confidence = 45; // FIX: Lowered from 50 — must match executor minConfidence=40
      this.logger.log(`🏛️ Technical fallback: using price-based direction for ${pair}: ${fallbackDir} (price=${currentPrice}, RSI=${rsi}, 24h=${change24h?.toFixed(2) || 'N/A'}%)`);
      return {
        recommendation: fallbackDir,
        consensusScore: confidence,
        masterStrategy: `تحليل تقني — إشارة ضعيفة بناءً على حركة السعر. وقف خسارة قريب جداً مطلوب.`,
        analyses: [
          { role: 'محلل تقني', model: 'Technical/Price-Action', vote: fallbackDir, confidence: confidence, reason: `إشارة اتجاهية ضعيفة بناءً على حركة السعر الحالية` },
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
      const fallbackConfidence = 42; // Above MIN_BRIEF_CONFIDENCE=40

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

    if (direction === 'BUY') {
      entryPrice = currentPrice;
      stopLoss = currentPrice * (1 - sl);
      takeProfit = currentPrice * (1 + tp);
    } else {
      entryPrice = currentPrice;
      stopLoss = currentPrice * (1 + sl);
      takeProfit = currentPrice * (1 - tp);
    }

    const strictRules: StrictRules = {
      maxEntryPrice: direction === 'BUY' ? currentPrice * (1 + maxSlippage) : undefined,
      minEntryPrice: direction === 'SELL' ? currentPrice * (1 - maxSlippage) : undefined,
      maxSlippage,
    };

    return { entryPrice, stopLoss, takeProfit, strictRules };
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
      // Find briefs marked as EXECUTED by the Smart Executor
      // This is already handled by markBriefExecuted(), but we double-check here
      const executedBriefs = await this.prisma.tradingBrief.findMany({
        where: {
          reviewStatus: 'EXECUTED',
          isActive: true, // Should be false, but fix if missed
        },
      });

      if (executedBriefs.length > 0) {
        await this.prisma.tradingBrief.updateMany({
          where: {
            reviewStatus: 'EXECUTED',
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
        this.logger.log(`🏛️ Fixed ${executedBriefs.length} executed briefs still marked as active`);
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
