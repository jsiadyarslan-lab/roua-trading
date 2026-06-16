// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — EA Bridge Module
// وحدة جسر الاتصال بين EA (MT5) والكلاود
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Module } from '@nestjs/common';
import { EABridgeController } from './ea-bridge.controller';
import { EABridgeService } from './ea-bridge.service';
import { EABridgeGuard } from './ea-bridge.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuditModule,
  ],
  controllers: [EABridgeController],
  providers: [EABridgeService, EABridgeGuard],
  exports: [EABridgeService],
})
export class EABridgeModule {}
