import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
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
    // Uses REDIS_URL env var; falls back to localhost:6379 for local dev.
    // If REDIS_URL is not set, BullMQ workers will gracefully degrade
    // (queues won't process but the app still starts).
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        // Parse REDIS_URL into host/port/username/password for BullMQ
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port) || 6379,
            username: url.username || undefined,
            password: url.password || undefined,
            // BullMQ uses ioredis under the hood — reconnect on failure
            maxRetriesPerRequest: null,
          },
        };
      },
    }),

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
  ],
})
export class AppModule {}
