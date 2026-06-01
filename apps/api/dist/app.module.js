"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const schedule_1 = require("@nestjs/schedule");
const prisma_module_1 = require("./common/prisma/prisma.module");
const redis_module_1 = require("./common/redis/redis.module");
const auth_module_1 = require("./auth/auth.module");
const exchange_module_1 = require("./modules/exchange/exchange.module");
const ai_module_1 = require("./modules/ai/ai.module");
const portfolio_module_1 = require("./modules/portfolio/portfolio.module");
const signal_module_1 = require("./modules/signal/signal.module");
const trading_module_1 = require("./modules/trading/trading.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const execution_module_1 = require("./modules/execution/execution.module");
const engine_module_1 = require("./modules/engine/engine.module");
const neural_module_1 = require("./modules/neural/neural.module");
const news_module_1 = require("./modules/news/news.module");
const audit_module_1 = require("./audit/audit.module");
const coach_module_1 = require("./modules/coach/coach.module");
const scanner_module_1 = require("./modules/scanner/scanner.module");
const prediction_market_module_1 = require("./modules/prediction-market/prediction-market.module");
const agent_module_1 = require("./agents/autonomous-trader/agent.module");
const content_agent_module_1 = require("./agents/content/content-agent.module");
const strategic_council_module_1 = require("./modules/ai/strategic-council/strategic-council.module");
const smart_executor_module_1 = require("./modules/ai/smart-executor/smart-executor.module");
const notification_module_1 = require("./modules/notification/notification.module");
const integration_module_1 = require("./modules/integration/integration.module");
const maintenance_module_1 = require("./modules/maintenance/maintenance.module");
const user_isolation_interceptor_1 = require("./common/interceptors/user-isolation.interceptor");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        providers: [
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: user_isolation_interceptor_1.UserIsolationInterceptor,
            },
        ],
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', '../../.env'],
            }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    name: 'short',
                    ttl: 1000,
                    limit: 3,
                },
                {
                    name: 'medium',
                    ttl: 10000,
                    limit: 20,
                },
                {
                    name: 'long',
                    ttl: 60000,
                    limit: 100,
                },
            ]),
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            audit_module_1.AuditModule,
            auth_module_1.AuthModule,
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
            portfolio_module_1.PortfolioModule,
            signal_module_1.SignalModule,
            analytics_module_1.AnalyticsModule,
            trading_module_1.TradingModule,
            execution_module_1.ExecutionModule,
            engine_module_1.EngineModule,
            neural_module_1.NeuralModule,
            news_module_1.NewsModule,
            coach_module_1.CoachModule,
            scanner_module_1.ScannerModule,
            prediction_market_module_1.PredictionMarketModule,
            agent_module_1.AutonomousTraderAgentModule,
            content_agent_module_1.ContentAgentModule,
            strategic_council_module_1.StrategicCouncilModule,
            smart_executor_module_1.SmartExecutorModule,
            notification_module_1.NotificationModule,
            integration_module_1.IntegrationModule,
            maintenance_module_1.MaintenanceModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map