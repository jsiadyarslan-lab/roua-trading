"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentAgentModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../common/prisma/prisma.module");
const redis_module_1 = require("../../common/redis/redis.module");
const audit_module_1 = require("../../audit/audit.module");
const exchange_module_1 = require("../../modules/exchange/exchange.module");
const ai_module_1 = require("../../modules/ai/ai.module");
const content_generator_service_1 = require("./services/content-generator.service");
const content_curator_service_1 = require("./services/content-curator.service");
const content_optimizer_service_1 = require("./services/content-optimizer.service");
const content_publisher_service_1 = require("./services/content-publisher.service");
const content_agent_service_1 = require("./content-agent.service");
const content_agent_controller_1 = require("./content-agent.controller");
let ContentAgentModule = class ContentAgentModule {
};
exports.ContentAgentModule = ContentAgentModule;
exports.ContentAgentModule = ContentAgentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            audit_module_1.AuditModule,
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
        ],
        controllers: [content_agent_controller_1.ContentAgentController],
        providers: [
            content_generator_service_1.ContentGeneratorService,
            content_curator_service_1.ContentCuratorService,
            content_optimizer_service_1.ContentOptimizerService,
            content_publisher_service_1.ContentPublisherService,
            content_agent_service_1.ContentAgentService,
        ],
        exports: [
            content_agent_service_1.ContentAgentService,
            content_generator_service_1.ContentGeneratorService,
            content_curator_service_1.ContentCuratorService,
            content_optimizer_service_1.ContentOptimizerService,
            content_publisher_service_1.ContentPublisherService,
        ],
    })
], ContentAgentModule);
//# sourceMappingURL=content-agent.module.js.map