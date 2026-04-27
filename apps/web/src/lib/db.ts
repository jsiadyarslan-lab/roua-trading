import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

// In production, also cache the PrismaClient on globalThis to prevent
// hot-reloading from creating multiple connections.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

// Always cache on globalThis (not just in dev)
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db
}

/**
 * Ensure the database is ready for queries.
 *
 * Improvement over the previous version:
 * - Explicitly calls $connect() before querying, instead of relying on
 *   Prisma's lazy connection which can silently fail
 * - Retries up to 3 times with increasing delay (1s, 2s, 3s)
 * - Returns true if DB is ready, false otherwise
 * - Calling code can check the return value to decide fallback behavior
 *
 * If DB was previously initialized but a query fails later, call
 * resetDbInitialized() to force re-connection on the next call.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  const MAX_RETRIES = 3

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Explicitly connect before querying — this establishes the connection
      // pool instead of relying on lazy connection which can fail silently
      await db.$connect()

      // Verify by querying the User table (core table for auth)
      await db.user.findFirst()

      globalForPrisma.dbInitialized = true
      console.log('[db] Database connection established and verified')
      return true
    } catch (error: any) {
      const message = error?.message || 'Database is not ready'

      if (message.includes('does not exist') || message.includes('no such table')) {
        console.error('[db] User table not found — Prisma schema may not be applied:', message)
        // Table doesn't exist — retrying won't help, break early
        return false
      }

      console.error(
        `[db] Database readiness check failed (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        message,
      )

      if (attempt < MAX_RETRIES - 1) {
        const delay = 1000 * (attempt + 1)
        console.log(`[db] Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  console.error('[db] All connection attempts failed — DB is unavailable')
  return false
}

/**
 * Reset the DB initialized flag so the next ensureDbReady() call
 * will attempt to reconnect. Call this when a DB operation fails
 * with a connection error.
 */
export function resetDbInitialized() {
  globalForPrisma.dbInitialized = false
}
