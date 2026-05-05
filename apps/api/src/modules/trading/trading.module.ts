import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
import { RiskManagerService } from './risk-manager.service';
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
import { RiskGatekeeperService } from './services/risk-gatekeeper.service';
import { OrderStateManagerService } from './services/order-state-manager.service';
import { PositionManagerService } from './services/position-manager.service';
import { OrderProducerService } from './services/order-producer.service';
import { OrderConsumerService } from './services/order-consumer.service';
import { PositionReconciliationService } from './services/position-reconciliation.service';

/**
 * Trading Module — Complete Trading Engine
 *
 * Combines the original trading services with the new engine:
 *
 * Legacy Services:
 * - TradingService: Order placement with direct execution
 * - RiskManagerService: Basic risk checks
 * - TradingController: Original REST endpoints
 *
 * New Engine Services:
 * - OrderController: New order pipeline (idempotency → risk → queue)
 * - IdempotencyService: Duplicate order prevention (Redis)
 * - RiskGatekeeperService: 5-point pre-trade validation
 * - OrderStateManagerService: Order lifecycle + event sourcing
 * - PositionManagerService: Portfolio tracking with live P&L
 * - OrderProducerService: RabbitMQ order publisher
 * - OrderConsumerService: RabbitMQ order processor
 * - PositionReconciliationService: Background job to reconcile failed position updates
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

    // BullMQ queue for order execution (shared with ExecutionModule)
    BullModule.registerQueue({
      name: 'execution_queue',
    }),
  ],
  controllers: [TradingController, OrderController],
  providers: [
    // Legacy services
    TradingService,
    RiskManagerService,

    // New engine services
    IdempotencyService,
    RiskGatekeeperService,
    OrderStateManagerService,
    PositionManagerService,
    OrderProducerService,
    OrderConsumerService,
    PositionReconciliationService,
  ],
  exports: [
    TradingService,
    RiskManagerService,
    IdempotencyService,
    RiskGatekeeperService,
    OrderStateManagerService,
    PositionManagerService,
    OrderProducerService,
    OrderConsumerService,
    PositionReconciliationService,
  ],
})
export class TradingModule {}
