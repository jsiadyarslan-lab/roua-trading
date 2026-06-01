import { Module } from '@nestjs/common';
import { CredentialsModule } from './credentials/credentials.module';
import { SanctuaryController } from './sanctuary/sanctuary.controller';
import { RedisModule } from '../../common/redis/redis.module';
import { SanctuaryService } from './sanctuary/sanctuary.service';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [
    RedisModule,
    CredentialsModule,
    ExchangeModule,
    AiModule,
    AuditModule,
  ],
  controllers: [SanctuaryController],
  providers: [SanctuaryService],
  exports: [SanctuaryService, CredentialsModule],
})
export class PortfolioModule {}
