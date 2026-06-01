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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionMarketController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const auth_guard_1 = require("../../common/guards/auth.guard");
const prediction_market_service_1 = require("./prediction-market.service");
let PredictionMarketController = class PredictionMarketController {
    constructor(predictionMarketService) {
        this.predictionMarketService = predictionMarketService;
    }
    async getEvents(symbol, category) {
        const events = await this.predictionMarketService.getActiveEvents({ symbol, category });
        return {
            success: true,
            data: events,
            disclaimer: 'الأسواق التنبؤية هي أداة تعليمية وتحليلية فقط. لا تشكل نصيحة استثمارية.',
        };
    }
    async getEventDetails(id) {
        const events = await this.predictionMarketService.getActiveEvents();
        const event = events.find((e) => e.id === id);
        if (!event) {
            return {
                success: false,
                error: 'الحدث غير موجود',
            };
        }
        const assessment = await this.predictionMarketService.generateImpactAssessment(id);
        return {
            success: true,
            data: {
                ...event,
                impactAssessment: assessment,
            },
        };
    }
    async getGapsForSymbol(symbol) {
        const gaps = await this.predictionMarketService.getGapsForSymbol(symbol.toUpperCase());
        return {
            success: true,
            data: gaps,
        };
    }
    async getTopGaps(limit) {
        const parsedLimit = Math.min(parseInt(limit || '10', 10) || 10, 50);
        const events = await this.predictionMarketService.getTopGapEvents(parsedLimit);
        return {
            success: true,
            data: events,
        };
    }
    async getCouncilVote(symbol) {
        const vote = await this.predictionMarketService.getCouncilVote(symbol.toUpperCase());
        return {
            success: true,
            data: vote,
            model: 'PredictionMarket/8th',
        };
    }
    async getPortfolioImpact() {
        const events = await this.predictionMarketService.getActiveEvents();
        return {
            success: true,
            data: events.slice(0, 5),
            message: 'أحداث تنبؤية تؤثر على محفظتك',
        };
    }
    async syncEvents(force) {
        const result = await this.predictionMarketService.syncEvents(force === 'true');
        return {
            success: true,
            data: result,
        };
    }
    async analyzeEvent(id) {
        const aiProbability = await this.predictionMarketService.calculateAIProbability(id);
        if (aiProbability === null) {
            return {
                success: false,
                error: 'لم يتم العثور على الحدث أو فشل التحليل',
            };
        }
        const assessment = await this.predictionMarketService.generateImpactAssessment(id);
        return {
            success: true,
            data: {
                eventId: id,
                aiProbability,
                impactAssessment: assessment,
            },
        };
    }
};
exports.PredictionMarketController = PredictionMarketController;
__decorate([
    (0, common_1.Get)('events'),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    __param(0, (0, common_1.Query)('symbol')),
    __param(1, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "getEvents", null);
__decorate([
    (0, common_1.Get)('events/:id'),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "getEventDetails", null);
__decorate([
    (0, common_1.Get)('gaps/:symbol'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "getGapsForSymbol", null);
__decorate([
    (0, common_1.Get)('gaps/top'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "getTopGaps", null);
__decorate([
    (0, common_1.Get)('vote/:symbol'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "getCouncilVote", null);
__decorate([
    (0, common_1.Get)('portfolio'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "getPortfolioImpact", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "syncEvents", null);
__decorate([
    (0, common_1.Post)('analyze/:id'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PredictionMarketController.prototype, "analyzeEvent", null);
exports.PredictionMarketController = PredictionMarketController = __decorate([
    (0, common_1.Controller)('prediction-market'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [prediction_market_service_1.PredictionMarketService])
], PredictionMarketController);
//# sourceMappingURL=prediction-market.controller.js.map