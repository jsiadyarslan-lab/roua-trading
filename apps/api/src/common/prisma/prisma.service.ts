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

    // FIX v10: DO NOT strip SSL params for pgbouncer=true!
    //
    // Previous versions stripped sslmode/ssl/sslrootcert when pgbouncer=true
    // was detected. This was correct for LOCAL PgBouncer (localhost:6432)
    // but WRONG for Railway's REMOTE PgBouncer which REQUIRES SSL.
    //
    // Stripping SSL caused: ECONNREFUSED / SSL required / connection failed
    // → All DB operations fail → "database currently unavailable"
    //
    // The news website (separate service) works because it uses DATABASE_URL
    // directly without pgbouncer=true or SSL stripping.
    const dbUrl = (() => {
      try {
        const u = new URL(process.env.DATABASE_URL || '');
        u.searchParams.set('connection_limit', '1');
        u.searchParams.set('pool_timeout', '10');
        // FIX v10: REMOVED SSL stripping when pgbouncer=true.
        // Railway's PgBouncer is NOT localhost — it requires SSL.
        // Keeping sslmode/ssl/sslrootcert intact.
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
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    // Log the effective connection mode (PgBouncer vs direct)
    let connectionMode = 'direct';
    try {
      const url = new URL(dbUrl || '');
      if (url.searchParams.get('pgbouncer') === 'true') {
        connectionMode = 'PgBouncer (Railway pooler)';
      }
      const limit = url.searchParams.get('connection_limit');
      if (limit) connectionMode += ` connection_limit=${limit}`;
      const sslmode = url.searchParams.get('sslmode');
      if (sslmode) connectionMode += ` sslmode=${sslmode}`;
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
    // doesn't block the entire NestJS bootstrap.
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
      // FIX v10: Do NOT call $disconnect() on failure.
      // $disconnect() destroys the pool, and the next $connect() creates
      // a new pool with a new connection. This cycle exhausts max_connections.
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

    const baseDelay = 60_000;
    const delay = Math.min(baseDelay * Math.pow(2, Math.min(this.consecutiveFailures, 3)), 300_000);

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
