import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectInProgress = false;
  private connected = false;
  private consecutiveFailures = 0;
  // FIX: Shared flag so background services can check DB availability
  // before attempting queries that would create new connection pools.
  private static _dbAvailable = false;
  static get dbAvailable(): boolean { return PrismaService._dbAvailable; }

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';

    // SUSTAINABLE FIX: Connection pooling handled by PgBouncer.
    //
    // ARCHITECTURE:
    //   App (PrismaClient) → PgBouncer (localhost:6432) → PostgreSQL
    //
    // PgBouncer multiplexes many app connections onto few real PG connections.
    // In transaction mode, connections are only held during active transactions.
    // This means 15+ app connections share ~5 real PostgreSQL connections.
    //
    // DATABASE_URL points to PgBouncer (with pgbouncer=true parameter).
    // DIRECT_DATABASE_URL points to real PostgreSQL (for Prisma CLI commands).
    //
    // If PgBouncer is unavailable (local dev), DATABASE_URL connects directly.
    // No per-client URL modification needed — pooling is handled centrally.
    // SUSTAINABLE FIX: Force connection_limit=2 even if DATABASE_URL has a higher value.
    // With PgBouncer, 2 connections per PrismaClient is sufficient.
    // Total: 2 (NestJS) + 2 (Next.js) = 4 client → PgBouncer → 3 real PG connections.
    const dbUrl = (() => {
      try {
        const u = new URL(process.env.DATABASE_URL || '');
        u.searchParams.set('connection_limit', '2');
        return u.toString();
      } catch {
        return process.env.DATABASE_URL;
      }
    })();

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: [
        ...(isDev ? [{ emit: 'event' as const, level: 'query' as const }] : []),
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    // Log the effective connection mode (PgBouncer vs direct)
    // Use dbUrl (which has connection_limit=2 forced) not raw DATABASE_URL
    let connectionMode = 'direct';
    try {
      const url = new URL(dbUrl || '');
      if (url.searchParams.get('pgbouncer') === 'true') {
        connectionMode = 'PgBouncer (transaction mode)';
      }
      const limit = url.searchParams.get('connection_limit');
      if (limit) connectionMode += ` connection_limit=${limit}`;
    } catch {}
    this.logger.log(`📦 Prisma connection: ${connectionMode}`);

    // Only attach query event listener in development mode
    if (isDev) {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query} — ${e.duration}ms`);
      });
    }
  }

  async onModuleInit() {
    // FIX: Add a timeout to Prisma $connect() so that an unreachable database
    // doesn't block the entire NestJS bootstrap. Without this timeout,
    // $connect() can hang for 60-120s (OS TCP SYN timeout), preventing
    // app.listen() from ever executing → ECONNREFUSED on port 3001.
    const INIT_TIMEOUT_MS = 10_000; // 10 seconds
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
      // SUSTAINABLE FIX: Always disconnect before connecting.
      //
      // ROOT CAUSE of multiple "Starting a postgresql pool" messages:
      //   When $connect() fails, Prisma internally creates a connection pool
      //   but doesn't properly clean it up. On the next $connect() attempt,
      //   Prisma creates ANOTHER pool instead of reusing the failed one.
      //   Each failed pool leaks a PostgreSQL connection slot.
      //
      //   On Railway's PostgreSQL (max ~5-25 connections), even 3-4 leaked
      //   pools + the original pool = immediate "too many clients already".
      //
      // FIX: Call $disconnect() before each $connect() attempt. This
      //   properly closes the previous (failed) pool before creating a new one.
      //   This ensures we never have more than 1 pool from PrismaService.
      try {
        await this.$disconnect();
      } catch {
        // Ignore disconnect errors — the pool may not exist yet
      }

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
      // FIX: Only log every 5th failure to avoid log spam
      if (this.consecutiveFailures <= 3 || this.consecutiveFailures % 5 === 0) {
        this.logger.error(`📦 Prisma connection failed (attempt ${this.consecutiveFailures}): ${message}`);
      }
      return false;
    } finally {
      this.connectInProgress = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    // FIX: Exponential backoff — 10s, 20s, 40s, 80s, max 120s
    // Previously used fixed 10s interval which created a feedback loop:
    // each failed $connect() created a new pool (5 connections), exhausting
    // PostgreSQL max_connections, causing the NEXT $connect() to fail too.
    // Exponential backoff gives PostgreSQL time to free connections.
    const baseDelay = 10_000;
    const delay = Math.min(baseDelay * Math.pow(2, Math.min(this.consecutiveFailures, 4)), 120_000);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      const connected = await this.tryConnect();
      if (!connected) {
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Check if the database is currently available.
   * Background services should call this before making queries to avoid
   * creating new connection pools when DB is unreachable.
   */
  isAvailable(): boolean {
    return this.connected && PrismaService._dbAvailable;
  }
}
