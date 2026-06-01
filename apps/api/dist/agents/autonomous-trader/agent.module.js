"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousTraderAgentModule = void 0;
const common_1 = require("@nestjs/common");
const audit_module_1 = require("../../audit/audit.module");
const trading_module_1 = require("../../modules/trading/trading.module");
const exchange_module_1 = require("../../modules/exchange/exchange.module");
const ai_module_1 = require("../../modules/ai/ai.module");
const strategic_council_module_1 = require("../../modules/ai/strategic-council/strategic-council.module");
const portfolio_module_1 = require("../../modules/portfolio/portfolio.module");
const market_analyzer_service_1 = require("./services/market-analyzer.service");
const signal_evaluator_service_1 = require("./services/signal-evaluator.service");
const risk_calculator_service_1 = require("./services/risk-calculator.service");
const order_executor_service_1 = require("./services/order-executor.service");
const adaptive_strategy_selector_service_1 = require("./services/adaptive-strategy-selector.service");
const agent_service_1 = require("./agent.service");
const agent_controller_1 = require("./agent.controller");
let AutonomousTraderAgentModule = class AutonomousTraderAgentModule {
};
exports.AutonomousTraderAgentModule = AutonomousTraderAgentModule;
exports.AutonomousTraderAgentModule = AutonomousTraderAgentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            audit_module_1.AuditModule,
            trading_module_1.TradingModule,
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
            strategic_council_module_1.StrategicCouncilModule,
            portfolio_module_1.PortfolioModule,
        ],
        controllers: [agent_controller_1.AutonomousTraderPublicController, agent_controller_1.AutonomousTraderAgentController],
        providers: [
            market_analyzer_service_1.MarketAnalyzerService,
            adaptive_strategy_selector_service_1.AdaptiveStrategySelectorService,
            signal_evaluator_service_1.SignalEvaluatorService,
            risk_calculator_service_1.RiskCalculatorService,
            order_executor_service_1.OrderExecutorService,
            agent_service_1.AutonomousTraderAgentService,
        ],
        exports: [
            agent_service_1.AutonomousTraderAgentService,
            market_analyzer_service_1.MarketAnalyzerService,
            signal_evaluator_service_1.SignalEvaluatorService,
            adaptive_strategy_selector_service_1.AdaptiveStrategySelectorService,
            risk_calculator_service_1.RiskCalculatorService,
            order_executor_service_1.OrderExecutorService,
        ],
    })
], AutonomousTraderAgentModule);
//# sourceMappingURL=agent.module.js.map