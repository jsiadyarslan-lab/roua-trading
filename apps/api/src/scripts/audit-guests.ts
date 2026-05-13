import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

type PgBouncerAwareDatabaseUrl = string;

function buildPgBouncerSafeDatabaseUrl(rawUrl: string): PgBouncerAwareDatabaseUrl {
  const u = new URL(rawUrl);

  // Force single connection behavior for this standalone script.
  u.searchParams.set('connection_limit', '1');
  u.searchParams.set('pool_timeout', '5');
  u.searchParams.set('connect_timeout', '5');

  // If PgBouncer mode is enabled, ensure we don’t send SSL params to localhost:6432.
  // This must mirror apps/api/src/common/prisma/prisma.service.ts behavior.
  if (u.searchParams.get('pgbouncer') === 'true') {
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    u.searchParams.delete('sslrootcert');
    u.searchParams.delete('sslcert');
    u.searchParams.delete('sslkey');
  }

  return u.toString();
}

async function acquireRedisLock(opts: {
  redisUrl?: string;
  lockKey: string;
  ttlSeconds: number;
}): Promise<{ redis: Redis; acquired: boolean }> {
  const redisUrl = opts.redisUrl || process.env.REDIS_URL;
  if (!redisUrl) {
    return { redis: new Redis(), acquired: false };
  }

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
  });

  // Best-effort SET NX with TTL.
  const lockVal = `audit-guests:${process.pid}:${Date.now()}`;
  // ioredis has strict TS overloads for `set`. Cast to avoid mismatch.
  const res = await (redis as any).set(opts.lockKey, lockVal, 'NX', 'EX', opts.ttlSeconds);

  const acquired = res === 'OK';
  if (!acquired) {
    // Don’t keep the process open if we failed to acquire.
    await redis.quit().catch(() => redis.disconnect());
  }

  return { redis, acquired };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  // Apply PgBouncer-safe URL normalization consistently.
  process.env.DATABASE_URL = buildPgBouncerSafeDatabaseUrl(process.env.DATABASE_URL);

  // Concurrency guard: this script is invoked from startup/deploy, so it must be run-once.
  const lockTtlSeconds = 120; // enough for this script; prevents dead locks
  const lockKey = process.env.AUDIT_GUESTS_LOCK_KEY || 'roua:audit-guests:lock';

  let redis: Redis | null = null;
  try {
    const { redis: redisClient, acquired } = await acquireRedisLock({
      redisUrl: process.env.REDIS_URL,
      lockKey,
      ttlSeconds: lockTtlSeconds,
    });

    redis = redisClient;

    if (!acquired) {
      console.log(JSON.stringify({ skipped: true, reason: 'lock_not_acquired', lockKey }, null, 2));
      return;
    }

    const prisma = new PrismaClient();

    try {
      const totalUsers = await prisma.user.count();

      const guestUsers = await prisma.user.count({
        where: {
          email: {
            contains: 'guest',
          },
        },
      });

      const recentGuests = await prisma.user.findMany({
        where: {
          email: {
            contains: 'guest',
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      });

      const creationStats = await prisma.$queryRaw`
        SELECT
          DATE_TRUNC('hour', "createdAt") as hour,
          COUNT(*) as count
        FROM "User"
        WHERE email LIKE '%guest%'
        GROUP BY hour
        ORDER BY hour DESC
        LIMIT 24
      `;

      console.log(
        JSON.stringify(
          {
            skipped: false,
            totalUsers,
            guestUsers,
            recentGuests,
            creationStats,
          },
          null,
          2,
        ),
      );
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  } finally {
    if (redis) {
      await redis.quit().catch(() => redis?.disconnect());
    }
  }
}

main().catch((err) => {
  console.error('audit-guests failed:', err?.message || err);
  // Exit non-zero so the deploy log shows failure, but we still avoid connection leaks.
  process.exit(1);
});
