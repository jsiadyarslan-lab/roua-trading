import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * BUG-066s: Direct DB cleanup endpoint — bypasses NestJS proxy entirely.
 *
 * PROBLEM: The NestJS proxy fails when the DB connection pool is exhausted.
 * The /api/maintenance/cleanup-db endpoint goes through the proxy, so it
 * becomes unreachable when the DB is overloaded — the exact time we need it.
 *
 * FIX: This route runs directly in Next.js using its own PrismaClient.
 * It does NOT go through the NestJS proxy. Security is enforced by
 * X-Admin-Token header check against ADMIN_PASSWORD env var.
 *
 * Uses batched DELETE (5000 rows per batch) via raw SQL to avoid
 * long-running transactions that hold locks.
 *
 * Does NOT touch: User, Position, Trade, Order, AgentSettings,
 * ExchangeCredential, Setting, Session, Account, Portfolio, ApiKey, Subscription.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

const TABLES: { name: string; dateField: string; days: number }[] = [
  { name: 'RiskEvent', dateField: 'createdAt', days: 3 },
  { name: 'AuditLog', dateField: 'createdAt', days: 7 },
  { name: 'AiUsageLog', dateField: 'createdAt', days: 7 },
  { name: 'OrderEvent', dateField: 'timestamp', days: 14 },
  { name: 'TradeLifecycleLog', dateField: 'createdAt', days: 14 },
  { name: 'PositionReconciliation', dateField: 'createdAt', days: 14 },
  { name: 'MarketRegimeSnapshot', dateField: 'createdAt', days: 14 },
  { name: 'SystemMemory', dateField: 'createdAt', days: 14 },
  { name: 'CouncilVoteAccuracy', dateField: 'createdAt', days: 14 },
  { name: 'TradeJournal', dateField: 'createdAt', days: 30 },
  { name: 'CrossPairCorrelation', dateField: 'createdAt', days: 14 },
  { name: 'AdaptiveSchedule', dateField: 'createdAt', days: 14 },
  { name: 'NewsArticle', dateField: 'createdAt', days: 30 },
  { name: 'ContentArticle', dateField: 'createdAt', days: 30 },
  { name: 'ContentSchedule', dateField: 'createdAt', days: 14 },
  { name: 'StrategyReport', dateField: 'createdAt', days: 30 },
  { name: 'Alert', dateField: 'createdAt', days: 14 },
  { name: 'UserNotification', dateField: 'createdAt', days: 14 },
]

const BATCH_SIZE = 5000
const MAX_BATCHES_PER_TABLE = 200

export async function POST(request: NextRequest) {
  // Security: check admin token
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const results: {
    steps: string[]
    deleted: number
    errors: string[]
    tableCounts: Record<string, { before: number; after: number; deleted: number }>
    dbSizeBefore?: string
    dbSizeAfter?: string
  } = {
    steps: [],
    deleted: 0,
    errors: [],
    tableCounts: {},
  }

  try {
    // Get DB size before
    try {
      const sizeResult = await db.$queryRawUnsafe<{ size: string }[]>(
        `SELECT pg_size_pretty(pg_database_size('railway')) as size`,
      )
      results.dbSizeBefore = sizeResult[0]?.size
      results.steps.push(`DB size before: ${results.dbSizeBefore}`)
    } catch {
      // Non-critical
    }

    // Process each table
    for (const { name, dateField, days } of TABLES) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)

      // Get count before
      let countBefore = 0
      try {
        const countResult = await db.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT count(*) as count FROM "${name}" WHERE "${dateField}" < $1`,
          cutoff,
        )
        countBefore = Number(countResult[0]?.count || 0)
      } catch (err: any) {
        results.errors.push(
          `${name} (count): ${err?.message?.substring(0, 150) || 'unknown error'}`,
        )
        continue
      }

      if (countBefore === 0) {
        results.tableCounts[name] = { before: 0, after: 0, deleted: 0 }
        continue
      }

      // Batched DELETE
      let tableDeleted = 0
      let batchCount = 0
      let consecutiveErrors = 0

      while (batchCount < MAX_BATCHES_PER_TABLE) {
        try {
          const result = await db.$executeRawUnsafe(
            `DELETE FROM "${name}" WHERE "ctid" IN (SELECT "ctid" FROM "${name}" WHERE "${dateField}" < $1 LIMIT ${BATCH_SIZE})`,
            cutoff,
          )

          if (result === 0) break
          tableDeleted += result
          batchCount++
          consecutiveErrors = 0
        } catch (err: any) {
          consecutiveErrors++
          if (
            err?.message?.includes('does not exist') ||
            err?.message?.includes('column')
          ) {
            results.errors.push(
              `${name}: ${err.message.substring(0, 150)}`,
            )
            break
          }
          if (consecutiveErrors >= 3) {
            results.errors.push(
              `${name}: ${err?.message?.substring(0, 150)} (after 3 retries)`,
            )
            break
          }
          await new Promise((r) => setTimeout(r, 500))
        }
      }

      // Get count after
      let countAfter = 0
      try {
        const countResult = await db.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT count(*) as count FROM "${name}" WHERE "${dateField}" < $1`,
          cutoff,
        )
        countAfter = Number(countResult[0]?.count || 0)
      } catch {
        // Non-critical
      }

      results.deleted += tableDeleted
      results.tableCounts[name] = {
        before: countBefore,
        after: countAfter,
        deleted: tableDeleted,
      }

      if (tableDeleted > 0) {
        results.steps.push(
          `🗑️ ${name}: ${tableDeleted} rows deleted (${batchCount} batches, was ${countBefore}, now ${countAfter} old rows remain)`,
        )
      }
    }

    // Get DB size after
    try {
      const sizeResult = await db.$queryRawUnsafe<{ size: string }[]>(
        `SELECT pg_size_pretty(pg_database_size('railway')) as size`,
      )
      results.dbSizeAfter = sizeResult[0]?.size
      results.steps.push(`DB size after: ${results.dbSizeAfter}`)
    } catch {
      // Non-critical
    }

    results.steps.push(`Total deleted: ${results.deleted} rows`)

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

export async function GET(request: NextRequest) {
  // GET returns DB stats without deleting anything
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    // DB size
    const sizeResult = await db.$queryRawUnsafe<{ size: string }[]>(
      `SELECT pg_size_pretty(pg_database_size('railway')) as size`,
    )

    // Table counts
    const tables = [
      'User', 'Position', 'Trade', 'Order', 'AgentSettings',
      'ExchangeCredential', 'Session', 'Account', 'ApiKey',
      'RiskEvent', 'AuditLog', 'AiUsageLog', 'OrderEvent',
      'TradeLifecycleLog', 'PositionReconciliation',
    ]
    const counts: Record<string, number> = {}
    for (const table of tables) {
      try {
        const result = await db.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT count(*) as count FROM "${table}"`,
        )
        counts[table] = Number(result[0]?.count || 0)
      } catch {
        counts[table] = -1 // table doesn't exist
      }
    }

    return NextResponse.json({
      success: true,
      dbSize: sizeResult[0]?.size,
      counts,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message?.substring(0, 300) },
      { status: 500 },
    )
  }
}
