// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — اللاسع Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { LazicService } from './lazic.service';
import { LazicController } from './lazic.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { ExchangeModule } from '../../modules/exchange/exchange.module';
import { TradingModule } from '../../modules/trading/trading.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ExchangeModule,   // يوفر OandaStreamingService + BinanceStreamingService
    TradingModule,    // يوفر TradingService.placeOrder()
  ],
  controllers: [LazicController],
  providers: [LazicService],
  exports: [LazicService],
})
export class LazicModule {}
