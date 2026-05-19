import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * V169: Automatic cleanup of expired guest users.
 *
 * Guest users (guest-*@roua.auto) are created per-session for data isolation.
 * This service periodically cleans up guest users whose sessions have ALL expired,
 * preventing DB bloat while maintaining per-user isolation.
 *
 * Runs every 6 hours. Only deletes guests older than 4 hours with no active sessions.
 */
@Injectable()
export class GuestCleanupService {
  private readonly logger = new Logger(GuestCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupExpiredGuests(): Promise<void> {
    try {
      if (!this.prisma.isAvailable()) {
        this.logger.debug('DB unavailable — skipping guest cleanup');
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 4); // Only clean guests older than 4 hours

      // Find guest users with no active sessions
      const expiredGuests = await this.prisma.user.findMany({
        where: {
          AND: [
            { email: { startsWith: 'guest-' } },
            { email: { endsWith: '@roua.auto' } },
          ],
          createdAt: { lt: cutoffDate },
          sessions: {
            every: {
              OR: [
                { isActive: false },
                { expiresAt: { lt: new Date() } },
              ],
            },
          },
        },
        take: 200, // Batch limit to avoid long transactions
        select: { id: true, email: true },
      });

      if (expiredGuests.length === 0) {
        this.logger.debug('No expired guest users to clean up');
        return;
      }

      this.logger.log(`🧹 Cleaning up ${expiredGuests.length} expired guest users`);

      let deletedCount = 0;
      for (const guest of expiredGuests) {
        try {
          await this.prisma.$transaction([
            this.prisma.session.deleteMany({ where: { userId: guest.id } }),
            this.prisma.portfolioAsset.deleteMany({ where: { portfolio: { userId: guest.id } } }),
            this.prisma.portfolio.deleteMany({ where: { userId: guest.id } }),
            this.prisma.position.deleteMany({ where: { userId: guest.id } }),
            this.prisma.trade.deleteMany({ where: { userId: guest.id } }),
            this.prisma.paperOrder.deleteMany({ where: { userId: guest.id } }),
            this.prisma.exchangeCredential.deleteMany({ where: { userId: guest.id } }),
            this.prisma.agentSession.deleteMany({ where: { userId: guest.id } }),
            this.prisma.agentSettings.deleteMany({ where: { userId: guest.id } }),
            this.prisma.autonomousTrade.deleteMany({ where: { userId: guest.id } }),
            this.prisma.signalUsage.deleteMany({ where: { userId: guest.id } }),
            this.prisma.signal.deleteMany({ where: { userId: guest.id } }),
            this.prisma.order.deleteMany({ where: { userId: guest.id } }),
            this.prisma.orderEvent.deleteMany({ where: { order: { userId: guest.id } } }),
            this.prisma.chartPreference.deleteMany({ where: { userId: guest.id } }),
            this.prisma.coachAdvice.deleteMany({ where: { userId: guest.id } }),
            this.prisma.tradingBot.deleteMany({ where: { userId: guest.id } }),
            this.prisma.apiKey.deleteMany({ where: { userId: guest.id } }),
            this.prisma.account.deleteMany({ where: { userId: guest.id } }),
            this.prisma.userNotification.deleteMany({ where: { userId: guest.id } }),
            this.prisma.alert.deleteMany({ where: { userId: guest.id } }),
            this.prisma.setting.deleteMany({ where: { key: { startsWith: `user:${guest.id}:` } } }),
            this.prisma.user.delete({ where: { id: guest.id } }),
          ]);
          deletedCount++;
        } catch (err: any) {
          // Skip this guest — might have been cleaned up already or has complex relations
          this.logger.debug(`Failed to delete guest ${guest.email}: ${err.message?.substring(0, 100)}`);
        }
      }

      this.logger.log(`🧹 Guest cleanup complete: ${deletedCount}/${expiredGuests.length} deleted`);
    } catch (error: any) {
      this.logger.warn(`Guest cleanup failed: ${error.message}`);
    }
  }
}
