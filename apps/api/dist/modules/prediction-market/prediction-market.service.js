"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PredictionMarketService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionMarketService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const redis_service_1 = require("../../common/redis/redis.service");
const ai_orchestrator_service_1 = require("../ai/services/ai-orchestrator.service");
const polymarket_adapter_1 = require("./adapters/polymarket.adapter");
const CACHE_TTL_EVENTS_MS = 60 * 60 * 1000;
const CACHE_TTL_DATA_MS = 5 * 60 * 1000;
const CACHE_TTL_GAP_MS = 10 * 60 * 1000;
const CACHE_TTL_VOTE_MS = 5 * 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
let PredictionMarketService = PredictionMarketService_1 = class PredictionMarketService {
    constructor(prisma, redis, configService, polymarketAdapter, orchestrator) {
        this.prisma = prisma;
        this.redis = redis;
        this.configService = configService;
        this.polymarketAdapter = polymarketAdapter;
        this.orchestrator = orchestrator;
        this.logger = new common_1.Logger(PredictionMarketService_1.name);
        this.syncInProgress = false;
        this.lastSyncAt = null;
        this.logger.log('🔮 Prediction Market Service initialized — Polymarket integration active');
    }
    async syncEvents(force = false) {
        if (this.syncInProgress) {
            this.logger.debug('Sync already in progress — skipping');
            return { synced: 0, updated: 0 };
        }
        if (!force && this.lastSyncAt) {
            const timeSinceLastSync = Date.now() - this.lastSyncAt.getTime();
            if (timeSinceLastSync < SYNC_INTERVAL_MS) {
                this.logger.debug(`Last sync was ${Math.round(timeSinceLastSync / 1000)}s ago — skipping`);
                return { synced: 0, updated: 0 };
            }
        }
        this.syncInProgress = true;
        try {
            const cacheKey = 'prediction:events:polymarket';
            let events;
            if (!force) {
                events = await this.redis.cacheOrGet(cacheKey, () => this.polymarketAdapter.fetchActiveEvents(100), CACHE_TTL_EVENTS_MS);
            }
            else {
                events = await this.polymarketAdapter.fetchActiveEvents(100);
                await this.redis.set(cacheKey, JSON.stringify(events), CACHE_TTL_EVENTS_MS);
            }
            let synced = 0;
            let updated = 0;
            for (const event of events) {
                const existing = await this.prisma.predictionEvent.findUnique({
                    where: { source_sourceId: { source: event.source, sourceId: event.sourceId } },
                });
                if (existing) {
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
                }
                else {
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
        }
        catch (error) {
            this.logger.error(`Failed to sync Polymarket events: ${error.message}`);
            return { synced: 0, updated: 0 };
        }
        finally {
            this.syncInProgress = false;
        }
    }
    async calculateAIProbability(eventId) {
        const event = await this.prisma.predictionEvent.findFirst({
            where: { id: eventId, status: 'ACTIVE' },
        });
        if (!event)
            return null;
        try {
            let aiProbability = 0.50;
            const relatedSymbols = JSON.parse(event.relatedSymbols || '[]');
            if (relatedSymbols.length > 0) {
                const marketSignal = await this._analyzeMarketTrend(relatedSymbols);
                aiProbability += marketSignal * 0.30;
            }
            if (this.orchestrator) {
                const aiSignal = await this._getAIQualitativeAnalysis(event.title, relatedSymbols);
                if (aiSignal !== null) {
                    aiProbability = aiProbability * 0.40 + aiSignal * 0.60;
                }
            }
            if (event.endDate) {
                const daysToResolution = Math.max(0, (event.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                if (daysToResolution < 3) {
                    const marketWeight = Math.max(0, 0.3 * (1 - daysToResolution / 3));
                    aiProbability = aiProbability * (1 - marketWeight) + Number(event.marketProbability) * marketWeight;
                }
            }
            aiProbability = Math.max(0.05, Math.min(0.95, aiProbability));
            return Math.round(aiProbability * 1_000_000) / 1_000_000;
        }
        catch (error) {
            this.logger.error(`Failed to calculate AI probability for event ${eventId}: ${error.message}`);
            return null;
        }
    }
    async analyzePredictionGap(eventId, symbol) {
        const cacheKey = `prediction:gap:${eventId}:${symbol}`;
        try {
            return await this.redis.cacheOrGet(cacheKey, () => this._computeGapAnalysis(eventId, symbol), CACHE_TTL_GAP_MS);
        }
        catch {
            return this._computeGapAnalysis(eventId, symbol);
        }
    }
    async getGapsForSymbol(symbol) {
        const cacheKey = `prediction:gaps:${symbol}`;
        try {
            return await this.redis.cacheOrGet(cacheKey, () => this._computeGapsForSymbol(symbol), CACHE_TTL_GAP_MS);
        }
        catch {
            return this._computeGapsForSymbol(symbol);
        }
    }
    async getCouncilVote(symbol) {
        const cacheKey = `prediction:vote:${symbol}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { }
        const events = await this._getActiveEventsForSymbol(symbol);
        if (events.length === 0) {
            return null;
        }
        const gaps = [];
        for (const event of events) {
            const gap = await this.analyzePredictionGap(event.id, symbol);
            if (gap)
                gaps.push(gap);
        }
        if (gaps.length === 0)
            return null;
        const avgGap = gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length;
        const alignedGaps = gaps.filter(g => g.gapDirection === 'aligned');
        const marketHigherGaps = gaps.filter(g => g.gapDirection === 'market_higher');
        const aiHigherGaps = gaps.filter(g => g.gapDirection === 'ai_higher');
        let vote = 'HOLD';
        let reason = '';
        if (alignedGaps.length > gaps.length * 0.6) {
            const marketProb = events.reduce((sum, e) => sum + Number(e.marketProbability), 0) / events.length;
            if (marketProb > 0.6) {
                vote = 'BUY';
                reason = `السوق التنبؤي وتوقعات AI متفقان (${alignedGaps.length}/${gaps.length} أحداث) — احتمال إيجابي ${Math.round(marketProb * 100)}%`;
            }
            else if (marketProb < 0.4) {
                vote = 'SELL';
                reason = `السوق التنبؤي وتوقعات AI متفقان (${alignedGaps.length}/${gaps.length} أحداث) — احتمال سلبي ${Math.round(marketProb * 100)}%`;
            }
            else {
                vote = 'HOLD';
                reason = `السوق التنبؤي وتوقعات AI متفقان على الحياد — احتمال ${Math.round(marketProb * 100)}%`;
            }
        }
        else if (marketHigherGaps.length > aiHigherGaps.length) {
            vote = 'HOLD';
            reason = `السوق أكثر تفاؤلاً من AI (${marketHigherGaps.length} أحداث) — احتمال تضخيم في الأسعار`;
        }
        else if (aiHigherGaps.length > marketHigherGaps.length) {
            vote = 'BUY';
            reason = `AI أكثر تفاؤلاً من السوق (${aiHigherGaps.length} أحداث) — فرصة شراء محتملة`;
        }
        else {
            vote = 'HOLD';
            reason = `إشارات مختلطة من الأسواق التنبؤية — ${gaps.length} أحداث بفجوة متوسطة ${Math.round(avgGap * 100)}%`;
        }
        const avgVolume = events.reduce((sum, e) => sum + Number(e.volume24h || 0), 0) / events.length;
        let confidence = 60 + (events.length * 5) + Math.min(avgVolume / 100_000, 20);
        confidence = Math.min(confidence, 95);
        const result = {
            vote,
            confidence: Math.round(confidence),
            reason,
            eventsAnalyzed: events.length,
            avgGap: Math.round(avgGap * 10_000) / 10_000,
        };
        try {
            await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL_VOTE_MS);
        }
        catch { }
        this.logger.log(`🔮 Prediction Market vote for ${symbol}: ${vote} (${confidence}%) — ${events.length} events analyzed`);
        return result;
    }
    async generateImpactAssessment(eventId) {
        const event = await this.prisma.predictionEvent.findFirst({
            where: { id: eventId, status: 'ACTIVE' },
        });
        if (!event)
            return null;
        const relatedSymbols = JSON.parse(event.relatedSymbols || '[]');
        if (relatedSymbols.length === 0) {
            return {
                primarySymbols: [],
                secondaryEffects: ['لا توجد أصول مالية مرتبطة بهذا الحدث'],
                hedgeComplexity: 'LOW',
                timeHorizon: 'MEDIUM',
            };
        }
        const hedgeComplexity = relatedSymbols.length > 3 ? 'HIGH' : relatedSymbols.length > 1 ? 'MEDIUM' : 'LOW';
        let timeHorizon = 'MEDIUM';
        if (event.endDate) {
            const daysToResolution = (event.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (daysToResolution < 1)
                timeHorizon = 'IMMEDIATE';
            else if (daysToResolution < 7)
                timeHorizon = 'SHORT';
            else if (daysToResolution < 30)
                timeHorizon = 'MEDIUM';
            else
                timeHorizon = 'LONG';
        }
        const marketProb = Number(event.marketProbability);
        const primarySymbols = relatedSymbols.map(symbol => ({
            symbol,
            expectedDirection: marketProb > 0.6 ? 'UP' : marketProb < 0.4 ? 'DOWN' : 'VOLATILE',
            expectedMagnitude: Math.round(Math.abs(marketProb - 0.5) * 200),
            confidence: Math.round(Number(event.liquidity || 0) > 100_000 ? 75 : 50),
        }));
        const secondaryEffects = [];
        if (marketProb > 0.7) {
            secondaryEffects.push('احتمال ارتفاع ثقة المستثمرين في الأصول المرتبطة');
        }
        else if (marketProb < 0.3) {
            secondaryEffects.push('احتمال هروب رؤوس الأموال من الأصول المرتبطة');
        }
        if (relatedSymbols.length > 1) {
            secondaryEffects.push(`تأثير متبادل بين ${relatedSymbols.length} أصول مالية`);
        }
        const assessment = {
            primarySymbols,
            secondaryEffects,
            hedgeComplexity,
            timeHorizon,
        };
        await this.prisma.predictionEvent.update({
            where: { id: event.id },
            data: { impactAssessment: JSON.stringify(assessment) },
        });
        return assessment;
    }
    async getActiveEvents(filters) {
        const where = { status: 'ACTIVE' };
        if (filters?.category) {
            where.category = filters.category;
        }
        const events = await this.prisma.predictionEvent.findMany({
            where,
            orderBy: { volume24h: 'desc' },
            take: 50,
        });
        if (filters?.symbol) {
            return events.filter(event => {
                const symbols = JSON.parse(event.relatedSymbols || '[]');
                return symbols.includes(filters.symbol);
            });
        }
        return events;
    }
    async getTopGapEvents(limit = 10) {
        return this.prisma.predictionEvent.findMany({
            where: {
                status: 'ACTIVE',
                predictionGap: { not: null },
            },
            orderBy: { predictionGap: 'desc' },
            take: limit,
        });
    }
    async getPortfolioImpactEvents(userId) {
        const portfolioAssets = await this.prisma.portfolioAsset.findMany({
            where: { portfolio: { userId } },
            select: { symbol: true },
        });
        const userSymbols = portfolioAssets.map(a => a.symbol);
        if (userSymbols.length === 0)
            return [];
        const activeEvents = await this.prisma.predictionEvent.findMany({
            where: { status: 'ACTIVE' },
        });
        return activeEvents.filter(event => {
            const symbols = JSON.parse(event.relatedSymbols || '[]');
            return symbols.some(s => userSymbols.includes(s));
        });
    }
    async _analyzeMarketTrend(symbols) {
        return 0;
    }
    async _getAIQualitativeAnalysis(eventTitle, relatedSymbols) {
        if (!this.orchestrator)
            return null;
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
            if (response.confidence === 0)
                return null;
            const content = response.content.trim();
            const probMatch = content.match(/(\d+\.?\d*)/);
            if (probMatch) {
                let prob = parseFloat(probMatch[1]);
                if (prob > 1)
                    prob = prob / 100;
                return Math.max(0.05, Math.min(0.95, prob));
            }
            return null;
        }
        catch (error) {
            this.logger.debug(`AI qualitative analysis failed: ${error.message}`);
            return null;
        }
    }
    async _computeGapAnalysis(eventId, symbol) {
        const event = await this.prisma.predictionEvent.findFirst({
            where: { id: eventId, status: 'ACTIVE' },
        });
        if (!event)
            return null;
        if (!event.aiProbability) {
            const aiProb = await this.calculateAIProbability(eventId);
            if (aiProb === null)
                return null;
            await this.prisma.predictionEvent.update({
                where: { id: event.id },
                data: { aiProbability: aiProb },
            });
            event.aiProbability = aiProb;
        }
        const marketProb = Number(event.marketProbability);
        const aiProb = Number(event.aiProbability);
        const gap = Math.abs(marketProb - aiProb);
        let gapDirection;
        if (gap < 0.05) {
            gapDirection = 'aligned';
        }
        else if (marketProb > aiProb) {
            gapDirection = 'market_higher';
        }
        else {
            gapDirection = 'ai_higher';
        }
        let signalBoost;
        if (gapDirection === 'aligned') {
            signalBoost = 0.05;
        }
        else if (gap > 0.15) {
            signalBoost = -0.08;
        }
        else {
            signalBoost = 0;
        }
        let recommendation;
        if (gapDirection === 'aligned' && marketProb > 0.6) {
            recommendation = 'توافق إيجابي — السوق وAI متفقان على احتمال مرتفع';
        }
        else if (gapDirection === 'aligned' && marketProb < 0.4) {
            recommendation = 'توافق سلبي — السوق وAI متفقان على احتمال منخفض';
        }
        else if (gapDirection === 'market_higher' && gap > 0.15) {
            recommendation = 'فجوة كبيرة — السوق أكثر تفاؤلاً من AI — احتمال تضخيم';
        }
        else if (gapDirection === 'ai_higher' && gap > 0.15) {
            recommendation = 'فجوة كبيرة — AI أكثر تفاؤلاً من السوق — فرصة محتملة';
        }
        else {
            recommendation = 'فجوة معتدلة — إشارات متباينة';
        }
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
    async _computeGapsForSymbol(symbol) {
        const events = await this._getActiveEventsForSymbol(symbol);
        const gaps = [];
        for (const event of events) {
            const gap = await this._computeGapAnalysis(event.id, symbol);
            if (gap)
                gaps.push(gap);
        }
        return gaps;
    }
    async _getActiveEventsForSymbol(symbol) {
        const activeEvents = await this.prisma.predictionEvent.findMany({
            where: { status: 'ACTIVE' },
        });
        return activeEvents.filter(event => {
            const symbols = JSON.parse(event.relatedSymbols || '[]');
            return symbols.includes(symbol);
        });
    }
};
exports.PredictionMarketService = PredictionMarketService;
exports.PredictionMarketService = PredictionMarketService = PredictionMarketService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => ai_orchestrator_service_1.AIOrchestratorService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        config_1.ConfigService,
        polymarket_adapter_1.PolymarketAdapter,
        ai_orchestrator_service_1.AIOrchestratorService])
], PredictionMarketService);
//# sourceMappingURL=prediction-market.service.js.map