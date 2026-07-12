import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== 'Bearer emergency-cleanup-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: any = { steps: [], deleted: 0, errors: [] }

  try {
    const { Client } = await import('pg')
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 30000,
      query_timeout: 300000,
    })

    await client.connect()
    results.steps.push('Connected ✅')

    const tables = [
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

    for (const { name, dateField, days } of tables) {
      try {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - days)
        const result = await client.query(
          `DELETE FROM "${name}" WHERE "${dateField}" < $1`,
          [cutoff.toISOString()]
        )
        const deleted = result.rowCount || 0
        results.deleted += deleted
        if (deleted > 0) results.steps.push(`🗑️ ${name}: ${deleted} deleted`)
      } catch (err: any) {
        results.errors.push(`${name}: ${err.message}`)
      }
    }

    await client.end()
    results.steps.push(`Total: ${results.deleted} rows deleted`)
  } catch (err: any) {
    results.steps.push(`FATAL: ${err.message}`)
  }

  return NextResponse.json(results)
}
