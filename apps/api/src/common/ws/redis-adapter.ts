/**
 * V272: Redis WebSocket Adapter for multi-replica support.
 *
 * When Railway runs multiple replicas, Socket.IO events (position:opened,
 * position:closed, etc.) only reach clients connected to the SAME replica.
 * The Redis adapter broadcasts events across ALL replicas via Redis pub/sub.
 *
 * Usage in main.ts:
 *   const adapter = await createRedisAdapter(app);
 *   app.useWebSocketAdapter(adapter);
 *
 * Environment variables:
 *   REDIS_URL or REDIS_PUBLIC_URL — Railway's Redis connection string
 *   If not set, falls back to single-replica IoAdapter (no multi-replica support).
 *
 * The adapter is OPT-IN: if Redis is not available, the app still works
 * in single-replica mode. This ensures zero downtime during deployment.
 */
import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';

const logger = new Logger('RedisWsAdapter');

export async function createRedisAdapter(
  app: INestApplication,
): Promise<IoAdapter | any> {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

  if (!redisUrl) {
    logger.log('🔴 No REDIS_URL found — using single-replica IoAdapter (no multi-replica WS)');
    return new IoAdapter(app);
  }

  try {
    const { createClient } = await import('redis');
    const { createAdapter } = await import('@socket.io/redis-adapter');

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err: any) => {
      logger.error(`Redis pub client error: ${err.message}`);
    });
    subClient.on('error', (err: any) => {
      logger.error(`Redis sub client error: ${err.message}`);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    const redisAdapter = createAdapter(pubClient, subClient);
    logger.log('✅ Redis WebSocket adapter connected — multi-replica support ENABLED');

    return new RedisIoAdapter(app, pubClient, subClient, redisAdapter);
  } catch (err: any) {
    logger.warn(
      `⚠️ Failed to create Redis adapter: ${err.message} — falling back to single-replica IoAdapter. ` +
      `WebSocket events will NOT broadcast across replicas.`,
    );
    return new IoAdapter(app);
  }
}

class RedisIoAdapter extends IoAdapter {
  private readonly pubClient: any;
  private readonly subClient: any;
  private readonly redisAdapter: any;

  constructor(
    app: INestApplication,
    pubClient: any,
    subClient: any,
    redisAdapter: any,
  ) {
    super(app);
    this.pubClient = pubClient;
    this.subClient = subClient;
    this.redisAdapter = redisAdapter;
  }

  createIOServer(port: number, options?: any): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.redisAdapter);
    return server;
  }

  async dispose(): Promise<void> {
    try {
      await this.pubClient?.quit();
      await this.subClient?.quit();
      logger.log('🔴 Redis WebSocket adapter disconnected');
    } catch { /* non-critical */ }
  }
}
