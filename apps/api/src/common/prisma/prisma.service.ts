import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectInProgress = false;
  private connected = false;
  private consecutiveFailures = 0;
  private static _dbAvailable = false;
  private static _lastError: string | null = null;
  private static _dbUrlPrefix: string | null = null;
  static get dbAvailable(): boolean { return PrismaService._dbAvailable; }
  static get lastError(): string | null { return PrismaService._lastError; }
  static get dbUrlPrefix(): string | null { return PrismaService._dbUrlPrefix; }

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';

    // FIX v13: Add connection_limit=1 via URL params.
    // CRITICAL: Without connection_limit=1, Prisma opens 3-5 connections
    // per PrismaClient (2 clients = 6-10 connections), which exhausts
    // Railway's PostgreSQL max_connections.
    // We do NOT add pgbouncer=true or strip SSL.
    const dbUrl = (() => {
      try {
        const u = new URL(process.env.DATABASE_URL || '');
        u.searchParams.set('connection_limit', '1');
        u.searchParams.set('pool_timeout', '10');
        return u.toString();
      } catch {
        const base = process.env.DATABASE_URL || '';
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}connection_limit=1&pool_timeout=10`;
      }
    })();
    PrismaService._dbUrlPrefix = dbUrl.substring(0, 30) + '...';

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: [
        ...(isDev ? [{ emit: 'event' as const, level: 'query' as const }] : []),
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    // Log the effective connection mode
    let connectionMode = 'direct (no modifications)';
    this.logger.log(`📦 Prisma connection: ${connectionMode}`);

    if (isDev) {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query} — ${e.duration}ms`);
      });
    }
  }

  async onModuleInit() {
    const INIT_TIMEOUT_MS = 15_000;
    const connected = await Promise.race([
      this.tryConnect(),
      new Promise<boolean>((resolve) =>
        setTimeout(() => {
          this.logger.warn(`📦 Prisma $connect() timed out after ${INIT_TIMEOUT_MS / 1000}s — will retry in background`);
          resolve(false);
        }, INIT_TIMEOUT_MS),
      ),
    ]);

    if (!connected) {
      this.logger.warn(
        `📦 Prisma database unavailable at startup — API will continue and retry with exponential backoff`,
      );
      this.scheduleReconnect();
    } else {
      // ── Auto-migrate missing columns on startup ──
      // This ensures the database schema matches the Prisma schema even if
      // `prisma migrate deploy` failed or was skipped during deployment.
      await this.autoMigrateMissingColumns();

      // ── V222: Agent Position Protection at Database Level ──
      // This is the ULTIMATE defense — works regardless of which code path
      // calls prisma.position.update(). Even old compiled JS on Railway
      // that bypasses V214 in closePosition() will be blocked here.
      //
      // HOW: We use Prisma $extends to intercept ALL position.update() and
      // position.updateMany() calls. If the update sets status='CLOSED' for
      // an Agent position held < 48h (and closeReason is NOT SL/TP), we BLOCK it.
      this._applyAgentProtectionExtension();
    }
  }

  /**
   * V222: Agent Position Protection at Database Level
   *
   * This is the ULTIMATE defense against premature Agent position closes.
   * It intercepts ALL position.update() and position.updateMany() calls
   * at the Prisma level. If the update sets status='CLOSED' for an Agent
   * position held < 48h, AND the closeReason is NOT SL/TP, it BLOCKS the update.
   *
   * This works regardless of:
   * - Which code path calls the update (PositionMonitor, Agent, ExchangeSync, etc.)
   * - Whether old compiled JS is running on Railway (pre-V184/V213/V214)
   * - Direct prisma.position.update() calls that bypass TradingService
   *
   * The ONLY exceptions are SL/TP closes (valid trading exits).
   */
  private _applyAgentProtectionExtension(): void {
    const logger = this.logger;
    const H = 60 * 60 * 1000;
    const AGENT_MIN_HOLDING_HOURS = 48;
    const AGENT_MIN_HOLDING_MS = AGENT_MIN_HOLDING_HOURS * H;
    const self = this;

    try {
      this.$extends({
        name: 'V222_AgentProtection',
        query: {
          position: {
            async update({ args, query }) {
              const data = args.data as any;
              // Only intercept updates that set status to CLOSED
              const newStatus = typeof data?.status === 'string' ? data.status : data?.status?.set;
              if (newStatus === 'CLOSED') {
                const where = args.where as any;
                const positionId = where?.id;

                if (positionId) {
                  // Read the current position using the SAME PrismaClient (self)
                  try {
                    const current = await self.position.findUnique({ where: { id: positionId } });

                    if (current && current.source === 'agent' && current.openedAt) {
                      const holdingMs = Date.now() - new Date(current.openedAt).getTime();
                      const closeReason = String(data.closeReason || data.closeReason?.set || '').toUpperCase();
                      const isSLTP = closeReason.includes('STOP_LOSS') || closeReason.includes('TAKE_PROFIT');

                      if (holdingMs < AGENT_MIN_HOLDING_MS && !isSLTP) {
                        logger.error(
                          `🚨 V222 DB-LEVEL BLOCK: Agent position ${positionId} (${current.symbol}) ` +
                          `attempted close at ${(holdingMs / H).toFixed(1)}h (< ${AGENT_MIN_HOLDING_HOURS}h). ` +
                          `closeReason="${closeReason || 'EMPTY'}". ` +
                          `BLOCKED at Prisma level — position stays OPEN.`
                        );
                        // Return the current position without closing it
                        return current;
                      }
                    }
                  } catch (readErr: any) {
                    // If we can't read the position, log but don't block
                    logger.warn(`V222: Could not read position ${positionId} for protection check: ${readErr.message}`);
                  }
                }
              }
              return query(args);
            },
            async updateMany({ args, query }) {
              const data = args.data as any;
              if (data?.status === 'CLOSED') {
                logger.warn(
                  `🚨 V222: updateMany with status=CLOSED detected — this bypasses Agent protection. ` +
                  `Consider using individual update() calls instead.`
                );
              }
              return query(args);
            },
          },
        },
      });

      logger.log(`🛡️ V222: Agent Position Protection active — Agent positions < ${AGENT_MIN_HOLDING_HOURS}h are protected at DB level`);
    } catch (extendErr: any) {
      // $extends may not work in all Prisma versions — don't crash the app
      logger.warn(`V222: Could not apply Agent protection extension: ${extendErr.message} — relying on V214 code-level protection`);
    }
  }

  /**
   * Auto-migrate missing columns that are defined in the Prisma schema
   * but may not exist in the production database yet.
   *
   * Uses $executeRawUnsafe with IF NOT EXISTS — safe to run multiple times.
   * This is a safety net for when Railway migrations fail silently.
   */
  private async autoMigrateMissingColumns(): Promise<void> {
    const migrations: { table: string; column: string; sql: string }[] = [
      {
        table: 'Position',
        column: 'exitPrice',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exitPrice" Decimal(18,8)`,
      },
      {
        table: 'Position',
        column: 'closeReason',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "closeReason" TEXT`,
      },
      // V204: Position columns that may be missing if migration 20260612000000 wasn't applied
      {
        table: 'Position',
        column: 'timeframe',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "timeframe" TEXT`,
      },
      {
        table: 'Position',
        column: 'version',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0`,
      },
      {
        table: 'Position',
        column: 'exchangeSymbol',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exchangeSymbol" TEXT`,
      },
      {
        table: 'Position',
        column: 'source',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user_manual'`,
      },
      // V171: keyType column for ExchangeCredential — if this migration fails,
      // ALL credential queries throw "column keyType does not exist" → $0 balance
      {
        table: 'ExchangeCredential',
        column: 'keyType',
        sql: `ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "keyType" TEXT NOT NULL DEFAULT 'hmac'`,
      },
      // V208: credentialId column for Trade — if this migration fails,
      // ALL trade queries throw "column credentialId does not exist" → zero trades shown.
      // Prisma always includes ALL schema columns in SELECT, so even the V207
      // fallback (which removes credentialId from WHERE) still crashes because
      // the SELECT clause references the missing column.
      {
        table: 'Trade',
        column: 'credentialId',
        sql: `ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "credentialId" TEXT`,
      },
    ];

    for (const migration of migrations) {
      try {
        await this.$executeRawUnsafe(migration.sql);
        this.logger.log(`📦 Auto-migration: Added ${migration.table}.${migration.column}`);
      } catch (error: any) {
        // Column already exists — this is fine
        if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
          this.logger.log(`📦 Auto-migration: ${migration.table}.${migration.column} already exists ✅`);
        } else {
          this.logger.warn(`📦 Auto-migration failed for ${migration.table}.${migration.column}: ${error?.message?.substring(0, 200)}`);
        }
      }
    }

    // V208: Backfill Trade.credentialId from Position and Order for existing records
    // This runs AFTER the column is added (above) to populate it for existing data.
    try {
      // Step A: Backfill from Position (most reliable — credentialId is NOT NULL)
      const posResult = await this.$executeRawUnsafe(`
        UPDATE "Trade" t SET "credentialId" = p."credentialId"
        FROM "Position" p WHERE t."positionId" = p.id
        AND t."credentialId" IS NULL AND p."credentialId" IS NOT NULL
      `);
      this.logger.log(`📦 Auto-migration: Backfilled Trade.credentialId from Position (${posResult} rows)`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: Trade.credentialId backfill from Position failed: ${err?.message?.substring(0, 200)}`);
    }
    try {
      // Step B: Backfill from Order (for trades without Position link)
      const ordResult = await this.$executeRawUnsafe(`
        UPDATE "Trade" t SET "credentialId" = o."exchangeCredentialId"
        FROM "Order" o WHERE t."orderId" = o.id
        AND t."credentialId" IS NULL AND o."exchangeCredentialId" IS NOT NULL
      `);
      this.logger.log(`📦 Auto-migration: Backfilled Trade.credentialId from Order (${ordResult} rows)`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: Trade.credentialId backfill from Order failed: ${err?.message?.substring(0, 200)}`);
    }
    try {
      // Step C: Create indexes for efficient filtering
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Trade_credentialId_idx" ON "Trade"("credentialId")`);
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Trade_userId_credentialId_idx" ON "Trade"("userId", "credentialId")`);
      this.logger.log(`📦 Auto-migration: Trade.credentialId indexes created ✅`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: Trade.credentialId indexes failed: ${err?.message?.substring(0, 200)}`);
    }
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      await this.$disconnect();
      this.connected = false;
      PrismaService._dbAvailable = false;
      this.logger.log('📦 Prisma disconnected from database');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`📦 Prisma disconnect skipped: ${message}`);
    }
  }

  private async tryConnect(): Promise<boolean> {
    if (this.connectInProgress) {
      return this.connected;
    }

    this.connectInProgress = true;

    try {
      // FIX v11: Do NOT call $disconnect() on failure.
      await this.$connect();
      this.connected = true;
      this.consecutiveFailures = 0;
      PrismaService._dbAvailable = true;
      this.logger.log('📦 Prisma connected to database');
      return true;
    } catch (error: unknown) {
      this.connected = false;
      PrismaService._dbAvailable = false;
      this.consecutiveFailures++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      PrismaService._lastError = `[attempt ${this.consecutiveFailures}] ${message.substring(0, 300)}`;
      this.logger.error(`📦 Prisma connection failed (attempt ${this.consecutiveFailures}): ${message}`);
      return false;
    } finally {
      this.connectInProgress = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const baseDelay = 10_000; // FIX v13: Reduced from 60s to 10s for faster reconnection
    const delay = Math.min(baseDelay * Math.pow(2, Math.min(this.consecutiveFailures, 3)), 300_000);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      const connected = await this.tryConnect();
      if (!connected) {
        this.scheduleReconnect();
      }
    }, delay);
  }

  isAvailable(): boolean {
    return this.connected && PrismaService._dbAvailable;
  }

  getDiagnosticInfo(): { available: boolean; lastError: string | null; urlPrefix: string | null; failures: number } {
    return {
      available: this.connected && PrismaService._dbAvailable,
      lastError: PrismaService._lastError,
      urlPrefix: PrismaService._dbUrlPrefix,
      failures: this.consecutiveFailures,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RLS (Row Level Security) Support — Defense-in-Depth Layer 2
  // ═══════════════════════════════════════════════════════════════
  //
  // PostgreSQL RLS policies check current_setting('app.current_user_id')
  // to determine which rows a user can access. These methods set/reset
  // that session variable for the current database connection.
  //
  // V171 FIX: Reverted from SET LOCAL back to SET (session-scoped).
  //
  // WHY SET LOCAL BROKE EVERYTHING:
  //   V168 changed SET → SET LOCAL, intending that the RLS context
  //   auto-resets at transaction boundary. But with connection_limit=1,
  //   Prisma runs each $executeRawUnsafe in its own implicit transaction.
  //   So SET LOCAL sets the value, the implicit transaction commits
  //   immediately, and the value is RESET. The next query (findMany,
  //   findUnique, etc.) runs in a NEW transaction with NO RLS context.
  //   RLS policy: current_setting('app.current_user_id', true) = '' ≠ userId
  //   → ALL user-specific queries return 0 rows → balance = $0.00
  //
  // The fallback to SET (in the catch block) was NEVER reached because
  // SET LOCAL doesn't throw — it just has no lasting effect.
  //
  // Defense-in-depth for context leaking (the V168 concern):
  //   - UserIsolationInterceptor ALWAYS calls clearRlsUserId() in finalize
  //   - AuthGuard also sets RLS before UserIsolationInterceptor
  //   - With connection_limit=1, there's only 1 connection — no pool reuse
  //   - The session-scoped SET is safe as long as clearRlsUserId() runs
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set the current user ID for Row Level Security.
   * Called by AuthGuard and UserIsolationInterceptor before each request.
   *
   * V171 FIX: Use SET (session-scoped), NOT SET LOCAL.
   * SET LOCAL is broken with Prisma's connection_limit=1 because each
   * $executeRawUnsafe runs in its own implicit transaction, so the
   * SET LOCAL value is immediately lost when that transaction commits.
   *
   * Safety: clearRlsUserId() is called by UserIsolationInterceptor's
   * finalize handler after every request, preventing context leaking.
   */
  async setRlsUserId(userId: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      // Sanitize userId to prevent SQL injection (though it should be a UUID)
      const safeId = userId.replace(/'/g, "''");
      // V171: Use SET (session-scoped) — SET LOCAL doesn't work with
      // Prisma's implicit transactions + connection_limit=1
      await this.$executeRawUnsafe(`SET app.current_user_id = '${safeId}'`);
    } catch (error: any) {
      this.logger.warn(`RLS setRlsUserId failed: ${error?.message}`);
    }
  }

  /**
   * Clear the current user ID for Row Level Security.
   * Called after each request completes.
   *
   * V168 FIX: Added explicit logging when clear fails instead of
   * silently swallowing errors. A failed clear means the RLS context
   * leaks to the next request on the same connection.
   */
  async clearRlsUserId(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.$executeRawUnsafe(`RESET app.current_user_id`);
    } catch (error: any) {
      // V168: Log the error instead of silently ignoring it.
      // A leaked RLS context is a security issue — we need to know about it.
      this.logger.warn(`RLS clearRlsUserId FAILED — RLS context may leak: ${error?.message || 'unknown'}`);
    }
  }

  /**
   * Enable RLS bypass mode for background services.
   * Background services (Position Monitor, Smart Executor) need to
   * query across ALL users, so they bypass RLS.
   */
  async enableRlsBypass(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.$executeRawUnsafe(`SET app.rls_bypass = 'true'`);
    } catch {
      // Non-critical
    }
  }

  /**
   * Disable RLS bypass mode.
   */
  async disableRlsBypass(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.$executeRawUnsafe(`RESET app.rls_bypass`);
    } catch {
      // Non-critical
    }
  }

  /**
   * Run a function with RLS set for a specific user.
   * Automatically sets and clears the RLS context.
   * Use in background services that process data for a specific user.
   */
  async withRlsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await this.setRlsUserId(userId);
    try {
      return await fn();
    } finally {
      await this.clearRlsUserId();
    }
  }

  /**
   * Run a function with RLS bypass enabled.
   * Use in background services that need to query across ALL users.
   */
  async withRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
    await this.enableRlsBypass();
    try {
      return await fn();
    } finally {
      await this.disableRlsBypass();
    }
  }
}
