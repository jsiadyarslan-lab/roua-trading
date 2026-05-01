// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Live Engine Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../../audit/audit.module';
import { SignalModule } from '../signal/signal.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TradingModule } from '../trading/trading.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { PortfolioModule } from '../portfolio/portfolio.module';

// Live Engines
import { MarketScannerService } from './services/market-scanner.service';
import { TradingBotService } from './services/trading-bot.service';
import { CouncilSchedulerService } from './services/council-scheduler.service';
import { PositionMonitorService } from './services/position-monitor.service';
import { MarketBroadcasterService } from './services/market-broadcaster.service';
import { EngineController } from './engine.controller';

/**
 * Engine Module — The Heartbeat of Roua Trading
 *
 * This module contains all the LIVE, SCHEDULED, and BACKGROUND engines
 * that make the platform autonomous and intelligent.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │ 🔍 MarketScannerService  — Scans market for opportunities      │
 * │    @Cron every 5 minutes                                        │
 * │                                                                 │
 * │ 🤖 TradingBotService     — Auto-executes high-confidence       │
 * │    signals                                                    │
 * │    @Cron every 2 minutes                                        │
 * │                                                                 │
 * │ 🏛️ CouncilSchedulerService — Runs AI Council consensus         │
 * │    on top symbols                                               │
 * │    @Cron every 15 minutes                                       │
 * │                                                                 │
 * │ 🛡️ PositionMonitorService — Monitors SL/TP, triggers exits    │
 * │    @Interval every 30 seconds                                   │
 * │                                                                 │
 * │ 📡 MarketBroadcasterService — Streams live data via WebSocket  │
 * │    @Interval every 5 seconds                                    │
 * └────────────────────────────────────────────────────────────────┘
 *
 * These services transform Roua from a "request-only" platform
 * into a truly autonomous trading intelligence system.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuditModule,
    SignalModule,
    AnalyticsModule,
    TradingModule,
    ExchangeModule,
    AiModule,
    PortfolioModule,
  ],
  controllers: [EngineController],
  providers: [
    MarketScannerService,
    TradingBotService,
    CouncilSchedulerService,
    PositionMonitorService,
    MarketBroadcasterService,
  ],
  exports: [
    MarketScannerService,
    TradingBotService,
    CouncilSchedulerService,
    PositionMonitorService,
    MarketBroadcasterService,
  ],
})
export class EngineModule {}
