import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RecoveryController } from './recovery.controller';
import { AuthService } from './auth.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AuthController, RecoveryController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
