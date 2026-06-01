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
var NewsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsController = void 0;
const common_1 = require("@nestjs/common");
const news_service_1 = require("./news.service");
const news_integration_service_1 = require("./news-integration.service");
const auth_guard_1 = require("../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
let NewsController = NewsController_1 = class NewsController {
    constructor(newsService, newsIntegration) {
        this.newsService = newsService;
        this.newsIntegration = newsIntegration;
        this.logger = new common_1.Logger(NewsController_1.name);
    }
    async getLatestNews(symbol, sentiment, category, limitStr) {
        const limit = Math.min(parseInt(limitStr || '20', 10) || 20, 100);
        try {
            const news = await this.newsService.getLatestNews({
                symbol,
                sentiment,
                category,
                limit,
            });
            return { success: true, data: news, count: news.length };
        }
        catch (error) {
            this.logger.error(`Failed to fetch news: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في جلب الأخبار');
        }
    }
    async getNewsFeed(symbol, sentiment, category, limitStr) {
        const limit = Math.min(parseInt(limitStr || '20', 10) || 20, 50);
        try {
            const news = await this.newsService.getLatestNews({
                symbol,
                sentiment,
                category,
                limit,
            });
            return { success: true, data: news, count: news.length };
        }
        catch (error) {
            this.logger.error(`Failed to fetch news feed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في جلب تغذية الأخبار');
        }
    }
    async getMarketSentiment() {
        try {
            const sentiment = await this.newsIntegration.getMarketSentiment();
            return { success: true, data: sentiment };
        }
        catch (error) {
            this.logger.error(`Failed to fetch market sentiment: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في جلب مشاعر السوق');
        }
    }
    async analyzeNewsText(body) {
        if (!body.text) {
            throw new common_1.BadRequestException('النص مطلوب للتحليل');
        }
        try {
            const analysis = await this.newsService.analyzeNewsText(body.text, body.symbol);
            return { success: true, data: analysis };
        }
        catch (error) {
            this.logger.error(`Failed to analyze news: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في تحليل الخبر');
        }
    }
    async triggerFetch() {
        try {
            await this.newsService.fetchAndAnalyzeNews();
            return { success: true, message: 'تم جلب وتحليل الأخبار بنجاح' };
        }
        catch (error) {
            this.logger.error(`Manual fetch failed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في جلب الأخبار');
        }
    }
    async triggerPipeline(body) {
        try {
            const result = await this.newsIntegration.triggerNewsPipeline(body?.maxItems || 15);
            return { success: true, data: result, message: 'تم تشغيل خط أنابيب الأخبار' };
        }
        catch (error) {
            this.logger.error(`Pipeline trigger failed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في تشغيل خط الأنابيب');
        }
    }
};
exports.NewsController = NewsController;
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('latest'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    __param(0, (0, common_1.Query)('symbol')),
    __param(1, (0, common_1.Query)('sentiment')),
    __param(2, (0, common_1.Query)('category')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], NewsController.prototype, "getLatestNews", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('feed'),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    __param(0, (0, common_1.Query)('symbol')),
    __param(1, (0, common_1.Query)('sentiment')),
    __param(2, (0, common_1.Query)('category')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], NewsController.prototype, "getNewsFeed", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('sentiment'),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NewsController.prototype, "getMarketSentiment", null);
__decorate([
    (0, common_1.Post)('analyze'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NewsController.prototype, "analyzeNewsText", null);
__decorate([
    (0, common_1.Post)('fetch'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NewsController.prototype, "triggerFetch", null);
__decorate([
    (0, common_1.Post)('pipeline'),
    (0, throttler_1.Throttle)({ default: { limit: 2, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NewsController.prototype, "triggerPipeline", null);
exports.NewsController = NewsController = NewsController_1 = __decorate([
    (0, common_1.Controller)('news'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [news_service_1.NewsService,
        news_integration_service_1.NewsIntegrationService])
], NewsController);
//# sourceMappingURL=news.controller.js.map