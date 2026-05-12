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
  (() => {
    // FIX: Add connection pool params to match backend PrismaService.
    // Without these, the frontend PrismaClient uses Prisma's default pool
    // settings which can exhaust connections or timeout during cold starts.
    let dbUrl = process.env.DATABASE_URL
    if (dbUrl) {
      try {
        const url = new URL(dbUrl)
        url.searchParams.set('connection_limit', '10')
        url.searchParams.set('pool_timeout', '30')
        dbUrl = url.toString()
      } catch {
        // If URL parsing fails, use original URL as-is
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
    // ── AgentStrategy enum (CRITICAL for Autonomous Trader) ──
    // The PostgreSQL enum must exist and have all 8 values.
    // If the enum doesn't exist (prisma db push skipped it), queries using
    // AgentStrategy will throw "invalid input value for enum" errors.
    // CREATE TYPE IF NOT EXISTS is NOT supported in PostgreSQL, so we use
    // DO $$ BEGIN ... EXCEPTION WHEN duplicate_object pattern.
    `DO $$ BEGIN CREATE TYPE "AgentStrategy" AS ENUM ('AUTO', 'SCALPING', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    // Add any missing values to existing AgentStrategy enum
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'AUTO'`,
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'SCALPING'`,
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'SWING'`,
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'GRID'`,
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'MEAN_REVERSION'`,
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'MOMENTUM_BREAKOUT'`,
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'DCA'`,
    `ALTER TYPE "AgentStrategy" ADD VALUE IF NOT EXISTS 'VWAP_RSI'`,
    // ── AgentTradeStatus enum ──
    `DO $$ BEGIN CREATE TYPE "AgentTradeStatus" AS ENUM ('PENDING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'FAILED', 'REJECTED', 'CLOSED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'PENDING'`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'FILLED'`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_FILLED'`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'CANCELLED'`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'FAILED'`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'REJECTED'`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'CLOSED'`,
    `ALTER TYPE "AgentTradeStatus" ADD VALUE IF NOT EXISTS 'EXPIRED'`,
    // ── AgentExitReason enum ──
    `DO $$ BEGIN CREATE TYPE "AgentExitReason" AS ENUM ('TAKE_PROFIT', 'STOP_LOSS', 'MANUAL', 'TRAILING_STOP', 'STRATEGY_EXIT', 'TIMEOUT', 'SIGNAL_REVERSAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `ALTER TYPE "AgentExitReason" ADD VALUE IF NOT EXISTS 'TAKE_PROFIT'`,
    `ALTER TYPE "AgentExitReason" ADD VALUE IF NOT EXISTS 'STOP_LOSS'`,
    `ALTER TYPE "AgentExitReason" ADD VALUE IF NOT EXISTS 'MANUAL'`,
    `ALTER TYPE "AgentExitReason" ADD VALUE IF NOT EXISTS 'TRAILING_STOP'`,
    `ALTER TYPE "AgentExitReason" ADD VALUE IF NOT EXISTS 'STRATEGY_EXIT'`,
    `ALTER TYPE "AgentExitReason" ADD VALUE IF NOT EXISTS 'TIMEOUT'`,
    `ALTER TYPE "AgentExitReason" ADD VALUE IF NOT EXISTS 'SIGNAL_REVERSAL'`,
    // ── AutonomousTrade: Convert TEXT columns to native enum types ──
    // The original migration created strategy/status/exitReason as TEXT,
    // but the Prisma schema defines them as native PostgreSQL enums.
    // Without this ALTER, Prisma reads/writes using typed enums but
    // the database stores TEXT, causing "invalid input value for enum" errors.
    `ALTER TABLE "AutonomousTrade" ALTER COLUMN "strategy" TYPE "AgentStrategy" USING "strategy"::"AgentStrategy"`,
    `ALTER TABLE "AutonomousTrade" ALTER COLUMN "status" TYPE "AgentTradeStatus" USING "status"::"AgentTradeStatus"`,
    `ALTER TABLE "AutonomousTrade" ALTER COLUMN "exitReason" TYPE "AgentExitReason" USING "exitReason"::"AgentExitReason"`,
    // ── Session table: cross-device sync columns (CRITICAL for Google OAuth + refresh tokens) ──
    // These MUST be added before any session.create() call, because Prisma's
    // RETURNING clause references ALL model columns. If any column is missing,
    // PostgreSQL throws "column does not exist" — even for "minimal" creates.
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "deviceInfo" TEXT`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userAgent" TEXT`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "riskTolerance" TEXT DEFAULT 'moderate'`,
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passkeyCounter" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "PaperOrder" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "TradingBot" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "ChartPreference" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "ChartPreference" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
    // User table: add telegramChatId (used by alert-agent for Telegram notifications)
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT`,
    // Session table: add unique index on refreshToken (needed by Prisma schema @unique)
    `CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshToken_key" ON "Session"("refreshToken")`,
    `CREATE INDEX IF NOT EXISTS "Session_refreshToken_idx" ON "Session"("refreshToken")`,
    `CREATE INDEX IF NOT EXISTS "Session_userId_isActive_idx" ON "Session"("userId", "isActive")`,
    `CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt")`,
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
      // SECURITY: Using $executeRawUnsafe with hardcoded SQL strings only.
      // These SQL strings contain no user input and are defined above as
      // const string literals. Prisma's $executeRaw tagged template is
      // preferred for parameterized queries, but for static DDL statements
      // like ALTER TABLE / CREATE TABLE, $executeRawUnsafe is acceptable
      // since there are no dynamic values to inject.
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

  // Verify critical tables + Session columns exist after migrations
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

    // Verify Session table has the critical cross-device sync columns
    const sessionColumns = await db.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Session'
      ORDER BY column_name
    `
    const columnNames = (sessionColumns as any[]).map((r: any) => r.column_name)
    const requiredSessionColumns = ['refreshToken', 'deviceInfo', 'ipAddress', 'userAgent', 'isActive', 'updatedAt']
    const missingColumns = requiredSessionColumns.filter(c => !columnNames.includes(c))
    if (missingColumns.length > 0) {
      console.error(`[db] CRITICAL: Session table missing columns: ${missingColumns.join(', ')} — Google OAuth and session refresh will FAIL`)
    } else {
      console.log('[db] Session table has all required columns for cross-device sync')
    }
  } catch (err: any) {
    console.warn(`[db] Could not verify table/column existence: ${err?.message || err}`)
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
 * - Retries up to 5 times with exponential backoff (2s, 4s, 6s, 8s, 10s = 30s total)
 * - Returns true if DB is ready, false otherwise
 * - Stores the last error in globalForPrisma.dbInitError for diagnostics
 *
 * If DB was previously initialized but a query fails later, call
 * resetDbInitialized() to force re-connection on the next call.
 *
 * FIX: Increased from 3 retries (6s total) to 5 retries (30s total) with
 * exponential backoff. Railway cold starts can take 45-60s, and the OAuth
 * callback needs the DB to be ready. The longer timeout gives PostgreSQL
 * time to accept connections during cold starts.
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) return true

  const MAX_RETRIES = 10 // Increased from 5 to handle slow Railway cold starts
  const dbUrl = process.env.DATABASE_URL || '(not set)'

  console.log(`[db] ensureDbReady() starting — Retries: ${MAX_RETRIES}, URL prefix: ${dbUrl.substring(0, 35)}...`)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 1. Establish connection
      await db.$connect()

      // 2. Run migrations if needed (only once per process)
      if (!globalForPrisma.schemaMigrated) {
        console.log(`[db] Running safety-net migrations (Attempt ${attempt + 1})...`)
        await runSchemaMigrations()
      }

      // 3. Verify core table access
      await db.user.findFirst()

      globalForPrisma.dbInitialized = true
      globalForPrisma.dbInitError = undefined
      console.log('[db] Database successfully initialized and verified.')
      return true
    } catch (error: any) {
      const message = error?.message || 'Unknown database error'
      const code = error?.code || 'NO_CODE'
      globalForPrisma.dbInitError = `[${code}] ${message}`

      // Specific handling for "Table not found" — usually means db push didn't run yet
      if (message.includes('does not exist') || message.includes('P2021')) {
        console.warn(`[db] Table missing (Attempt ${attempt + 1}). This is expected if migrations are still running.`)
      } else {
        console.error(`[db] Connection attempt ${attempt + 1} failed: [${code}] ${message.substring(0, 200)}`)
      }

      if (attempt < MAX_RETRIES - 1) {
        // Incremental delay: 1s, 2s, 3s, ... 10s (Total ~55s)
        const delay = 1000 * (attempt + 1)
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
