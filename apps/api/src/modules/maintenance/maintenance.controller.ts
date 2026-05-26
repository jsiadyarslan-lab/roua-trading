import { Controller, Post, Headers, UnauthorizedException, Logger, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ConfigService } from '@nestjs/config';

@Controller('maintenance')
export class MaintenanceController {
  private readonly logger = new Logger(MaintenanceController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /api/maintenance/cleanup-guests
   * Safely removes abandoned guest/phantom accounts in batches.
   * Requires X-Admin-Token header matching ADMIN_TOKEN env var.
   *
   * ANTI-PHANTOM-USER FIX: Expanded to also clean up:
   * - user-*@rouatrading.com (chart-preference phantom users)
   * - Unverified users with no passkeyId and no OAuth accounts (abandoned registrations)
   * - Shared guest@roua.auto is EXCLUDED from deletion
   */
  @Post('cleanup-guests')
  async cleanupGuests(
    @Headers('x-admin-token') adminToken: string,
    @Query('batchSize') batchSize = '500',
    @Query('dryRun') dryRun = 'false',
    @Query('includeUnverified') includeUnverified = 'true',
  ) {
    // 1. Security Check
    const expectedToken = this.config.get('ADMIN_TOKEN') || 'roua-admin-secret-2026';
    if (!adminToken || adminToken !== expectedToken) {
      this.logger.warn(`🚫 Unauthorized cleanup attempt with token: ${adminToken}`);
      throw new UnauthorizedException('Invalid admin token');
    }

    const limit = parseInt(batchSize, 10) || 500;
    const isDryRun = dryRun === 'true';
    const shouldCleanUnverified = includeUnverified === 'true';

    this.logger.log(`🧹 Starting phantom user cleanup (batchSize: ${limit}, dryRun: ${isDryRun}, includeUnverified: ${shouldCleanUnverified})`);

    // 2. Find phantom/guest users
    // Categories:
    //   a) guest-{uuid}@roua.auto — created by proxy/guest route per-session
    //   b) user-{id}@rouatrading.com — created by chart-preference upsert
    //   c) anon-... — legacy anonymous accounts
    //   d) Unverified real emails: no passkeyId, no OAuth, no active sessions, older than 7 days
    // EXCLUDED: guest@roua.auto (the shared guest account we now use)
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    const phantomWhere: any = {
      AND: [
        {
          OR: [
            { email: { startsWith: 'guest-' } },    // guest-{uuid}@roua.auto
            { email: { startsWith: 'anon-' } },      // legacy anonymous
            { email: { startsWith: 'user-' } },       // chart-pref phantoms (user-{id}@rouatrading.com)
            { displayName: { startsWith: 'Guest' } },
          ],
        },
        { email: { not: 'guest@roua.auto' } }, // NEVER delete the shared guest user
        { updatedAt: { lt: cutoffDate } },
      ],
    };

    let guests = await this.prisma.user.findMany({
      where: phantomWhere,
      take: limit,
      select: { id: true, email: true },
    });

    // Also find unverified real-email users (no passkeyId, no OAuth, old)
    if (shouldCleanUnverified && guests.length < limit) {
      const unverifiedCutoff = new Date();
      unverifiedCutoff.setDate(unverifiedCutoff.getDate() - 7); // 7 days old

      const unverified = await this.prisma.user.findMany({
        where: {
          passkeyId: null,
          accounts: { none: {} },
          sessions: { every: { isActive: false } },
          createdAt: { lt: unverifiedCutoff },
          AND: [
            { email: { not: { startsWith: 'guest-' } } },
            { email: { not: { startsWith: 'user-' } } },
            { email: { not: 'guest@roua.auto' } },
          ],
        },
        take: limit - guests.length,
        select: { id: true, email: true },
      });

      guests = [...guests, ...unverified];
    }

    if (guests.length === 0) {
      return { success: true, message: 'No phantom users found', count: 0 };
    }

    if (isDryRun) {
      return {
        success: true,
        message: '[DRY RUN] Would delete these phantom users',
        count: guests.length,
        sample: guests.slice(0, 20).map(g => g.email),
      };
    }

    // 3. Batch delete related data and then the users
    let deletedCount = 0;
    const errors: string[] = [];

    for (const guest of guests) {
      try {
        // Use a transaction for each guest to ensure full cleanup
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
          this.prisma.user.delete({ where: { id: guest.id } }),
        ]);
        deletedCount++;
      } catch (err: any) {
        errors.push(`${guest.email}: ${err.message}`);
      }
    }

    // 4. Audit the operation
    await this.audit.log({
      action: 'SYSTEM_CLEANUP_PHANTOM_USERS',
      resource: 'maintenance',
      details: JSON.stringify({
        deletedCount,
        errorCount: errors.length,
        batchSize: limit,
        includeUnverified: shouldCleanUnverified,
      }),
    });

    this.logger.log(`✅ Phantom user cleanup complete: ${deletedCount} deleted, ${errors.length} errors`);

    return {
      success: true,
      deletedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    };
  }
}
