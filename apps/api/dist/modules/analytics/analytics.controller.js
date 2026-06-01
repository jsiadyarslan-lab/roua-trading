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
var AnalyticsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const analytical_ai_service_1 = require("./analytical-ai.service");
const signal_generator_service_1 = require("./signal-generator.service");
const auth_guard_1 = require("../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
let AnalyticsController = AnalyticsController_1 = class AnalyticsController {
    constructor(analyticalAI, signalGenerator) {
        this.analyticalAI = analyticalAI;
        this.signalGenerator = signalGenerator;
        this.logger = new common_1.Logger(AnalyticsController_1.name);
        this.logger.log('📊 Analytics Controller initialized');
    }
    async analyzeAsset(req, symbol) {
        this.logger.debug(`Analysis request: ${symbol} (user: ${req.user?.id})`);
        let decodedSymbol;
        try {
            decodedSymbol = decodeURIComponent(symbol);
        }
        catch {
            decodedSymbol = symbol;
        }
        const analysisCard = await this.analyticalAI.analyzeAsset(decodedSymbol);
        return {
            success: true,
            data: analysisCard,
        };
    }
    async getSignalsForSymbol(req, symbol, limit) {
        let decodedSymbol;
        try {
            decodedSymbol = decodeURIComponent(symbol);
        }
        catch {
            decodedSymbol = symbol;
        }
        const parsedLimit = limit ? (parseInt(limit, 10) || 10) : 10;
        const signals = await this.signalGenerator.getSignalsForSymbol(req.user.id, decodedSymbol, parsedLimit);
        return {
            success: true,
            data: signals,
        };
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('analyze/:symbol'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "analyzeAsset", null);
__decorate([
    (0, common_1.Get)('signals/:symbol'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('symbol')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getSignalsForSymbol", null);
exports.AnalyticsController = AnalyticsController = AnalyticsController_1 = __decorate([
    (0, common_1.Controller)('analytics'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [analytical_ai_service_1.AnalyticalAIService,
        signal_generator_service_1.SignalGeneratorService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map