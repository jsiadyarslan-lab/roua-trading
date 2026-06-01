"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeuralModule = void 0;
const common_1 = require("@nestjs/common");
const neural_controller_1 = require("./neural.controller");
const neural_predictor_service_1 = require("./services/neural-predictor.service");
const backtest_runner_service_1 = require("./services/backtest-runner.service");
const neural_swarm_service_1 = require("./services/neural-swarm.service");
const prisma_module_1 = require("../../common/prisma/prisma.module");
const redis_module_1 = require("../../common/redis/redis.module");
const exchange_module_1 = require("../exchange/exchange.module");
const ai_module_1 = require("../ai/ai.module");
const audit_module_1 = require("../../audit/audit.module");
const performance_tracker_service_1 = require("../analytics/services/performance-tracker.service");
let NeuralModule = class NeuralModule {
};
exports.NeuralModule = NeuralModule;
exports.NeuralModule = NeuralModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
            audit_module_1.AuditModule,
        ],
        controllers: [neural_controller_1.NeuralController],
        providers: [
            neural_predictor_service_1.NeuralPredictorService,
            backtest_runner_service_1.BacktestRunnerService,
            performance_tracker_service_1.PerformanceTrackerService,
            neural_swarm_service_1.NeuralSwarmService,
        ],
        exports: [
            neural_predictor_service_1.NeuralPredictorService,
            backtest_runner_service_1.BacktestRunnerService,
            performance_tracker_service_1.PerformanceTrackerService,
            neural_swarm_service_1.NeuralSwarmService,
        ],
    })
], NeuralModule);
//# sourceMappingURL=neural.module.js.map