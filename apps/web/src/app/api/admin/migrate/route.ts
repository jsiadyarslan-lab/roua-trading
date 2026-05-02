import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

/**
 * Emergency migration endpoint — adds missing columns to existing tables.
 *
 * This is needed because `prisma db push` in start.sh may fail silently,
 * and `CREATE TABLE IF NOT EXISTS` doesn't add columns to existing tables.
 * The result is schema drift where Prisma expects columns that don't exist
 * in the actual database, causing P2022 errors and 401 responses.
 *
 * Call this endpoint once after deployment to sync the schema.
 * It's safe to call multiple times — all statements are idempotent.
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ADMIN_MIGRATIONS !== 'true') {
    return NextResponse.json(
      { error: 'ADMIN_MIGRATIONS_DISABLED' },
      { status: 403 },
    )
  }

  const results: Record<string, any> = {}

  const migrations = [
    {
      name: 'Session.updatedAt',
      sql: `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'User.updatedAt',
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'User.riskTolerance',
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "riskTolerance" TEXT DEFAULT 'moderate'`,
    },
    {
      name: 'Position.updatedAt',
      sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'ExchangeCredential.updatedAt',
      sql: `ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'PaperOrder.updatedAt',
      sql: `ALTER TABLE "PaperOrder" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'TradingBot.createdAt',
      sql: `ALTER TABLE "TradingBot" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'ChartPreference.updatedAt',
      sql: `ALTER TABLE "ChartPreference" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'ChartPreference.createdAt',
      sql: `ALTER TABLE "ChartPreference" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    {
      name: 'AuditLog.userId',
      sql: `ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
    },
  ]

  for (const migration of migrations) {
    try {
      await db.$executeRawUnsafe(migration.sql)
      results[migration.name] = 'OK'
    } catch (error: any) {
      results[migration.name] = `FAILED: ${error?.message || String(error)}`
    }
  }

  // Verify the critical Session table
  try {
    await db.session.findFirst()
    results['_verification'] = 'Session table works correctly'
  } catch (error: any) {
    results['_verification'] = `FAILED: ${error?.message || String(error)}`
  }

  // Count sessions to verify
  try {
    const count = await db.session.count()
    results['_sessionCount'] = count
  } catch (error: any) {
    results['_sessionCount'] = `FAILED: ${error?.message || String(error)}`
  }

  return NextResponse.json({ success: true, migrations: results })
}
