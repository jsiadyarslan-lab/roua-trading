import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * BUG-066t: DB Repair — fix corrupted tables, drop unused indexes, VACUUM.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: {
    steps: string[]
    errors: string[]
    dbSizeBefore?: string
    dbSizeAfter?: string
  } = { steps: [], errors: [] }

  try {
    // Get DB size before
    try {
      const sizeResult = await db.$queryRawUnsafe<{ size: string }[]>(
        `SELECT pg_size_pretty(pg_database_size('railway')) as size`,
      )
      results.dbSizeBefore = sizeResult[0]?.size
      results.steps.push(`DB size before: ${results.dbSizeBefore}`)
    } catch {}

    // Step 1: Drop corrupted tables
    results.steps.push('--- Step 1: Drop corrupted tables ---')
    const corruptedTables = ['RiskEvent', 'AiUsageLog', 'OrderEvent']
    for (const table of corruptedTables) {
      try {
        const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = $1) as exists`,
          table,
        )
        if (!exists[0]?.exists) {
          results.steps.push(`  ${table}: does not exist, skipping`)
          continue
        }
        try {
          await db.$queryRawUnsafe(`SELECT count(*) FROM "${table}" LIMIT 1`)
          results.steps.push(`  ${table}: accessible, keeping`)
        } catch (queryErr: any) {
          results.steps.push(`  ${table}: CORRUPTED, dropping...`)
          await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`)
          results.steps.push(`  ${table}: dropped ✅`)
        }
      } catch (err: any) {
        results.errors.push(`${table}: ${err?.message?.substring(0, 150)}`)
      }
    }

    // Step 2: Drop unused indexes
    results.steps.push('--- Step 2: Drop unused indexes ---')
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
      'Order_idempotencyKey_key',
      'Order_userId_status_createdAt_idx',
      'Order_createdAt_idx',
      'Trade_userId_type_executedAt_idx',
    ]

    for (const name of unusedIndexes) {
      try {
        const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1) as exists`,
          name,
        )
        if (!exists[0]?.exists) continue
        await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${name}"`)
        results.steps.push(`  ${name}: dropped ✅`)
      } catch (err: any) {
        results.errors.push(`${name}: ${err?.message?.substring(0, 100)}`)
      }
    }

    // Step 3: ANALYZE tables (VACUUM can't run in transaction)
    results.steps.push('--- Step 3: ANALYZE tables ---')
    const analyzeTables = ['AuditLog', 'TradeLifecycleLog', 'Session', 'Order', 'Trade', 'Position', 'User', 'ExchangeCredential']
    for (const table of analyzeTables) {
      try {
        await db.$executeRawUnsafe(`ANALYZE "${table}"`)
        results.steps.push(`  ${table}: analyzed ✅`)
      } catch (err: any) {
        results.errors.push(`${table} ANALYZE: ${err?.message?.substring(0, 100)}`)
      }
    }

    // Get DB size after
    try {
      const sizeResult = await db.$queryRawUnsafe<{ size: string }[]>(
        `SELECT pg_size_pretty(pg_database_size('railway')) as size`,
      )
      results.dbSizeAfter = sizeResult[0]?.size
      results.steps.push(`DB size after: ${results.dbSizeAfter}`)
    } catch {}

    return NextResponse.json({
      success: true,
      ...results,
    })
  } catch (err: any) {
    results.errors.push(`Fatal: ${err?.message?.substring(0, 200)}`)
    return NextResponse.json(
      { success: false, ...results },
      { status: 500 },
    )
  }
}
