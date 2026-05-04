// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "القائد في غرفة العمليات" — يحلل السوق بعمق
// ويصدر وثائق تداول (Trading Briefs).
// لا ينفذ أي صفقة بنفسه.
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

  /** Daily cost cap for council sessions */
  private readonly DAILY_COST_CAP_USD = 5.00;

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
    this.logger.log('🏛️ Strategic Council initialized — hourly analysis engine ready');
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

      result.durationMs = Date.now() - startTime;

      this.logger.log(
        `🏛️ Strategic Council session complete: ${result.pairsAnalyzed} pairs, ` +
        `${result.briefsIssued} new briefs, ${result.briefsModified} modified, ` +
        `${result.briefsCancelled} cancelled (${result.durationMs}ms)`,
      );

      // Store session result in Redis
      await this.redis.set(
        'strategic-council:last_session',
        JSON.stringify(result),
        3600000, // 1 hour TTL
      );

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
   * Get all active briefs
   */
  async getActiveBriefs(userId?: string): Promise<TradingBriefDTO[]> {
    const where: any = { isActive: true, reviewStatus: 'ACTIVE' };
    if (userId) where.userId = userId;

    const briefs = await this.prisma.tradingBrief.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
    });

    return briefs.map((b) => this._toDTO(b));
  }

  /**
   * Get brief history (including expired/cancelled)
   */
  async getBriefHistory(userId?: string, limit: number = 100): Promise<TradingBriefDTO[]> {
    const where: any = {};
    if (userId) where.userId = userId;

    const briefs = await this.prisma.tradingBrief.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return briefs.map((b) => this._toDTO(b));
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
    const briefs = await this.prisma.tradingBrief.findMany({
      where: { pair, isActive: true, reviewStatus: 'ACTIVE' },
      orderBy: { issuedAt: 'desc' },
    });
    return briefs.map((b) => this._toDTO(b));
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
        reviewStatus: 'ACTIVE',
      },
    });

    // Get AI consensus analysis
    const consensus = await this.orchestrator.getConsensusAnalysis(pair);

    // Only issue/modify briefs for BUY or SELL recommendations with sufficient confidence
    if (consensus.recommendation === 'HOLD' || consensus.consensusScore < 60) {
      // If existing brief but market now says HOLD or low confidence — cancel it
      if (existingBrief) {
        await this.prisma.tradingBrief.update({
          where: { id: existingBrief.id },
          data: {
            isActive: false,
            reviewStatus: 'CANCELLED',
            lastReviewedAt: new Date(),
          },
        });
        result.briefsCancelled++;
        this.logger.log(`🏛️ Cancelled brief for ${pair} ${timeframe} (HOLD / low confidence)`);
      }
      return;
    }

    const direction: BriefDirection = consensus.recommendation === 'BUY' ? 'BUY' : 'SELL';

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
            confidence: consensus.consensusScore,
            analysisSummary: consensus.masterStrategy,
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
            confidence: consensus.consensusScore,
            strictRules: JSON.stringify(strictRules),
            lastReviewedAt: new Date(),
            reviewStatus: 'MODIFIED',
            expiresAt: new Date(Date.now() + TIMEFRAME_EXPIRY_MS[timeframe]),
            analysisSummary: consensus.masterStrategy,
          },
        });
        result.briefsModified++;
        this.logger.log(`🏛️ Modified brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice}`);
      }
    } else {
      // No existing brief — issue a new one
      await this.prisma.tradingBrief.create({
        data: {
          pair,
          direction,
          entryPrice,
          stopLoss,
          takeProfit,
          confidence: consensus.consensusScore,
          timeframe,
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + TIMEFRAME_EXPIRY_MS[timeframe]),
          isActive: true,
          strictRules: JSON.stringify(strictRules),
          lastReviewedAt: new Date(),
          reviewStatus: 'ACTIVE',
          analysisSummary: consensus.masterStrategy,
        },
      });
      result.briefsIssued++;
      this.logger.log(`🏛️ New brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice} (confidence: ${consensus.consensusScore}%)`);
    }

    // Track cost
    await this._addCost(consensus.analyses.length);
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
    // Risk/reward ratios per timeframe
    const slTpPercent: Record<BriefTimeframe, { sl: number; tp: number; maxSlippage: number }> = {
      H1: { sl: 0.005, tp: 0.01, maxSlippage: 0.001 },     // 0.5% SL, 1% TP
      H4: { sl: 0.01, tp: 0.02, maxSlippage: 0.001 },       // 1% SL, 2% TP
      D1: { sl: 0.02, tp: 0.04, maxSlippage: 0.002 },       // 2% SL, 4% TP
      W1: { sl: 0.04, tp: 0.08, maxSlippage: 0.003 },       // 4% SL, 8% TP
    };

    const { sl, tp, maxSlippage } = slTpPercent[timeframe];

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

  // ── Private: Utility ──

  private _toDTO(brief: any): TradingBriefDTO {
    return {
      id: brief.id,
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
      const estimatedCost = analysesCount * 0.02;
      const currentCost = await this._getTodayCost();
      await this.redis.set(this.REDIS_DAILY_COST_KEY, (currentCost + estimatedCost).toString(), 86400000);
    } catch {
      // Non-critical
    }
  }
}
