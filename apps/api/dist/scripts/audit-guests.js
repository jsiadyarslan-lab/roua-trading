"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const ioredis_1 = __importDefault(require("ioredis"));
function buildPgBouncerSafeDatabaseUrl(rawUrl) {
    const u = new URL(rawUrl);
    u.searchParams.set('connection_limit', '1');
    u.searchParams.set('pool_timeout', '5');
    u.searchParams.set('connect_timeout', '5');
    if (u.searchParams.get('pgbouncer') === 'true') {
        u.searchParams.delete('sslmode');
        u.searchParams.delete('ssl');
        u.searchParams.delete('sslrootcert');
        u.searchParams.delete('sslcert');
        u.searchParams.delete('sslkey');
    }
    return u.toString();
}
async function acquireRedisLock(opts) {
    const redisUrl = opts.redisUrl || process.env.REDIS_URL;
    if (!redisUrl) {
        return { redis: new ioredis_1.default(), acquired: false };
    }
    const redis = new ioredis_1.default(redisUrl, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: false,
    });
    const lockVal = `audit-guests:${process.pid}:${Date.now()}`;
    const res = await redis.set(opts.lockKey, lockVal, 'NX', 'EX', opts.ttlSeconds);
    const acquired = res === 'OK';
    if (!acquired) {
        await redis.quit().catch(() => redis.disconnect());
    }
    return { redis, acquired };
}
async function main() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set');
    }
    process.env.DATABASE_URL = buildPgBouncerSafeDatabaseUrl(process.env.DATABASE_URL);
    const lockTtlSeconds = 120;
    const lockKey = process.env.AUDIT_GUESTS_LOCK_KEY || 'roua:audit-guests:lock';
    let redis = null;
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
        const prisma = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: process.env.DATABASE_URL,
                },
            },
        });
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
            const creationStats = await prisma.$queryRaw `
        SELECT
          DATE_TRUNC('hour', "createdAt") as hour,
          COUNT(*) as count
        FROM "User"
        WHERE email LIKE '%guest%'
        GROUP BY hour
        ORDER BY hour DESC
        LIMIT 24
      `;
            console.log(JSON.stringify({
                skipped: false,
                totalUsers,
                guestUsers,
                recentGuests,
                creationStats,
            }, null, 2));
        }
        finally {
            await prisma.$disconnect().catch(() => undefined);
        }
    }
    finally {
        if (redis) {
            await redis.quit().catch(() => redis?.disconnect());
        }
    }
}
main().catch((err) => {
    console.error('audit-guests failed:', err?.message || err);
    process.exit(1);
});
//# sourceMappingURL=audit-guests.js.map