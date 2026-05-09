import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
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

    // ── BullMQ (order execution queue) ──
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        if (!redisUrl) {
          return { connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null } };
        }
        try {
          const url = new URL(redisUrl);
          return {
            connection: {
              host: url.hostname,
              port: parseInt(url.port) || 6379,
              username: url.username || undefined,
              password: url.password || undefined,
              maxRetriesPerRequest: null,
            },
          };
        } catch {
          return { connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null } };
        }
      },
    }),

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
