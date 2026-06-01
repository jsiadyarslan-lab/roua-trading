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
var AiController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const ai_orchestrator_service_1 = require("./services/ai-orchestrator.service");
const auth_guard_1 = require("../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
let AiController = AiController_1 = class AiController {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.logger = new common_1.Logger(AiController_1.name);
    }
    async analyze(body) {
        const request = {
            prompt: body.prompt,
            type: body.type || 'general',
            symbol: body.symbol,
            language: body.language || 'ar',
        };
        this.logger.debug(`AI analyze request: ${request.type} (${request.language})`);
        const result = await this.orchestrator.analyze(request);
        return { success: true, data: result };
    }
    async analyzeWithAllModels(body) {
        const request = {
            prompt: body.prompt,
            type: body.type || 'general',
            symbol: body.symbol,
            language: body.language || 'ar',
        };
        const result = await this.orchestrator.analyzeWithAllModels(request);
        return { success: true, data: result };
    }
    async getModels() {
        const status = this.orchestrator.getModelsStatus();
        return { success: true, data: status };
    }
    async consensus(body) {
        const symbol = body.symbol || 'BTC/USD';
        const language = body.language === 'en' ? 'en' : 'ar';
        this.logger.log(`🗳️ AI Council consensus request for ${symbol} (lang: ${language})`);
        const result = await this.orchestrator.getConsensusAnalysis(symbol, { language });
        return { success: true, data: result };
    }
    async diagnoseModels() {
        this.logger.log('🔧 Running AI model diagnostics...');
        const result = await this.orchestrator.diagnoseModels();
        return { success: true, data: result, version: 'v2026-05-05-fix-memkey-diversification-override' };
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Post)('analyze'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "analyze", null);
__decorate([
    (0, common_1.Post)('analyze/all'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "analyzeWithAllModels", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('models'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "getModels", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Post)('consensus'),
    (0, throttler_1.Throttle)({ default: { limit: 2, ttl: 60000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "consensus", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('diagnose'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "diagnoseModels", null);
exports.AiController = AiController = AiController_1 = __decorate([
    (0, common_1.Controller)('ai'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [ai_orchestrator_service_1.AIOrchestratorService])
], AiController);
//# sourceMappingURL=ai.controller.js.map