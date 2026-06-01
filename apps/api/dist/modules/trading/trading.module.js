"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingModule = void 0;
const common_1 = require("@nestjs/common");
const trading_controller_1 = require("./trading.controller");
const trading_service_1 = require("./trading.service");
const risk_manager_service_1 = require("./risk-manager.service");
const prisma_module_1 = require("../../common/prisma/prisma.module");
const redis_module_1 = require("../../common/redis/redis.module");
const exchange_module_1 = require("../exchange/exchange.module");
const portfolio_module_1 = require("../portfolio/portfolio.module");
const analytics_module_1 = require("../analytics/analytics.module");
const audit_module_1 = require("../../audit/audit.module");
const notification_module_1 = require("../notification/notification.module");
const order_controller_1 = require("./controllers/order.controller");
const idempotency_service_1 = require("./services/idempotency.service");
const risk_gatekeeper_service_1 = require("./services/risk-gatekeeper.service");
const order_state_manager_service_1 = require("./services/order-state-manager.service");
const position_manager_service_1 = require("./services/position-manager.service");
const order_producer_service_1 = require("./services/order-producer.service");
const order_consumer_service_1 = require("./services/order-consumer.service");
const position_reconciliation_service_1 = require("./services/position-reconciliation.service");
const exchange_sync_service_1 = require("./services/exchange-sync.service");
const order_dispatcher_service_1 = require("./services/order-dispatcher.service");
const exposure_manager_service_1 = require("./services/exposure-manager.service");
let TradingModule = class TradingModule {
};
exports.TradingModule = TradingModule;
exports.TradingModule = TradingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            exchange_module_1.ExchangeModule,
            portfolio_module_1.PortfolioModule,
            analytics_module_1.AnalyticsModule,
            audit_module_1.AuditModule,
            notification_module_1.NotificationModule,
        ],
        controllers: [trading_controller_1.TradingController, order_controller_1.OrderController],
        providers: [
            trading_service_1.TradingService,
            risk_manager_service_1.RiskManagerService,
            idempotency_service_1.IdempotencyService,
            risk_gatekeeper_service_1.RiskGatekeeperService,
            order_state_manager_service_1.OrderStateManagerService,
            position_manager_service_1.PositionManagerService,
            order_producer_service_1.OrderProducerService,
            order_consumer_service_1.OrderConsumerService,
            position_reconciliation_service_1.PositionReconciliationService,
            exchange_sync_service_1.ExchangeSyncService,
            order_dispatcher_service_1.OrderDispatcherService,
            exposure_manager_service_1.ExposureManagerService,
        ],
        exports: [
            trading_service_1.TradingService,
            risk_manager_service_1.RiskManagerService,
            idempotency_service_1.IdempotencyService,
            risk_gatekeeper_service_1.RiskGatekeeperService,
            order_state_manager_service_1.OrderStateManagerService,
            position_manager_service_1.PositionManagerService,
            order_producer_service_1.OrderProducerService,
            order_consumer_service_1.OrderConsumerService,
            position_reconciliation_service_1.PositionReconciliationService,
            exchange_sync_service_1.ExchangeSyncService,
            order_dispatcher_service_1.OrderDispatcherService,
            exposure_manager_service_1.ExposureManagerService,
        ],
    })
], TradingModule);
//# sourceMappingURL=trading.module.js.map