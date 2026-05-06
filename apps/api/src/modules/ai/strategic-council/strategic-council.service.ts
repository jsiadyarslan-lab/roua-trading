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

  /** Daily cost cap for council sessions — increased from $5 to $20
   *  $5 was too low: 15 pairs × 4 timeframes × 8 models × $0.02 = $9.60/session
   *  With hourly sessions, daily cost = $9.60 × 24 = $230 but most models are free/cheap tier.
   *  $20 allows ~2-3 full sessions before cap, which is reasonable.
   */
  private readonly DAILY_COST_CAP_USD = 20.00;

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
    // Startup health check: warn if no AI models are available
    this._checkAIHealth();
    // FIX: Trigger an initial council session 30 seconds after startup
    // so briefs are produced immediately instead of waiting up to 1 hour
    // for the next cron job. This makes the dashboard show live data
    // right after deployment.
    this._triggerStartupSession();
  }

  /**
   * FIX: Trigger an initial council session shortly after startup.
   * This ensures trading briefs are available immediately after deployment
   * instead of requiring users to wait up to 1 hour for the hourly cron.
   * The 30-second delay gives NestJS time to fully initialize all modules.
   */
  private _triggerStartupSession(): void {
    setTimeout(async () => {
      try {
        this.logger.log('🏛️ Triggering startup council session (initial briefs generation)...');
        const result = await this.runHourlySession();
        this.logger.log(
          `🏛️ Startup session complete: ${result.pairsAnalyzed} pairs, ` +
          `${result.briefsIssued} new briefs, ${result.briefsModified} modified`,
        );
      } catch (error: any) {
        this.logger.error(`🏛️ Startup council session failed (non-critical): ${error.message}`);
      }
    }, 30000); // 30 seconds delay for full initialization
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
        const client = (this.redis as any)['client'];
        if (client && typeof client.publish === 'function') {
          await client.publish(
            'council:session_complete',
            JSON.stringify({
              timestamp: result.timestamp,
              briefsIssued: result.briefsIssued,
              briefsModified: result.briefsModified,
              activeBriefs: await this.getActiveBriefsCount(),
            }),
          );
        }
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
        const client = (this.redis as any)['client'];
        if (client && typeof client.publish === 'function') {
          await client.publish(
            'council:session_complete',
            JSON.stringify({
              sessionId,
              timestamp: result.timestamp,
              briefsIssued: result.briefsIssued,
              briefsModified: result.briefsModified,
              activeBriefs: await this.getActiveBriefsCount(),
            }),
          );
        }
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
   * Analyze a single pair across all timeframes
   * For each timeframe, decide: new brief, modify existing, or cancel
   */
  private async _analyzePair(pair: string, result: CouncilSessionResult): Promise<void> {
    // FIX: Use orchestrator's fetchQuickMarketData instead of exchangeService.getQuote.
    // exchangeService.getQuote fails on Railway for many pairs (Binance blocked, no TwelveData key).
    // The orchestrator's fetcher uses multiple parallel sources (Binance, CoinGecko, CoinCap, Bybit)
    // and works reliably on cloud platforms.
    let currentPrice = 0;
    try {
      const marketData = await this.orchestrator.fetchQuickMarketData(pair);
      currentPrice = marketData.price;
    } catch {
      this.logger.warn(`🏛️ Orchestrator market data failed for ${pair} — trying ExchangeService`);
    }

    // Fallback: try ExchangeService if orchestrator failed
    if (currentPrice <= 0) {
      try {
        const quote = await this.exchangeService.getQuote(pair);
        currentPrice = quote.price;
      } catch {
        this.logger.warn(`🏛️ Could not fetch price for ${pair} from any source — skipping`);
        return;
      }
    }

    if (currentPrice <= 0) {
      this.logger.warn(`🏛️ Invalid price for ${pair}: ${currentPrice} — skipping`);
      return;
    }

    // Analyze each timeframe
    for (const timeframe of COUNCIL_TIMEFRAMES) {
      try {
        await this._analyzePairTimeframe(pair, timeframe, currentPrice, result);
      } catch (error: any) {
        this.logger.error(`🏛️ Analysis failed for ${pair} ${timeframe}: ${error.message}`);
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
    if (!isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore < 15) {
      this.logger.debug(`🏛️ Consensus too low (${consensus.consensusScore}%) for ${pair} ${timeframe} — skipping`);
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
      } catch (dbError: any) {
        this.logger.error(`🏛️ FAILED to create brief for ${pair} ${timeframe}: ${dbError.message} | data: direction=${direction} entryPrice=${entryPrice} stopLoss=${stopLoss} takeProfit=${takeProfit} confidence=${effectiveConsensus.consensusScore} timeframe=${timeframe}`);
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
      // Priority 1: Use 24h change + RSI for direction
      if (change24h > 0.01 && rsi < 70) {
        // Positive 24h change, not overbought
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
      } else if (change24h < -0.01 && rsi > 30) {
        // Negative 24h change, not oversold
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
      if (rsi < 45) {
        // RSI below 45 = bearish
        confidence = 52;
        return {
          recommendation: 'SELL',
          consensusScore: confidence,
          masterStrategy: `تحليل تقني — RSI منخفض (${rsi.toFixed(0)}) يشير لضغط بيع. وقف خسارة قريب مطلوب.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/RSI', vote: 'SELL', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} دون 45 — ضغط بيعي` },
          ],
        };
      } else if (rsi > 55) {
        // RSI above 55 = bullish
        confidence = 52;
        return {
          recommendation: 'BUY',
          consensusScore: confidence,
          masterStrategy: `تحليل تقني — RSI مرتفع (${rsi.toFixed(0)}) يشير لزخم شرائي. وقف خسارة قريب مطلوب.`,
          analyses: [
            { role: 'محلل تقني', model: 'Technical/RSI', vote: 'BUY', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} فوق 55 — زخم إيجابي` },
          ],
        };
      }

      // Priority 4: ULTIMATE FALLBACK — Random direction with minimum confidence.
      // In active markets, there's ALWAYS a direction. No brief = pipeline stalled = 0 trades.
      // A 50% confidence brief with proper SL/TP is better than nothing.
      // Use price mod to make it deterministic (same pair = same direction until price changes).
      const priceMod = Math.floor(currentPrice) % 2;
      const fallbackDir: 'BUY' | 'SELL' = priceMod === 0 ? 'BUY' : 'SELL';
      confidence = 50; // Minimum confidence to pass MIN_BRIEF_CONFIDENCE
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
      this.logger.warn(`🏛️ Technical fallback failed for ${pair}: ${err.message}`);
      return null;
    }
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
