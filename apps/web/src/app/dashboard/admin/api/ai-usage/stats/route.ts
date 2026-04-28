import { NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - 7)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Total requests & cost per period
    const [todayLogs, weekLogs, monthLogs] = await Promise.all([
      db.aiUsageLog.findMany({ where: { createdAt: { gte: todayStart } } }),
      db.aiUsageLog.findMany({ where: { createdAt: { gte: weekStart } } }),
      db.aiUsageLog.findMany({ where: { createdAt: { gte: monthStart } } }),
    ])

    const sumCost = (logs: typeof todayLogs) => logs.reduce((s, l) => s + Number(l.costUsd), 0)
    const sumTokens = (logs: typeof todayLogs) => ({
      input: logs.reduce((s, l) => s + l.inputTokens, 0),
      output: logs.reduce((s, l) => s + l.outputTokens, 0),
    })

    // Cost by model
    const allLogs = await db.aiUsageLog.findMany({ where: { createdAt: { gte: thirtyDaysAgo } } })

    const byModel: Record<string, { provider: string; requests: number; inputTokens: number; outputTokens: number; cost: number; avgLatency: number; errors: number }> = {}
    for (const log of allLogs) {
      if (!byModel[log.model]) {
        byModel[log.model] = { provider: log.provider, requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, avgLatency: 0, errors: 0 }
      }
      byModel[log.model].requests++
      byModel[log.model].inputTokens += log.inputTokens
      byModel[log.model].outputTokens += log.outputTokens
      byModel[log.model].cost += Number(log.costUsd)
      byModel[log.model].avgLatency += log.latencyMs
      if (!log.success) byModel[log.model].errors++
    }
    // Compute average latency
    for (const key of Object.keys(byModel)) {
      if (byModel[key].requests > 0) {
        byModel[key].avgLatency = Math.round(byModel[key].avgLatency / byModel[key].requests)
      }
    }

    // Cost by endpoint
    const byEndpoint: Record<string, { requests: number; cost: number }> = {}
    for (const log of allLogs) {
      if (!byEndpoint[log.endpoint]) {
        byEndpoint[log.endpoint] = { requests: 0, cost: 0 }
      }
      byEndpoint[log.endpoint].requests++
      byEndpoint[log.endpoint].cost += Number(log.costUsd)
    }

    // Cache hit rate
    const cachedCount = allLogs.filter(l => l.cached).length
    const cacheRate = allLogs.length > 0 ? Math.round((cachedCount / allLogs.length) * 100) : 0

    // Daily cost trend
    const dailyCost: Record<string, number> = {}
    for (const log of allLogs) {
      const day = log.createdAt.toISOString().split('T')[0]
      dailyCost[day] = (dailyCost[day] || 0) + Number(log.costUsd)
    }

    return NextResponse.json({
      summary: {
        today: { requests: todayLogs.length, cost: sumCost(todayLogs), tokens: sumTokens(todayLogs) },
        week: { requests: weekLogs.length, cost: sumCost(weekLogs), tokens: sumTokens(weekLogs) },
        month: { requests: monthLogs.length, cost: sumCost(monthLogs), tokens: sumTokens(monthLogs) },
        cacheRate,
      },
      byModel: Object.entries(byModel).map(([model, data]) => ({ model, ...data })),
      byEndpoint: Object.entries(byEndpoint).map(([endpoint, data]) => ({ endpoint, ...data })),
      dailyCost,
    })
  } catch (error: any) {
    console.error('[admin/ai-usage/stats] Error:', error?.message || error)
    return NextResponse.json({
      summary: { today: { requests: 0, cost: 0, tokens: { input: 0, output: 0 } }, week: { requests: 0, cost: 0, tokens: { input: 0, output: 0 } }, month: { requests: 0, cost: 0, tokens: { input: 0, output: 0 } }, cacheRate: 0 },
      byModel: [],
      byEndpoint: [],
      dailyCost: {},
    })
  }
}
