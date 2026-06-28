import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
// V271: Feature Flags
import { FeatureFlagModule } from './common/feature-flags/feature-flag.module';
// V339: Trade Lifecycle Logger — Single Source of Truth for trade events
import { TradeLifecycleModule } from './common/trade-lifecycle/trade-lifecycle.module';
// V341: Position State Machine — single decision point for position lifecycle
import { StateMachineModule } from './common/state-machine/state-machine.module';
// RC-8: Custom ThrottlerGuard per-user (يفعّل @Throttle decorators التي كانت معطّلة)
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
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
import { CouncilIntelligenceModule } from './modules/ai/council-intelligence/council-intelligence.module';
// V458: Assistant Module — مساعد ذكي متعدد اللغات (32 لغة)
// Phase 1: Context Engine — يجمع 6 طبقات سياق (صفقات + مجلس + تعلم + سوق + أخبار + صحة)
import { AssistantModule } from './modules/assistant/assistant.module';
import { UserIsolationInterceptor } from './common/interceptors/user-isolation.interceptor';
import { PrismaService } from './common/prisma/prisma.service';

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
  providers: [
    // ═══════════════════════════════════════════════════════════════
    // V168 CRITICAL FIX: Register UserIsolationInterceptor globally.
    //
    // ROOT CAUSE: This interceptor was defined but NEVER registered,
    // which meant PostgreSQL RLS context (SET app.current_user_id)
    // was ONLY set during AuthGuard DB lookups — NOT for cached
    // sessions from Redis. With Prisma's connection pool, a connection
    // that had User A's RLS context could be reused for User B's
    // request (when served from cache), causing User B to see
    // User A's data (the "$12,342.85 shared balance" bug).
    //
    // Now: Every authenticated request goes through this interceptor,
    // which sets the RLS context before the handler runs and clears
    // it after the request completes. This is defense-in-depth Layer 2.
    // ═══════════════════════════════════════════════════════════════
    {
      provide: APP_INTERCEPTOR,
      useClass: UserIsolationInterceptor,
    },
    // RC-8 REMOVED: UserThrottlerGuard كـ APP_GUARD كان يكسر الـ dashboard بالكامل
    // (429 Too Many Requests على كل endpoints لأن dashboard يرسل 10+ طلبات متوازية)
    // الحل الصحيح: تطبيق throttle فقط على assistant endpoints عبر @UseGuards
    // وليس عالمياً. سيتم إضافته بشكل targeted لاحقاً.
  ],
  imports: [
    // ── Configuration ──
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // V271: Feature Flags — كل إصلاح قابل للتعطيل بـ env var
    FeatureFlagModule,

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
    TradeLifecycleModule, // V339: Global trade lifecycle logging
    StateMachineModule,   // V341: Position State Machine

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
    CouncilIntelligenceModule, // V185: حلقة التعلم + كشف وضع السوق + الارتباط + الحجم الذكي + الذاكرة + الجدول الذكي + الشفاء الذاتي + Backtesting
    AssistantModule,           // V458: مساعد ذكي — Phase 1: Context Engine
  ],
})
export class AppModule {}
