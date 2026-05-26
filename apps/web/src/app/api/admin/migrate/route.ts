import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

/**
 * Emergency migration endpoint — DEPRECATED.
 *
 * ALL schema changes must ONLY be done via:
 *   1. `prisma migrate deploy` (in start.sh — production-safe, tracked)
 *   2. `prisma migrate dev` (local development)
 *
 * This endpoint previously ran ALTER TABLE statements via $executeRawUnsafe,
 * which is an anti-pattern that:
 *   - Conflicts with Prisma schema management
 *   - Competes for DB connections during deployment
 *   - Can cause schema drift and data corruption
 *   - Masked real migration issues instead of fixing them
 *
 * Now: This endpoint only VERIFIES the schema is in sync and reports status.
 * It does NOT execute any DDL (CREATE/ALTER/DROP).
 *
 * 🔒 SECURITY: Requires admin authentication.
 */
export async function POST(req: NextRequest) {
  // 🔒 Require admin auth
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const results: Record<string, any> = {}

  // Verify database connectivity
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({
        success: false,
        error: 'قاعدة البيانات غير متاحة — لا يمكن التحقق من Schema',
        migrations: {},
      }, { status: 503 })
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: `فشل الاتصال بقاعدة البيانات: ${error?.message || 'خطأ غير معروف'}`,
      migrations: {},
    }, { status: 503 })
  }

  // Verify critical tables exist by attempting a simple query on each
  const tableChecks = [
    { name: 'Session', fn: () => db.session.findFirst() },
    { name: 'User', fn: () => db.user.findFirst() },
    { name: 'Setting', fn: () => db.setting.findFirst() },
    { name: 'Position', fn: () => db.position.findFirst() },
    { name: 'ExchangeCredential', fn: () => db.exchangeCredential.findFirst() },
    { name: 'TradingBrief', fn: () => db.tradingBrief.findFirst() },
    { name: 'AuditLog', fn: () => db.auditLog.findFirst() },
  ]

  for (const check of tableChecks) {
    try {
      await check.fn()
      results[check.name] = 'OK — table exists and accessible'
    } catch (error: any) {
      const msg = error?.message || String(error)
      if (msg.includes('does not exist') || error?.code === 'P2021') {
        results[check.name] = 'MISSING — table does not exist, run `prisma db push` or `prisma migrate deploy`'
      } else {
        results[check.name] = `ERROR: ${msg.substring(0, 200)}`
      }
    }
  }

  // Count sessions for verification
  try {
    const count = await db.session.count()
    results['_sessionCount'] = count
  } catch (error: any) {
    results['_sessionCount'] = `FAILED: ${error?.message || String(error)}`
  }

  const hasErrors = Object.values(results).some(v => typeof v === 'string' && (v.includes('MISSING') || v.includes('ERROR')))

  return NextResponse.json({
    success: !hasErrors,
    message: hasErrors
      ? 'بعض الجداول مفقودة — يرجى تشغيل prisma db push أو prisma migrate deploy'
      : 'جميع الجداول موجودة ويمكن الوصول إليها',
    migrations: results,
  })
}

/**
 * GET — Quick schema verification (read-only, no modifications)
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const results: Record<string, any> = {}

  // Quick table existence check
  const tables = ['Session', 'User', 'Setting', 'Position', 'TradingBrief', 'AuditLog']
  for (const table of tables) {
    try {
      // Use a raw query to check table existence without Prisma model dependency
      const result = await db.$queryRawUnsafe(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        table
      )
      results[table] = result
    } catch (error: any) {
      results[table] = `ERROR: ${error?.message || 'unknown'}`
    }
  }

  return NextResponse.json({ success: true, tables: results })
}
