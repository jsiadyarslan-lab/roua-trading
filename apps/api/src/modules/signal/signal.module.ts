import { Module } from '@nestjs/common';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [
    ExchangeModule,
    AiModule,
    AuditModule,
  ],
  controllers: [SignalController],
  providers: [SignalService],
  exports: [SignalService],
})
export class SignalModule {}
