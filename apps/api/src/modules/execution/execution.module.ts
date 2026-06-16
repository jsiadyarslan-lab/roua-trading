// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Execution Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, Logger, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../../audit/audit.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PortfolioModule } from '../portfolio/portfolio.module';

// Execution Engine Components
import { ExecutionGatewayService } from './gateways/execution-gateway.service';
import { OrderLifecycleService } from './services/order-lifecycle.service';
import { ConnectionResilienceService } from './services/connection-resilience.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { OrderQueueProcessor } from './services/order-queue.processor';
import { AlgoExecutionService } from './services/algo-execution.service'; // V-PHASE4
import { OrderBookAnalysisService } from './services/orderbook-analysis.service'; // V-PHASE4

/**
 * ExecutionModule — Order Execution Engine
 *
 * CRITICAL FIX: BullMQ queue registration is now done via a Dynamic Module
 * pattern. The static `BullModule.registerQueue()` was crashing NestJS when
 * Redis was unavailable, taking down the entire module chain:
 *   ExecutionModule → TradingModule → SmartExecutorModule → API crash
 *
 * Now: If REDIS_URL is not configured, the queue is simply not registered.
 * The OrderQueueProcessor uses @Processor() which gracefully handles a
 * missing queue. The OrderController uses @Optional() @InjectQueue.
 */
@Module({
  imports: [
    // Infrastructure
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,

    // Data providers
    AnalyticsModule,
    PortfolioModule,
  ],
  providers: [
    // Core execution services
    ExecutionGatewayService,
    OrderLifecycleService,
    ConnectionResilienceService,
    RateLimiterService,
    // V-PHASE4: Advanced execution services
    AlgoExecutionService,
    OrderBookAnalysisService,
    // FIX: OrderQueueProcessor is REMOVED from providers when BullMQ is not
    // registered. The @Processor('execution_queue') decorator requires BullMQ
    // queue registration, which we removed to prevent Redis crashes.
    // Orders will execute directly via ExecutionGatewayService instead.
    // OrderQueueProcessor,  // ← uncomment when BullMQ is re-enabled
  ],
  exports: [
    // Export services needed by TradingModule
    ExecutionGatewayService,
    OrderLifecycleService,
    ConnectionResilienceService,
    RateLimiterService,
    // V-PHASE4: Advanced execution services
    AlgoExecutionService,
    OrderBookAnalysisService,
  ],
})
export class ExecutionModule {
  private readonly logger = new Logger(ExecutionModule.name);

  /**
   * Register BullMQ queue conditionally based on REDIS_URL availability.
   * This MUST be called as: ExecutionModule.registerBullQueue()
   * It returns a DynamicModule that includes the queue registration.
   */
  static registerBullQueue(): DynamicModule {
    return {
      module: ExecutionModuleBullQueue,
      imports: [
        BullModule.registerQueue({
          name: 'execution_queue',
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential' as const,
              delay: 5000,
            },
            removeOnComplete: {
              age: 3600,
              count: 1000,
            },
            removeOnFail: {
              age: 86400,
            },
          },
        }),
      ],
    };
  }
}

/**
 * Separate module for BullMQ queue registration.
 * Only imported by AppModule when REDIS_URL is configured.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'execution_queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential' as const,
          delay: 5000,
        },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    }),
  ],
})
class ExecutionModuleBullQueue {}
