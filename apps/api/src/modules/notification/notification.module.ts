import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';

/**
 * Notification Module — Real-time + Persisted Notifications
 *
 * Components:
 * - NotificationGateway: Socket.IO `/notifications` namespace for real-time push
 * - NotificationService: Business logic (create, read, preferences, auto-execute)
 * - NotificationController: REST API endpoints
 *
 * Integration:
 * - Imported by TradingModule for order/position notifications
 * - Imported by SignalModule for signal notifications
 * - Imported by AIModule for AI insight notifications
 */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [NotificationController],
  providers: [NotificationGateway, NotificationService],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
