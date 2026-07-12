import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []
  const errors: string[] = []

  // Drop corrupted tables
  const corruptedTables = ['RiskEvent', 'AiUsageLog', 'OrderEvent']
  for (const table of corruptedTables) {
    try {
      const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = $1) as exists`,
        table,
      )
      if (!exists[0]?.exists) {
        results.push(`${table}: does not exist`)
        continue
      }
      try {
        await db.$queryRawUnsafe(`SELECT count(*) FROM "${table}" LIMIT 1`)
        results.push(`${table}: accessible, keeping`)
      } catch {
        await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`)
        results.push(`${table}: DROPPED`)
      }
    } catch (err: any) {
      errors.push(`${table}: ${err?.message?.substring(0, 150)}`)
    }
  }

  // Drop unused indexes
  const unusedIndexes = [
    'AuditLog_action_idx',
    'AuditLog_userId_idx',
    'TradeLifecycleLog_positionId_createdAt_idx',
    'TradeLifecycleLog_createdAt_idx',
    'TradeLifecycleLog_positionId_idx',
    'TradeLifecycleLog_userId_idx',
    'TradeLifecycleLog_closingSource_idx',
    'TradeLifecycleLog_eventType_idx',
    'Session_userId_isActive_idx',
    'Session_userId_idx',
    'Session_expiresAt_idx',
  ]
  for (const name of unusedIndexes) {
    try {
      await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${name}"`)
      results.push(`${name}: dropped`)
    } catch (err: any) {
      errors.push(`${name}: ${err?.message?.substring(0, 100)}`)
    }
  }

  // Get DB size
  let dbSize = '?'
  try {
    const sizeResult = await db.$queryRawUnsafe<{ size: string }[]>(
      `SELECT pg_size_pretty(pg_database_size('railway')) as size`,
    )
    dbSize = sizeResult[0]?.size || '?'
  } catch {}

  return NextResponse.json({ success: true, results, errors, dbSize })
}
