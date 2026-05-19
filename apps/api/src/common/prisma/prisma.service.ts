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
  // V168 FIX: We now use SET LOCAL (transaction-scoped) instead of
  // SET (session-scoped). SET LOCAL auto-resets at transaction boundary,
  // preventing RLS context from leaking between requests on the same
  // pooled connection. If SET LOCAL fails (outside transaction), we
  // fall back to SET + explicit RESET in the Interceptor's finalize.
  //
  // Defense-in-depth:
  //   - AuthGuard sets RLS (first line of defense)
  //   - UserIsolationInterceptor sets RLS (second line, registered V168)
  //   - UserIsolationInterceptor clears RLS in finalize (always runs)
  //   - SET LOCAL auto-clears at transaction boundary (safety net)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set the current user ID for Row Level Security.
   * Called by UserIsolationInterceptor before each request.
   *
   * V168 FIX: Use SET LOCAL instead of SET. SET LOCAL only persists
   * within the current transaction, so if clearRlsUserId() fails
   * or the connection is reused before the RESET, the RLS context
   * is automatically cleared at transaction end.
   *
   * NOTE: For non-transaction queries (the common case), SET LOCAL
   * is effectively the same as SET because Prisma auto-wraps each
   * $executeRawUnsafe in an implicit transaction. But it's safer
   * because it won't persist beyond the transaction boundary.
   */
  async setRlsUserId(userId: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      // Sanitize userId to prevent SQL injection (though it should be a UUID)
      const safeId = userId.replace(/'/g, "''");
      // V168: Use SET LOCAL — auto-resets at transaction boundary
      await this.$executeRawUnsafe(`SET LOCAL app.current_user_id = '${safeId}'`);
    } catch (error: any) {
      // Fallback to SET if SET LOCAL fails (e.g., outside transaction)
      try {
        const safeId = userId.replace(/'/g, "''");
        await this.$executeRawUnsafe(`SET app.current_user_id = '${safeId}'`);
      } catch (fallbackError: any) {
        this.logger.debug(`RLS setRlsUserId failed (both SET LOCAL and SET): ${fallbackError.message}`);
      }
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
