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
var AutonomousTraderAgentController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousTraderAgentController = exports.AutonomousTraderPublicController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../../common/guards/auth.guard");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const agent_service_1 = require("./agent.service");
const market_analyzer_service_1 = require("./services/market-analyzer.service");
const signal_evaluator_service_1 = require("./services/signal-evaluator.service");
const agent_types_1 = require("./types/agent.types");
let AutonomousTraderPublicController = class AutonomousTraderPublicController {
    constructor(agentService, prisma) {
        this.agentService = agentService;
        this.prisma = prisma;
    }
    async getHealth() {
        return {
            success: true,
            data: {
                module: 'autonomous-trader',
                status: this.agentService.isReady ? 'ok' : 'degraded',
                ready: this.agentService.isReady,
                reason: this.agentService.isReady ? undefined : this.agentService.notReadyReason,
                timestamp: new Date().toISOString(),
            },
        };
    }
    async getPublicStatus() {
        return this.agentService.getPublicStatus();
    }
    async fixDb(req) {
        if (!req.user || req.user.tier !== 'INSTITUTIONAL') {
            throw new common_1.ForbiddenException('فقط المستخدمون المؤسسيون يمكنهم تنفيذ إصلاحات قاعدة البيانات');
        }
        return {
            success: true,
            message: "DB fix endpoint disabled — use prisma migrate deploy for schema changes",
            logs: ["DDL operations removed from application code for safety"]
        };
    }
};
exports.AutonomousTraderPublicController = AutonomousTraderPublicController;
__decorate([
    (0, common_1.Get)('health'),
    (0, auth_guard_1.Public)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AutonomousTraderPublicController.prototype, "getHealth", null);
__decorate([
    (0, common_1.Get)('public-status'),
    (0, auth_guard_1.Public)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AutonomousTraderPublicController.prototype, "getPublicStatus", null);
__decorate([
    (0, common_1.Get)('fix-db'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AutonomousTraderPublicController.prototype, "fixDb", null);
exports.AutonomousTraderPublicController = AutonomousTraderPublicController = __decorate([
    (0, common_1.Controller)('agent/trader'),
    __metadata("design:paramtypes", [agent_service_1.AutonomousTraderAgentService,
        prisma_service_1.PrismaService])
], AutonomousTraderPublicController);
let AutonomousTraderAgentController = AutonomousTraderAgentController_1 = class AutonomousTraderAgentController {
    constructor(agentService, marketAnalyzer, signalEvaluator) {
        this.agentService = agentService;
        this.marketAnalyzer = marketAnalyzer;
        this.signalEvaluator = signalEvaluator;
        this.logger = new common_1.Logger(AutonomousTraderAgentController_1.name);
    }
    async startAgent(req, dto) {
        this.logger.log(`[startAgent] Request from user: ${req.user?.id || 'unknown'}`);
        this.logger.debug(`[startAgent] Received DTO: ${JSON.stringify(dto)}`);
        if (!dto || (!dto.strategy)) {
            this.logger.warn('[startAgent] DTO appears empty after validation — attempting raw body parse');
            try {
                const rawBody = req.rawBody || req.body;
                if (rawBody && typeof rawBody === 'object') {
                    dto = {
                        strategy: rawBody.strategy || agent_types_1.StrategyType.AUTO,
                        credentialId: rawBody.credentialId || '',
                        symbols: rawBody.symbols,
                    };
                    this.logger.warn(`[startAgent] Reconstructed DTO from raw body: ${JSON.stringify(dto)}`);
                }
            }
            catch (e) {
                this.logger.error(`[startAgent] Failed to reconstruct DTO: ${e}`);
            }
        }
        const validStrategies = [agent_types_1.StrategyType.AUTO, agent_types_1.StrategyType.SWING, agent_types_1.StrategyType.GRID, agent_types_1.StrategyType.MEAN_REVERSION, agent_types_1.StrategyType.MOMENTUM_BREAKOUT, agent_types_1.StrategyType.DCA, agent_types_1.StrategyType.VWAP_RSI];
        if (!dto.strategy || !validStrategies.includes(dto.strategy)) {
            if (dto.strategy === agent_types_1.StrategyType.SCALPING) {
                this.logger.warn(`[startAgent] SCALPING is not valid for the Agent — use the Smart Executor instead. Defaulting to AUTO`);
            }
            else {
                this.logger.warn(`[startAgent] Invalid strategy "${dto.strategy}" — defaulting to AUTO`);
            }
            dto.strategy = agent_types_1.StrategyType.AUTO;
        }
        try {
            const state = await this.agentService.startAgent(req.user.id, dto);
            return {
                success: true,
                data: state,
                message: `تم تفعيل وكيل التداول الذاتي — الاستراتيجية: ${dto.strategy}`,
            };
        }
        catch (error) {
            this.logger.error(`[startAgent] Service error: ${error.message}`);
            if (error instanceof common_1.ServiceUnavailableException) {
                return {
                    success: false,
                    message: error.message || 'الخدمة غير متاحة حالياً — يرجى المحاولة لاحقاً',
                    data: null,
                };
            }
            if (error.getStatus && typeof error.getStatus === 'function') {
                throw error;
            }
            return {
                success: false,
                message: error.message || 'فشل تفعيل وكيل التداول — يرجى المحاولة لاحقاً',
                data: null,
            };
        }
    }
    async stopAgent(req, body) {
        const state = await this.agentService.stopAgent(req.user.id, body.emergency === true);
        return {
            success: true,
            data: state,
            message: body.emergency
                ? 'تم الإيقاف الطارئ — تم إغلاق جميع المراكز'
                : 'تم إيقاف وكيل التداول الذاتي',
        };
    }
    async getStatus(req) {
        const state = await this.agentService.getStatus(req.user.id);
        return {
            success: true,
            data: state,
        };
    }
    async getPerformance(req) {
        const period = 'WEEKLY';
        const metrics = await this.agentService.getPerformance(req.user.id, period);
        return {
            success: true,
            data: metrics,
        };
    }
    async getOpenPositions(req) {
        const positions = await this.agentService.getOpenPositions(req.user.id);
        return {
            success: true,
            data: positions,
        };
    }
    async changeStrategy(req, dto) {
        const state = await this.agentService.changeStrategy(req.user.id, dto);
        return {
            success: true,
            data: state,
            message: `تم تغيير الاستراتيجية إلى: ${dto.strategy}`,
        };
    }
    async getRegimeInfo(req, symbol) {
        const targetSymbol = symbol || 'BTC/USDT';
        try {
            const market = await this.marketAnalyzer.analyze(targetSymbol);
            if (!market) {
                return {
                    success: false,
                    message: 'لا يمكن تحليل السوق حالياً',
                    data: null,
                };
            }
            const regimeInfo = await this.signalEvaluator.getAutoRegimeInfo(req.user.id, market);
            return {
                success: true,
                data: regimeInfo,
            };
        }
        catch (error) {
            return {
                success: false,
                message: error.message || 'فشل الحصول على معلومات النظام',
                data: null,
            };
        }
    }
    async updateRiskParams(req, dto) {
        const state = await this.agentService.updateRiskParams(req.user.id, dto);
        return {
            success: true,
            data: state,
            message: 'تم تحديث معلمات المخاطر',
        };
    }
    async getSettings(req) {
        const settings = await this.agentService.getSettings(req.user.id);
        return {
            success: true,
            data: settings,
        };
    }
    async updateSettings(req, dto) {
        const settings = await this.agentService.updateSettings(req.user.id, dto);
        return {
            success: true,
            data: settings,
            message: 'تم تحديث إعدادات الوكيل',
        };
    }
    async getSystemStatus() {
        return this.agentService.getSystemStatus();
    }
    async updateSystemSettings(req, body) {
        const user = req.user;
        if (!user) {
            throw new common_1.ForbiddenException('يجب تسجيل الدخول أولاً');
        }
        if (body.autoTradingEnabled !== undefined) {
            await this.agentService.updateSystemAutoTrading(body.autoTradingEnabled);
        }
        return {
            success: true,
            message: body.autoTradingEnabled
                ? 'تم تفعيل التداول الذاتي على مستوى النظام'
                : 'تم تحديث إعدادات النظام',
        };
    }
};
exports.AutonomousTraderAgentController = AutonomousTraderAgentController;
__decorate([
    (0, common_1.Post)('start'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, agent_types_1.StartAgentDto]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "startAgent", null);
__decorate([
    (0, common_1.Post)('stop'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "stopAgent", null);
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Get)('performance'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "getPerformance", null);
__decorate([
    (0, common_1.Get)('open-positions'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "getOpenPositions", null);
__decorate([
    (0, common_1.Put)('strategy'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, agent_types_1.ChangeStrategyDto]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "changeStrategy", null);
__decorate([
    (0, common_1.Get)('regime-info'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "getRegimeInfo", null);
__decorate([
    (0, common_1.Put)('risk-params'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, agent_types_1.UpdateRiskParamsDto]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "updateRiskParams", null);
__decorate([
    (0, common_1.Get)('settings'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Put)('settings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, agent_types_1.UpdateAgentSettingsDto]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Get)('system-status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "getSystemStatus", null);
__decorate([
    (0, common_1.Put)('system-settings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AutonomousTraderAgentController.prototype, "updateSystemSettings", null);
exports.AutonomousTraderAgentController = AutonomousTraderAgentController = AutonomousTraderAgentController_1 = __decorate([
    (0, common_1.Controller)('agent/trader'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [agent_service_1.AutonomousTraderAgentService,
        market_analyzer_service_1.MarketAnalyzerService,
        signal_evaluator_service_1.SignalEvaluatorService])
], AutonomousTraderAgentController);
//# sourceMappingURL=agent.controller.js.map