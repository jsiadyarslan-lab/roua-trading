"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationModule = void 0;
const common_1 = require("@nestjs/common");
const integration_controller_1 = require("./integration.controller");
const integration_guard_1 = require("../../common/guards/integration.guard");
const exchange_module_1 = require("../exchange/exchange.module");
const signal_module_1 = require("../signal/signal.module");
const prisma_module_1 = require("../../common/prisma/prisma.module");
const content_agent_module_1 = require("../../agents/content/content-agent.module");
let IntegrationModule = class IntegrationModule {
};
exports.IntegrationModule = IntegrationModule;
exports.IntegrationModule = IntegrationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            exchange_module_1.ExchangeModule,
            signal_module_1.SignalModule,
            prisma_module_1.PrismaModule,
            content_agent_module_1.ContentAgentModule,
        ],
        controllers: [integration_controller_1.IntegrationController],
        providers: [integration_guard_1.IntegrationGuard],
        exports: [integration_guard_1.IntegrationGuard],
    })
], IntegrationModule);
//# sourceMappingURL=integration.module.js.map