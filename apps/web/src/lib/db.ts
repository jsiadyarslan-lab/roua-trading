import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
}

/**
 * FIX v10: Lazy PrismaClient initialization with RELIABLE connection management.
 *
 * ARCHITECTURE:
 *   With DATABASE_POOLED_URL: App → Railway PgBouncer → PostgreSQL (pgbouncer=true)
 *   Without:                  App → PostgreSQL (direct, connection_limit=1)
 *
 * FIX v10 CRITICAL: DO NOT strip SSL params for pgbouncer=true!
 *
 * Previous versions stripped sslmode/ssl/sslrootcert when pgbouncer=true
 * was detected. This was correct for LOCAL PgBouncer (localhost:6432)
 * but WRONG for Railway's REMOTE PgBouncer which REQUIRES SSL.
 *
 * Stripping SSL caused: ECONNREFUSED / SSL required / connection failed
 * → Google OAuth callback fails → "database currently unavailable"
 *
 * The news website (separate Railway service) works because it uses
 * DATABASE_URL directly without pgbouncer=true or SSL stripping.
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
        // FIX v10: Force connection_limit=1 and pool_timeout=10.
        // DO NOT strip SSL params — Railway requires SSL for all connections,
        // including connections to its remote PgBouncer.
        url: (() => {
          try {
            const u = new URL(process.env.DATABASE_URL || '');
            u.searchParams.set('connection_limit', '1');
            u.searchParams.set('pool_timeout', '10');
            // FIX v10: REMOVED SSL stripping when pgbouncer=true.
            // Railway's PgBouncer is NOT localhost — it requires SSL.
            // The old code deleted sslmode/ssl/sslrootcert which broke
            // the connection to Railway's remote PgBouncer.
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
 * FIX v10: Do NOT call $disconnect() on failure.
 * $disconnect() destroys the entire connection pool. The next
 * $connect() creates a NEW pool with a NEW connection. This cycle
 * exhausts max_connections.
 *
 * Instead, on failure, just return false and let Prisma handle
 * reconnection internally.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  // Prevent tight retry loops when Postgres is saturated ("too many clients").
  const now = Date.now()
  const cooldownMs = 15_000
  const lastFail = (globalForPrisma as any).dbLastInitFailAt as number | undefined
  if (typeof lastFail === 'number' && now - lastFail < cooldownMs) {
    console.log(`[db] Skipping ensureDbReady() — cooldown (${Math.round((cooldownMs - (now - lastFail)) / 1000)}s remaining)`)
    return false
  }

  const MAX_RETRIES = 2
  const dbUrl = process.env.DATABASE_URL || '(not set)'
  const isPgbouncer = dbUrl.includes('pgbouncer=true')

  console.log(`[db] ensureDbReady() — PgBouncer: ${isPgbouncer}, URL prefix: ${dbUrl.substring(0, 50)}...`)

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
      // FIX: Do NOT call $disconnect() here!

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
 * will attempt to reconnect.
 */
export function resetDbInitialized() {
  globalForPrisma.dbInitialized = false
}
