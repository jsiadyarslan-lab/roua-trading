import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly reconnectDelayMs = 10000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectInProgress = false;
  private connected = false;

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';

    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'connection_limit=15&pool_timeout=20',
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
    // Log connection pool configuration (now auto-configured in constructor)
    this.logger.log('📦 Prisma connection pool: connection_limit=15, pool_timeout=20');

    const connected = await this.tryConnect();

    if (!connected) {
      this.logger.warn(
        `📦 Prisma database unavailable at startup — API will continue and retry every ${this.reconnectDelayMs / 1000}s`,
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
      this.logger.log('📦 Prisma connected to database');
      return true;
    } catch (error: unknown) {
      this.connected = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`📦 Prisma connection failed: ${message}`);
      return false;
    } finally {
      this.connectInProgress = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      const connected = await this.tryConnect();
      if (!connected) {
        this.scheduleReconnect();
      }
    }, this.reconnectDelayMs);
  }
}
