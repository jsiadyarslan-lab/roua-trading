import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { GuestCleanupService } from './guest-cleanup.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MaintenanceController],
  providers: [GuestCleanupService], // V169: Auto-cleanup of expired guest users
})
export class MaintenanceModule {}
