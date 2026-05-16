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
   * Safely removes abandoned guest accounts in batches.
   * Requires X-Admin-Token header matching ADMIN_TOKEN env var.
   */
  @Post('cleanup-guests')
  async cleanupGuests(
    @Headers('x-admin-token') adminToken: string,
    @Query('batchSize') batchSize = '100',
    @Query('dryRun') dryRun = 'false',
  ) {
    // 1. Security Check
    const expectedToken = this.config.get('ADMIN_TOKEN') || 'roua-admin-secret-2026';
    if (!adminToken || adminToken !== expectedToken) {
      this.logger.warn(`🚫 Unauthorized cleanup attempt with token: ${adminToken}`);
      throw new UnauthorizedException('Invalid admin token');
    }

    const limit = parseInt(batchSize, 10) || 100;
    const isDryRun = dryRun === 'true';

    this.logger.log(`🧹 Starting guest cleanup (batchSize: ${limit}, dryRun: ${isDryRun})`);

    // 2. Find abandoned guest users
    // Guests are users with email like 'guest-...' or 'anon-...' 
    // that haven't been updated in 24 hours.
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    const guests = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { startsWith: 'guest-' } },
          { email: { startsWith: 'anon-' } },
          { displayName: { startsWith: 'Guest' } },
        ],
        updatedAt: { lt: cutoffDate },
      },
      take: limit,
      select: { id: true, email: true },
    });

    if (guests.length === 0) {
      return { success: true, message: 'No abandoned guests found', count: 0 };
    }

    if (isDryRun) {
      return {
        success: true,
        message: '[DRY RUN] Would delete these guests',
        count: guests.length,
        guests: guests.map(g => g.email),
      };
    }

    // 3. Batch delete related data and then the users
    let deletedCount = 0;
    const errors: string[] = [];

    for (const guest of guests) {
      try {
        // Use a transaction for each guest to ensure full cleanup
        await this.prisma.$transaction([
          // Delete sessions
          this.prisma.session.deleteMany({ where: { userId: guest.id } }),
          // Delete positions
          this.prisma.position.deleteMany({ where: { userId: guest.id } }),
          // Delete trades
          this.prisma.trade.deleteMany({ where: { userId: guest.id } }),
          // Delete credentials
          this.prisma.exchangeCredential.deleteMany({ where: { userId: guest.id } }),
          // Delete agent sessions
          this.prisma.agentSession.deleteMany({ where: { userId: guest.id } }),
          // Delete agent settings
          this.prisma.agentSettings.deleteMany({ where: { userId: guest.id } }),
          // Delete autonomous trades
          this.prisma.autonomousTrade.deleteMany({ where: { userId: guest.id } }),
          // Finally delete the user
          this.prisma.user.delete({ where: { id: guest.id } }),
        ]);
        deletedCount++;
      } catch (err: any) {
        errors.push(`${guest.email}: ${err.message}`);
      }
    }

    // 4. Audit the operation
    await this.audit.log({
      action: 'SYSTEM_CLEANUP_GUESTS',
      resource: 'maintenance',
      details: JSON.stringify({
        deletedCount,
        errorCount: errors.length,
        batchSize: limit,
      }),
    });

    this.logger.log(`✅ Cleanup complete: ${deletedCount} deleted, ${errors.length} errors`);

    return {
      success: true,
      deletedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // only return first 10 errors
    };
  }
}
