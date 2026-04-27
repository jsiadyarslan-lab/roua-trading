import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
  dbInitError: string | undefined
  schemaMigrated: boolean | undefined
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
 * Run safety-net migrations to add missing columns.
 *
 * This handles schema drift from iterative deploys where:
 * - `prisma db push` fails silently
 * - `CREATE TABLE IF NOT EXISTS` skips existing tables with missing columns
 * - Prisma expects columns that don't exist (causing P2022 errors)
 *
 * Uses ALTER TABLE ADD COLUMN IF NOT EXISTS — idempotent and safe.
 * Runs once per process lifetime (flagged by globalForPrisma.schemaMigrated).
 */
async function runSchemaMigrations(): Promise<void> {
  if (globalForPrisma.schemaMigrated) return

  const migrations = [
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "riskTolerance" TEXT DEFAULT 'moderate'`,
    `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "PaperOrder" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "TradingBot" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "ChartPreference" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "ChartPreference" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  ]

  for (const sql of migrations) {
    try {
      await db.$executeRawUnsafe(sql)
    } catch {
      // Column already exists or other non-fatal issue — ignore
    }
  }

  globalForPrisma.schemaMigrated = true
  console.log('[db] Schema migrations completed')
}

/**
 * Ensure the database is ready for queries.
 *
 * - Explicitly calls $connect() before querying, instead of relying on
 *   Prisma's lazy connection which can silently fail
 * - Runs safety-net schema migrations for missing columns
 * - Retries up to 3 times with increasing delay (1s, 2s, 3s)
 * - Returns true if DB is ready, false otherwise
 * - Stores the last error in globalForPrisma.dbInitError for diagnostics
 *
 * If DB was previously initialized but a query fails later, call
 * resetDbInitialized() to force re-connection on the next call.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  const MAX_RETRIES = 3
  const dbUrl = process.env.DATABASE_URL || '(not set)'

  console.log(`[db] ensureDbReady() called — DATABASE_URL prefix: ${dbUrl.substring(0, 35)}...`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Explicitly connect before querying — this establishes the connection
      // pool instead of relying on lazy connection which can fail silently
      await db.$connect()

      // Run safety-net migrations for missing columns before verifying
      await runSchemaMigrations()

      // Verify by querying the User table (core table for auth)
      await db.user.findFirst()

      globalForPrisma.dbInitialized = true
      globalForPrisma.dbInitError = undefined
      console.log('[db] Database connection established and verified')
      return true
    } catch (error: any) {
      const message = error?.message || 'Database is not ready'
      const code = error?.code || '(no code)'
      globalForPrisma.dbInitError = `[${code}] ${message}`

      if (message.includes('does not exist') || message.includes('no such table')) {
        console.error('[db] User table not found — Prisma schema may not be applied:', message)
        // Table doesn't exist — retrying won't help, break early
        return false
      }

      console.error(
        `[db] Database readiness check failed (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        `[${code}] ${message}`,
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
