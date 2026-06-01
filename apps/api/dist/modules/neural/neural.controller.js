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
var NeuralController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeuralController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const auth_guard_1 = require("../../common/guards/auth.guard");
const neural_predictor_service_1 = require("./services/neural-predictor.service");
const backtest_runner_service_1 = require("./services/backtest-runner.service");
const neural_swarm_service_1 = require("./services/neural-swarm.service");
const performance_tracker_service_1 = require("../analytics/services/performance-tracker.service");
const neural_types_1 = require("./neural.types");
let NeuralController = NeuralController_1 = class NeuralController {
    constructor(predictor, backtestRunner, swarmService, perfTracker) {
        this.predictor = predictor;
        this.backtestRunner = backtestRunner;
        this.swarmService = swarmService;
        this.perfTracker = perfTracker;
        this.logger = new common_1.Logger(NeuralController_1.name);
        this.logger.log('🧪 Neural Controller initialized — AI Trading Lab endpoints');
    }
    async runBacktest(req, body) {
        const result = await this.backtestRunner.runBacktest(req.user.id, {
            symbol: body.symbol,
            strategy: body.strategy || neural_types_1.BacktestStrategy.MOMENTUM,
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
            initialCapital: body.initialCapital || 10000,
            positionSize: body.positionSize || 0.1,
            stopLoss: body.stopLoss || 0.03,
            takeProfit: body.takeProfit || 0.06,
        }, body.language || 'ar');
        return { success: true, data: result };
    }
    async compareStrategies(req, body) {
        const strategies = Object.values(neural_types_1.BacktestStrategy);
        const results = await Promise.allSettled(strategies.map(strategy => this.backtestRunner.runBacktest(req.user.id, {
            symbol: body.symbol || 'BTC/USDT',
            strategy,
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
            initialCapital: body.initialCapital || 10000,
            positionSize: body.positionSize || 0.1,
            stopLoss: body.stopLoss || 0.03,
            takeProfit: body.takeProfit || 0.06,
        })));
        const comparison = strategies.map((strategy, i) => ({
            strategy,
            result: results[i].status === 'fulfilled' ? results[i].value : null,
            error: results[i].status === 'rejected' ? results[i].reason?.message : null,
        })).sort((a, b) => (b.result?.winRate || 0) - (a.result?.winRate || 0));
        return { success: true, data: { comparison, symbol: body.symbol || 'BTC/USDT' } };
    }
    async trainNeural(req, body) {
        const model = await this.predictor.trainModel(req.user.id, body.symbol, body.architecture || neural_types_1.NeuralArchitecture.ENSEMBLE, body.horizon || neural_types_1.PredictionHorizon.MEDIUM, body.lookbackDays || 90);
        return { success: true, data: model };
    }
    _getLanguage(body) {
        return body.language || 'ar';
    }
    async neuralPredict(req, body) {
        const result = await this.predictor.predict(req.user.id, body.symbol, body.steps || 5, body.horizon || neural_types_1.PredictionHorizon.MEDIUM, body.language || 'ar');
        return { success: true, data: result };
    }
    async getModels(req) {
        return { success: true, data: this.predictor.getModels() };
    }
    async startSwarm(req, body) {
        const result = await this.swarmService.startSwarm(req.user.id, {
            agents: body.agents || 3,
            symbols: body.symbols || ['BTC/USDT'],
            strategy: body.strategy || neural_types_1.BacktestStrategy.AI_COUNCIL,
            riskTolerance: body.riskTolerance || 50,
        }, body.language || 'ar');
        return { success: true, data: result };
    }
    async getSwarmStatus(req, swarmId) {
        return { success: true, data: this.swarmService.getSwarmStatus(swarmId, req.user.id) };
    }
    async stopSwarm(req, swarmId) {
        return { success: true, data: await this.swarmService.stopSwarm(req.user.id, swarmId) };
    }
    async getAllSwarms(req) {
        return { success: true, data: this.swarmService.getAllSwarms(req.user.id) };
    }
    async getSystemHealth(req) {
        const health = await this.perfTracker.getSystemHealth(req.user.id);
        return { success: true, data: health };
    }
    async getSourcePerformance(req, source) {
        const perf = await this.perfTracker.getSourcePerformance(req.user.id, source);
        return { success: true, data: perf };
    }
};
exports.NeuralController = NeuralController;
__decorate([
    (0, common_1.Post)('backtest'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, neural_types_1.BacktestRequest]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "runBacktest", null);
__decorate([
    (0, common_1.Post)('backtest/compare'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "compareStrategies", null);
__decorate([
    (0, common_1.Post)('train'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, neural_types_1.NeuralTrainRequest]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "trainNeural", null);
__decorate([
    (0, common_1.Post)('predict'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, neural_types_1.NeuralPredictRequest]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "neuralPredict", null);
__decorate([
    (0, common_1.Get)('models'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "getModels", null);
__decorate([
    (0, common_1.Post)('swarm/start'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 120000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, neural_types_1.SwarmStartRequest]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "startSwarm", null);
__decorate([
    (0, common_1.Get)('swarm/:id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "getSwarmStatus", null);
__decorate([
    (0, common_1.Post)('swarm/:id/stop'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "stopSwarm", null);
__decorate([
    (0, common_1.Get)('swarm'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "getAllSwarms", null);
__decorate([
    (0, common_1.Get)('performance/health'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "getSystemHealth", null);
__decorate([
    (0, common_1.Get)('performance/:source'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('source')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NeuralController.prototype, "getSourcePerformance", null);
exports.NeuralController = NeuralController = NeuralController_1 = __decorate([
    (0, common_1.Controller)('neural'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [neural_predictor_service_1.NeuralPredictorService,
        backtest_runner_service_1.BacktestRunnerService,
        neural_swarm_service_1.NeuralSwarmService,
        performance_tracker_service_1.PerformanceTrackerService])
], NeuralController);
//# sourceMappingURL=neural.controller.js.map