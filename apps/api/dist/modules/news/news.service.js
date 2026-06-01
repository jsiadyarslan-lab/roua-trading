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
var NewsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const ai_orchestrator_service_1 = require("../ai/services/ai-orchestrator.service");
let NewsService = NewsService_1 = class NewsService {
    constructor(prisma, aiOrchestrator) {
        this.prisma = prisma;
        this.aiOrchestrator = aiOrchestrator;
        this.logger = new common_1.Logger(NewsService_1.name);
        this.fetchInterval = null;
        this.isFetchingNews = false;
        this.logger.log('📰 News Service initialized');
    }
    async onModuleInit() {
        this.startScheduledFetching();
        setTimeout(() => {
            this._scheduledFetch();
        }, 5000);
    }
    async onModuleDestroy() {
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = null;
        }
    }
    startScheduledFetching() {
        const INTERVAL_MS = 30 * 60 * 1000;
        this.fetchInterval = setInterval(() => {
            this._scheduledFetch();
        }, INTERVAL_MS);
        this.logger.log('⏰ Scheduled news fetching every 30 minutes');
    }
    async _scheduledFetch() {
        if (this.isFetchingNews) {
            this.logger.warn('📰 News fetch already in progress, skipping');
            return;
        }
        this.isFetchingNews = true;
        try {
            await this.fetchAndAnalyzeNews();
        }
        catch (error) {
            this.logger.error(`Scheduled fetch failed: ${error.message}`);
        }
        finally {
            this.isFetchingNews = false;
        }
    }
    async getLatestNews(filter) {
        const where = {};
        if (filter.sentiment) {
            where.sentimentLabel = filter.sentiment;
        }
        if (filter.category) {
            where.category = filter.category;
        }
        if (filter.symbol) {
            where.affectedAssets = { contains: filter.symbol };
        }
        try {
            return await this.prisma.newsArticle.findMany({
                where,
                orderBy: { publishedAt: 'desc' },
                take: filter.limit || 20,
            });
        }
        catch (error) {
            this.logger.error(`DB query failed: ${error.message}`, error.stack);
            throw new Error(`فشل في جلب الأخبار: ${error.message}`);
        }
    }
    async analyzeNewsText(text, symbol) {
        const result = await this.aiOrchestrator.analyze({
            symbol: symbol || 'GENERAL',
            prompt: `أنت محلل أخبار مالية محترف. حلل الخبر التالي وأجب بصيغة JSON فقط بدون أي نص آخر:
{"translatedTitle": "العنوان المترجم للعربية", "translatedContent": "المحتوى المترجم للعربية", "sentiment": "positive أو negative أو neutral", "sentimentScore": رقم بين -1 و 1, "impactLevel": "high أو medium أو low", "affectedAssets": ["BTC", "ETH"], "summary": "ملخص عربي مختصر في جملة واحدة", "marketImpact": "وصف تأثير الخبر على السوق", "recommendation": "توصية تداول واضحة مع مستوى الدخول والوقف"}

الخبر: ${text.substring(0, 2000)}`,
            type: 'sentiment',
            language: 'ar',
        });
        const content = result.content || '';
        let analysisData = {
            translatedTitle: text.substring(0, 100),
            translatedContent: '',
            sentiment: 'neutral',
            sentimentScore: 0,
            impactLevel: 'medium',
            affectedAssets: [],
            summary: '',
            marketImpact: '',
            recommendation: '',
        };
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysisData = { ...analysisData, ...JSON.parse(jsonMatch[0]) };
            }
        }
        catch {
            const lower = content.toLowerCase();
            if (lower.includes('إيجابي') || lower.includes('positive') || lower.includes('صعود')) {
                analysisData.sentiment = 'positive';
                analysisData.sentimentScore = 0.6;
            }
            else if (lower.includes('سلبي') || lower.includes('negative') || lower.includes('هبوط')) {
                analysisData.sentiment = 'negative';
                analysisData.sentimentScore = -0.6;
            }
            analysisData.translatedContent = content;
        }
        return {
            originalText: text,
            translatedText: analysisData.translatedContent || analysisData.translatedTitle || text,
            analysis: {
                sentiment: analysisData.sentiment,
                sentimentScore: analysisData.sentimentScore,
                impactLevel: analysisData.impactLevel,
                affectedAssets: analysisData.affectedAssets,
                summary: analysisData.summary,
                marketImpact: analysisData.marketImpact,
                recommendation: analysisData.recommendation,
            },
            aiAnalysis: content,
            model: result.model,
            confidence: result.confidence,
        };
    }
    async fetchAndAnalyzeNews() {
        if (!this.prisma?.isAvailable?.()) {
            this.logger.warn('📰 Skipping news fetch — DB not yet available');
            return;
        }
        this.logger.log('📰 Starting news fetch and analysis...');
        const rawNews = await this._fetchAllSources();
        if (rawNews.length === 0) {
            this.logger.warn('No news fetched from any source');
            return;
        }
        this.logger.log(`📰 Fetched ${rawNews.length} raw news items`);
        await this._processNewsBatch(rawNews.slice(0, 5), 3);
    }
    async _processNewsBatch(items, concurrency = 3) {
        let processed = 0;
        for (let i = 0; i < items.length; i += concurrency) {
            const batch = items.slice(i, i + concurrency);
            const results = await Promise.allSettled(batch.map(async (item) => {
                try {
                    const existing = await this.prisma.newsArticle.findFirst({
                        where: {
                            OR: [
                                { url: item.link || undefined },
                                { title: item.title },
                            ],
                        },
                    });
                    if (existing)
                        return;
                    const combinedResult = await this._translateAndAnalyze(item.title, item.description, item.category);
                    const categoryAr = this._mapCategoryToArabic(item.category || 'General');
                    await this.prisma.newsArticle.create({
                        data: {
                            source: item.source,
                            title: item.title,
                            translatedTitle: combinedResult.translatedTitle,
                            content: item.description || '',
                            translatedContent: combinedResult.translatedContent || item.description || '',
                            summary: combinedResult.summary || '',
                            url: item.link || null,
                            sentiment: combinedResult.sentimentScore || 0,
                            sentimentLabel: combinedResult.sentiment || 'neutral',
                            impactLevel: combinedResult.impactLevel || 'medium',
                            affectedAssets: JSON.stringify(combinedResult.affectedAssets || []),
                            category: item.category || 'General',
                            categoryAr,
                            aiAnalysis: combinedResult.fullAnalysis || '',
                            imageUrl: item.imageUrl || null,
                            publishedAt: item.publishedAt
                                ? new Date(item.publishedAt)
                                : new Date(),
                        },
                    });
                    processed++;
                }
                catch (error) {
                    this.logger.warn(`Failed to process news item: ${error.message}`);
                }
            }));
            if (i + concurrency < items.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        this.logger.log(`📰 Processed and stored ${processed} new articles`);
    }
    async _fetchAllSources() {
        const [rouaResult, ctResult, cpResult, cdResult] = await Promise.allSettled([
            this._fetchRouaNews(),
            this._fetchCoinTelegraph(),
            this._fetchCryptoPanic(),
            this._fetchCoinDesk(),
        ]);
        const rouaNews = rouaResult.status === 'fulfilled' ? rouaResult.value : [];
        const ctNews = ctResult.status === 'fulfilled' ? ctResult.value : [];
        const cpNews = cpResult.status === 'fulfilled' ? cpResult.value : [];
        const cdNews = cdResult.status === 'fulfilled' ? cdResult.value : [];
        if (rouaResult.status === 'rejected')
            this.logger.debug(`RouaNews unavailable: ${rouaResult.reason?.message}`);
        if (ctResult.status === 'rejected') {
            this.logger.warn(`CoinTelegraph fetch failed: ${ctResult.reason?.message || ctResult.reason}`);
        }
        if (cpResult.status === 'rejected') {
            this.logger.warn(`CryptoPanic fetch failed: ${cpResult.reason?.message || cpResult.reason}`);
        }
        if (cdResult.status === 'rejected') {
            this.logger.warn(`CoinDesk fetch failed: ${cdResult.reason?.message || cdResult.reason}`);
        }
        const allNews = [...rouaNews, ...ctNews, ...cpNews, ...cdNews];
        const seen = new Set();
        return allNews.filter((item) => {
            const key = item.title.toLowerCase().trim();
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
    async _fetchCoinTelegraph() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch('https://cointelegraph.com/rss', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
                },
                signal: controller.signal,
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            const items = [];
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
                const content = match[1];
                const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content) ||
                    /<title>(.*?)<\/title>/.exec(content);
                const descMatch = /<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(content) ||
                    /<description>(.*?)<\/description>/.exec(content);
                const linkMatch = /<link><!\[CDATA\[(.*?)\]\]><\/link>/.exec(content) ||
                    /<link>(.*?)<\/link>/.exec(content);
                const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(content);
                const categoryMatch = /<category><!\[CDATA\[(.*?)\]\]><\/category>/.exec(content) ||
                    /<category>(.*?)<\/category>/.exec(content);
                if (titleMatch) {
                    let link = linkMatch ? linkMatch[1].trim() : undefined;
                    if (link) {
                        link = link.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
                        if (link && !link.startsWith('http')) {
                            link = 'https://' + link.replace(/^[hH]*t*t*p*:*\/*/, '');
                        }
                    }
                    items.push({
                        title: titleMatch[1].trim(),
                        description: descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '') : undefined,
                        link,
                        publishedAt: pubDateMatch ? pubDateMatch[1].trim() : undefined,
                        source: 'CoinTelegraph',
                        category: categoryMatch ? categoryMatch[1].trim() : 'Crypto',
                    });
                }
            }
            return items;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async _fetchCryptoPanic() {
        const apiKey = process.env.CRYPTOPANIC_API_KEY;
        if (!apiKey) {
            this.logger.warn('CRYPTOPANIC_API_KEY not set — skipping CryptoPanic fetch');
            return [];
        }
        const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&currencies=BTC,ETH,SOL&kind=news&filter=hot`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'RouaTradingBot/1.0' },
                signal: controller.signal,
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data.results || !Array.isArray(data.results))
                return [];
            return data.results.slice(0, 15).map((item) => ({
                title: item.title || '',
                description: item.title || '',
                link: item.url || undefined,
                publishedAt: item.published_at || undefined,
                source: item.source?.domain || 'CryptoPanic',
                category: item.currencies?.[0] || 'Crypto',
            }));
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async _fetchCoinDesk() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
                },
                signal: controller.signal,
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            const items = [];
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
                const content = match[1];
                const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content) ||
                    /<title>(.*?)<\/title>/.exec(content);
                const linkMatch = /<link><!\[CDATA\[(.*?)\]\]><\/link>/.exec(content) ||
                    /<link>(.*?)<\/link>/.exec(content);
                const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(content);
                if (titleMatch) {
                    let link = linkMatch ? linkMatch[1].trim() : undefined;
                    if (link) {
                        link = link.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
                        if (link && !link.startsWith('http')) {
                            link = 'https://' + link.replace(/^[hH]*t*t*p*:*\/*/, '');
                        }
                    }
                    items.push({
                        title: titleMatch[1].trim(),
                        link,
                        publishedAt: pubDateMatch ? pubDateMatch[1].trim() : undefined,
                        source: 'CoinDesk',
                        category: 'Crypto',
                    });
                }
            }
            return items;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async _translateAndAnalyze(title, description, category) {
        const defaultResult = {
            translatedTitle: title,
            translatedContent: description || '',
            sentiment: 'neutral',
            sentimentScore: 0,
            impactLevel: 'medium',
            affectedAssets: [],
            summary: '',
            fullAnalysis: '',
        };
        const fullText = title + (description ? '. ' + description : '');
        try {
            const result = await this.aiOrchestrator.analyze({
                symbol: 'NEWS',
                prompt: `أنت محلل أخبار مالية. حلل الخبر التالي وأجب بصيغة JSON فقط بدون أي نص آخر:
{"translatedTitle": "العنوان المترجم للعربية", "translatedContent": "المحتوى المترجم للعربية", "sentiment": "positive أو negative أو neutral", "sentimentScore": رقم بين -1 و 1, "impactLevel": "high أو medium أو low", "affectedAssets": ["BTC", "ETH"], "summary": "ملخص عربي في جملة واحدة"}

الخبر: ${fullText.substring(0, 1500)}`,
                type: 'sentiment',
                language: 'ar',
            });
            const content = result.content || '';
            if (result.confidence === 0 || result.isFallback) {
                this.logger.warn('AI returned fallback response — using heuristic sentiment analysis');
                return this._heuristicSentiment(fullText, defaultResult);
            }
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return { ...defaultResult, ...parsed, fullAnalysis: content };
                }
                catch {
                }
            }
            return this._heuristicSentiment(fullText, defaultResult);
        }
        catch (error) {
            this.logger.warn(`Combined translation+sentiment analysis failed: ${error.message}`);
            return this._heuristicSentiment(fullText, defaultResult);
        }
    }
    _heuristicSentiment(text, defaultResult) {
        const lower = text.toLowerCase();
        let score = 0;
        const assets = [];
        const positiveWords = ['surge', 'rally', 'bull', 'gain', 'rise', 'soar', 'jump', 'upgrade', 'adopt', 'approval', 'breakthrough', 'صعود', 'ارتفاع', 'إيجابي'];
        const negativeWords = ['crash', 'dump', 'bear', 'fall', 'drop', 'decline', 'hack', 'ban', 'regulate', 'risk', 'loss', 'هبوط', 'انخفاض', 'سلبي', 'حظر'];
        for (const word of positiveWords) {
            if (lower.includes(word))
                score += 0.15;
        }
        for (const word of negativeWords) {
            if (lower.includes(word))
                score -= 0.15;
        }
        const assetPatterns = [
            { pattern: /\bbtc\b|\bbitcoin\b/i, asset: 'BTC' },
            { pattern: /\beth\b|\bethereum\b/i, asset: 'ETH' },
            { pattern: /\bsol\b|\bsolana\b/i, asset: 'SOL' },
            { pattern: /\bxrp\b/i, asset: 'XRP' },
            { pattern: /\bada\b/i, asset: 'ADA' },
            { pattern: /\bbnb\b/i, asset: 'BNB' },
        ];
        for (const { pattern, asset } of assetPatterns) {
            if (pattern.test(lower))
                assets.push(asset);
        }
        const sentimentScore = Math.max(-1, Math.min(1, score));
        let sentiment = 'neutral';
        if (sentimentScore > 0.2)
            sentiment = 'positive';
        else if (sentimentScore < -0.2)
            sentiment = 'negative';
        return {
            ...defaultResult,
            sentiment,
            sentimentScore,
            impactLevel: Math.abs(sentimentScore) > 0.4 ? 'high' : 'medium',
            affectedAssets: assets,
            summary: '',
        };
    }
    _mapCategoryToArabic(category) {
        const lower = category.toLowerCase();
        if (lower.includes('bitcoin') || lower.includes('crypto'))
            return 'كريبتو';
        if (lower.includes('market') || lower.includes('stock'))
            return 'أسهم';
        if (lower.includes('regulation') || lower.includes('policy'))
            return 'تنظيم';
        if (lower.includes('economy') || lower.includes('macro'))
            return 'اقتصاد';
        if (lower.includes('etf') || lower.includes('fund'))
            return 'صناديق';
        if (lower.includes('forex') || lower.includes('currency'))
            return 'فوركس';
        if (lower.includes('oil') || lower.includes('energy'))
            return 'طاقة';
        if (lower.includes('gold') || lower.includes('metal'))
            return 'معادن';
        if (lower.includes('tech') || lower.includes('ai'))
            return 'تقنية';
        return 'أسواق';
    }
    async _fetchRouaNews() {
        const siteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
        const apiKey = process.env.INTEGRATION_API_KEY;
        if (!apiKey)
            return [];
        try {
            const res = await fetch(`${siteUrl}/api/integration/news?limit=20`, {
                headers: { 'Content-Type': 'application/json', 'X-Integration-Key': apiKey },
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok)
                return [];
            const data = await res.json();
            const articles = data.articles || data.news || [];
            if (!Array.isArray(articles) || !articles.length)
                return [];
            this.logger.log(`📰 RouaNews: ${articles.length} articles`);
            return articles.map((a) => ({
                title: a.titleAr || a.title || '',
                description: a.summaryAr || a.summary || '',
                link: a.url || (a.slug ? `${siteUrl}/news/${a.slug}` : undefined),
                publishedAt: a.publishedAt,
                source: 'RouaNews',
                category: a.category || 'أسواق',
                sentiment: typeof a.sentiment === 'number' ? a.sentiment : 0,
                impactLevel: a.impactLevel || 'medium',
                affectedAssets: Array.isArray(a.affectedAssets) ? a.affectedAssets.join(',') : (a.affectedAssets || ''),
            }));
        }
        catch {
            return [];
        }
    }
};
exports.NewsService = NewsService;
exports.NewsService = NewsService = NewsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_orchestrator_service_1.AIOrchestratorService])
], NewsService);
//# sourceMappingURL=news.service.js.map