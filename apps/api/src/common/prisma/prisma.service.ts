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

    // FIX: Robust URL modification that handles special characters in passwords.
    // The previous new URL() approach silently failed when DATABASE_URL contained
    // special characters (common in Railway-generated passwords like p#ssw0rd!),
    // causing Prisma to use its DEFAULT pool size of 5 instead of 2.
    // This was the ROOT CAUSE of connection pool exhaustion — "Starting a postgresql
    // pool with 5 connections" appearing 20+ times in logs, each creating a NEW pool.
    let dbUrl = process.env.DATABASE_URL!;
    const poolParams = 'connection_limit=1&pool_timeout=10&connect_timeout=10';
    let urlModified = false;

    // Strategy 1: URL API (handles most cases, preserves existing params)
    try {
      const url = new URL(dbUrl);
      url.searchParams.set('connection_limit', '1');
      url.searchParams.set('pool_timeout', '10');
      url.searchParams.set('connect_timeout', '10');
      dbUrl = url.toString();
      urlModified = true;
    } catch {
      // URL API failed — likely special characters in password
    }

    // Strategy 2: String concatenation fallback (handles malformed URLs)
    if (!urlModified) {
      try {
        const separator = dbUrl.includes('?') ? '&' : '?';
        dbUrl = `${dbUrl}${separator}${poolParams}`;
        urlModified = true;
      } catch {
        // Last resort: use URL as-is
      }
    }

    if (urlModified) {
      // Don't log the full URL (contains credentials) — just confirm modification
      console.log(`[PrismaService] URL modification successful — pool params injected`);
    } else {
      console.error(`[PrismaService] WARNING: Could not modify DATABASE_URL — Prisma will use DEFAULT pool size (5)`);
    }

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

    // Only attach query event listener in development mode
    if (isDev) {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query} — ${e.duration}ms`);
      });
    }
  }

  async onModuleInit() {
    // FIX: Reduced from connection_limit=2 to connection_limit=1.
    // Railway PostgreSQL has ~25 max_connections. With Next.js also using 1,
    // total = 2 — well under the limit. Multiple pools are created during
    // startup (prisma db push, seed script, Next.js, NestJS), so each must
    // use the absolute minimum to avoid 'too many clients already' errors.
    this.logger.log('📦 Prisma connection pool: connection_limit=1, pool_timeout=10');

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
