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
var StrategicCouncilController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategicCouncilController = void 0;
const common_1 = require("@nestjs/common");
const strategic_council_service_1 = require("./strategic-council.service");
const auth_guard_1 = require("../../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
const ai_orchestrator_service_1 = require("../services/ai-orchestrator.service");
let StrategicCouncilController = StrategicCouncilController_1 = class StrategicCouncilController {
    constructor(councilService, orchestrator) {
        this.councilService = councilService;
        this.orchestrator = orchestrator;
        this.logger = new common_1.Logger(StrategicCouncilController_1.name);
    }
    async getAllBriefs() {
        const [active, count] = await Promise.all([
            this.councilService.getActiveBriefs(),
            this.councilService.getActiveBriefsCount(),
        ]);
        return { success: true, data: { active, count } };
    }
    async getActiveBriefs(symbol) {
        if (symbol) {
            const briefs = await this.councilService.getBriefsForPair(symbol);
            return { success: true, data: briefs };
        }
        const briefs = await this.councilService.getActiveBriefs();
        return { success: true, data: briefs };
    }
    async getBriefHistory() {
        const briefs = await this.councilService.getBriefHistory();
        return { success: true, data: briefs };
    }
    async getActiveBriefsCount() {
        const count = await this.councilService.getActiveBriefsCount();
        return { success: true, data: { count } };
    }
    async triggerSession(req, body) {
        const pairs = body.pairs || [];
        if (pairs.length === 0) {
            return { success: false, message: 'حدد زوجاً واحداً على الأقل' };
        }
        const userId = req.user?.id || 'system';
        this.logger.log(`🏛️ Manual council session triggered by ${userId} for: ${pairs.join(', ')}`);
        if (this.councilService.isInSessionNow()) {
            return {
                success: false,
                message: 'جلسة أخرى قيد التشغيل حالياً — يرجى الانتظار حتى تنتهي',
                status: 'already_running',
            };
        }
        const sessionId = `manual-${Date.now()}`;
        this.councilService.forceSessionAsync(sessionId, pairs, userId).catch((err) => {
            this.logger.error(`🏛️ Background manual session failed: ${err.message}`);
        });
        return {
            success: true,
            data: {
                sessionId,
                status: 'processing',
                pairs,
                message: 'تم بدء الجلسة — راقب النتائج خلال دقيقة واحدة',
            },
        };
    }
    async getSessionStatus() {
        const isRunning = this.councilService.isInSessionNow();
        const lastSession = await this.councilService.getLastSession();
        return {
            success: true,
            data: {
                isRunning,
                lastSession,
            },
        };
    }
    async getLastSession() {
        const result = await this.councilService.getLastSession();
        return { success: true, data: result };
    }
    async debugConsensus(pair) {
        const testPair = pair || 'BTC/USDT';
        const diagnostic = { pair: testPair, steps: {} };
        try {
            try {
                const marketData = await this.orchestrator.fetchQuickMarketData(testPair);
                diagnostic.steps.marketData = {
                    success: marketData.price > 0,
                    price: marketData.price,
                    rsi: marketData.rsi,
                    macd: marketData.macd,
                    change24h: marketData.change24h,
                };
            }
            catch (err) {
                diagnostic.steps.marketData = { success: false, error: err.message };
            }
            try {
                const consensus = await this.orchestrator.getConsensusAnalysis(testPair, { forceFresh: true });
                const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;
                const wouldCreateBrief = !isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore >= 15;
                const direction = consensus.recommendation === 'BUY' ? 'BUY' : consensus.recommendation === 'SELL' ? 'SELL' : 'HOLD';
                diagnostic.steps.consensus = {
                    success: true,
                    recommendation: consensus.recommendation,
                    consensusScore: consensus.consensusScore,
                    isFallback: consensus.isFallback,
                    analysesCount: consensus.analyses?.length || 0,
                    models: consensus.analyses?.map((a) => `${a.role}→${a.vote}(${a.confidence}%)`) || [],
                    isAIFallback,
                    wouldCreateBrief,
                    direction,
                    reason: isAIFallback
                        ? 'AI fallback - would try technical analysis'
                        : consensus.recommendation === 'HOLD'
                            ? 'AI says HOLD - would try technical override'
                            : consensus.consensusScore < 15
                                ? `Score too low (${consensus.consensusScore}% < 15%)`
                                : `Would create ${direction} brief`,
                };
            }
            catch (err) {
                diagnostic.steps.consensus = { success: false, error: err.message };
            }
            try {
                const marketData = diagnostic.steps.marketData?.price > 0
                    ? { price: diagnostic.steps.marketData.price }
                    : await this.orchestrator.fetchQuickMarketData(testPair);
                if (marketData.price > 0) {
                    const testBrief = await this.councilService.prisma.tradingBrief.create({
                        data: {
                            pair: testPair,
                            direction: 'BUY',
                            entryPrice: marketData.price,
                            stopLoss: marketData.price * 0.995,
                            takeProfit: marketData.price * 1.01,
                            confidence: 99,
                            timeframe: 'H1',
                            expiresAt: new Date(Date.now() + 60000),
                            isActive: true,
                            strictRules: '{}',
                            lastReviewedAt: new Date(),
                            reviewStatus: 'ACTIVE',
                            analysisSummary: 'DIAGNOSTIC TEST — will be deleted',
                        },
                    });
                    await this.councilService.prisma.tradingBrief.delete({
                        where: { id: testBrief.id },
                    });
                    diagnostic.steps.dbCreate = {
                        success: true,
                        createdId: testBrief.id,
                        deleted: true,
                        message: 'Brief created and deleted successfully — DB is working',
                    };
                }
                else {
                    diagnostic.steps.dbCreate = { success: false, error: 'No price available for test brief' };
                }
            }
            catch (err) {
                diagnostic.steps.dbCreate = { success: false, error: err.message, stack: err.stack?.slice(0, 500) };
            }
            try {
                const columns = await this.councilService.prisma.$queryRaw `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'TradingBrief'
          ORDER BY ordinal_position
        `;
                diagnostic.steps.tableSchema = { success: true, columns };
            }
            catch (err) {
                diagnostic.steps.tableSchema = { success: false, error: err.message };
            }
            diagnostic.success = true;
            diagnostic.canCreateBriefs =
                diagnostic.steps.marketData?.success &&
                    diagnostic.steps.consensus?.wouldCreateBrief &&
                    diagnostic.steps.dbCreate?.success;
            return { success: true, data: diagnostic };
        }
        catch (error) {
            return { success: false, error: error.message, data: diagnostic };
        }
    }
};
exports.StrategicCouncilController = StrategicCouncilController;
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('briefs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "getAllBriefs", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('briefs/active'),
    __param(0, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "getActiveBriefs", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('briefs/history'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "getBriefHistory", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('briefs/count'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "getActiveBriefsCount", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Post)('trigger'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "triggerSession", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('session/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "getSessionStatus", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('session/last'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "getLastSession", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('debug'),
    __param(0, (0, common_1.Query)('pair')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StrategicCouncilController.prototype, "debugConsensus", null);
exports.StrategicCouncilController = StrategicCouncilController = StrategicCouncilController_1 = __decorate([
    (0, common_1.Controller)('strategic-council'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [strategic_council_service_1.StrategicCouncilService,
        ai_orchestrator_service_1.AIOrchestratorService])
], StrategicCouncilController);
//# sourceMappingURL=strategic-council.controller.js.map