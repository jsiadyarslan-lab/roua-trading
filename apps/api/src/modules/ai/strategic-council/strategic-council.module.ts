// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StrategicCouncilService } from './strategic-council.service';
import { StrategicCouncilController } from './strategic-council.controller';
import { AiModule } from '../ai.module';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { RedisModule } from '../../../common/redis/redis.module';
import { AuditModule } from '../../../audit/audit.module';
import { ExchangeModule } from '../../exchange/exchange.module';
import { NewsModule } from '../../news/news.module';

// V223.1 FIX: @Global() — StrategicCouncilService.invalidateBriefsForSymbol
// must be reachable from EngineModule (position-monitor) and TradingModule
// (trading.service) without each consumer having to import this module.
// Previously @Optional() @Inject(forwardRef(...)) silently returned undefined
// in both consumers → brief cancellation never ran → flip-flop persisted.
@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    ExchangeModule,
    AiModule,
    NewsModule,
  ],
  controllers: [StrategicCouncilController],
  providers: [StrategicCouncilService],
  exports: [StrategicCouncilService],
})
export class StrategicCouncilModule {}
