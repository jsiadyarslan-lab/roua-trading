"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../common/prisma/prisma.module");
const redis_module_1 = require("../../common/redis/redis.module");
const audit_module_1 = require("../../audit/audit.module");
const signal_module_1 = require("../signal/signal.module");
const analytics_module_1 = require("../analytics/analytics.module");
const trading_module_1 = require("../trading/trading.module");
const exchange_module_1 = require("../exchange/exchange.module");
const portfolio_module_1 = require("../portfolio/portfolio.module");
const market_scanner_service_1 = require("./services/market-scanner.service");
const position_monitor_service_1 = require("./services/position-monitor.service");
const market_broadcaster_service_1 = require("./services/market-broadcaster.service");
const engine_controller_1 = require("./engine.controller");
let EngineModule = class EngineModule {
};
exports.EngineModule = EngineModule;
exports.EngineModule = EngineModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            audit_module_1.AuditModule,
            signal_module_1.SignalModule,
            analytics_module_1.AnalyticsModule,
            trading_module_1.TradingModule,
            exchange_module_1.ExchangeModule,
            portfolio_module_1.PortfolioModule,
        ],
        controllers: [engine_controller_1.EngineController],
        providers: [
            market_scanner_service_1.MarketScannerService,
            position_monitor_service_1.PositionMonitorService,
            market_broadcaster_service_1.MarketBroadcasterService,
        ],
        exports: [
            market_scanner_service_1.MarketScannerService,
            position_monitor_service_1.PositionMonitorService,
            market_broadcaster_service_1.MarketBroadcasterService,
        ],
    })
], EngineModule);
//# sourceMappingURL=engine.module.js.map