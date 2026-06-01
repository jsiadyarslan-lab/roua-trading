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
var ContentPublisherService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentPublisherService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const audit_service_1 = require("../../../audit/audit.service");
const content_types_1 = require("../types/content.types");
let ContentPublisherService = ContentPublisherService_1 = class ContentPublisherService {
    constructor(prisma, redis, audit, configService) {
        this.prisma = prisma;
        this.redis = redis;
        this.audit = audit;
        this.configService = configService;
        this.logger = new common_1.Logger(ContentPublisherService_1.name);
        this.logger.log('📤 Content Publisher initialized — scheduling engine ready');
    }
    async saveContent(userId, content, status = content_types_1.ContentStatus.DRAFT) {
        this.logger.log(`📤 Saving content: "${content.titleAr}" [${status}]`);
        try {
            const article = await this.prisma.contentArticle.create({
                data: {
                    userId,
                    type: content.generationSource,
                    contentType: content.category,
                    titleAr: content.titleAr,
                    titleEn: content.titleEn,
                    contentAr: content.contentAr,
                    contentEn: content.contentEn,
                    summaryAr: content.summaryAr,
                    summaryEn: content.summaryEn,
                    excerpt: content.excerpt,
                    category: content.category,
                    categoryAr: content.categoryAr,
                    tags: JSON.stringify(content.tags),
                    relatedSymbols: JSON.stringify(content.relatedSymbols),
                    seo: JSON.stringify(content.seo),
                    aiModel: content.aiModel,
                    generationSource: content.generationSource,
                    confidence: content.confidence,
                    qualityScore: content.qualityScore,
                    sentimentScore: content.sentimentScore,
                    impactLevel: content.impactLevel,
                    riskWarnings: JSON.stringify(content.riskWarnings),
                    sources: JSON.stringify(content.sources),
                    readingTimeMinutes: content.readingTimeMinutes,
                    wordCountAr: content.wordCountAr,
                    wordCountEn: content.wordCountEn,
                    status,
                    publishedAt: status === content_types_1.ContentStatus.PUBLISHED ? new Date() : null,
                },
            });
            await this.audit.log({
                userId,
                action: 'CONTENT_CREATED',
                resource: 'content-agent',
                details: JSON.stringify({
                    articleId: article.id,
                    title: content.titleEn,
                    type: content.category,
                    status,
                }),
            });
            if (status === content_types_1.ContentStatus.PUBLISHED) {
                await this._sendTelegramNotification(article);
            }
            return article;
        }
        catch (error) {
            this.logger.error(`Failed to save content: ${error.message}`);
            throw error;
        }
    }
    async publish(userId, contentId) {
        this.logger.log(`📤 Publishing content: ${contentId}`);
        const article = await this.prisma.contentArticle.findUnique({
            where: { id: contentId },
        });
        if (!article) {
            throw new Error('المحتوى غير موجود');
        }
        if (article.status === content_types_1.ContentStatus.PUBLISHED) {
            throw new Error('المحتوى منشور بالفعل');
        }
        const updated = await this.prisma.contentArticle.update({
            where: { id: contentId },
            data: {
                status: content_types_1.ContentStatus.PUBLISHED,
                publishedAt: new Date(),
            },
        });
        await this.audit.log({
            userId,
            action: 'CONTENT_PUBLISHED',
            resource: 'content-agent',
            details: JSON.stringify({
                articleId: contentId,
                title: article.titleEn,
            }),
        });
        await this._sendTelegramNotification(updated);
        return updated;
    }
    async schedule(userId, contentId, scheduledAt, platform = 'WEBSITE') {
        this.logger.log(`📤 Scheduling content ${contentId} for ${scheduledAt.toISOString()}`);
        await this.prisma.contentArticle.update({
            where: { id: contentId },
            data: {
                status: content_types_1.ContentStatus.SCHEDULED,
                scheduledAt,
            },
        });
        const schedule = await this.prisma.contentSchedule.create({
            data: {
                contentId,
                scheduledAt,
                platform,
                status: 'PENDING',
            },
        });
        return {
            id: schedule.id,
            contentId,
            scheduledAt,
            platform,
            status: 'PENDING',
            retryCount: 0,
        };
    }
    async unpublish(userId, contentId, archive = false) {
        const status = archive ? content_types_1.ContentStatus.ARCHIVED : content_types_1.ContentStatus.DRAFT;
        const updated = await this.prisma.contentArticle.update({
            where: { id: contentId },
            data: { status },
        });
        await this.audit.log({
            userId,
            action: archive ? 'CONTENT_ARCHIVED' : 'CONTENT_UNPUBLISHED',
            resource: 'content-agent',
            details: JSON.stringify({ articleId: contentId }),
        });
        return updated;
    }
    async getFeed(options) {
        const page = options.page || 1;
        const limit = Math.min(options.limit || 20, 50);
        const skip = (page - 1) * limit;
        const where = {};
        if (options.category)
            where.category = options.category;
        if (options.type)
            where.contentType = options.type;
        if (options.status)
            where.status = options.status;
        if (options.symbol) {
            where.relatedSymbols = { contains: options.symbol };
        }
        where.NOT = [
            { titleAr: { contains: 'GLM API error' } },
            { titleAr: { contains: 'timeout of' } },
            { titleAr: { contains: '⚠️' } },
            { contentAr: { contains: 'GLM API error' } },
            { contentAr: { contains: 'timeout of' } },
        ];
        const [articles, total] = await Promise.all([
            this.prisma.contentArticle.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.contentArticle.count({ where }),
        ]);
        return {
            articles,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    async cleanupErrorArticles() {
        try {
            const result = await this.prisma.contentArticle.updateMany({
                where: {
                    OR: [
                        { titleAr: { contains: 'GLM API error' } },
                        { titleAr: { contains: 'timeout of' } },
                        { titleAr: { contains: '⚠️' } },
                        { contentAr: { contains: 'GLM API error' } },
                        { contentAr: { contains: 'timeout of' } },
                        { titleEn: { contains: 'GLM API error' } },
                        { titleEn: { contains: 'timeout of' } },
                        { contentEn: { contains: 'GLM API error' } },
                        { contentEn: { contains: 'timeout of' } },
                    ],
                },
                data: { status: content_types_1.ContentStatus.ARCHIVED },
            });
            if (result.count > 0) {
                this.logger.log(`📤 Cleaned up ${result.count} error articles (archived)`);
            }
            return { archived: result.count };
        }
        catch (error) {
            this.logger.error(`Cleanup error articles failed: ${error.message}`);
            return { archived: 0 };
        }
    }
    async getById(contentId) {
        return this.prisma.contentArticle.findUnique({
            where: { id: contentId },
        });
    }
    async getStats() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const [totalArticles, published, drafts, scheduled, todayPublished, weekPublished] = await Promise.all([
            this.prisma.contentArticle.count(),
            this.prisma.contentArticle.count({ where: { status: content_types_1.ContentStatus.PUBLISHED } }),
            this.prisma.contentArticle.count({ where: { status: content_types_1.ContentStatus.DRAFT } }),
            this.prisma.contentArticle.count({ where: { status: content_types_1.ContentStatus.SCHEDULED } }),
            this.prisma.contentArticle.count({
                where: { status: content_types_1.ContentStatus.PUBLISHED, publishedAt: { gte: todayStart } },
            }),
            this.prisma.contentArticle.count({
                where: { status: content_types_1.ContentStatus.PUBLISHED, publishedAt: { gte: weekStart } },
            }),
        ]);
        const qualityResult = await this.prisma.contentArticle.aggregate({
            where: { status: content_types_1.ContentStatus.PUBLISHED },
            _avg: { qualityScore: true },
        });
        return {
            totalArticles,
            published,
            drafts,
            scheduled,
            todayPublished,
            thisWeekPublished: weekPublished,
            avgQualityScore: Math.round(qualityResult._avg.qualityScore || 0),
        };
    }
    async processScheduledPublications() {
        if (!this.prisma.isAvailable()) {
            return;
        }
        try {
            const now = new Date();
            const scheduled = await this.prisma.contentArticle.findMany({
                where: {
                    status: content_types_1.ContentStatus.SCHEDULED,
                    scheduledAt: { lte: now },
                },
                take: 20,
            });
            if (scheduled.length === 0)
                return;
            this.logger.log(`📤 Processing ${scheduled.length} scheduled publications`);
            for (const article of scheduled) {
                try {
                    await this.prisma.contentArticle.update({
                        where: { id: article.id },
                        data: {
                            status: content_types_1.ContentStatus.PUBLISHED,
                            publishedAt: now,
                        },
                    });
                    await this.prisma.contentSchedule.updateMany({
                        where: { contentId: article.id, status: 'PENDING' },
                        data: { status: 'PUBLISHED', publishedAt: now },
                    });
                    this.logger.log(`📤 Published scheduled article: ${article.titleEn}`);
                }
                catch (error) {
                    this.logger.error(`Failed to publish ${article.id}: ${error.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`Schedule processor error: ${error.message}`);
        }
    }
    async _sendTelegramNotification(article) {
        try {
            const botToken = this.configService.get('TELEGRAM_BOT_TOKEN', '')?.trim();
            const chatId = this.configService.get('TELEGRAM_CHAT_ID', '')?.trim();
            if (!botToken || !chatId) {
                return;
            }
            const typeEmojis = {
                ARTICLE: '📰',
                ANALYSIS: '📊',
                NEWS_DIGEST: '📋',
                MARKET_REPORT: '📈',
                EDUCATIONAL: '📚',
                OPINION: '💡',
                BREAKING: '🚨',
                HOURLY_UPDATE: '⏱️',
                WEEKLY_REVIEW: '📅',
                PAIR_ANALYSIS: '💹',
            };
            const emoji = typeEmojis[article.type] || typeEmojis[article.contentType] || '📄';
            let symbols = [];
            try {
                symbols = article.relatedSymbols ? JSON.parse(article.relatedSymbols) : [];
            }
            catch {
                symbols = [];
            }
            const symbolsStr = symbols.length > 0 ? symbols.join(', ') : '—';
            const category = article.categoryAr || article.category || '—';
            const titleAr = article.titleAr || article.titleEn || 'تقرير جديد';
            const qualityScore = article.qualityScore;
            const qualityDisplay = qualityScore ? `⭐ الجودة: ${qualityScore}/100` : '';
            const message = [
                `${emoji} <b>تقرير جديد</b>`,
                '',
                `📌 <b>${titleAr}</b>`,
                `📂 التصنيف: ${category}`,
                `🏷️ الأصول: ${symbolsStr}`,
                qualityDisplay ? qualityDisplay : '',
                '',
                '⚠️ <i>هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية</i>',
            ].filter(Boolean).join('\n');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (res.ok) {
                this.logger.log(`📤 Telegram notification sent for: ${article.titleEn || article.id}`);
            }
            else {
                const errData = await res.json().catch(() => ({}));
                this.logger.warn(`Telegram notification failed: ${JSON.stringify(errData)}`);
            }
        }
        catch (error) {
            this.logger.warn(`Telegram notification error (non-blocking): ${error.message}`);
        }
    }
    async autoArchive() {
        try {
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const result = await this.prisma.contentArticle.updateMany({
                where: {
                    status: content_types_1.ContentStatus.PUBLISHED,
                    publishedAt: { lt: ninetyDaysAgo },
                },
                data: { status: content_types_1.ContentStatus.ARCHIVED },
            });
            if (result.count > 0) {
                this.logger.log(`📤 Auto-archived ${result.count} articles older than 90 days`);
            }
        }
        catch (error) {
            this.logger.error(`Auto-archive error: ${error.message}`);
        }
    }
};
exports.ContentPublisherService = ContentPublisherService;
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentPublisherService.prototype, "processScheduledPublications", null);
__decorate([
    (0, schedule_1.Cron)('0 3 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentPublisherService.prototype, "autoArchive", null);
exports.ContentPublisherService = ContentPublisherService = ContentPublisherService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        audit_service_1.AuditService,
        config_1.ConfigService])
], ContentPublisherService);
//# sourceMappingURL=content-publisher.service.js.map