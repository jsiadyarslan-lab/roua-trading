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
}
