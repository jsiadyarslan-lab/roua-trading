"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartExecutorModule = void 0;
const common_1 = require("@nestjs/common");
const smart_executor_service_1 = require("./smart-executor.service");
const smart_executor_controller_1 = require("./smart-executor.controller");
const prisma_module_1 = require("../../../common/prisma/prisma.module");
const redis_module_1 = require("../../../common/redis/redis.module");
const audit_module_1 = require("../../../audit/audit.module");
const exchange_module_1 = require("../../exchange/exchange.module");
const trading_module_1 = require("../../trading/trading.module");
const strategic_council_module_1 = require("../strategic-council/strategic-council.module");
const notification_module_1 = require("../../notification/notification.module");
const ai_module_1 = require("../ai.module");
const news_module_1 = require("../../news/news.module");
const credentials_module_1 = require("../../portfolio/credentials/credentials.module");
let SmartExecutorModule = class SmartExecutorModule {
};
exports.SmartExecutorModule = SmartExecutorModule;
exports.SmartExecutorModule = SmartExecutorModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            audit_module_1.AuditModule,
            exchange_module_1.ExchangeModule,
            trading_module_1.TradingModule,
            strategic_council_module_1.StrategicCouncilModule,
            ai_module_1.AiModule,
            notification_module_1.NotificationModule,
            news_module_1.NewsModule,
            credentials_module_1.CredentialsModule,
        ],
        controllers: [smart_executor_controller_1.SmartExecutorController],
        providers: [smart_executor_service_1.SmartExecutorService],
        exports: [smart_executor_service_1.SmartExecutorService],
    })
], SmartExecutorModule);
//# sourceMappingURL=smart-executor.module.js.map