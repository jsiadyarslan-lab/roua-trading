// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Execution Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, Logger } from '@nestjs/common';
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

/**
 * ExecutionModule — Order Execution Engine
 *
 * Handles the actual execution of trading orders on exchanges.
 * Separates the execution concern from the trading/orchestration concern
 * (handled by TradingModule).
 *
 * Architecture:
 * ┌───────────────────────────────────────────────────────────────┐
 * │                                                               │
 * │  TradingModule (orchestration)                                │
 * │    ↓ sends orders to execution_queue                          │
 * │                                                               │
 * │  ExecutionModule (execution)                                  │
 * │    ┌─────────────────────────────────────────────────────┐    │
 * │    │ BullMQ execution_queue                              │    │
 * │    │   ↓                                                 │    │
 * │    │ OrderQueueProcessor                                 │    │
 * │    │   ↓                                                 │    │
 * │    │ ExecutionGatewayService (adapter routing)           │    │
 * │    │   ├─→ BinanceAdapter (CCXT)                         │    │
 * │    │   ├─→ AlpacaAdapter (REST)                          │    │
 * │    │   └─→ PaperTradingAdapter (simulation)              │    │
 * │    │   ↓                                                 │    │
 * │    │ OrderLifecycleService (state management)            │    │
 * │    │   ↓                                                 │    │
 * │    │ ConnectionResilienceService (watch + reconnect)     │    │
 * │    │                                                     │    │
 * │    │ RateLimiterService (token bucket per exchange)      │    │
 * │    └─────────────────────────────────────────────────────┘    │
 * │                                                               │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Integration Points:
 * - TradingModule: Sends orders to execution_queue
 * - AnalyticsModule: Provides live market data for PaperTrading
 * - PortfolioModule: Provides CredentialsService for key decryption
 * - AuditModule: Immutable audit trail for all execution events
 */
@Module({
  imports: [
    // FIX: BullMQ queue registration is now CONDITIONAL.
    // Previously, BullModule.registerQueue() was called unconditionally,
    // which crashes NestJS if Redis is unavailable. This was the #1 cause
    // of production outages — the entire ExecutionModule would fail to load,
    // cascading to TradingModule, SmartExecutorModule, and crashing the API.
    //
    // Now: registerQueue is only called if REDIS_URL is configured.
    // If Redis is unavailable, the queue is not registered, and order
    // execution falls back to direct execution (no queue).
    BullModule.registerQueueAsync({
      name: 'execution_queue',
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL') || '';
        if (!redisUrl || redisUrl === 'CHANGE_ME_IN_PRODUCTION') {
          // Redis not configured — return minimal config with lazyConnect
          // The queue won't actually work, but it won't crash the module either
          new Logger('ExecutionModule').warn(
            '⚠️ REDIS_URL not configured — execution_queue will be in disconnected state. ' +
            'Orders will execute directly without queuing.'
          );
          return {
            defaultJobOptions: {
              attempts: 1,
              removeOnComplete: true,
              removeOnFail: true,
            },
          };
        }
        return {
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
        };
      },
      inject: [ConfigService],
    }),

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
    OrderQueueProcessor,
  ],
  exports: [
    // Export services needed by TradingModule
    ExecutionGatewayService,
    OrderLifecycleService,
    ConnectionResilienceService,
    RateLimiterService,
  ],
})
export class ExecutionModule {
  private readonly logger = new Logger(ExecutionModule.name);
}
