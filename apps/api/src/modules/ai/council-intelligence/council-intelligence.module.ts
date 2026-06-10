// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Council Intelligence Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V185: كل ميزات تطوير مجلس الذكاء في موديول واحد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, forwardRef } from '@nestjs/common';
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
  ],
})
export class CouncilIntelligenceModule {}
