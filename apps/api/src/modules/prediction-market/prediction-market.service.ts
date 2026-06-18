import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { PolymarketAdapter } from './adapters/polymarket.adapter';
import {
  UnifiedPredictionEvent,
  ImpactAssessment,
  PredictionGapAnalysis,
  PredictionMarketVote,
  IPredictionMarketAdapter,
} from './prediction-market.types';

/**
 * Prediction Market Service — Core business logic for the PredictionGap system.
 *
 * Responsibilities:
 * 1. Sync events from Polymarket → Database (with Redis caching)
 * 2. Calculate AI probability for each event using our AI Council
 * 3. Compute PredictionGap = |marketProbability - aiProbability|
 * 4. Generate impact assessments for related assets
 * 5. Provide voting data for the AI Council's 8th model
 *
 * Caching Strategy (per review recommendation):
 * - Redis cache for API data: 5 minutes TTL
 * - Redis cache for event lists: 1 hour TTL
 * - In-memory cache for gap analyses: 10 minutes
 *
 * Minimum Volume Filter:
 * - Markets with < $50,000 volume are filtered out (anti-manipulation)
 */

// Cache TTLs
const CACHE_TTL_EVENTS_MS = 60 * 60 * 1000;     // 1 hour for event lists
const CACHE_TTL_DATA_MS = 5 * 60 * 1000;          // 5 minutes for individual data
const CACHE_TTL_GAP_MS = 10 * 60 * 1000;          // 10 minutes for gap analyses
const CACHE_TTL_VOTE_MS = 5 * 60 * 1000;          // 5 minutes for vote data

// Sync interval — how often to pull fresh data from Polymarket
const SYNC_INTERVAL_MS = 5 * 60 * 1000;            // 5 minutes

