"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsModule = void 0;
const common_1 = require("@nestjs/common");
const analytics_controller_1 = require("./analytics.controller");
const aggregator_service_1 = require("./aggregator.service");
const indicators_service_1 = require("./indicators.service");
const analytical_ai_service_1 = require("./analytical-ai.service");
const signal_generator_service_1 = require("./signal-generator.service");
const finnhub_adapter_1 = require("./finnhub.adapter");
const exchange_module_1 = require("../exchange/exchange.module");
const ai_module_1 = require("../ai/ai.module");
const audit_module_1 = require("../../audit/audit.module");
let AnalyticsModule = class AnalyticsModule {
};
exports.AnalyticsModule = AnalyticsModule;
exports.AnalyticsModule = AnalyticsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
            audit_module_1.AuditModule,
        ],
        controllers: [analytics_controller_1.AnalyticsController],
        providers: [
            finnhub_adapter_1.FinnhubAdapter,
            aggregator_service_1.MarketDataAggregatorService,
            indicators_service_1.TechnicalIndicatorService,
            analytical_ai_service_1.AnalyticalAIService,
            signal_generator_service_1.SignalGeneratorService,
        ],
        exports: [
            aggregator_service_1.MarketDataAggregatorService,
            indicators_service_1.TechnicalIndicatorService,
            analytical_ai_service_1.AnalyticalAIService,
            signal_generator_service_1.SignalGeneratorService,
        ],
    })
], AnalyticsModule);
//# sourceMappingURL=analytics.module.js.map