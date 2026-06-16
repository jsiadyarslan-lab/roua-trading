import { Module } from '@nestjs/common';
import { ExecutionModule } from '../execution/execution.module';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
// REMOVED: RiskManagerService — deprecated, replaced by UnifiedRiskService (V219)
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

// New Trading Engine Services
import { OrderController } from './controllers/order.controller';
import { IdempotencyService } from './services/idempotency.service';
// REMOVED: RiskGatekeeperService — deprecated, replaced by UnifiedRiskService (V219)
import { UnifiedRiskService } from './services/unified-risk.service';
import { OrderStateManagerService } from './services/order-state-manager.service';
import { PositionManagerService } from './services/position-manager.service';
import { OrderProducerService } from './services/order-producer.service';
import { OrderConsumerService } from './services/order-consumer.service';
import { PositionReconciliationService } from './services/position-reconciliation.service';
import { ExchangeSyncService } from './services/exchange-sync.service';

// ✅ NEW: Order Dispatcher — المنسق الوحيد لجميع الأوامر الآلية
import { OrderDispatcherService } from './services/order-dispatcher.service';

// ✅ NEW: Exposure Manager — مدير التعرض الموحد بين المنفذ الذكي والوكيل
import { ExposureManagerService } from './services/exposure-manager.service';

// ✅ #18: Trade Coordination Service — prevents duplicate positions across SmartExecutor and Agent
import { TradeCoordinationService } from './services/trade-coordination.service';

// ✅ #11: Distributed Lock Service — Redis-based distributed locking for trade operations
import { DistributedLockService } from './services/distributed-lock.service';

// ✅ #14: Agent Strategy Full Healing — safety valves for strategy decisions
import { SignalEvaluatorService } from './services/signal-evaluator.service';
import { AdaptiveStrategySelectorService } from './services/adaptive-strategy-selector.service';

// ✅ V218: Unified Portfolio Valuation — single source of truth for RiskManager + RiskCalculator
import { PortfolioValuationService } from './services/portfolio-valuation.service';

// ✅ V218: Price Validation — prevents recording trades with wrong prices
import { PriceValidationService } from './services/price-validation.service';

// ✅ V218: Risk Event Audit — every risk decision logged for audit trail
import { RiskEventAuditService } from './services/risk-event-audit.service';

// ✅ V219: Partial Fill Manager — handles partially filled orders from real exchanges
import { PartialFillManagerService } from './services/partial-fill-manager.service';

// ✅ V220: Stuck Order Detector — detects and resolves orders stuck in PENDING/ACCEPTED
import { StuckOrderDetectorService } from './services/stuck-order-detector.service';

// ✅ V220: External Circuit Breaker — protects against cascading external API failures
import { ExternalCircuitBreakerService } from './services/external-circuit-breaker.service';

/**
 * Trading Module — Complete Trading Engine
 *
 * Combines the original trading services with the new engine:
 *
 * Services:
 * - TradingService: Order placement with direct execution
 * - TradingController: Original REST endpoints
 * - UnifiedRiskService: V219 — ONE unified risk service (replaces RiskManager + RiskGatekeeper + RiskCalculator)
 *
 * New Engine Services:
 * - OrderController: New order pipeline (idempotency → risk → queue)
 * - IdempotencyService: Duplicate order prevention (Redis)
 * - UnifiedRiskService: V219 — ONE unified risk service replacing 3 conflicting ones
 * - OrderStateManagerService: Order lifecycle + event sourcing
 * - PositionManagerService: Portfolio tracking with live P&L
 * - OrderProducerService: RabbitMQ order publisher
 * - OrderConsumerService: RabbitMQ order processor
 * - PositionReconciliationService: Background job to reconcile failed position updates
 * - ExchangeSyncService: Exchange ↔ DB position reconciliation (detects exchange closures)
 * - OrderDispatcherService: ✅ NEW — الموزع المركزي لجميع الأوامر الآلية
 * - SignalEvaluatorService: ✅ #14 — Pre-risk signal quality assessment with strategy healing
 * - AdaptiveStrategySelectorService: ✅ #14 — Dynamic strategy allocation based on performance
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ExchangeModule,
    PortfolioModule,
    AnalyticsModule,
    AuditModule,
    NotificationModule,

    // V226: ExecutionModule provides ExecutionGatewayService which
    // TradingService now needs for MT5 order routing.
    // Also needed by OrderDispatcherService.
    // Without this import, NestJS can't resolve ExecutionGatewayService → crash.
    ExecutionModule,
  ],
  controllers: [TradingController, OrderController],
  providers: [
    // Core service
    TradingService,

    // New engine services
    IdempotencyService,
    UnifiedRiskService,  // V219: Unified risk service — ONE gate, ONE set of rules
    OrderStateManagerService,
    PositionManagerService,
    OrderProducerService,
    OrderConsumerService,
    PositionReconciliationService,
    ExchangeSyncService,

    // ✅ NEW: Order Dispatcher
    OrderDispatcherService,

    // ✅ NEW: Exposure Manager
    ExposureManagerService,

    // ✅ #18: Trade Coordination — prevents SmartExecutor and Agent conflicts
    TradeCoordinationService,

    // ✅ #14: Agent Strategy Full Healing — safety valves for strategy decisions
    SignalEvaluatorService,
    AdaptiveStrategySelectorService,

    // ✅ #11: Distributed Lock — Redis-based concurrent trade protection
    DistributedLockService,

    // ✅ V218: Unified Portfolio Valuation
    PortfolioValuationService,

    // ✅ V218: Price Validation
    PriceValidationService,

    // ✅ V218: Risk Event Audit
    RiskEventAuditService,

    // ✅ V219: Partial Fill Manager
    PartialFillManagerService,

    // ✅ V220: Stuck Order Detector
    StuckOrderDetectorService,

    // ✅ V220: External Circuit Breaker
    ExternalCircuitBreakerService,
  ],
  exports: [
    TradingService,
    IdempotencyService,
    UnifiedRiskService,  // V219: Export for SmartExecutor, Agent, etc.
    OrderStateManagerService,
    PositionManagerService,
    OrderProducerService,
    OrderConsumerService,
    PositionReconciliationService,
    ExchangeSyncService,

    // ✅ NEW: Export so SmartExecutor and AutonomousTrader can inject it
    OrderDispatcherService,

    // ✅ NEW: Export Exposure Manager for cross-system exposure tracking
    ExposureManagerService,

    // ✅ #18: Export Trade Coordination for SmartExecutor and Agent to use
    TradeCoordinationService,

    // ✅ #14: Export Strategy Healing services for Agent and SmartExecutor to use
    SignalEvaluatorService,
    AdaptiveStrategySelectorService,

    // ✅ #11: Export Distributed Lock for cross-service trade operation locking
    DistributedLockService,

    // ✅ V218: Export Portfolio Valuation for RiskCalculator and other services
    PortfolioValuationService,

    // ✅ V218: Export Price Validation for trading services
    PriceValidationService,

    // ✅ V218: Export Risk Event Audit for risk services
    RiskEventAuditService,

    // ✅ V219: Export Partial Fill Manager for trading services
    PartialFillManagerService,

    // ✅ V220: Export Stuck Order Detector for monitoring
    StuckOrderDetectorService,

    // ✅ V220: Export External Circuit Breaker for external API calls
    ExternalCircuitBreakerService,
  ],
})
export class TradingModule {}
