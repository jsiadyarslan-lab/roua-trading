import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
}

// FIX: Robust URL modification that handles special characters in passwords.
// The previous new URL() approach silently failed when DATABASE_URL contained
// special characters (common in Railway-generated passwords like p#ssw0rd!),
// causing Prisma to use its DEFAULT pool size of 5 instead of 2.
// This was a MAJOR contributor to connection pool exhaustion.
export const db =
  globalForPrisma.prisma ??
  (() => {
    let dbUrl = process.env.DATABASE_URL
    const poolParams = 'connection_limit=1&pool_timeout=10&connect_timeout=10'
    let urlModified = false

    if (dbUrl) {
      // Strategy 1: URL API (handles most cases, preserves existing params)
      try {
        const url = new URL(dbUrl)
        url.searchParams.set('connection_limit', '1')
        url.searchParams.set('pool_timeout', '10')
        url.searchParams.set('connect_timeout', '10')
        dbUrl = url.toString()
        urlModified = true
      } catch {
        // URL API failed — likely special characters in password
      }

      // Strategy 2: String concatenation fallback (handles malformed URLs)
      if (!urlModified) {
        try {
          const separator = dbUrl.includes('?') ? '&' : '?'
          dbUrl = `${dbUrl}${separator}${poolParams}`
          urlModified = true
        } catch {
          // Last resort: use URL as-is
        }
      }

      if (urlModified) {
        console.log('[db] URL modification successful — pool params injected (connection_limit=1)')
      } else {
        console.error('[db] WARNING: Could not modify DATABASE_URL — Prisma will use DEFAULT pool size (5)')
      }
    }

    return new PrismaClient({
      ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
      log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    })
  })()

// Always cache on globalThis (not just in dev)
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db
}

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
