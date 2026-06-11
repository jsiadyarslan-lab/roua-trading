import { Module } from '@nestjs/common';
import { CredentialsModule } from './credentials/credentials.module';
import { SanctuaryController } from './sanctuary/sanctuary.controller';
import { RedisModule } from '../../common/redis/redis.module';
import { SanctuaryService } from './sanctuary/sanctuary.service';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';
import { MT5StreamingModule } from './mt5-streaming/mt5-streaming.module';

@Module({
  imports: [
    RedisModule,
    CredentialsModule,
    ExchangeModule,
    AiModule,
    AuditModule,
    MT5StreamingModule,
  ],
  controllers: [SanctuaryController],
  providers: [SanctuaryService],
  exports: [SanctuaryService, CredentialsModule, MT5StreamingModule],
})
export class PortfolioModule {}
