// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Council Intelligence Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V185: كل ميزات تطوير مجلس الذكاء في موديول واحد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, forwardRef, Global } from '@nestjs/common';
import { CouncilIntelligenceController } from './council-intelligence.controller';
import { TradeJournalService } from './trade-journal.service';
import { CouncilVoteAccuracyService } from './council-vote-accuracy.service';
import { MarketRegimeService } from './market-regime.service';
import { CrossPairCorrelationService } from './cross-pair-correlation.service';
import { DynamicPositionSizingService } from './dynamic-position-sizing.service';
import { SystemMemoryService } from './system-memory.service';
import { AdaptiveScheduleService } from './adaptive-schedule.service';
import { SelfHealingService } from './self-healing.service';
import { BacktestingEngineService } from './backtesting-engine.service';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { RedisModule } from '../../../common/redis/redis.module';
import { AiModule } from '../ai.module';

/**
 * V267: @Global() — so the ADAPTIVE_SCHEDULE_SERVICE token can be injected
 * by StrategicCouncilService (in a different module) without an explicit
 * import chain that would create a circular dependency.
 */
@Global()
@Module({
  imports: [PrismaModule, RedisModule, forwardRef(() => AiModule)],
  controllers: [CouncilIntelligenceController],
  providers: [
    TradeJournalService,
    CouncilVoteAccuracyService,
    MarketRegimeService,
    CrossPairCorrelationService,
    DynamicPositionSizingService,
    SystemMemoryService,
    AdaptiveScheduleService,
    SelfHealingService,
    BacktestingEngineService,
    // V267: Expose AdaptiveScheduleService via a string token so other modules
    // (notably StrategicCouncilService) can @Optional() @Inject() it without
    // importing CouncilIntelligenceModule (avoids circular import).
    {
      provide: 'ADAPTIVE_SCHEDULE_SERVICE',
      useExisting: AdaptiveScheduleService,
    },
  ],
  exports: [
    TradeJournalService,
    CouncilVoteAccuracyService,
    MarketRegimeService,
    CrossPairCorrelationService,
    DynamicPositionSizingService,
    SystemMemoryService,
    AdaptiveScheduleService,
    SelfHealingService,
    BacktestingEngineService,
    // V267: Export the string token so @Global() makes it injectable anywhere.
    'ADAPTIVE_SCHEDULE_SERVICE',
  ],
})
export class CouncilIntelligenceModule {}
