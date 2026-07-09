import { Controller, Post, Get, Headers, UnauthorizedException, Logger, Query } from '@nestjs/common';
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
   * Requires X-Admin-Token header matching ADMIN_PASSWORD env var.
   *
   * ANTI-PHANTOM-USER FIX: Expanded to also clean up:
   * - user-*@rouatrading.com (chart-preference phantom users)
   * - Unverified users with no passkeyId and no OAuth accounts (abandoned registrations)
   * - Shared guest@roua.auto is EXCLUDED from deletion
   */
  /**
   * GET /api/maintenance/db-audit
   * Audit database for missing closed positions.
   * Requires X-Admin-Token header matching ADMIN_PASSWORD env var.
   */
  @Get('db-audit')
  async dbAudit(
    @Headers('x-admin-token') adminToken: string,
  ) {
    const expectedToken = this.config.get('ADMIN_PASSWORD') || 'roua-admin-secret-2026';
    if (!adminToken || adminToken !== expectedToken) {
      throw new UnauthorizedException('Invalid admin token');
    }

    try {
      // 1. Total position counts by status
      const [total, open, closed, liquidated] = await Promise.all([
        this.prisma.position.count(),
        this.prisma.position.count({ where: { status: 'OPEN' } }),
        this.prisma.position.count({ where: { status: 'CLOSED' } }),
        this.prisma.position.count({ where: { status: 'LIQUIDATED' } }),
      ]);

      // 2. Positions by exchange
      const byExchange = await this.prisma.position.groupBy({
        by: ['exchange'],
        _count: { id: true },
        where: { status: { in: ['CLOSED', 'LIQUIDATED'] } },
      });

      // 3. Positions by source
      const bySource = await this.prisma.position.groupBy({
        by: ['source'],
        _count: { id: true },
        where: { status: { in: ['CLOSED', 'LIQUIDATED'] } },
      });

      // 4. Recent closed positions (last 20)
      const recentClosed = await this.prisma.position.findMany({
        where: { status: { in: ['CLOSED', 'LIQUIDATED'] } },
        orderBy: { closedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          symbol: true,
          side: true,
          source: true,
          exchange: true,
          openedAt: true,
          closedAt: true,
          closeReason: true,
          realizedPnl: true,
          credentialId: true,
          userId: true,
        },
      });

      // 5. Users with positions
      const usersWithPositions = await this.prisma.position.groupBy({
        by: ['userId'],
        _count: { id: true },
        _max: { closedAt: true },
      });

      // 6. Check if columns exist (timeframe, closeReason, version, source, exchangeSymbol)
      let columnCheck: any = {};
      try {
        const samplePosition = await this.prisma.position.findFirst({
          where: { status: { in: ['CLOSED', 'LIQUIDATED'] } },
        });
        if (samplePosition) {
          columnCheck = {
            hasTimeframe: 'timeframe' in samplePosition,
            hasCloseReason: 'closeReason' in samplePosition,
            hasVersion: 'version' in samplePosition,
            hasSource: 'source' in samplePosition,
            hasExchangeSymbol: 'exchangeSymbol' in samplePosition,
            timeframeValue: (samplePosition as any).timeframe,
            closeReasonValue: (samplePosition as any).closeReason,
            sourceValue: (samplePosition as any).source,
          };
        }
      } catch (e: any) {
        columnCheck = { error: e.message };
      }

      // 7. RLS check — try querying without user context
      let rlsCheck: any = {};
      try {
        await this.prisma.enableRlsBypass();
        const totalWithBypass = await this.prisma.position.count();
        const closedWithBypass = await this.prisma.position.count({ where: { status: 'CLOSED' } });
        await this.prisma.disableRlsBypass();
        rlsCheck = {
          totalWithBypass,
          closedWithBypass,
          bypassWorks: true,
        };
      } catch (e: any) {
        rlsCheck = { error: e.message };
      }

      // 8. All-time trade count
      const tradeCount = await this.prisma.trade.count();

      // 9. Credentials count
      const credentialCount = await this.prisma.exchangeCredential.count();
      const deletedCredentialIds: string[] = []; // Can't check without credential

      // 10. Check for positions with NULL credentialId (would mean credential was deleted)
      const orphanedPositions = await this.prisma.position.count({
        where: { credentialId: '' },
      });

      return {
        positionCounts: { total, open, closed, liquidated, tradeCount },
        closedByExchange: byExchange.map(e => ({ exchange: e.exchange || 'NULL', count: e._count.id })),
        closedBySource: bySource.map(s => ({ source: s.source || 'NULL', count: s._count.id })),
        recentClosed: recentClosed.map(p => ({
          ...p,
          realizedPnl: p.realizedPnl?.toNumber?.() ?? p.realizedPnl,
          userId: p.userId.slice(0, 8) + '...',
          credentialId: p.credentialId.slice(0, 8) + '...',
        })),
        usersWithPositions: usersWithPositions.map(u => ({
          userId: u.userId.slice(0, 8) + '...',
          positionCount: u._count.id,
          lastClosedAt: u._max.closedAt,
        })),
        columnCheck,
        rlsCheck,
        credentialCount,
        orphanedPositions,
      };
    } catch (error: any) {
      return { error: error.message, stack: error.stack?.substring(0, 500) };
    }
  }

  @Post('cleanup-guests')
  async cleanupGuests(
    @Headers('x-admin-token') adminToken: string,
    @Query('batchSize') batchSize = '500',
    @Query('dryRun') dryRun = 'false',
    @Query('includeUnverified') includeUnverified = 'true',
  ) {
    // 1. Security Check
    const expectedToken = this.config.get('ADMIN_PASSWORD') || 'roua-admin-secret-2026';
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

  /**
   * POST /api/maintenance/cleanup-db
   * Safe DB cleanup: deletes old rows from 18 non-essential tables.
   * Uses PrismaService (shared connection — no pool exhaustion).
   * Does NOT touch: User, Position, Trade, Order, AgentSettings, etc.
   */
  @Post('cleanup-db')
  async cleanupDb(
    @Headers('x-admin-token') adminToken: string,
    @Headers('cookie') cookieHeader: string,
  ) {
    const expectedToken = this.config.get('ADMIN_PASSWORD') || 'roua-admin-secret-2026';
    const hasAdminSession = cookieHeader?.includes('roua_admin_session');
    if (adminToken !== expectedToken && !hasAdminSession) {
      throw new UnauthorizedException('Invalid admin token');
    }

    const results: any = { steps: [], deleted: 0, errors: [] };

    const tables = [
      { name: 'RiskEvent', dateField: 'createdAt', days: 3 },
      { name: 'AuditLog', dateField: 'createdAt', days: 7 },
      { name: 'AiUsageLog', dateField: 'createdAt', days: 7 },
      { name: 'OrderEvent', dateField: 'timestamp', days: 14 },
      { name: 'TradeLifecycleLog', dateField: 'createdAt', days: 14 },
      { name: 'PositionReconciliation', dateField: 'createdAt', days: 14 },
      { name: 'MarketRegimeSnapshot', dateField: 'createdAt', days: 14 },
      { name: 'SystemMemory', dateField: 'createdAt', days: 14 },
      { name: 'CouncilVoteAccuracy', dateField: 'createdAt', days: 14 },
      { name: 'TradeJournal', dateField: 'createdAt', days: 30 },
      { name: 'CrossPairCorrelation', dateField: 'createdAt', days: 14 },
      { name: 'AdaptiveSchedule', dateField: 'createdAt', days: 14 },
      { name: 'NewsArticle', dateField: 'createdAt', days: 30 },
      { name: 'ContentArticle', dateField: 'createdAt', days: 30 },
      { name: 'ContentSchedule', dateField: 'createdAt', days: 14 },
      { name: 'StrategyReport', dateField: 'createdAt', days: 30 },
      { name: 'Alert', dateField: 'createdAt', days: 14 },
      { name: 'UserNotification', dateField: 'createdAt', days: 14 },
    ];

    for (const { name, dateField, days } of tables) {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const result = await this.prisma.$executeRawUnsafe(
          `DELETE FROM "${name}" WHERE "${dateField}" < $1`,
          cutoff.toISOString()
        );

        const deleted = result || 0;
        results.deleted += deleted;
        if (deleted > 0) {
          results.steps.push(`🗑️ ${name}: ${deleted} rows deleted (older than ${days} days)`);
          this.logger.log(`🧹 ${name}: ${deleted} rows deleted`);
        }
      } catch (err: any) {
        results.errors.push(`${name}: ${err.message}`);
      }
    }

    // VACUUM (safe — no table lock, no FULL)
    for (const { name } of tables) {
      try {
        await this.prisma.$executeRawUnsafe(`VACUUM "${name}"`);
      } catch {}
    }
    results.steps.push('VACUUM done ✅');
    results.steps.push(`Total deleted: ${results.deleted} rows`);

    return results;
  }
}
