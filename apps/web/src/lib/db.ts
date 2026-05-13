import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
}

/**
 * FIX v11: Lazy PrismaClient initialization — SIMPLE AND RELIABLE.
 *
 * ARCHITECTURE: App (PrismaClient) → PostgreSQL (direct, connection_limit=1)
 *
 * No PgBouncer, no pooler, no SSL stripping, no URL modification.
 * Just add connection_limit=1 and pool_timeout=10 to DATABASE_URL.
 * This matches what the news website does — and the news website works!
 *
 * FIX v11 CRITICAL: DO NOT add pgbouncer=true and DO NOT strip SSL.
 *
 * Previous versions added pgbouncer=true and stripped SSL params when
 * it was detected. This broke connections to Railway's PostgreSQL because:
 * 1. pgbouncer=true changes Prisma's driver mode (disables prepared statements)
 * 2. SSL stripping breaks connections to Railway's remote PostgreSQL/PgBouncer
 * 3. The auto-constructed pooler URLs were often wrong
 *
 * The news website works because it uses DATABASE_URL directly without
 * any modification. This code now does the same thing.
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
        // FIX v12: Use DATABASE_URL exactly as Railway provides it.
        // NO modifications — the news website does the same and it works.
        // Previous versions used new URL() which could change the URL format
        // (re-encoding special chars, changing protocol, etc.) and break Prisma.
        url: process.env.DATABASE_URL,
      },
    },
  });

  globalForPrisma.prisma = _prismaInstance;
  return _prismaInstance;
}

// Proxy-based lazy initialization: PrismaClient is created on first property access.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const instance = getOrCreatePrisma();
    const value = (instance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Ensure the database is ready for queries.
 *
 * FIX v11: Do NOT call $disconnect() on failure.
 * $disconnect() destroys the pool and creates a new one on next $connect(),
 * which leaks connections and causes "too many clients" errors.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  // Prevent tight retry loops when Postgres is saturated
  const now = Date.now()
  const cooldownMs = 15_000
  const lastFail = (globalForPrisma as any).dbLastInitFailAt as number | undefined
  if (typeof lastFail === 'number' && now - lastFail < cooldownMs) {
    console.log(`[db] Skipping ensureDbReady() — cooldown (${Math.round((cooldownMs - (now - lastFail)) / 1000)}s remaining)`)
    return false
  }

  const MAX_RETRIES = 2
  const dbUrl = process.env.DATABASE_URL || '(not set)'

  console.log(`[db] ensureDbReady() — URL prefix: ${dbUrl.substring(0, 50)}...`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await db.$connect()
      await db.$queryRaw`SELECT 1`

      globalForPrisma.dbInitialized = true
      globalForPrisma.dbInitError = undefined
      ;(globalForPrisma as any).dbLastInitFailAt = undefined
      console.log('[db] Database successfully initialized and verified.')
      return true
    } catch (error: any) {
      const message = error?.message || 'Unknown database error'
      const code = error?.code || 'NO_CODE'
      globalForPrisma.dbInitError = `[${code}] ${message}`

      console.error(`[db] Connection attempt ${attempt + 1}/${MAX_RETRIES} failed: [${code}] ${message.substring(0, 200)}`)

      if (attempt < MAX_RETRIES - 1) {
        const delay = 10000
        console.log(`[db] Retrying in ${Math.round(delay / 1000)}s...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  ;(globalForPrisma as any).dbLastInitFailAt = Date.now()

  console.error('[db] CRITICAL: Database initialization failed after all retries.')
  console.error(`[db] Last error: ${globalForPrisma.dbInitError}`)
  return false
}

export function getDbInitError(): string | undefined {
  return globalForPrisma.dbInitError
}

export function resetDbInitialized() {
  globalForPrisma.dbInitialized = false
}
