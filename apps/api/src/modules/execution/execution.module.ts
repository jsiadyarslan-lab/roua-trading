// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Execution Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    // BullMQ queue for async order execution
    BullModule.registerQueue({
      name: 'execution_queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 25s, 125s
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000,
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
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
export class ExecutionModule {}
