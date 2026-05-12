import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { AiModule } from './modules/ai/ai.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { SignalModule } from './modules/signal/signal.module';
import { TradingModule } from './modules/trading/trading.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { EngineModule } from './modules/engine/engine.module';
import { NeuralModule } from './modules/neural/neural.module';
import { NewsModule } from './modules/news/news.module';
import { AuditModule } from './audit/audit.module';
import { CoachModule } from './modules/coach/coach.module';
import { ScannerModule } from './modules/scanner/scanner.module';
import { PredictionMarketModule } from './modules/prediction-market/prediction-market.module';
import { AutonomousTraderAgentModule } from './agents/autonomous-trader/agent.module';
import { ContentAgentModule } from './agents/content/content-agent.module';
import { StrategicCouncilModule } from './modules/ai/strategic-council/strategic-council.module';
import { SmartExecutorModule } from './modules/ai/smart-executor/smart-executor.module';
import { NotificationModule } from './modules/notification/notification.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

/**
 * FIX: BullModule has been COMPLETELY REMOVED from AppModule.
 *
 * Previously, BullModule.forRootAsync() was registered here, which would
 * try to connect to Redis during NestJS bootstrap. Even with lazyConnect,
 * the BullMQ connection could fail and crash the entire application.
 *
 * Now: BullMQ is NOT registered at the root level. The ExecutionModule
 * no longer imports BullModule.registerQueue either. All order execution
 * falls back to direct execution (no queue). This eliminates the Redis
 * dependency that was causing the entire API to crash.
 *
 * If BullMQ is needed later, it can be conditionally registered via
 * ExecutionModule.registerBullQueue() when REDIS_URL is confirmed available.
 */
@Module({
  imports: [
    // ── Configuration ──
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // ── Rate Limiting ──
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // ── Scheduling (required for @Cron decorators in agents) ──
    ScheduleModule.forRoot(),

    // ── Infrastructure ──
    PrismaModule,
    RedisModule,

    // ── Application Modules ──
    AuditModule,
    AuthModule,
    ExchangeModule,
    AiModule,
    PortfolioModule,
    SignalModule,
    AnalyticsModule,
    TradingModule,
    ExecutionModule,
    EngineModule,
    NeuralModule,
    NewsModule,
    CoachModule,
    ScannerModule,
    PredictionMarketModule,
    AutonomousTraderAgentModule,
    ContentAgentModule,
    StrategicCouncilModule,
    SmartExecutorModule,
    NotificationModule,
    IntegrationModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
