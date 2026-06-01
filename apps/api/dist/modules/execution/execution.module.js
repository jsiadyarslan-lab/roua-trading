"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExecutionModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const prisma_module_1 = require("../../common/prisma/prisma.module");
const redis_module_1 = require("../../common/redis/redis.module");
const audit_module_1 = require("../../audit/audit.module");
const analytics_module_1 = require("../analytics/analytics.module");
const portfolio_module_1 = require("../portfolio/portfolio.module");
const execution_gateway_service_1 = require("./gateways/execution-gateway.service");
const order_lifecycle_service_1 = require("./services/order-lifecycle.service");
const connection_resilience_service_1 = require("./services/connection-resilience.service");
const rate_limiter_service_1 = require("./services/rate-limiter.service");
let ExecutionModule = ExecutionModule_1 = class ExecutionModule {
    constructor() {
        this.logger = new common_1.Logger(ExecutionModule_1.name);
    }
    static registerBullQueue() {
        return {
            module: ExecutionModuleBullQueue,
            imports: [
                bullmq_1.BullModule.registerQueue({
                    name: 'execution_queue',
                    defaultJobOptions: {
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 5000,
                        },
                        removeOnComplete: {
                            age: 3600,
                            count: 1000,
                        },
                        removeOnFail: {
                            age: 86400,
                        },
                    },
                }),
            ],
        };
    }
};
exports.ExecutionModule = ExecutionModule;
exports.ExecutionModule = ExecutionModule = ExecutionModule_1 = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            audit_module_1.AuditModule,
            analytics_module_1.AnalyticsModule,
            portfolio_module_1.PortfolioModule,
        ],
        providers: [
            execution_gateway_service_1.ExecutionGatewayService,
            order_lifecycle_service_1.OrderLifecycleService,
            connection_resilience_service_1.ConnectionResilienceService,
            rate_limiter_service_1.RateLimiterService,
        ],
        exports: [
            execution_gateway_service_1.ExecutionGatewayService,
            order_lifecycle_service_1.OrderLifecycleService,
            connection_resilience_service_1.ConnectionResilienceService,
            rate_limiter_service_1.RateLimiterService,
        ],
    })
], ExecutionModule);
let ExecutionModuleBullQueue = class ExecutionModuleBullQueue {
};
ExecutionModuleBullQueue = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({
                name: 'execution_queue',
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    },
                    removeOnComplete: {
                        age: 3600,
                        count: 1000,
                    },
                    removeOnFail: {
                        age: 86400,
                    },
                },
            }),
        ],
    })
], ExecutionModuleBullQueue);
//# sourceMappingURL=execution.module.js.map