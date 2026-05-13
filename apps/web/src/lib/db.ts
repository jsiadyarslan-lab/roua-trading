import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
}

/**
 * SUSTAINABLE FIX: Lazy PrismaClient initialization with PgBouncer.
 *
 * ARCHITECTURE:
 *   App (PrismaClient) → PgBouncer (localhost:6432) → PostgreSQL
 *
 * PgBouncer multiplexes many app connections onto few real PG connections.
 * In transaction mode, connections are released after each transaction.
 * This means 15+ app connections share ~5 real PostgreSQL connections.
 *
 * LAZY INIT:
 *   PrismaClient is created ONLY when first needed. The `db` export is
 *   a Proxy that delegates all property access to the real PrismaClient
 *   instance, created on first access. This prevents opening connections
 *   at module load time.
 *
 * PgBouncer handles connection pooling centrally. No per-client URL
 * modification needed. If PgBouncer is unavailable (local dev),
 * DATABASE_URL connects directly to PostgreSQL.
 */

let _prismaInstance: PrismaClient | undefined = undefined;

function getOrCreatePrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  // PgBouncer handles connection pooling centrally.
  // DATABASE_URL already has the correct pooling parameters from start.sh.
  _prismaInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    datasources: {
      db: {
        // SUSTAINABLE FIX: Force connection_limit=2 even if DATABASE_URL has a higher value.
        // With PgBouncer, 2 connections per PrismaClient is sufficient.
        // Total: 2 (Next.js) + 2 (NestJS) = 4 client → PgBouncer → 3 real PG connections.
        url: (() => {
          try {
            const u = new URL(process.env.DATABASE_URL || '');
            u.searchParams.set('connection_limit', '2');
            // CRITICAL FIX v3: Strip SSL params for PgBouncer on localhost
            // PgBouncer on localhost doesn't use SSL. If sslmode=require
            // is in the URL, Prisma will try SSL to localhost:6432 → FAIL.
            // start.sh should have already stripped these, but strip here too
            // as a safety net in case DATABASE_URL was set incorrectly.
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
 * Previously, this function ran ~70 DDL statements (runSchemaMigrations)
 * on every first connection. This was DANGEROUS because:
 *   - ALTER TABLE ... TYPE could fail and corrupt data
 *   - Running DDL from application code is an anti-pattern
 *   - It competed with start.sh migrations causing race conditions
 *   - It masked real migration issues instead of fixing them
 *
 * Now: just connect, verify, and return. Clean and safe.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  // INCREASED: 10 retries with exponential backoff (was 5)
  // Startup takes time on Railway — PgBouncer needs to establish its
  // pool, stale connections from old deployment need to expire, etc.
  const MAX_RETRIES = 10
  const dbUrl = process.env.DATABASE_URL || '(not set)'
  const isPgbouncer = dbUrl.includes('pgbouncer=true')

  console.log(`[db] ensureDbReady() starting — Retries: ${MAX_RETRIES}, PgBouncer: ${isPgbouncer}, URL prefix: ${dbUrl.substring(0, 40)}...`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // SUSTAINABLE FIX: Disconnect before each connect attempt.
      //
      // ROOT CAUSE: When $connect() fails, Prisma internally creates a
      // connection pool but doesn't properly clean it up. On the next
      // $connect() attempt, Prisma creates ANOTHER pool instead of
      // reusing the failed one. Each failed pool leaks a connection slot.
      //
      // FIX: Call $disconnect() before each $connect() to ensure the
      // previous (failed) pool is cleaned up before creating a new one.
      try {
        await db.$disconnect()
      } catch {
        // Ignore — pool may not exist yet
      }

      // 1. Establish connection
      await db.$connect()

      // 2. Verify core table access
      await db.user.findFirst()

      globalForPrisma.dbInitialized = true
      globalForPrisma.dbInitError = undefined
      console.log('[db] Database successfully initialized and verified.')
      return true
    } catch (error: any) {
      const message = error?.message || 'Unknown database error'
      const code = error?.code || 'NO_CODE'
      globalForPrisma.dbInitError = `[${code}] ${message}`

      // Log first 3, every 3rd after, and always the last
      if (attempt < 3 || attempt % 3 === 0 || attempt === MAX_RETRIES - 1) {
        console.error(`[db] Connection attempt ${attempt + 1}/${MAX_RETRIES} failed: [${code}] ${message.substring(0, 200)}`)
      }

      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff — 3s, 6s, 12s, 24s, 30s, 30s, 30s, 30s, 30s
        // Capped at 30s. Total max wait: ~3+6+12+24+30*5 = 195s
        const delay = Math.min(1000 * Math.pow(2, attempt + 1) + 1000, 30000)
        console.log(`[db] Retrying in ${Math.round(delay / 1000)}s...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

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
