import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MetricsSseController } from './metrics-sse.controller';
import { GuestCleanupService } from './guest-cleanup.service';
import { SystemMetricsService } from '../../common/middleware/system-metrics.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MaintenanceController, MetricsSseController],
  providers: [
    GuestCleanupService, // V169: Auto-cleanup of expired guest users
    SystemMetricsService, // #21: System metrics for SSE stream
  ],
})
export class MaintenanceModule {}
