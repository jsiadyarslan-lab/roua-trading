"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioModule = void 0;
const common_1 = require("@nestjs/common");
const credentials_module_1 = require("./credentials/credentials.module");
const sanctuary_controller_1 = require("./sanctuary/sanctuary.controller");
const redis_module_1 = require("../../common/redis/redis.module");
const sanctuary_service_1 = require("./sanctuary/sanctuary.service");
const exchange_module_1 = require("../exchange/exchange.module");
const ai_module_1 = require("../ai/ai.module");
const audit_module_1 = require("../../audit/audit.module");
let PortfolioModule = class PortfolioModule {
};
exports.PortfolioModule = PortfolioModule;
exports.PortfolioModule = PortfolioModule = __decorate([
    (0, common_1.Module)({
        imports: [
            redis_module_1.RedisModule,
            credentials_module_1.CredentialsModule,
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
            audit_module_1.AuditModule,
        ],
        controllers: [sanctuary_controller_1.SanctuaryController],
        providers: [sanctuary_service_1.SanctuaryService],
        exports: [sanctuary_service_1.SanctuaryService, credentials_module_1.CredentialsModule],
    })
], PortfolioModule);
//# sourceMappingURL=portfolio.module.js.map