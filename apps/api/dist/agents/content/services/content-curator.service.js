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
var ContentCuratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentCuratorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const exchange_service_1 = require("../../../modules/exchange/exchange.service");
const content_types_1 = require("../types/content.types");
let ContentCuratorService = ContentCuratorService_1 = class ContentCuratorService {
    constructor(prisma, redis, exchangeService) {
        this.prisma = prisma;
        this.redis = redis;
        this.exchangeService = exchangeService;
        this.logger = new common_1.Logger(ContentCuratorService_1.name);
        this.TRENDING_CACHE_TTL = 300000;
        this.logger.log('🔍 Content Curator initialized — aggregation engine ready');
    }
    async curateSources(category, symbols) {
        this.logger.log(`🔍 Curating sources for ${category} (${symbols?.join(',') || 'all'})`);
        const newsArticles = await this._fetchRecentNews(category, symbols);
        const marketDataArray = await this._fetchMarketData(symbols || this._getDefaultSymbols(category));
        const trendingTopics = await this._identifyTrendingTopics(category);
        const customContext = trendingTopics.length > 0
            ? `المواضيع الرائجة: ${trendingTopics.join(', ')}`
            : undefined;
        return {
            newsArticles,
            marketData: marketDataArray[0] || undefined,
            customContext,
        };
    }
    async getTrendingTopics() {
        try {
            const cached = await this.redis.get('content:trending');
            if (cached)
                return JSON.parse(cached);
        }
        catch { }
        const trends = await this._computeTrendingTopics();
        try {
            await this.redis.set('content:trending', JSON.stringify(trends), this.TRENDING_CACHE_TTL);
        }
        catch { }
        return trends;
    }
    async getContentGaps() {
        const gaps = [];
        for (const category of Object.values(content_types_1.ContentCategory)) {
            const lastArticle = await this.prisma.newsArticle.findFirst({
                where: { category: category },
                orderBy: { publishedAt: 'desc' },
                select: { publishedAt: true },
            });
            const hoursAgo = lastArticle
                ? (Date.now() - lastArticle.publishedAt.getTime()) / 3600000
                : 999;
            if (hoursAgo > 6) {
                gaps.push({
                    category: category,
                    lastArticleHoursAgo: Math.round(hoursAgo),
                    suggestedTopics: this._suggestTopics(category),
                });
            }
        }
        return gaps.sort((a, b) => b.lastArticleHoursAgo - a.lastArticleHoursAgo);
    }
    async _fetchRecentNews(category, symbols) {
        try {
            const where = {
                publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            };
            if (category)
                where.category = category;
            if (symbols?.length) {
                where.OR = symbols.map(s => ({
                    affectedAssets: { contains: s },
                }));
            }
            const articles = await this.prisma.newsArticle.findMany({
                where,
                orderBy: { publishedAt: 'desc' },
                take: 10,
            });
            return articles.map(a => ({
                title: a.translatedTitle || a.title,
                content: a.translatedContent || a.content || '',
                source: a.source,
                url: a.url || undefined,
                publishedAt: a.publishedAt,
                sentiment: a.sentiment ? Number(a.sentiment) : undefined,
            }));
        }
        catch (error) {
            this.logger.warn(`Failed to fetch news: ${error.message}`);
            return [];
        }
    }
    async _fetchMarketData(symbols) {
        const results = [];
        for (const symbol of symbols.slice(0, 5)) {
            try {
                const quote = await this.exchangeService.getQuote(symbol);
                if (quote?.price) {
                    results.push({
                        symbol,
                        price: quote.price,
                        change24h: quote.changePercent || 0,
                        volume24h: quote.volume || 0,
                        trend: (quote.changePercent || 0) > 0.5
                            ? 'BULLISH'
                            : (quote.changePercent || 0) < -0.5
                                ? 'BEARISH'
                                : 'SIDEWAYS',
                    });
                }
            }
            catch {
            }
        }
        return results;
    }
    async _identifyTrendingTopics(category) {
        try {
            const articles = await this.prisma.newsArticle.findMany({
                where: {
                    category: category,
                    publishedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
                },
                select: { title: true, translatedTitle: true },
                take: 20,
            });
            const words = {};
            for (const a of articles) {
                const title = (a.translatedTitle || a.title).toLowerCase();
                const tokens = title.split(/\s+/).filter(w => w.length > 3);
                for (const t of tokens) {
                    words[t] = (words[t] || 0) + 1;
                }
            }
            return Object.entries(words)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([word]) => word);
        }
        catch {
            return [];
        }
    }
    async _computeTrendingTopics() {
        try {
            const categories = Object.values(content_types_1.ContentCategory);
            const results = [];
            for (const category of categories) {
                const articles = await this.prisma.newsArticle.findMany({
                    where: {
                        category: category,
                        publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                    },
                    select: { sentiment: true, affectedAssets: true, title: true },
                    take: 50,
                });
                if (articles.length === 0)
                    continue;
                const avgSentiment = articles.reduce((sum, a) => sum + (Number(a.sentiment) || 0), 0) / articles.length;
                const symbolCounts = {};
                for (const a of articles) {
                    try {
                        const symbols = JSON.parse(a.affectedAssets || '[]');
                        for (const s of symbols) {
                            symbolCounts[s] = (symbolCounts[s] || 0) + 1;
                        }
                    }
                    catch { }
                }
                const topSymbols = Object.entries(symbolCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([s]) => s);
                results.push({
                    topic: this._getCategoryLabel(category),
                    category,
                    articleCount: articles.length,
                    avgSentiment: parseFloat(avgSentiment.toFixed(4)),
                    symbols: topSymbols,
                });
            }
            return results.sort((a, b) => b.articleCount - a.articleCount);
        }
        catch {
            return [];
        }
    }
    _getDefaultSymbols(category) {
        const map = {
            [content_types_1.ContentCategory.CRYPTO]: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
            [content_types_1.ContentCategory.FOREX]: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
            [content_types_1.ContentCategory.STOCKS]: ['AAPL', 'TSLA', 'NVDA'],
            [content_types_1.ContentCategory.COMMODITIES]: ['XAU/USD', 'XAG/USD'],
            [content_types_1.ContentCategory.ECONOMY]: ['EUR/USD', 'XAU/USD'],
            [content_types_1.ContentCategory.REGULATION]: ['BTC/USDT'],
            [content_types_1.ContentCategory.TECHNOLOGY]: ['NVDA', 'MSFT', 'AAPL'],
            [content_types_1.ContentCategory.EDUCATION]: ['BTC/USDT'],
            [content_types_1.ContentCategory.GEOPOLITICS]: ['XAU/USD', 'EUR/USD'],
            [content_types_1.ContentCategory.DEFI]: ['ETH/USDT', 'SOL/USDT'],
            [content_types_1.ContentCategory.NFT]: ['ETH/USDT'],
        };
        return map[category] || ['BTC/USDT'];
    }
    _suggestTopics(category) {
        const map = {
            [content_types_1.ContentCategory.CRYPTO]: ['تحليل بيتكوين الأسبوعي', 'أثر التراجع على ألتفكوينز', 'مؤشرات الخوف والجشع'],
            [content_types_1.ContentCategory.FOREX]: ['توقعات دولار-يورو', 'أثر بيانات التضخم', 'تحليل زوج جنيه-دولار'],
            [content_types_1.ContentCategory.STOCKS]: ['أداء قطاع التكنولوجيا', 'توقعات أرباح الشركات', 'مؤشر S&P 500'],
            [content_types_1.ContentCategory.COMMODITIES]: ['تحليل الذهب', 'النفط وأوبك+', 'توقعات الفضة'],
            [content_types_1.ContentCategory.ECONOMY]: ['قرارات الفائدة', 'التضخم العالمي', 'النمو الاقتصادي'],
            [content_types_1.ContentCategory.REGULATION]: ['تنظيم العملات الرقمية', 'قوانين التداول الجديدة'],
            [content_types_1.ContentCategory.TECHNOLOGY]: ['الذكاء الاصطناعي والأسواق', 'بلوكشين الجيل القادم'],
            [content_types_1.ContentCategory.EDUCATION]: ['كيف تقرأ الشارت', 'إدارة المخاطر للمبتدئين', 'استراتيجيات السوينغ'],
            [content_types_1.ContentCategory.GEOPOLITICS]: ['أثر التوترات على الأسواق', 'العقوبات والطاقة'],
            [content_types_1.ContentCategory.DEFI]: ['أرباح السيولة', 'مخاطر العقود الذكية', 'Staking مقابل التداول'],
            [content_types_1.ContentCategory.NFT]: ['سوق NFT الحالي', 'التحول نحو الأداة'],
        };
        return map[category] || ['تحديثات السوق'];
    }
    _getCategoryLabel(category) {
        const map = {
            [content_types_1.ContentCategory.CRYPTO]: 'العملات الرقمية',
            [content_types_1.ContentCategory.FOREX]: 'الفوركس',
            [content_types_1.ContentCategory.STOCKS]: 'الأسهم',
            [content_types_1.ContentCategory.COMMODITIES]: 'السلع',
            [content_types_1.ContentCategory.ECONOMY]: 'الاقتصاد',
            [content_types_1.ContentCategory.REGULATION]: 'التنظيمات',
            [content_types_1.ContentCategory.TECHNOLOGY]: 'التقنية',
            [content_types_1.ContentCategory.EDUCATION]: 'التعليم',
            [content_types_1.ContentCategory.GEOPOLITICS]: 'الجيوسياسة',
            [content_types_1.ContentCategory.DEFI]: 'التمويل اللامركزي',
            [content_types_1.ContentCategory.NFT]: 'NFTs',
        };
        return map[category] || category;
    }
};
exports.ContentCuratorService = ContentCuratorService;
exports.ContentCuratorService = ContentCuratorService = ContentCuratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        exchange_service_1.ExchangeService])
], ContentCuratorService);
//# sourceMappingURL=content-curator.service.js.map