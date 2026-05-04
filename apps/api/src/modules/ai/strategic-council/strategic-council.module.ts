// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, forwardRef } from '@nestjs/common';
import { StrategicCouncilService } from './strategic-council.service';
import { StrategicCouncilController } from './strategic-council.controller';
import { AiModule } from '../ai.module';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { RedisModule } from '../../../common/redis/redis.module';
import { AuditModule } from '../../../audit/audit.module';
import { ExchangeModule } from '../../exchange/exchange.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuditModule,
    ExchangeModule,
    forwardRef(() => AiModule),
  ],
  controllers: [StrategicCouncilController],
  providers: [StrategicCouncilService],
  exports: [StrategicCouncilService],
})
export class StrategicCouncilModule {}
