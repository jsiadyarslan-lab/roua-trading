import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectInProgress = false;
  private connected = false;
  private consecutiveFailures = 0;

  // V230: REMOVED V222 Prisma extension entirely.
  // The V222 extension was the ROOT CAUSE of 500 errors on ALL trading endpoints.
  // It intercepted position.update()/updateMany() at the Prisma level, but:
  //   1) Connection pool deadlocks: _basePositionFindUnique() needed a separate
  //      DB connection during $transaction, exhausting the pool → timeout → 500
  //   2) Object.defineProperty override of `position` getter was fragile
  //   3) $transaction override caused unexpected behavior
  //   4) Even with connection_limit=3 and try-catch (V229), intermittent 500s persisted
  //
  // V214 in TradingService.closePosition() and forceClosePosition() provides
  // the SAME protection (blocking premature Agent closes <48h) at the service
  // level — which is reliable, testable, and doesn't cause connection issues.
  //
  // V214 allows: USER closes, SL/TP closes, and closes after 48h
  // V214 blocks: SYSTEM-originated non-SL/TP closes of Agent positions <48h
  // This covers ALL known code paths (PositionMonitor, manual close, etc.)

  private static _dbAvailable = false;
  private static _lastError: string | null = null;
  private static _dbUrlPrefix: string | null = null;
  static get dbAvailable(): boolean { return PrismaService._dbAvailable; }
  static get lastError(): string | null { return PrismaService._lastError; }
  static get dbUrlPrefix(): string | null { return PrismaService._dbUrlPrefix; }

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';

    // FIX v13: Add connection_limit via URL params.
    // V230: connection_limit=3 for reliability (prevents pool exhaustion
    // under concurrent requests). V222 extension is removed so no deadlock risk.
    const dbUrl = (() => {
      try {
        const u = new URL(process.env.DATABASE_URL || '');
        u.searchParams.set('connection_limit', '3');
        u.searchParams.set('pool_timeout', '10');
        return u.toString();
      } catch {
        const base = process.env.DATABASE_URL || '';
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}connection_limit=3&pool_timeout=10`;
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
    }

    // V230: Log initialization status — no V222 extension to report
    this.logger.log(
      `📦 PrismaService initialized: connected=${connected}, ` +
      `agentProtection=V214_SERVICE_LEVEL, ` +
      `connection_limit=3`
    );
  }

  // V222 FIX: Expose protection status for monitoring/diagnostics
  // V230: V222 extension removed — protection is now V214 (service-level) only
  get agentProtectionActive(): boolean { return false; } // V222 removed

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
      // اللاسع (Lasic scalper) — lazicEnabled on AgentSettings.
      // Migration 20260701000000_add_lazic_enabled may have failed silently on
      // production (blocked by a stuck migration in _prisma_migrations table).
      // Without this safety-net, EVERY agentSettings.findUnique() throws
      // "column lazicEnabled does not exist" → 503 on /api/agent/trader/settings.
      {
        table: 'AgentSettings',
        column: 'lazicEnabled',
        sql: `ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicEnabled" BOOLEAN NOT NULL DEFAULT false`,
      },
    ];

    // V229: Auto-create tables that may be missing. If `prisma migrate deploy`
    // was skipped, entire tables might not exist, causing "relation does not exist"
    // errors that crash entire modules (e.g., RiskEventAuditService → TradingModule).
    const tableMigrations: { table: string; sql: string }[] = [
      {
        table: 'RiskEvent',
        sql: `CREATE TABLE IF NOT EXISTS "RiskEvent" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "severity" TEXT NOT NULL DEFAULT 'info',
          "message" TEXT,
          "metadata" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
        )`,
      },
    ];

    for (const migration of tableMigrations) {
      try {
        await this.$executeRawUnsafe(migration.sql);
        this.logger.log(`📦 Auto-migration: Table ${migration.table} created or already exists ✅`);
      } catch (error: any) {
        this.logger.warn(`📦 Auto-migration: Table ${migration.table} creation failed: ${error?.message?.substring(0, 200)}`);
      }
    }

    // V229: Create indexes for RiskEvent if they don't exist
    try {
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskEvent_userId_idx" ON "RiskEvent"("userId")`);
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt")`);
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskEvent_userId_createdAt_idx" ON "RiskEvent"("userId", "createdAt")`);
      this.logger.log(`📦 Auto-migration: RiskEvent indexes created ✅`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: RiskEvent indexes failed: ${err?.message?.substring(0, 200)}`);
    }

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

    const delay = Math.min(
      30_000 * Math.pow(2, this.consecutiveFailures),
      300_000, // Max 5 minutes
    );

    this.logger.warn(
      `📦 Prisma scheduling reconnect in ${delay / 1000}s (attempt ${this.consecutiveFailures + 1})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const connected = await this.tryConnect();
      if (connected) {
        await this.autoMigrateMissingColumns();
      } else {
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * FIX v11: Execute raw query with connection retry.
   * If the database connection is down, try to reconnect once before failing.
   */
  async safeExecuteRawUnsafe(query: string): Promise<number> {
    if (!this.connected) {
      const reconnected = await this.tryConnect();
      if (!reconnected) {
        throw new Error('Database connection unavailable');
      }
    }
    return this.$executeRawUnsafe(query);
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
  // V171 FIX: Use SET (session-scoped), NOT SET LOCAL.
  // SET LOCAL is broken with Prisma's connection pooling because each
  // $executeRawUnsafe can run on a different connection, so the
  // SET LOCAL value may not apply to subsequent queries.
  //
  // Safety: clearRlsUserId() is called by UserIsolationInterceptor's
  // finalize handler after every request, preventing context leaking.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set the current user ID for Row Level Security.
   * Called by AuthGuard and UserIsolationInterceptor before each request.
   */
  async setRlsUserId(userId: string | null): Promise<void> {
    if (!userId) return;
    if (!this.isAvailable()) return;
    try {
      // Sanitize userId to prevent SQL injection (though it should be a UUID)
      const safeId = userId.replace(/'/g, "''");
      await this.$executeRawUnsafe(`SET app.current_user_id = '${safeId}'`);
    } catch (error: any) {
      this.logger.warn(`RLS setRlsUserId failed: ${error?.message}`);
    }
  }

  /**
   * Clear the current user ID for Row Level Security.
   * Called after each request completes.
   */
  async clearRlsUserId(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.$executeRawUnsafe(`RESET app.current_user_id`);
    } catch (error: any) {
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
