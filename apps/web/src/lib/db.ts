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
    // User table: add telegramChatId (used by alert-agent for Telegram notifications)
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT`,
    // Subscription table
    `CREATE TABLE IF NOT EXISTS "Subscription" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tier" "Tier" NOT NULL DEFAULT 'FREE', "previousTier" "Tier", "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endDate" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'active', "paymentMethod" TEXT, "amount" DECIMAL(19,4), "currency" TEXT NOT NULL DEFAULT 'USD', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"))`,
    `CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId")`,
    `CREATE INDEX IF NOT EXISTS "Subscription_tier_idx" ON "Subscription"("tier")`,
    `CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status")`,
    `CREATE INDEX IF NOT EXISTS "Subscription_createdAt_idx" ON "Subscription"("createdAt")`,
    // AiUsageLog table
    `CREATE TABLE IF NOT EXISTS "AiUsageLog" ("id" TEXT NOT NULL, "userId" TEXT, "model" TEXT NOT NULL, "provider" TEXT NOT NULL, "endpoint" TEXT NOT NULL, "inputTokens" INTEGER NOT NULL DEFAULT 0, "outputTokens" INTEGER NOT NULL DEFAULT 0, "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0, "latencyMs" INTEGER NOT NULL DEFAULT 0, "cached" BOOLEAN NOT NULL DEFAULT false, "success" BOOLEAN NOT NULL DEFAULT true, "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id"))`,
    `CREATE INDEX IF NOT EXISTS "AiUsageLog_model_idx" ON "AiUsageLog"("model")`,
    `CREATE INDEX IF NOT EXISTS "AiUsageLog_provider_idx" ON "AiUsageLog"("provider")`,
    `CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_idx" ON "AiUsageLog"("userId")`,
    `CREATE INDEX IF NOT EXISTS "AiUsageLog_cached_idx" ON "AiUsageLog"("cached")`,
    // NotificationConfig table
    `CREATE TABLE IF NOT EXISTS "NotificationConfig" ("id" TEXT NOT NULL, "type" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false, "config" TEXT NOT NULL DEFAULT '{}', "description" TEXT, "lastTriggeredAt" TIMESTAMP(3), "triggerCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "NotificationConfig_type_key" ON "NotificationConfig"("type")`,
    `CREATE INDEX IF NOT EXISTS "NotificationConfig_type_idx" ON "NotificationConfig"("type")`,
    `CREATE INDEX IF NOT EXISTS "NotificationConfig_enabled_idx" ON "NotificationConfig"("enabled")`,
    // AdminSession table
    `CREATE TABLE IF NOT EXISTS "AdminSession" ("id" TEXT NOT NULL, "token" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_token_key" ON "AdminSession"("token")`,
    `CREATE INDEX IF NOT EXISTS "AdminSession_token_idx" ON "AdminSession"("token")`,
    `CREATE INDEX IF NOT EXISTS "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt")`,
    // Add PRO/PLUS to Tier enum if not exists
    `ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'PRO'`,
    `ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'PLUS'`,
    // Setting table (key-value system settings)
    `CREATE TABLE IF NOT EXISTS "Setting" ("id" TEXT NOT NULL, "key" TEXT NOT NULL, "value" TEXT NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Setting_pkey" PRIMARY KEY ("id"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Setting_key_key" ON "Setting"("key")`,
    `CREATE INDEX IF NOT EXISTS "Setting_key_idx" ON "Setting"("key")`,
    // VerificationToken table (OTP, etc.)
    `CREATE TABLE IF NOT EXISTS "VerificationToken" ("id" TEXT NOT NULL, "identifier" TEXT NOT NULL, "token" TEXT NOT NULL, "expires" TIMESTAMP(3) NOT NULL, CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token")`,
    `CREATE INDEX IF NOT EXISTS "VerificationToken_identifier_idx" ON "VerificationToken"("identifier")`,
    `CREATE INDEX IF NOT EXISTS "VerificationToken_expires_idx" ON "VerificationToken"("expires")`,
  ]

  let migrationErrors = 0
  for (const sql of migrations) {
    try {
      await db.$executeRawUnsafe(sql)
    } catch (err: any) {
      migrationErrors++
      // Log migration errors instead of silently swallowing them
      // "already exists" errors are expected and non-fatal
      const msg = err?.message || String(err)
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        // Expected — column/table/index already exists
      } else {
        console.warn(`[db] Migration warning: ${msg.substring(0, 200)}`)
      }
    }
  }

  // Verify critical tables exist after migrations (including AiUsageLog for dashboard costs)
  try {
    const tableCheck = await db.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('Setting', 'NotificationConfig', 'AdminSession', 'AiUsageLog')
      ORDER BY table_name
    `
    const foundTables = (tableCheck as any[]).map((r: any) => r.table_name)
    const missingTables = ['Setting', 'NotificationConfig', 'AdminSession', 'AiUsageLog'].filter(t => !foundTables.includes(t))
    if (missingTables.length > 0) {
      console.error(`[db] CRITICAL: Tables still missing after migrations: ${missingTables.join(', ')}`)
    } else {
      console.log('[db] All critical tables verified: Setting, NotificationConfig, AdminSession, AiUsageLog')
    }
  } catch (err: any) {
    console.warn(`[db] Could not verify table existence: ${err?.message || err}`)
  }

  globalForPrisma.schemaMigrated = true
  if (migrationErrors > 0) {
    console.log(`[db] Schema migrations completed with ${migrationErrors} warnings`)
  } else {
    console.log('[db] Schema migrations completed successfully')
  }
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
