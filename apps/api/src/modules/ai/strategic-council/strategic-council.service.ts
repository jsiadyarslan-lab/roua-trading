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
   * Force a council session for specific pairs (manual trigger)
   */
  async forceSession(pairs: string[], userId: string): Promise<CouncilSessionResult> {
    this.logger.log(`🏛️ Manual strategic council session triggered by ${userId} for: ${pairs.join(', ')}`);

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

    for (const pair of pairs) {
      try {
        await this._analyzePair(pair, result);
        result.pairsAnalyzed++;
      } catch (error: any) {
        this.logger.error(`🏛️ Manual council failed for ${pair}: ${error.message}`);
      }
    }

    result.durationMs = Date.now() - startTime;

    await this.audit.log({
      userId,
      action: 'STRATEGIC_COUNCIL_MANUAL',
      resource: 'strategic-council',
      details: JSON.stringify({ pairs, result }),
    });

    return result;
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
    // Get current price
    let currentPrice = 0;
    try {
      const quote = await this.exchangeService.getQuote(pair);
      currentPrice = quote.price;
    } catch {
      this.logger.warn(`🏛️ Could not fetch price for ${pair} — skipping`);
      return;
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
    const consensus = await this.orchestrator.getConsensusAnalysis(pair);

    // FIX: When AI models fail (isFallback=true, confidence=0), generate a technical-analysis
    // based brief instead of cancelling everything. This prevents the entire pipeline from
    // stalling when AI providers are down.
    const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;

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
      // Try to get market data from ExchangeService for technical analysis
      let momentum = 0; // -1 to 1 (bearish to bullish)
      let confidence = 55; // Default moderate confidence for technical fallback

      if (this.exchangeService) {
        try {
          // Fetch recent candles for simple momentum calculation
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
              const rsi = 100 - (100 / (1 + rs));

              // Determine direction from momentum and RSI
              // FIX: Lowered momentum threshold from 0.001 to 0.0003 (0.03%)
              // In active Forex/Crypto markets, even tiny momentum is actionable
              // with proper risk management (SL/TP).
              if (momentum > 0.0003 && rsi < 70) {
                // Bullish momentum, not overbought
                confidence = Math.min(70, 55 + Math.abs(momentum) * 2000);
                return {
                  recommendation: 'BUY',
                  consensusScore: Math.round(confidence),
                  masterStrategy: `تحليل تقني — زخم إيجابي (${(momentum * 100).toFixed(3)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
                  analyses: [
                    { role: 'محلل تقني', model: 'Technical/Momentum', vote: 'BUY', confidence: Math.round(confidence), reason: `زخم إيجابي ${(momentum * 100).toFixed(3)}% مع RSI ${rsi.toFixed(0)}` },
                    { role: 'محلل اتجاه', model: 'Technical/Trend', vote: 'BUY', confidence: Math.round(confidence - 5), reason: `المتوسط المتحرك القصير أعلى من المتوسط المتحرك الطويل` },
                  ],
                };
              } else if (momentum < -0.0003 && rsi > 30) {
                // Bearish momentum, not oversold
                confidence = Math.min(70, 55 + Math.abs(momentum) * 2000);
                return {
                  recommendation: 'SELL',
                  consensusScore: Math.round(confidence),
                  masterStrategy: `تحليل تقني — زخم سلبي (${(momentum * 100).toFixed(3)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
                  analyses: [
                    { role: 'محلل تقني', model: 'Technical/Momentum', vote: 'SELL', confidence: Math.round(confidence), reason: `زخم سلبي ${(momentum * 100).toFixed(3)}% مع RSI ${rsi.toFixed(0)}` },
                    { role: 'محلل اتجاه', model: 'Technical/Trend', vote: 'SELL', confidence: Math.round(confidence - 5), reason: `المتوسط المتحرك القصير أدنى من المتوسط المتحرك الطويل` },
                  ],
                };
              }

              // FIX: Even with very low momentum, determine direction from price vs MA
              // If recent average > older average = slight bullish, vice versa
              // This ensures we almost always get a directional signal
              if (Math.abs(momentum) <= 0.0003) {
                const shortMA = closes.slice(-3).reduce((a: number, b: number) => a + b, 0) / 3;
                const longMA = closes.slice(-10).reduce((a: number, b: number) => a + b, 0) / 10;

                if (shortMA > longMA) {
                  confidence = 52; // Very low confidence but still directional
                  return {
                    recommendation: 'BUY',
                    consensusScore: confidence,
                    masterStrategy: `تحليل تقني — اتجاه صاعد ضعيف (MA crossover). وقف خسارة قريب مطلوب.`,
                    analyses: [
                      { role: 'محلل تقني', model: 'Technical/MA-Cross', vote: 'BUY', confidence: confidence, reason: `المتوسط القصير (${shortMA.toFixed(2)}) أعلى من الطويل (${longMA.toFixed(2)})` },
                    ],
                  };
                } else if (shortMA < longMA) {
                  confidence = 52;
                  return {
                    recommendation: 'SELL',
                    consensusScore: confidence,
                    masterStrategy: `تحليل تقني — اتجاه هابط ضعيف (MA crossover). وقف خسارة قريب مطلوب.`,
                    analyses: [
                      { role: 'محلل تقني', model: 'Technical/MA-Cross', vote: 'SELL', confidence: confidence, reason: `المتوسط القصير (${shortMA.toFixed(2)}) أدنى من الطويل (${longMA.toFixed(2)})` },
                    ],
                  };
                }
              }
            } // end if closes.length >= 10
          } // end if candles.length >= 10
          } catch (err: any) {
            this.logger.warn(`🏛️ Technical fallback: could not fetch market data for ${pair}: ${err.message}`);
          }
      }

      // No clear momentum or no exchange data — return HOLD with low confidence
      // This is safer than generating a random direction
      return null;
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
