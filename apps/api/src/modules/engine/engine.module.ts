// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Live Engine Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// بنية جديدة: فصل البوت عن المجلس
// ─────────────────────────────────────
// البوت والمجلس أصبحا وحدتين مستقلتين:
//   - StrategicCouncilModule (modules/ai/strategic-council/)
//   - SmartExecutorModule   (modules/ai/smart-executor/)
//
// هذا الموديول يحتفظ فقط بخدمات البنية التحتية:
//   🔍 MarketScannerService  — مسح السوق كل 5 دقائق
//   🛡️ PositionMonitorService — مراقبة SL/TP كل 30 ثانية
//   📡 MarketBroadcasterService — بث الأسعار كل 45 ثانية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../../audit/audit.module';
import { SignalModule } from '../signal/signal.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TradingModule } from '../trading/trading.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { CouncilIntelligenceModule } from '../ai/council-intelligence/council-intelligence.module';

// Live Infrastructure Engines
import { MarketScannerService } from './services/market-scanner.service';
import { PositionMonitorService } from './services/position-monitor.service';
import { MarketBroadcasterService } from './services/market-broadcaster.service';
import { PartialTPService } from './services/partial-tp.service';
import { EngineController } from './engine.controller';

/**
 * Engine Module — البنية التحتية الحية لمنصة رؤى
 *
 * يحتوي فقط على خدمات البنية التحتية المشتركة:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ 🔍 MarketScannerService  — مسح السوق واكتشاف الفرص         │
 * │    @Cron كل 5 دقائق                                           │
 * │                                                                 │
 * │ 🛡️ PositionMonitorService — مراقبة SL/TP وتحديث الأرباح     │
 * │    @Interval كل 30 ثانية                                       │
 * │                                                                 │
 * │ 📡 MarketBroadcasterService — بث بيانات السوق المباشرة       │
 * │    @Interval كل 45 ثانية                                       │
 * └────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ TradingBotService و CouncilSchedulerService تم نقلهما إلى:
 *   - StrategicCouncilModule → يحل محل CouncilSchedulerService
 *   - SmartExecutorModule   → يحل محل TradingBotService
 */
@Module({
  imports: [
    // NOTE: ScheduleModule.forRoot() is already called in AppModule.
    // Do NOT call it again here — duplicate forRoot() corrupts the DI container
    // and prevents subsequent modules (SmartExecutor, StrategicCouncil, etc.)
    // from registering their controller routes.
    PrismaModule,
    RedisModule,
    AuditModule,
    SignalModule,
    AnalyticsModule,
    TradingModule,
    ExchangeModule,
    PortfolioModule,

    // V185: مجلس الذكاء — TradeJournal + SelfHealing لربط مراقب المراكز
    CouncilIntelligenceModule,
  ],
  controllers: [EngineController],
  providers: [
    MarketScannerService,
    PositionMonitorService,
    MarketBroadcasterService,
    PartialTPService,
  ],
  exports: [
    MarketScannerService,
    PositionMonitorService,
    MarketBroadcasterService,
    PartialTPService,
  ],
})
export class EngineModule {}
