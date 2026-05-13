import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
}

/**
 * SUSTAINABLE FIX: Lazy PrismaClient initialization.
 *
 * PREVIOUS PROBLEM:
 *   The old code created PrismaClient at MODULE LOAD TIME:
 *     export const db = globalForPrisma.prisma ?? new PrismaClient({...})
 *
 *   When Next.js starts, it eagerly evaluates imported modules.
 *   If any route or lib imports from db.ts, the PrismaClient is created
 *   immediately, opening a connection pool BEFORE start.sh has finished
 *   running prisma db push. This caused "too many clients already" errors
 *   because:
 *     1. start.sh starts Next.js first (for health checks)
 *     2. Next.js creates PrismaClient → opens 1 connection
 *     3. start.sh runs prisma db push → tries to open connection
 *     4. Old deployment connections still exist → total exceeds max_connections
 *
 * SUSTAINABLE FIX:
 *   PrismaClient is now created ONLY when first needed (lazy init).
 *   The `db` export is a Proxy that delegates all property access to the
 *   real PrismaClient instance, which is created on first access.
 *
 *   This means Next.js can start without opening any DB connections.
 *   The connection is opened only when the first actual API request comes in,
 *   by which time start.sh has finished its Prisma operations.
 *
 *   connection_limit=1 is set by start.sh in DATABASE_URL itself, so
 *   no URL modification is needed here.
 */

let _prismaInstance: PrismaClient | undefined = undefined;

function getOrCreatePrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  // SUSTAINABLE FIX: No URL modification needed here.
  // start.sh injects connection_limit=1 into DATABASE_URL at the
  // environment level before any process starts.
  _prismaInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
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

  const MAX_RETRIES = 5
  const dbUrl = process.env.DATABASE_URL || '(not set)'

  console.log(`[db] ensureDbReady() starting — Retries: ${MAX_RETRIES}, URL prefix: ${dbUrl.substring(0, 35)}...`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
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

      if (attempt < 2 || attempt === MAX_RETRIES - 1) {
        console.error(`[db] Connection attempt ${attempt + 1}/${MAX_RETRIES} failed: [${code}] ${message.substring(0, 200)}`)
      }

      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff — 2s, 4s, 8s, 16s (Total ~30s)
        const delay = 1000 * Math.pow(2, attempt + 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  console.error('[db] CRITICAL: Database initialization failed after all retries.')
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
