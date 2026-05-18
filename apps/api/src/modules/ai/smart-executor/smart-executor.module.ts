// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Smart Executor Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// بنية جديدة: المنفذ الذكي يحل محل TradingBotService القديم
// يعتمد على:
//   - StrategicCouncilModule → لقراءة TradingBriefs
//   - TradingModule → لتنفيذ الأوامر عبر TradingService
//   - ExchangeModule → لجلب الأسعار الحالية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module, forwardRef } from '@nestjs/common';
import { SmartExecutorService } from './smart-executor.service';
import { SmartExecutorController } from './smart-executor.controller';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { RedisModule } from '../../../common/redis/redis.module';
import { AuditModule } from '../../../audit/audit.module';
import { ExchangeModule } from '../../exchange/exchange.module';
import { TradingModule } from '../../trading/trading.module';
import { StrategicCouncilModule } from '../strategic-council/strategic-council.module';
import { NotificationModule } from '../../notification/notification.module';
import { AiModule } from '../ai.module';
import { NewsModule } from '../../news/news.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuditModule,
    ExchangeModule,
    TradingModule,
    forwardRef(() => StrategicCouncilModule),
    forwardRef(() => AiModule),
    NotificationModule,
    NewsModule,
  ],
  controllers: [SmartExecutorController],
  providers: [SmartExecutorService],
  exports: [SmartExecutorService],
})
export class SmartExecutorModule {}
