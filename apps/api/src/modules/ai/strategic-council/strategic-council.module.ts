// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Strategic Council Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StrategicCouncilService } from './strategic-council.service';
import { StrategicCouncilController } from './strategic-council.controller';
import { AiModule } from '../ai.module';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { RedisModule } from '../../../common/redis/redis.module';
import { AuditModule } from '../../../audit/audit.module';
import { ExchangeModule } from '../../exchange/exchange.module';
import { NewsModule } from '../../news/news.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    ExchangeModule,
    forwardRef(() => AiModule),
    NewsModule,
  ],
  controllers: [StrategicCouncilController],
  providers: [StrategicCouncilService],
  exports: [StrategicCouncilService],
})
export class StrategicCouncilModule {}
