import { Module } from '@nestjs/common';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { AuditModule } from '../../../audit/audit.module';
import { MT5StreamingModule } from '../mt5-streaming/mt5-streaming.module';

@Module({
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService],
  imports: [AuditModule, MT5StreamingModule],
})
export class CredentialsModule {}
