"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalModule = void 0;
const common_1 = require("@nestjs/common");
const signal_controller_1 = require("./signal.controller");
const signal_service_1 = require("./signal.service");
const exchange_module_1 = require("../exchange/exchange.module");
const ai_module_1 = require("../ai/ai.module");
const audit_module_1 = require("../../audit/audit.module");
const prediction_market_module_1 = require("../prediction-market/prediction-market.module");
const trading_module_1 = require("../trading/trading.module");
const notification_module_1 = require("../notification/notification.module");
let SignalModule = class SignalModule {
};
exports.SignalModule = SignalModule;
exports.SignalModule = SignalModule = __decorate([
    (0, common_1.Module)({
        imports: [
            exchange_module_1.ExchangeModule,
            ai_module_1.AiModule,
            audit_module_1.AuditModule,
            prediction_market_module_1.PredictionMarketModule,
            trading_module_1.TradingModule,
            notification_module_1.NotificationModule,
        ],
        controllers: [signal_controller_1.SignalController],
        providers: [signal_service_1.SignalService],
        exports: [signal_service_1.SignalService],
    })
], SignalModule);
//# sourceMappingURL=signal.module.js.map