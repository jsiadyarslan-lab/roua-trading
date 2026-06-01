"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ContentAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentAgentService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../common/redis/redis.service");
const audit_service_1 = require("../../audit/audit.service");
const content_generator_service_1 = require("./services/content-generator.service");
const content_curator_service_1 = require("./services/content-curator.service");
const content_optimizer_service_1 = require("./services/content-optimizer.service");
const content_publisher_service_1 = require("./services/content-publisher.service");
const content_types_1 = require("./types/content.types");
let ContentAgentService = ContentAgentService_1 = class ContentAgentService {
    constructor(redis, configService, audit, generator, curator, publisher, optimizer) {
        this.redis = redis;
        this.configService = configService;
        this.audit = audit;
        this.generator = generator;
        this.curator = curator;
        this.publisher = publisher;
        this.optimizer = optimizer;
        this.logger = new common_1.Logger(ContentAgentService_1.name);
        this.DAILY_QUOTA = 50;
        this.STATE_KEY = 'content-agent:state';
        this.logger.log('🧠 Content Agent initialized — content engine ready');
    }
    async getState() {
        try {
            const raw = await this.redis.get(this.STATE_KEY);
            if (raw)
                return JSON.parse(raw);
        }
        catch { }
        return {
            status: content_types_1.ContentAgentStatus.IDLE,
            totalGenerated: 0,
            totalPublished: 0,
            dailyQuota: this.DAILY_QUOTA,
            dailyGenerated: 0,
            activeTemplates: 0,
            pendingSchedule: 0,
            errors: 0,
        };
    }
    async generateContent(userId, dto) {
        this.logger.log(`🧠 Content generation pipeline: ${dto.type} — "${dto.topic}"`);
        const sourceData = await this.curator.curateSources(dto.category, dto.symbols);
        const request = {
            type: dto.type,
            category: dto.category,
            topic: dto.topic,
            symbols: dto.symbols,
            language: dto.language || content_types_1.ContentLanguage.BILINGUAL,
            priority: dto.priority || content_types_1.ContentPriority.NORMAL,
            sourceData,
            aiConfig: dto.aiConfig,
            scheduledAt: dto.scheduledAt,
            tags: dto.tags,
            authorId: userId,
        };
        const content = await this.generator.generate(request);
        const { content: optimizedContent, optimization } = await this.optimizer.optimize(content);
        const status = dto.scheduledAt ? content_types_1.ContentStatus.SCHEDULED : content_types_1.ContentStatus.DRAFT;
        const article = await this.publisher.saveContent(userId, optimizedContent, status);
        if (dto.scheduledAt) {
            await this.publisher.schedule(userId, article.id, dto.scheduledAt);
        }
        await this._updateState({ totalGenerated: { increment: 1 } });
        await this.audit.log({
            userId,
            action: 'CONTENT_GENERATED',
            resource: 'content-agent',
            details: JSON.stringify({
                articleId: article.id,
                type: dto.type,
                category: dto.category,
                qualityScore: optimizedContent.qualityScore,
                optimizationScore: optimization.overallScore,
            }),
        });
        return {
            content: optimizedContent,
            article,
            optimization,
        };
    }
    async bulkGenerate(userId, dto) {
        this.logger.log(`🧠 Bulk generating ${dto.requests.length} content items`);
        const results = [];
        for (const request of dto.requests) {
            try {
                const result = await this.generateContent(userId, {
                    type: request.type,
                    category: request.category,
                    topic: request.topic,
                    symbols: request.symbols,
                    language: request.language,
                    priority: request.priority,
                    aiConfig: request.aiConfig,
                    scheduledAt: request.scheduledAt,
                    tags: request.tags,
                });
                if (dto.publishImmediately && result.article) {
                    await this.publisher.publish(userId, result.article.id);
                }
                results.push({
                    topic: request.topic,
                    success: true,
                    articleId: result.article.id,
                });
            }
            catch (error) {
                results.push({
                    topic: request.topic,
                    success: false,
                    error: error.message,
                });
            }
        }
        return { results };
    }
    async generateBreakingAlert(userId, topic, symbols, context) {
        const content = await this.generator.generateBreakingAlert(topic, symbols, context);
        const { content: optimized } = await this.optimizer.optimize(content);
        const article = await this.publisher.saveContent(userId, optimized, content_types_1.ContentStatus.PUBLISHED);
        await this._updateState({ totalGenerated: { increment: 1 }, totalPublished: { increment: 1 } });
        return { content: optimized, article };
    }
    async publishContent(userId, contentId) {
        const result = await this.publisher.publish(userId, contentId);
        await this._updateState({ totalPublished: { increment: 1 } });
        return result;
    }
    async scheduleContent(userId, dto) {
        return this.publisher.schedule(userId, dto.contentId, dto.scheduledAt, dto.platform);
    }
    async getContentFeed(dto) {
        return this.publisher.getFeed({
            category: dto.category,
            type: dto.type,
            status: dto.status,
            symbol: dto.symbol,
            page: dto.page,
            limit: dto.limit,
        });
    }
    async getContentById(contentId) {
        return this.publisher.getById(contentId);
    }
    async updateContent(userId, contentId, dto) {
        const data = {};
        if (dto.titleAr)
            data.titleAr = dto.titleAr;
        if (dto.titleEn)
            data.titleEn = dto.titleEn;
        if (dto.contentAr)
            data.contentAr = dto.contentAr;
        if (dto.contentEn)
            data.contentEn = dto.contentEn;
        if (dto.status)
            data.status = dto.status;
        if (dto.tags)
            data.tags = JSON.stringify(dto.tags);
        if (dto.scheduledAt)
            data.scheduledAt = dto.scheduledAt;
        const { PrismaService } = await Promise.resolve().then(() => __importStar(require('../../common/prisma/prisma.service')));
        return data;
    }
    async unpublishContent(userId, contentId, archive = false) {
        return this.publisher.unpublish(userId, contentId, archive);
    }
    async getStats() {
        const [agentState, publisherStats, trendingTopics, contentGaps] = await Promise.all([
            this.getState(),
            this.publisher.getStats(),
            this.curator.getTrendingTopics(),
            this.curator.getContentGaps(),
        ]);
        return {
            agent: agentState,
            publisher: publisherStats,
            trendingTopics,
            contentGaps,
        };
    }
    async autoDailyDigest() {
        this.logger.log('🧠 Auto-generating daily market digest...');
        const categories = [
            content_types_1.ContentCategory.CRYPTO,
            content_types_1.ContentCategory.FOREX,
            content_types_1.ContentCategory.STOCKS,
        ];
        for (const category of categories) {
            try {
                const sourceData = await this.curator.curateSources(category);
                const topic = this._getDailyDigestTopic(category);
                const content = await this.generator.generate({
                    type: content_types_1.ContentType.NEWS_DIGEST,
                    category,
                    topic,
                    language: content_types_1.ContentLanguage.BILINGUAL,
                    priority: content_types_1.ContentPriority.HIGH,
                    sourceData,
                });
                const { content: optimized } = await this.optimizer.optimize(content);
                await this.publisher.saveContent('system', optimized, content_types_1.ContentStatus.PUBLISHED);
                this.logger.log(`🧠 Auto-published daily digest for ${category}`);
            }
            catch (error) {
                this.logger.error(`Auto-digest failed for ${category}: ${error.message}`);
            }
        }
    }
    async autoFillGaps() {
        this.logger.log('🧠 Checking content gaps...');
        try {
            const gaps = await this.curator.getContentGaps();
            const criticalGaps = gaps.filter(g => g.lastArticleHoursAgo > 12);
            for (const gap of criticalGaps.slice(0, 3)) {
                try {
                    const topic = gap.suggestedTopics[0] || `تحديث ${gap.category}`;
                    const sourceData = await this.curator.curateSources(gap.category);
                    const content = await this.generator.generate({
                        type: content_types_1.ContentType.ARTICLE,
                        category: gap.category,
                        topic,
                        language: content_types_1.ContentLanguage.BILINGUAL,
                        priority: content_types_1.ContentPriority.NORMAL,
                        sourceData,
                    });
                    const { content: optimized } = await this.optimizer.optimize(content);
                    await this.publisher.saveContent('system', optimized, content_types_1.ContentStatus.PUBLISHED);
                    this.logger.log(`🧠 Auto-filled gap for ${gap.category}: "${topic}"`);
                }
                catch (error) {
                    this.logger.error(`Auto-fill failed for ${gap.category}: ${error.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`Auto-fill error: ${error.message}`);
        }
    }
    async autoHourlyUpdate() {
        this.logger.log('🧠 Auto-generating hourly market updates...');
        const categories = [
            content_types_1.ContentCategory.CRYPTO,
            content_types_1.ContentCategory.FOREX,
            content_types_1.ContentCategory.STOCKS,
        ];
        for (const category of categories) {
            try {
                const sourceData = await this.curator.curateSources(category);
                const topic = this._getHourlyUpdateTopic(category);
                const content = await this.generator.generate({
                    type: content_types_1.ContentType.HOURLY_UPDATE,
                    category,
                    topic,
                    language: content_types_1.ContentLanguage.BILINGUAL,
                    priority: content_types_1.ContentPriority.HIGH,
                    sourceData,
                });
                const { content: optimized } = await this.optimizer.optimize(content);
                await this.publisher.saveContent('system', optimized, content_types_1.ContentStatus.PUBLISHED);
                this.logger.log(`🧠 Auto-published hourly update for ${category}`);
            }
            catch (error) {
                this.logger.error(`Hourly update failed for ${category}: ${error.message}`);
            }
        }
    }
    async autoWeeklyReview() {
        this.logger.log('🧠 Auto-generating weekly review...');
        const categories = [
            content_types_1.ContentCategory.CRYPTO,
            content_types_1.ContentCategory.FOREX,
            content_types_1.ContentCategory.STOCKS,
            content_types_1.ContentCategory.COMMODITIES,
            content_types_1.ContentCategory.ECONOMY,
        ];
        for (const category of categories) {
            try {
                const sourceData = await this.curator.curateSources(category);
                const topic = this._getWeeklyTopic(category);
                const content = await this.generator.generate({
                    type: content_types_1.ContentType.WEEKLY_REVIEW,
                    category,
                    topic,
                    language: content_types_1.ContentLanguage.BILINGUAL,
                    priority: content_types_1.ContentPriority.HIGH,
                    sourceData,
                });
                const { content: optimized } = await this.optimizer.optimize(content);
                await this.publisher.saveContent('system', optimized, content_types_1.ContentStatus.PUBLISHED);
                this.logger.log(`🧠 Auto-published weekly review for ${category}`);
            }
            catch (error) {
                this.logger.error(`Weekly review failed for ${category}: ${error.message}`);
            }
        }
    }
    async autoPairAnalysis() {
        this.logger.log('🧠 Auto-generating pair analysis reports...');
        const topPairs = [
            { symbol: 'BTC/USDT', category: content_types_1.ContentCategory.CRYPTO },
            { symbol: 'ETH/USDT', category: content_types_1.ContentCategory.CRYPTO },
            { symbol: 'EUR/USD', category: content_types_1.ContentCategory.FOREX },
            { symbol: 'SOL/USDT', category: content_types_1.ContentCategory.CRYPTO },
        ];
        for (const pair of topPairs) {
            try {
                const sourceData = await this.curator.curateSources(pair.category, [pair.symbol]);
                const topic = `تحليل ${pair.symbol} — المستويات والتوقعات`;
                const content = await this.generator.generate({
                    type: content_types_1.ContentType.PAIR_ANALYSIS,
                    category: pair.category,
                    topic,
                    symbols: [pair.symbol],
                    language: content_types_1.ContentLanguage.BILINGUAL,
                    priority: content_types_1.ContentPriority.NORMAL,
                    sourceData,
                });
                const { content: optimized } = await this.optimizer.optimize(content);
                await this.publisher.saveContent('system', optimized, content_types_1.ContentStatus.PUBLISHED);
                this.logger.log(`🧠 Auto-published pair analysis for ${pair.symbol}`);
            }
            catch (error) {
                this.logger.error(`Pair analysis failed for ${pair.symbol}: ${error.message}`);
            }
        }
    }
    async _updateState(updates) {
        try {
            const state = await this.getState();
            if (updates.totalGenerated)
                state.totalGenerated += updates.totalGenerated.increment;
            if (updates.totalPublished)
                state.totalPublished += updates.totalPublished.increment;
            if (updates.errors)
                state.errors += updates.errors.increment;
            if (updates.lastError)
                state.lastError = updates.lastError;
            state.lastGenerationAt = new Date();
            await this.redis.set(this.STATE_KEY, JSON.stringify(state), 86400000);
        }
        catch {
        }
    }
    _getHourlyUpdateTopic(category) {
        const topics = {
            [content_types_1.ContentCategory.CRYPTO]: 'تحديث ساعي — سوق العملات الرقمية',
            [content_types_1.ContentCategory.FOREX]: 'تحديث ساعي — سوق الفوركس',
            [content_types_1.ContentCategory.STOCKS]: 'تحديث ساعي — سوق الأسهم الأمريكية',
            [content_types_1.ContentCategory.COMMODITIES]: 'تحديث ساعي — سوق السلع',
            [content_types_1.ContentCategory.ECONOMY]: 'تحديث ساعي — المؤشرات الاقتصادية',
            [content_types_1.ContentCategory.REGULATION]: 'تحديث ساعي — التطورات التنظيمية',
            [content_types_1.ContentCategory.TECHNOLOGY]: 'تحديث ساعي — أخبار التقنية',
            [content_types_1.ContentCategory.EDUCATION]: 'نصيحة ساعية — درس سريع في التداول',
            [content_types_1.ContentCategory.GEOPOLITICS]: 'تحديث ساعي — الأحداث الجيوسياسية',
            [content_types_1.ContentCategory.DEFI]: 'تحديث ساعي — التمويل اللامركزي',
            [content_types_1.ContentCategory.NFT]: 'تحديث ساعي — سوق NFT',
        };
        return topics[category] || 'تحديث ساعي — السوق';
    }
    _getWeeklyTopic(category) {
        const topics = {
            [content_types_1.ContentCategory.CRYPTO]: 'مراجعة أسبوعية — سوق العملات الرقمية',
            [content_types_1.ContentCategory.FOREX]: 'مراجعة أسبوعية — سوق الفوركس',
            [content_types_1.ContentCategory.STOCKS]: 'مراجعة أسبوعية — سوق الأسهم الأمريكية',
            [content_types_1.ContentCategory.COMMODITIES]: 'مراجعة أسبوعية — سوق السلع',
            [content_types_1.ContentCategory.ECONOMY]: 'مراجعة أسبوعية — المشهد الاقتصادي',
            [content_types_1.ContentCategory.REGULATION]: 'مراجعة أسبوعية — التطورات التنظيمية',
            [content_types_1.ContentCategory.TECHNOLOGY]: 'مراجعة أسبوعية — أخبار التقنية والابتكار',
            [content_types_1.ContentCategory.EDUCATION]: 'مراجعة أسبوعية — دروس التداول',
            [content_types_1.ContentCategory.GEOPOLITICS]: 'مراجعة أسبوعية — الأحداث الجيوسياسية وأثرها',
            [content_types_1.ContentCategory.DEFI]: 'مراجعة أسبوعية — التمويل اللامركزي',
            [content_types_1.ContentCategory.NFT]: 'مراجعة أسبوعية — سوق NFT',
        };
        return topics[category] || 'مراجعة أسبوعية — السوق';
    }
    _getDailyDigestTopic(category) {
        const topics = {
            [content_types_1.ContentCategory.CRYPTO]: 'ملخص سوق العملات الرقمية اليومي',
            [content_types_1.ContentCategory.FOREX]: 'ملخص سوق الفوركس اليومي',
            [content_types_1.ContentCategory.STOCKS]: 'ملخص سوق الأسهم الأمريكية اليومي',
            [content_types_1.ContentCategory.COMMODITIES]: 'ملخص سوق السلع اليومي',
            [content_types_1.ContentCategory.ECONOMY]: 'ملخص الأخبار الاقتصادية اليومي',
            [content_types_1.ContentCategory.REGULATION]: 'آخر التطورات التنظيمية',
            [content_types_1.ContentCategory.TECHNOLOGY]: 'أخبار التقنية والأسواق',
            [content_types_1.ContentCategory.EDUCATION]: 'درس اليوم في التداول',
            [content_types_1.ContentCategory.GEOPOLITICS]: 'أثر الأحداث الجيوسياسية على الأسواق',
            [content_types_1.ContentCategory.DEFI]: 'ملخص التمويل اللامركزي',
            [content_types_1.ContentCategory.NFT]: 'آخر أخبار سوق NFT',
        };
        return topics[category] || 'ملخص السوق اليومي';
    }
};
exports.ContentAgentService = ContentAgentService;
__decorate([
    (0, schedule_1.Cron)('0 8 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentService.prototype, "autoDailyDigest", null);
__decorate([
    (0, schedule_1.Cron)('0 */6 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentService.prototype, "autoFillGaps", null);
__decorate([
    (0, schedule_1.Cron)('0 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentService.prototype, "autoHourlyUpdate", null);
__decorate([
    (0, schedule_1.Cron)('0 8 * * 1'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentService.prototype, "autoWeeklyReview", null);
__decorate([
    (0, schedule_1.Cron)('0 */4 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentService.prototype, "autoPairAnalysis", null);
exports.ContentAgentService = ContentAgentService = ContentAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        config_1.ConfigService,
        audit_service_1.AuditService,
        content_generator_service_1.ContentGeneratorService,
        content_curator_service_1.ContentCuratorService,
        content_publisher_service_1.ContentPublisherService,
        content_optimizer_service_1.ContentOptimizerService])
], ContentAgentService);
//# sourceMappingURL=content-agent.service.js.map