@Injectable()
export class PredictionMarketService {
  private readonly logger = new Logger(PredictionMarketService.name);
  private syncInProgress = false;
  private lastSyncAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly polymarketAdapter: PolymarketAdapter,
    @Optional() @Inject(forwardRef(() => AIOrchestratorService)) private readonly orchestrator?: AIOrchestratorService,
  ) {
    this.logger.log('🔮 Prediction Market Service initialized — Polymarket integration active');
  }

  // ── Event Sync ──

  /**
   * Sync active events from Polymarket to database.
   * Uses Redis cache to avoid hitting Polymarket API on every call.
   * Only syncs if the last sync was more than 5 minutes ago.
   */
  async syncEvents(force: boolean = false): Promise<{ synced: number; updated: number }> {
    // Prevent concurrent syncs
    if (this.syncInProgress) {
      this.logger.debug('Sync already in progress — skipping');
      return { synced: 0, updated: 0 };
    }

    // Check if we need to sync (unless forced)
    if (!force && this.lastSyncAt) {
      const timeSinceLastSync = Date.now() - this.lastSyncAt.getTime();
      if (timeSinceLastSync < SYNC_INTERVAL_MS) {
        this.logger.debug(`Last sync was ${Math.round(timeSinceLastSync / 1000)}s ago — skipping`);
        return { synced: 0, updated: 0 };
      }
    }

    this.syncInProgress = true;

    try {
      // Try Redis cache first
      const cacheKey = 'prediction:events:polymarket';
      let events: UnifiedPredictionEvent[];

      if (!force) {
        events = await this.redis.cacheOrGet<UnifiedPredictionEvent[]>(
          cacheKey,
          () => this.polymarketAdapter.fetchActiveEvents(100),
          CACHE_TTL_EVENTS_MS,
        );
      } else {
        // Force fresh data from API
        events = await this.polymarketAdapter.fetchActiveEvents(100);
        await this.redis.set(cacheKey, JSON.stringify(events), CACHE_TTL_EVENTS_MS);
      }

      let synced = 0;
      let updated = 0;

      for (const event of events) {
        // Upsert into database
        const existing = await this.prisma.predictionEvent.findUnique({
          where: { source_sourceId: { source: event.source, sourceId: event.sourceId } },
        });

        if (existing) {
          // Update existing event
          await this.prisma.predictionEvent.update({
            where: { id: existing.id },
            data: {
              title: event.title,
              description: event.description,
              category: event.category,
              relatedSymbols: JSON.stringify(event.relatedSymbols),
              marketProbability: event.marketProbability,
              volume24h: event.volume24h,
              liquidity: event.liquidity,
              endDate: event.endDate,
              status: event.active ? 'ACTIVE' : 'EXPIRED',
              lastSyncedAt: new Date(),
            },
          });
          updated++;
        } else {
          // Create new event
          await this.prisma.predictionEvent.create({
            data: {
              sourceId: event.sourceId,
              source: event.source,
              title: event.title,
              description: event.description,
              category: event.category,
              relatedSymbols: JSON.stringify(event.relatedSymbols),
              marketProbability: event.marketProbability,
              volume24h: event.volume24h,
              liquidity: event.liquidity,
              endDate: event.endDate,
              status: event.active ? 'ACTIVE' : 'EXPIRED',
              lastSyncedAt: new Date(),
            },
          });
          synced++;
        }
      }

      this.lastSyncAt = new Date();
      this.logger.log(`🔮 Synced ${synced} new + ${updated} updated events from Polymarket`);
      return { synced, updated };

    } catch (error: any) {
      this.logger.error(`Failed to sync Polymarket events: ${error.message}`);
      return { synced: 0, updated: 0 };
    } finally {
      this.syncInProgress = false;
    }
  }

  // ── AI Probability Calculation ──

  /**
   * Calculate AI-estimated probability for a prediction event.
   *
   * Algorithm (per architecture review):
   * 1. Base probability = 0.50 (neutral)
   * 2. Adjust based on market trend data (weight 30%)
   * 3. Adjust based on technical indicators (weight 15%)
   * 4. Adjust based on news sentiment (weight 5%)
   * 5. Use AI Council for qualitative analysis (optional, weight 50% if available)
   * 6. Clamp to 0.05–0.95 (nothing is 100% certain)
   */
  async calculateAIProbability(eventId: string): Promise<number | null> {
    const event = await this.prisma.predictionEvent.findFirst({
      where: { id: eventId, status: 'ACTIVE' },
    });

    if (!event) return null;

    try {
      // Start with neutral probability
      let aiProbability = 0.50;

      // Step 1: Market sentiment signal (from related symbols)
      const relatedSymbols: string[] = JSON.parse(event.relatedSymbols || '[]');
      if (relatedSymbols.length > 0) {
        const marketSignal = await this._analyzeMarketTrend(relatedSymbols);
        aiProbability += marketSignal * 0.30;
      }

      // Step 2: Use AI Council for qualitative analysis (highest weight)
      if (this.orchestrator) {
        const aiSignal = await this._getAIQualitativeAnalysis(event.title, relatedSymbols);
        if (aiSignal !== null) {
          // Blend: if AI gives a strong signal, it should dominate
          aiProbability = aiProbability * 0.40 + aiSignal * 0.60;
        }
      }

      // Step 3: Time decay — events closer to resolution tend to converge
      if (event.endDate) {
        const daysToResolution = Math.max(0,
          (event.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        // Events very close to resolution: market probability tends to be more accurate
        if (daysToResolution < 3) {
          const marketWeight = Math.max(0, 0.3 * (1 - daysToResolution / 3));
          aiProbability = aiProbability * (1 - marketWeight) + Number(event.marketProbability) * marketWeight;
        }
      }

      // Clamp to 0.05–0.95 — no event is 100% certain
      aiProbability = Math.max(0.05, Math.min(0.95, aiProbability));

      // Round to 6 decimal places for DB precision
      return Math.round(aiProbability * 1_000_000) / 1_000_000;

    } catch (error: any) {
      this.logger.error(`Failed to calculate AI probability for event ${eventId}: ${error.message}`);
      return null;
    }
  }

  // ── Prediction Gap Analysis ──

  /**
   * Compute the PredictionGap for a specific event and symbol.
   * The gap represents the divergence between market and AI probabilities.
   *
   * Signal boost logic:
   * - If market and AI agree (gap < 5%): +5% confidence boost to signals
   * - If market and AI disagree (gap > 15%): -8% confidence penalty
   * - Otherwise: no adjustment
   */
  async analyzePredictionGap(eventId: string, symbol: string): Promise<PredictionGapAnalysis | null> {
    const cacheKey = `prediction:gap:${eventId}:${symbol}`;

    try {
      return await this.redis.cacheOrGet<PredictionGapAnalysis | null>(
        cacheKey,
        () => this._computeGapAnalysis(eventId, symbol),
        CACHE_TTL_GAP_MS,
      );
    } catch {
      return this._computeGapAnalysis(eventId, symbol);
    }
  }

  /**
   * Get all prediction gap analyses for a specific symbol.
   * Returns gaps from all active events that mention the symbol.
   */
  async getGapsForSymbol(symbol: string): Promise<PredictionGapAnalysis[]> {
    const cacheKey = `prediction:gaps:${symbol}`;

    try {
      return await this.redis.cacheOrGet<PredictionGapAnalysis[]>(
        cacheKey,
        () => this._computeGapsForSymbol(symbol),
        CACHE_TTL_GAP_MS,
      );
    } catch {
      return this._computeGapsForSymbol(symbol);
    }
  }

  // ── AI Council 8th Model: Vote ──

  /**
   * Generate a vote from the Prediction Market model for the AI Council.
   *
   * Dynamic confidence mechanism (per architecture review):
   * - Base confidence = 60%
   * - +5% for each active event related to the symbol
   * - +bonus based on trading volume (higher liquidity = more reliable signals)
   * - Maximum confidence = 95%
   *
   * The model only votes if there are relevant prediction market events.
   * If no events exist for the symbol, it abstains (no vote).
   */
  async getCouncilVote(symbol: string): Promise<PredictionMarketVote | null> {
    const cacheKey = `prediction:vote:${symbol}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    // Get all active events for this symbol
    const events = await this._getActiveEventsForSymbol(symbol);

    if (events.length === 0) {
      // No prediction market events for this symbol — abstain from voting
      return null;
    }

    // Get gap analyses for all related events
    const gaps: PredictionGapAnalysis[] = [];
    for (const event of events) {
      const gap = await this.analyzePredictionGap(event.id, symbol);
      if (gap) gaps.push(gap);
    }

    if (gaps.length === 0) return null;

    // Calculate aggregate signals
    const avgGap = gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length;
    const alignedGaps = gaps.filter(g => g.gapDirection === 'aligned');
    const marketHigherGaps = gaps.filter(g => g.gapDirection === 'market_higher');
    const aiHigherGaps = gaps.filter(g => g.gapDirection === 'ai_higher');

    // Determine vote based on gap direction consensus
    let vote: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let reason = '';

    if (alignedGaps.length > gaps.length * 0.6) {
      // Market and AI mostly agree — this is a strong signal
      const marketProb = events.reduce((sum, e) => sum + Number(e.marketProbability), 0) / events.length;
      if (marketProb > 0.6) {
        vote = 'BUY';
        reason = `السوق التنبؤي وتوقعات AI متفقان (${alignedGaps.length}/${gaps.length} أحداث) — احتمال إيجابي ${Math.round(marketProb * 100)}%`;
      } else if (marketProb < 0.4) {
        vote = 'SELL';
        reason = `السوق التنبؤي وتوقعات AI متفقان (${alignedGaps.length}/${gaps.length} أحداث) — احتمال سلبي ${Math.round(marketProb * 100)}%`;
      } else {
        vote = 'HOLD';
        reason = `السوق التنبؤي وتوقعات AI متفقان على الحياد — احتمال ${Math.round(marketProb * 100)}%`;
      }
    } else if (marketHigherGaps.length > aiHigherGaps.length) {
      // Market is more optimistic than AI — potential overvaluation
      vote = 'HOLD';
      reason = `السوق أكثر تفاؤلاً من AI (${marketHigherGaps.length} أحداث) — احتمال تضخيم في الأسعار`;
    } else if (aiHigherGaps.length > marketHigherGaps.length) {
      // AI is more optimistic than market — potential undervaluation
      vote = 'BUY';
      reason = `AI أكثر تفاؤلاً من السوق (${aiHigherGaps.length} أحداث) — فرصة شراء محتملة`;
    } else {
      vote = 'HOLD';
      reason = `إشارات مختلطة من الأسواق التنبؤية — ${gaps.length} أحداث بفجوة متوسطة ${Math.round(avgGap * 100)}%`;
    }

    // Calculate dynamic confidence (per architecture review)
    const avgVolume = events.reduce((sum, e) => sum + Number(e.volume24h || 0), 0) / events.length;
    let confidence = 60 + (events.length * 5) + Math.min(avgVolume / 100_000, 20);
    confidence = Math.min(confidence, 95);

    const result: PredictionMarketVote = {
      vote,
      confidence: Math.round(confidence),
      reason,
      eventsAnalyzed: events.length,
      avgGap: Math.round(avgGap * 10_000) / 10_000,
    };

    // Cache the vote
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL_VOTE_MS);
    } catch {}

    this.logger.log(`🔮 Prediction Market vote for ${symbol}: ${vote} (${confidence}%) — ${events.length} events analyzed`);

    return result;
  }

  // ── Impact Assessment ──

  /**
   * Generate a structured impact assessment for a prediction event.
   * Uses AI Council analysis to determine impact on related assets.
   */
  async generateImpactAssessment(eventId: string): Promise<ImpactAssessment | null> {
    const event = await this.prisma.predictionEvent.findFirst({
      where: { id: eventId, status: 'ACTIVE' },
    });

    if (!event) return null;

    const relatedSymbols: string[] = JSON.parse(event.relatedSymbols || '[]');

    if (relatedSymbols.length === 0) {
      // No related symbols — can't assess impact
      return {
        primarySymbols: [],
        secondaryEffects: ['لا توجد أصول مالية مرتبطة بهذا الحدث'],
        hedgeComplexity: 'LOW',
        timeHorizon: 'MEDIUM',
      };
    }

    // Determine hedge complexity based on number of affected assets
    const hedgeComplexity: 'LOW' | 'MEDIUM' | 'HIGH' =
      relatedSymbols.length > 3 ? 'HIGH' : relatedSymbols.length > 1 ? 'MEDIUM' : 'LOW';

    // Determine time horizon based on event end date
    let timeHorizon: 'IMMEDIATE' | 'SHORT' | 'MEDIUM' | 'LONG' = 'MEDIUM';
    if (event.endDate) {
      const daysToResolution = (event.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysToResolution < 1) timeHorizon = 'IMMEDIATE';
      else if (daysToResolution < 7) timeHorizon = 'SHORT';
      else if (daysToResolution < 30) timeHorizon = 'MEDIUM';
      else timeHorizon = 'LONG';
    }

    const marketProb = Number(event.marketProbability);
    const primarySymbols = relatedSymbols.map(symbol => ({
      symbol,
      expectedDirection: marketProb > 0.6 ? 'UP' as const : marketProb < 0.4 ? 'DOWN' as const : 'VOLATILE' as const,
      expectedMagnitude: Math.round(Math.abs(marketProb - 0.5) * 200), // 0-100 scale
      confidence: Math.round(Number(event.liquidity || 0) > 100_000 ? 75 : 50),
    }));

    // Generate secondary effects description
    const secondaryEffects: string[] = [];
    if (marketProb > 0.7) {
      secondaryEffects.push('احتمال ارتفاع ثقة المستثمرين في الأصول المرتبطة');
    } else if (marketProb < 0.3) {
      secondaryEffects.push('احتمال هروب رؤوس الأموال من الأصول المرتبطة');
    }
    if (relatedSymbols.length > 1) {
      secondaryEffects.push(`تأثير متبادل بين ${relatedSymbols.length} أصول مالية`);
    }

    const assessment: ImpactAssessment = {
      primarySymbols,
      secondaryEffects,
      hedgeComplexity,
      timeHorizon,
    };

    // Store assessment in database
    await this.prisma.predictionEvent.update({
      where: { id: event.id },
      data: { impactAssessment: JSON.stringify(assessment) },
    });

    return assessment;
  }

  // ── Query Methods ──

  /**
   * Get all active prediction events, optionally filtered by symbol or category.
   */
  async getActiveEvents(filters?: { symbol?: string; category?: string }): Promise<any[]> {
    const where: any = { status: 'ACTIVE' };

    if (filters?.category) {
      where.category = filters.category;
    }

    const events = await this.prisma.predictionEvent.findMany({
      where,
      orderBy: { volume24h: 'desc' },
      take: 50,
    });

    if (filters?.symbol) {
      // Filter by symbol (contained in relatedSymbols JSON array)
      return events.filter(event => {
        const symbols: string[] = JSON.parse(event.relatedSymbols || '[]');
        return symbols.includes(filters.symbol!);
      });
    }

    return events;
  }

  /**
   * Get events with the largest prediction gaps.
   * These are the most interesting opportunities for trading signals.
   */
  async getTopGapEvents(limit: number = 10): Promise<any[]> {
    return this.prisma.predictionEvent.findMany({
      where: {
        status: 'ACTIVE',
        predictionGap: { not: null },
      },
      orderBy: { predictionGap: 'desc' },
      take: limit,
    });
  }

  /**
   * Get prediction market events that affect a user's portfolio.
   * Matches events' relatedSymbols against the user's portfolio assets.
   */
  async getPortfolioImpactEvents(userId: string): Promise<any[]> {
    // Get user's portfolio assets
    const portfolioAssets = await this.prisma.portfolioAsset.findMany({
      where: { portfolio: { userId } },
      select: { symbol: true },
    });

    const userSymbols = portfolioAssets.map(a => a.symbol);

    if (userSymbols.length === 0) return [];

    // Find active events that relate to any of the user's symbols
    const activeEvents = await this.prisma.predictionEvent.findMany({
      where: { status: 'ACTIVE' },
    });

    return activeEvents.filter(event => {
      const symbols: string[] = JSON.parse(event.relatedSymbols || '[]');
      return symbols.some(s => userSymbols.includes(s));
    });
  }

  // ── Private Helpers ──

  /**
   * V267: Analyze market trend for related symbols — NO LONGER A STUB.
   *
   * Previously this method always returned 0 (TODO comment), meaning the 30% market
   * signal weight in `calculateAIProbability` contributed nothing. Now we fetch
   * live prices + 24h change via the AIOrchestrator's market-data helper and
   * compute a simple trend signal: -1.0 (very bearish) to +1.0 (very bullish).
   *
   * Algorithm:
   *   For each symbol in `symbols`, fetch `changePercent24h` from the orchestrator's
   *   multi-source price fetcher. Normalize each to [-1, +1] (±5% change → ±1.0,
   *   clamped). Average across all symbols.
   *
   * If the orchestrator is unavailable or all fetches fail, returns 0 (neutral).
   */
  private async _analyzeMarketTrend(symbols: string[]): Promise<number> {
    if (!this.orchestrator || !symbols || symbols.length === 0) return 0;

    const signals: number[] = [];
    for (const symbol of symbols.slice(0, 3)) { // cap at 3 to limit API calls
      try {
        // Try as-is (e.g., "BTC") then with /USDT suffix (e.g., "BTC/USDT")
        const candidates = [symbol, `${symbol}/USDT`, `${symbol}/USD`];
        let marketData: any = null;
        for (const candidate of candidates) {
          try {
            marketData = await this.orchestrator.fetchQuickMarketData(candidate);
            if (marketData?.price && marketData.price > 0) break;
          } catch { /* try next candidate */ }
        }
        if (!marketData || !marketData.price) continue;

        const changePercent = Number(marketData.change24h ?? marketData.changePercent ?? 0);
        if (!isFinite(changePercent)) continue;

        // Normalize: ±5% change → ±1.0 (clamped)
        const signal = Math.max(-1, Math.min(1, changePercent / 5));
        signals.push(signal);
      } catch (err: any) {
        this.logger.debug(`V267 _analyzeMarketTrend: failed for ${symbol}: ${err?.message || err}`);
      }
    }

    if (signals.length === 0) return 0;
    return signals.reduce((sum, s) => sum + s, 0) / signals.length;
  }

  /**
   * Get qualitative probability estimate from AI Council.
   * Returns a probability estimate from 0.0 to 1.0.
   */
  private async _getAIQualitativeAnalysis(eventTitle: string, relatedSymbols: string[]): Promise<number | null> {
    if (!this.orchestrator) return null;

    try {
      const symbolContext = relatedSymbols.length > 0
        ? `الأصول المرتبطة: ${relatedSymbols.join(', ')}`
        : 'لا توجد أصول مرتبطة مباشرة';

      const response = await this.orchestrator.analyze({
        symbol: relatedSymbols[0] || 'MARKET',
        prompt: `قم بتحليل الحدث التنبؤي التالي وقّدر احتمال تحققه كنسبة مئوية:
        
الحدث: ${eventTitle}
${symbolContext}

أجب بنسبة مئوية فقط (مثلاً: 0.65 تعني 65%). لا تكتب أي شيء آخر غير الرقم.`,
        type: 'prediction',
        language: 'ar',
      });

      if (response.confidence === 0) return null;

      // Extract probability from AI response
      const content = response.content.trim();
      const probMatch = content.match(/(\d+\.?\d*)/);
      if (probMatch) {
        let prob = parseFloat(probMatch[1]);
        // If the number is > 1, it's probably a percentage (e.g., 65 instead of 0.65)
        if (prob > 1) prob = prob / 100;
        return Math.max(0.05, Math.min(0.95, prob));
      }

      return null;
    } catch (error: any) {
      this.logger.debug(`AI qualitative analysis failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Compute the PredictionGap analysis for a single event/symbol pair.
   */
  private async _computeGapAnalysis(eventId: string, symbol: string): Promise<PredictionGapAnalysis | null> {
    const event = await this.prisma.predictionEvent.findFirst({
      where: { id: eventId, status: 'ACTIVE' },
    });

    if (!event) return null;

    // Ensure AI probability is calculated
    if (!event.aiProbability) {
      const aiProb = await this.calculateAIProbability(eventId);
      if (aiProb === null) return null;

      await this.prisma.predictionEvent.update({
        where: { id: event.id },
        data: { aiProbability: aiProb },
      });

      event.aiProbability = aiProb as any;
    }

    const marketProb = Number(event.marketProbability);
    const aiProb = Number(event.aiProbability);
    const gap = Math.abs(marketProb - aiProb);

    // Determine gap direction
    let gapDirection: 'market_higher' | 'ai_higher' | 'aligned';
    if (gap < 0.05) {
      gapDirection = 'aligned';
    } else if (marketProb > aiProb) {
      gapDirection = 'market_higher';
    } else {
      gapDirection = 'ai_higher';
    }

    // Calculate signal boost
    let signalBoost: number;
    if (gapDirection === 'aligned') {
      signalBoost = 0.05; // +5% for agreement
    } else if (gap > 0.15) {
      signalBoost = -0.08; // -8% for significant disagreement
    } else {
      signalBoost = 0; // Neutral for moderate gap
    }

    // Generate recommendation
    let recommendation: string;
    if (gapDirection === 'aligned' && marketProb > 0.6) {
      recommendation = 'توافق إيجابي — السوق وAI متفقان على احتمال مرتفع';
    } else if (gapDirection === 'aligned' && marketProb < 0.4) {
      recommendation = 'توافق سلبي — السوق وAI متفقان على احتمال منخفض';
    } else if (gapDirection === 'market_higher' && gap > 0.15) {
      recommendation = 'فجوة كبيرة — السوق أكثر تفاؤلاً من AI — احتمال تضخيم';
    } else if (gapDirection === 'ai_higher' && gap > 0.15) {
      recommendation = 'فجوة كبيرة — AI أكثر تفاؤلاً من السوق — فرصة محتملة';
    } else {
      recommendation = 'فجوة معتدلة — إشارات متباينة';
    }

    // Update the event with computed gap values
    await this.prisma.predictionEvent.update({
      where: { id: event.id },
      data: {
        predictionGap: gap,
        gapDirection,
        signalBoost,
      },
    });

    return {
      eventId: event.id,
      symbol,
      marketProbability: marketProb,
      aiProbability: aiProb,
      gap,
      gapDirection,
      signalBoost,
      confidence: Number(event.liquidity || 0) > 100_000 ? 0.85 : 0.60,
      recommendation,
    };
  }

  /**
   * Compute gap analyses for all events related to a symbol.
   */
  private async _computeGapsForSymbol(symbol: string): Promise<PredictionGapAnalysis[]> {
    const events = await this._getActiveEventsForSymbol(symbol);
    const gaps: PredictionGapAnalysis[] = [];

    for (const event of events) {
      const gap = await this._computeGapAnalysis(event.id, symbol);
      if (gap) gaps.push(gap);
    }

    return gaps;
  }

  /**
   * Get active events that are related to a specific symbol.
   */
  private async _getActiveEventsForSymbol(symbol: string): Promise<any[]> {
    const activeEvents = await this.prisma.predictionEvent.findMany({
      where: { status: 'ACTIVE' },
    });

    return activeEvents.filter(event => {
      const symbols: string[] = JSON.parse(event.relatedSymbols || '[]');
      return symbols.includes(symbol);
    });
  }
}
