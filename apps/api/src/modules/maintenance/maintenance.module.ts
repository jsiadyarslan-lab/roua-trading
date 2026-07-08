import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MetricsSseController } from './metrics-sse.controller';
import { IntegrityCheckController } from './integrity-check.controller';
import { GuestCleanupService } from './guest-cleanup.service';
import { DbCleanupService } from './db-cleanup.service'; // BUG-066r
import { SystemMetricsService } from '../../common/middleware/system-metrics.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MaintenanceController, MetricsSseController, IntegrityCheckController],
  providers: [
    GuestCleanupService, // V169: Auto-cleanup of expired guest users
    DbCleanupService, // BUG-066r: Auto-cleanup of old DB rows (RiskEvent, AuditLog, etc.)
    SystemMetricsService, // #21: System metrics for SSE stream
  ],
})
export class MaintenanceModule {}
