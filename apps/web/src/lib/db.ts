import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
}

/**
 * FIX v6: Lazy PrismaClient initialization with reliable connection management.
 *
 * ARCHITECTURE:
 *   Mode A: App (PrismaClient) → PgBouncer (localhost:6432) → PostgreSQL
 *   Mode B: App (PrismaClient) → PostgreSQL (direct, connection_limit=1, pool_timeout=10)
 *
 * PgBouncer is preferred. start.sh v6 ensures PgBouncer is used even if
 * the pre-flight query fails (TCP check is sufficient).
 *
 * KEY FIX v6: pool_timeout changed from 3→10.
 * pool_timeout is the time to WAIT for a connection from the pool,
 * NOT an idle timeout. 3s was too short and caused timeout errors
 * that triggered $disconnect/$connect cycles, making exhaustion worse.
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
        // FIX v6: Force connection_limit=1 AND pool_timeout=10.
        // connection_limit=1: Only 1 connection per PrismaClient (2 total: Next.js + NestJS).
        // pool_timeout=10: Wait up to 10s for a pool connection (was 3, too short!).
        //   pool_timeout is NOT idle timeout — it's how long to wait if the
        //   single connection is busy. 3s caused timeouts → $disconnect → more connections.
        // With PgBouncer, pool_timeout is less important (PgBouncer manages pooling).
        url: (() => {
          try {
            const u = new URL(process.env.DATABASE_URL || '');
            u.searchParams.set('connection_limit', '1');
            u.searchParams.set('pool_timeout', '10');
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
 *
 * FIX v6: Do NOT call $disconnect() on failure.
 * WHY: $disconnect() destroys the entire connection pool. The next
 * $connect() creates a NEW pool with a NEW connection. The old
 * connection from the destroyed pool may not be released by PostgreSQL
 * immediately. This creates a cycle: fail → disconnect → connect →
 * new connection → fail → disconnect → ... that exhausts max_connections.
 *
 * Instead, on failure, just return false and let Prisma handle
 * reconnection internally. Prisma's pool will automatically retry
 * the existing connection without creating new ones.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  // Prevent tight retry loops when Postgres is saturated ("too many clients").
  // If DB recently failed init, bail out quickly instead of re-running
  // connect+query retries on every auth request.
  const now = Date.now()
  const cooldownMs = 15_000  // FIX v6: Reduced from 30s to 15s cooldown
  const lastFail = (globalForPrisma as any).dbLastInitFailAt as number | undefined
  if (typeof lastFail === 'number' && now - lastFail < cooldownMs) {
    console.log(`[db] Skipping ensureDbReady() — cooldown (${Math.round((cooldownMs - (now - lastFail)) / 1000)}s remaining)`) 
    return false
  }

  // FIX v6: Only 2 retries with 10s backoff.
  // WHY: Each retry is a connection attempt. With PgBouncer, failed
  // connections are handled by PgBouncer's internal retry mechanism,
  // so we don't need many retries here. With direct connections,
  // fewer retries means less connection pressure.
  const MAX_RETRIES = 2
  const dbUrl = process.env.DATABASE_URL || '(not set)'
  const isPgbouncer = dbUrl.includes('pgbouncer=true')

  console.log(`[db] ensureDbReady() — Retries: ${MAX_RETRIES}, PgBouncer: ${isPgbouncer}, URL prefix: ${dbUrl.substring(0, 40)}...`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Try $connect(). If already connected, $connect() is a no-op.
      await db.$connect()

      // Verify connection with SELECT 1
      await db.$queryRaw`SELECT 1`

      globalForPrisma.dbInitialized = true
      globalForPrisma.dbInitError = undefined
      ;(globalForPrisma as any).dbLastInitFailAt = undefined
      console.log('[db] Database successfully initialized and verified.')
      return true
    } catch (error: any) {
      // FIX v6: Do NOT call $disconnect() here!
      // $disconnect() destroys the pool, and the next $connect() creates
      // a new pool with a new connection. This cycle exhausts max_connections.
      // Instead, just let the pool stay — Prisma will reuse it on retry.

      const message = error?.message || 'Unknown database error'
      const code = error?.code || 'NO_CODE'
      globalForPrisma.dbInitError = `[${code}] ${message}`

      console.error(`[db] Connection attempt ${attempt + 1}/${MAX_RETRIES} failed: [${code}] ${message.substring(0, 200)}`)

      if (attempt < MAX_RETRIES - 1) {
        const delay = 10000  // FIX v6: 10s delay between retries
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
