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
var NewsIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../common/redis/redis.service");
let NewsIntegrationService = NewsIntegrationService_1 = class NewsIntegrationService {
    constructor(configService, redis) {
        this.configService = configService;
        this.redis = redis;
        this.logger = new common_1.Logger(NewsIntegrationService_1.name);
        this.fetchInterval = null;
        this.REDIS_SENTIMENT_KEY = 'news:market_sentiment';
        this.REDIS_SENTIMENT_TTL_MS = 15 * 60 * 1000;
        this.NEWS_SITE_URL = this.configService.get('NEWS_SITE_URL', '').replace(/\/$/, '');
        this.NEWS_API_KEY = this.configService.get('NEWS_API_KEY', '');
        this.NEWS_ADMIN_SECRET = this.configService.get('NEWS_ADMIN_SECRET', '') ||
            this.configService.get('CRON_SECRET', '');
        if (this.NEWS_SITE_URL) {
            this.logger.log(`📰 News Integration Service initialized — connected to ${this.NEWS_SITE_URL}`);
        }
        else {
            this.logger.warn('📰 NEWS_SITE_URL not set — rouatradingnews integration disabled');
        }
    }
    async onModuleInit() {
        if (!this.NEWS_SITE_URL)
            return;
        setTimeout(() => this._fetchMarketSentiment(), 10000);
        this.fetchInterval = setInterval(() => {
            this._fetchMarketSentiment();
        }, 15 * 60 * 1000);
    }
    async onModuleDestroy() {
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = null;
        }
    }
    async getMarketSentiment() {
        try {
            const cached = await this.redis.get(this.REDIS_SENTIMENT_KEY);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        catch { }
        if (this.NEWS_SITE_URL) {
            return await this._fetchMarketSentiment();
        }
        return null;
    }
    async getSentimentForAI() {
        const sentiment = await this.getMarketSentiment();
        if (!sentiment)
            return '';
        const parts = [];
        if (sentiment.fearGreedIndex) {
            const fg = sentiment.fearGreedIndex;
            const fgDir = fg.value > 60 ? 'جشع (صعودي)' : fg.value < 40 ? 'خوف (هبوطي)' : 'محايد';
            parts.push(`مؤشر الخوف والطمع: ${fg.value} (${fg.labelAr || fg.label}) — ${fgDir}`);
        }
        if (sentiment.arabSentimentIndex) {
            const ar = sentiment.arabSentimentIndex;
            parts.push(`مؤشر المشاعر العربية: ${ar.value} (${ar.label}) — تصويت: ${ar.majorityVote}`);
        }
        if (sentiment.geopoliticalRiskIndex) {
            const geo = sentiment.geopoliticalRiskIndex;
            parts.push(`المخاطر الجيوسياسية: ${geo.value} (${geo.label})`);
            if (geo.impacts) {
                const impactStrs = Object.entries(geo.impacts)
                    .map(([key, val]) => `${key}: ${val.trend === 'up' ? '↑' : '↓'} ${val.value}`)
                    .join(', ');
                parts.push(`تأثيرات الأصول: ${impactStrs}`);
            }
        }
        if (sentiment.aiSummary) {
            parts.push(`ملخص AI: ${sentiment.aiSummary}`);
        }
        return parts.length > 0 ? `📊 مشاعر السوق العالمية:\n${parts.join('\n')}` : '';
    }
    async _fetchMarketSentiment() {
        if (!this.NEWS_SITE_URL)
            return null;
        try {
            const url = `${this.NEWS_SITE_URL}/api/markets/sentiment`;
            const headers = {
                'Accept': 'application/json',
            };
            if (this.NEWS_API_KEY) {
                headers['Authorization'] = `Bearer ${this.NEWS_API_KEY}`;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const res = await fetch(url, { headers, signal: controller.signal });
                if (!res.ok) {
                    this.logger.warn(`📰 Market sentiment fetch failed: HTTP ${res.status}`);
                    return null;
                }
                const data = await res.json();
                const sentiment = {
                    fearGreedIndex: data.fearGreedIndex || { value: 50, label: 'Neutral', labelAr: 'محايد' },
                    arabSentimentIndex: data.arabSentimentIndex || { value: 50, label: 'Neutral', majorityVote: 'HOLD' },
                    geopoliticalRiskIndex: data.geopoliticalRiskIndex || { value: 35, label: 'Low', impacts: {} },
                    aiSummary: data.aiSummary || '',
                    fetchedAt: new Date().toISOString(),
                };
                try {
                    await this.redis.set(this.REDIS_SENTIMENT_KEY, JSON.stringify(sentiment), this.REDIS_SENTIMENT_TTL_MS);
                }
                catch { }
                this.logger.log(`📰 Market sentiment updated: Fear&Greed=${sentiment.fearGreedIndex.value} ` +
                    `(${sentiment.fearGreedIndex.labelAr}), Arab=${sentiment.arabSentimentIndex.value} ` +
                    `(${sentiment.arabSentimentIndex.majorityVote}), Geo=${sentiment.geopoliticalRiskIndex.value}`);
                return sentiment;
            }
            finally {
                clearTimeout(timeout);
            }
        }
        catch (error) {
            this.logger.warn(`📰 Market sentiment fetch error: ${error.message}`);
            return null;
        }
    }
    async triggerNewsPipeline(maxItems = 15) {
        if (!this.NEWS_SITE_URL)
            return null;
        try {
            const url = `${this.NEWS_SITE_URL}/api/news/pipeline`;
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            };
            if (this.NEWS_ADMIN_SECRET) {
                headers['Authorization'] = `Bearer ${this.NEWS_ADMIN_SECRET}`;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ maxItems, minImpactLevel: 4 }),
                    signal: controller.signal,
                });
                if (!res.ok) {
                    this.logger.warn(`📰 Pipeline trigger failed: HTTP ${res.status}`);
                    return null;
                }
                const data = await res.json();
                this.logger.log(`📰 Pipeline triggered: ${JSON.stringify(data?.summary || 'ok')}`);
                return data;
            }
            finally {
                clearTimeout(timeout);
            }
        }
        catch (error) {
            this.logger.warn(`📰 Pipeline trigger error: ${error.message}`);
            return null;
        }
    }
    async fetchExternalNews(limit = 20) {
        if (!this.NEWS_SITE_URL)
            return [];
        try {
            const url = `${this.NEWS_SITE_URL}/api/v1/news?type=live&limit=${limit}&lang=ar`;
            const headers = {
                'Accept': 'application/json',
            };
            if (this.NEWS_API_KEY) {
                headers['Authorization'] = `Bearer ${this.NEWS_API_KEY}`;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const res = await fetch(url, { headers, signal: controller.signal });
                if (!res.ok) {
                    this.logger.warn(`📰 External news fetch failed: HTTP ${res.status}`);
                    return [];
                }
                const data = await res.json();
                const articles = data?.data || [];
                this.logger.log(`📰 Fetched ${articles.length} articles from rouatradingnews`);
                return articles;
            }
            finally {
                clearTimeout(timeout);
            }
        }
        catch (error) {
            this.logger.warn(`📰 External news fetch error: ${error.message}`);
            return [];
        }
    }
};
exports.NewsIntegrationService = NewsIntegrationService;
exports.NewsIntegrationService = NewsIntegrationService = NewsIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_service_1.RedisService])
], NewsIntegrationService);
//# sourceMappingURL=news-integration.service.js.map