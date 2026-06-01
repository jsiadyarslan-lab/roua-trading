"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategicCouncilModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const strategic_council_service_1 = require("./strategic-council.service");
const strategic_council_controller_1 = require("./strategic-council.controller");
const ai_module_1 = require("../ai.module");
const prisma_module_1 = require("../../../common/prisma/prisma.module");
const redis_module_1 = require("../../../common/redis/redis.module");
const audit_module_1 = require("../../../audit/audit.module");
const exchange_module_1 = require("../../exchange/exchange.module");
const news_module_1 = require("../../news/news.module");
let StrategicCouncilModule = class StrategicCouncilModule {
};
exports.StrategicCouncilModule = StrategicCouncilModule;
exports.StrategicCouncilModule = StrategicCouncilModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            audit_module_1.AuditModule,
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
            news_module_1.NewsModule,
        ],
        controllers: [strategic_council_controller_1.StrategicCouncilController],
        providers: [strategic_council_service_1.StrategicCouncilService],
        exports: [strategic_council_service_1.StrategicCouncilService],
    })
], StrategicCouncilModule);
//# sourceMappingURL=strategic-council.module.js.map