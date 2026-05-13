import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
}

/**
 * SUSTAINABLE FIX v5: Lazy PrismaClient initialization with Dual-Mode connections.
 *
 * ARCHITECTURE:
 *   Mode A: App (PrismaClient) → PgBouncer (localhost:6432) → PostgreSQL
 *   Mode B: App (PrismaClient) → PostgreSQL (direct, connection_limit=1, pool_timeout=3)
 *
 * PgBouncer is preferred but may fail on Railway. When it fails, DATABASE_URL
 * does NOT include pgbouncer=true, and PrismaClient connects directly with
 * aggressive connection limits to avoid exhausting max_connections.
 *
 * LAZY INIT:
 *   PrismaClient is created ONLY when first needed. The `db` export is
 *   a Proxy that delegates all property access to the real PrismaClient
 *   instance, created on first access. This prevents opening connections
 *   at module load time.
 */

let _prismaInstance: PrismaClient | undefined = undefined;

function getOrCreatePrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  _prismaInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    datasources: {
      db: {
        // FIX v5: Force connection_limit=1 AND pool_timeout=3.
        // connection_limit=1: Only 1 connection per PrismaClient (2 total: Next.js + NestJS).
        // pool_timeout=3: Release idle connections after 3s (critical for direct PG mode).
        // With PgBouncer, pool_timeout is ignored (PgBouncer manages pooling).
        url: (() => {
          try {
            const u = new URL(process.env.DATABASE_URL || '');
            u.searchParams.set('connection_limit', '1');
            u.searchParams.set('pool_timeout', '3');
            if (u.searchParams.get('pgbouncer') === 'true') {
              u.searchParams.delete('sslmode');
              u.searchParams.delete('ssl');
              u.searchParams.delete('sslrootcert');
              u.searchParams.delete('sslcert');
              u.searchParams.delete('sslkey');
            }
            return u.toString();
          } catch {
            return process.env.DATABASE_URL;
          }
        })(),
      },
    },
  });

  globalForPrisma.prisma = _prismaInstance;
  return _prismaInstance;
}

// Proxy-based lazy initialization: PrismaClient is created on first property access.
// This prevents opening a DB connection at module load time.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const instance = getOrCreatePrisma();
    const value = (instance as any)[prop];
    // Bind methods to the PrismaClient instance so `this` is correct
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Ensure the database is ready for queries.
 *
 * This function ONLY connects and verifies — it does NOT run any
 * schema migrations. All schema changes must be done via:
 *   1. `prisma migrate deploy` (in start.sh — production-safe)
 *   2. `prisma migrate dev` (local development)
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  // Prevent tight retry loops when Postgres is saturated ("too many clients").
  // If DB recently failed init, bail out quickly instead of re-running
  // connect+query retries on every auth request.
  const now = Date.now()
  const cooldownMs = 30_000
  const lastFail = (globalForPrisma as any).dbLastInitFailAt as number | undefined
  if (typeof lastFail === 'number' && now - lastFail < cooldownMs) {
    return false
  }

  // FIX v5: Reduced from 10 to 3 retries with LONG 15s backoff.
  // WHY: Each retry creates a new connection attempt. With 10 retries and
  // exponential backoff starting at 2s, we accumulate ~10 connection attempts
  // in 2 minutes. On Railway with max_connections~20, this EXHAUSTS all slots.
  // With 3 retries and 15s delay, we try 3 times in ~1 minute but
  // each attempt has time to fully release its connection before the next.
  const MAX_RETRIES = 3
  const dbUrl = process.env.DATABASE_URL || '(not set)'
  const isPgbouncer = dbUrl.includes('pgbouncer=true')

  console.log(`[db] ensureDbReady() starting — Retries: ${MAX_RETRIES}, PgBouncer: ${isPgbouncer}, URL prefix: ${dbUrl.substring(0, 40)}...`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Try $connect() first. If already connected, $connect() is a no-op.
      try {
        await db.$connect()
      } catch (connectErr: any) {
        // Connect failed — disconnect to clean up any leaked pool, then rethrow
        try { await db.$disconnect() } catch { /* ignore */ }
        throw connectErr
      }

      // FIX v5: Use $queryRaw`SELECT 1` instead of user.findFirst().
      // SELECT 1 is the simplest possible query — it only verifies the
      // connection works without creating additional overhead.
      await db.$queryRaw`SELECT 1`

      globalForPrisma.dbInitialized = true
      globalForPrisma.dbInitError = undefined
      ;(globalForPrisma as any).dbLastInitFailAt = undefined
      console.log('[db] Database successfully initialized and verified.')
      return true
    } catch (error: any) {
      // CRITICAL: Prevent connection buildup during "too many clients already"
      // by explicitly disconnecting on ANY failure, not only on connect failure.
      try { await db.$disconnect() } catch { /* ignore disconnect errors */ }

      const message = error?.message || 'Unknown database error'
      const code = error?.code || 'NO_CODE'
      globalForPrisma.dbInitError = `[${code}] ${message}`

      console.error(`[db] Connection attempt ${attempt + 1}/${MAX_RETRIES} failed: [${code}] ${message.substring(0, 200)}`)

      if (attempt < MAX_RETRIES - 1) {
        // FIX v5: Fixed 15s delay (was exponential 2-30s).
        // Long fixed delay gives PostgreSQL time to release the failed
        // connection slot before we try again.
        const delay = 15000
        console.log(`[db] Retrying in ${Math.round(delay / 1000)}s...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  // Record failure timestamp for cooldown logic
  ;(globalForPrisma as any).dbLastInitFailAt = Date.now()

  console.error('[db] CRITICAL: Database initialization failed after all retries.')
  console.error(`[db] Last error: ${globalForPrisma.dbInitError}`)
  console.error(`[db] DATABASE_URL has pgbouncer=true: ${isPgbouncer}`)
  if (isPgbouncer) {
    console.error('[db] TIP: If PgBouncer auth fails, check that PgBouncer config uses auth_type=plain (not md5)')
    console.error('[db] TIP: If SSL fails, check that DATABASE_URL has sslmode stripped for localhost')
  }
  return false
}

/**
 * Get the last DB initialization error message (for diagnostics).
 */
export function getDbInitError(): string | undefined {
  return globalForPrisma.dbInitError
}

/**
 * Reset the DB initialized flag so the next ensureDbReady() call
 * will attempt to reconnect. Call this when a DB operation fails
 * with a connection error.
 */
export function resetDbInitialized() {
  globalForPrisma.dbInitialized = false
}
