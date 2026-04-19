import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { AiModule } from './modules/ai/ai.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { SignalModule } from './modules/signal/signal.module';
import { TradingModule } from './modules/trading/trading.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './audit/audit.module';

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
    TradingModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
