import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MaintenanceController],
})
export class MaintenanceModule {}
