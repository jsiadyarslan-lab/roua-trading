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

    // SUSTAINABLE FIX: No longer modifying DATABASE_URL here.
    //
    // Previously, this constructor added connection_limit=1 to DATABASE_URL.
    // But this ONLY affected the NestJS PrismaService — Prisma CLI commands
    // (db push, db execute, migrate deploy) used the raw URL with DEFAULT
    // pool size of 5, causing connection exhaustion.
    //
    // Now: start.sh injects connection_limit=1 into DATABASE_URL at the
    // ENVIRONMENT LEVEL before any process starts. This ensures ALL Prisma
    // operations (CLI + application) use 1 connection. No per-client
    // URL modification needed.
    //
    // If DATABASE_URL already has connection_limit (from start.sh), Prisma
    // will respect it. If not (e.g., running locally without start.sh),
    // Prisma uses its default pool size, which is fine for development.
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: [
        ...(isDev ? [{ emit: 'event' as const, level: 'query' as const }] : []),
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    // Log the effective connection_limit from the URL (for diagnostics)
    let effectiveLimit = 'default (5)';
    try {
      const url = new URL(process.env.DATABASE_URL || '');
      const limit = url.searchParams.get('connection_limit');
      if (limit) effectiveLimit = limit;
    } catch {}
    this.logger.log(`📦 Prisma connection pool: connection_limit=${effectiveLimit}, pool_timeout=10`);

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
