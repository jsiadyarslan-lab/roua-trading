import { Controller, Post, Get, Headers, UnauthorizedException, Logger, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/guards/auth.guard';

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
  @Public()
  @Get('db-audit')
  async dbAudit(
    @Headers('x-admin-token') adminToken: string,
  ) {
    const expectedToken = this.config.get('ADMIN_PASSWORD');
    // BUG-066s: Actually throw (old code had empty block — security bug)
    if (!adminToken || adminToken !== expectedToken) {
      throw new UnauthorizedException('Admin token required');
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

  @Public()
  @Post('cleanup-guests')
  async cleanupGuests(
    @Headers('x-admin-token') adminToken: string,
    @Query('batchSize') batchSize = '500',
    @Query('dryRun') dryRun = 'false',
    @Query('includeUnverified') includeUnverified = 'true',
  ) {
    // 1. Security Check
    const expectedToken = this.config.get('ADMIN_PASSWORD');
    if (!adminToken || adminToken !== expectedToken) {
      this.logger.warn(`🚫 Unauthorized cleanup attempt with token: ${adminToken}`);
      throw new UnauthorizedException('Admin token required');
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
   *
   * BUG-066s: Marked @Public() so the AuthGuard doesn't reject when DB
   * pool is exhausted (AuthGuard calls prisma.session.findUnique which
   * fails when pool is full). Security is enforced by X-Admin-Token
   * header check inside this handler.
   *
   * BUG-066s: Uses batched DELETE (5000 rows per batch) via raw SQL to
   * avoid long-running transactions that hold locks and exhaust the
   * connection pool. Each batch is a separate short transaction.
   */
  @Public()
  @Post('cleanup-db')
  async cleanupDb(
    @Headers('x-admin-token') adminToken: string,
    @Headers('cookie') cookieHeader: string,
  ) {
    const expectedToken = this.config.get('ADMIN_PASSWORD');
    const hasAdminSession = cookieHeader?.includes('roua_admin_session');
    // BUG-066s: Actually throw the exception (old code had empty block — security bug)
    if (adminToken !== expectedToken && !hasAdminSession) {
      this.logger.warn(`🚫 Unauthorized cleanup-db attempt`);
      throw new UnauthorizedException('Admin token required');
    }

    const results: any = { steps: [], deleted: 0, errors: [], batchSize: 5000 };

    // 18 tables with their retention periods
    const tables: { name: string; dateField: string; days: number }[] = [
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

    // Batched DELETE to avoid long transactions / lock contention
    // Each batch is 5000 rows, separate short transaction
    const BATCH_SIZE = 5000;
    const MAX_BATCHES_PER_TABLE = 200; // Safety cap: 200 × 5000 = 1,000,000 rows max per table

    for (const { name, dateField, days } of tables) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      let tableDeleted = 0;
      let batchCount = 0;
      let consecutiveErrors = 0;

      while (batchCount < MAX_BATCHES_PER_TABLE) {
        try {
          // Batched DELETE using ctid (PostgreSQL physical row id)
          // This avoids the need for a primary key and is very fast
          const result = await this.prisma.$executeRawUnsafe(`
            DELETE FROM "${name}"
            WHERE "ctid" IN (
              SELECT "ctid" FROM "${name}"
              WHERE "${dateField}" < $1
              LIMIT ${BATCH_SIZE}
            )
          `, cutoff);

          if (result === 0) break; // No more rows to delete
          tableDeleted += result;
          batchCount++;
          consecutiveErrors = 0; // Reset on success
        } catch (err: any) {
          consecutiveErrors++;
          // If table doesn't exist or column missing, skip after 1 error
          if (err?.message?.includes('does not exist') || err?.message?.includes('column')) {
            results.errors.push(`${name}: ${err.message.substring(0, 150)}`);
            break;
          }
          // For other errors, retry up to 3 times
          if (consecutiveErrors >= 3) {
            results.errors.push(`${name}: ${err.message.substring(0, 150)} (after 3 retries)`);
            break;
          }
          // Wait 500ms before retry
          await new Promise(r => setTimeout(r, 500));
        }
      }

      results.deleted += tableDeleted;
      if (tableDeleted > 0) {
        results.steps.push(`🗑️ ${name}: ${tableDeleted} rows deleted (${batchCount} batches)`);
        this.logger.log(`🧹 ${name}: ${tableDeleted} rows deleted (${batchCount} batches)`);
      }
    }

    // Run VACUUM (NOT VACUUM FULL — FULL locks the table and requires 2x space)
    // Plain VACUUM reclaims space for reuse without locking
    try {
      // VACUUM cannot run inside a transaction — use $executeRawUnsafe without transaction
      // Note: VACUUM is auto-run by autovacuum, but explicit VACUUM helps after large DELETEs
      // Skip VACUUM here to avoid any transaction issues — autovacuum will handle it
      results.steps.push('VACUUM skipped (autovacuum will reclaim space)');
    } catch (err: any) {
      results.errors.push(`VACUUM: ${err.message}`);
    }

    results.steps.push(`Total deleted: ${results.deleted} rows`);
    this.logger.log(`🧹 BUG-066s: DB cleanup complete — ${results.deleted} rows deleted`);

    return results;
  }
}
