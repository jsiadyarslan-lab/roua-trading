import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

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
    const oneHourAgo = new Date(now)
    oneHourAgo.setHours(oneHourAgo.getHours() - 1)

    // Use aggregate queries instead of loading all records — much faster and less memory
    const [todayAgg, weekAgg, monthAgg] = await Promise.all([
      db.aiUsageLog.aggregate({
        where: { createdAt: { gte: todayStart } },
        _count: true,
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
      db.aiUsageLog.aggregate({
        where: { createdAt: { gte: weekStart } },
        _count: true,
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
      db.aiUsageLog.aggregate({
        where: { createdAt: { gte: monthStart } },
        _count: true,
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
    ])

    const sumCost = (agg: typeof todayAgg) => Number(agg._sum.costUsd || 0)
    const sumTokens = (agg: typeof todayAgg) => ({
      input: agg._sum.inputTokens || 0,
      output: agg._sum.outputTokens || 0,
    })

    // FIX: Use groupBy instead of findMany to avoid loading all 30-day records into memory

    // Get by-model stats via groupBy
    const modelGroups = await db.aiUsageLog.groupBy({
      by: ['model', 'provider'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      _avg: { latencyMs: true },
      _count: true,
    })

    // Get error counts per model
    const errorGroups = await db.aiUsageLog.groupBy({
      by: ['model'],
      where: { createdAt: { gte: thirtyDaysAgo }, success: false },
      _count: true,
    })
    const errorCounts: Record<string, number> = {}
    for (const eg of errorGroups) {
      errorCounts[eg.model] = eg._count
    }

    // Get recent activity (last 1 hour) for active status
    const recentModels = await db.aiUsageLog.groupBy({
      by: ['model'],
      where: { createdAt: { gte: oneHourAgo } },
      _count: true,
    })
    const activeModels = new Set(recentModels.map(r => r.model))

    // Get last used time per model
    const lastUsedResults = await db.aiUsageLog.groupBy({
      by: ['model'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _max: { createdAt: true },
    })
    const lastUsedMap: Record<string, Date> = {}
    for (const lu of lastUsedResults) {
      if (lu._max.createdAt) lastUsedMap[lu.model] = lu._max.createdAt
    }

    const byModel: Record<string, any> = {}
    for (const mg of modelGroups) {
      const key = mg.model
      if (!byModel[key]) {
        byModel[key] = {
          model: key,
          provider: mg.provider,
          requests: 0,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
          avgLatency: 0,
          errors: 0,
          successRate: 0,
          isActive: activeModels.has(key),
          lastUsed: lastUsedMap[key]?.toISOString() || null,
        }
      }
      byModel[key].requests += mg._count
      byModel[key].cost += Number(mg._sum.costUsd || 0)
      byModel[key].inputTokens += mg._sum.inputTokens || 0
      byModel[key].outputTokens += mg._sum.outputTokens || 0
      byModel[key].avgLatency = Math.round(mg._avg.latencyMs || 0)
      byModel[key].errors = errorCounts[key] || 0
    }

    // Calculate success rates
    for (const key of Object.keys(byModel)) {
      const m = byModel[key]
      m.successRate = m.requests > 0 ? Math.round(((m.requests - m.errors) / m.requests) * 100) : 100
    }

    // Provider summary via groupBy
    const providerGroups = await db.aiUsageLog.groupBy({
      by: ['provider'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    })

    const byProvider: Record<string, any> = {}
    for (const pg of providerGroups) {
      byProvider[pg.provider] = {
        provider: pg.provider,
        requests: pg._count,
        cost: Number(pg._sum.costUsd || 0),
        inputTokens: pg._sum.inputTokens || 0,
        outputTokens: pg._sum.outputTokens || 0,
        tokens: (pg._sum.inputTokens || 0) + (pg._sum.outputTokens || 0),
        models: Object.values(byModel).filter((m: any) => m.provider === pg.provider).length,
        isActive: activeModels.size > 0,
      }
    }

    // Endpoint summary via groupBy
    const endpointGroups = await db.aiUsageLog.groupBy({
      by: ['endpoint'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    })

    const byEndpoint: Record<string, any> = {}
    for (const eg of endpointGroups) {
      byEndpoint[eg.endpoint] = {
        endpoint: eg.endpoint,
        requests: eg._count,
        cost: Number(eg._sum.costUsd || 0),
        inputTokens: eg._sum.inputTokens || 0,
        outputTokens: eg._sum.outputTokens || 0,
      }
    }

    // Cache hit rate via aggregate
    const cachedCount = await db.aiUsageLog.count({
      where: { createdAt: { gte: thirtyDaysAgo }, cached: true },
    })
    const total30DayCount = await db.aiUsageLog.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    })
    const cacheRate = total30DayCount > 0 ? Math.round((cachedCount / total30DayCount) * 100) : 0

    // Daily cost/tokens trend (last 30 days) — use raw SQL for date truncation
    const dailyTrend = await db.$queryRaw`
      SELECT DATE("createdAt") as date,
             SUM("costUsd") as cost,
             SUM("inputTokens") + SUM("outputTokens") as tokens
      FROM "AiUsageLog"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `

    // Build daily trend objects from raw SQL results
    const dailyCost: Record<string, number> = {}
    const dailyInputTokens: Record<string, number> = {}
    const dailyOutputTokens: Record<string, number> = {}
    const dailyRequests: Record<string, number> = {}
    for (const row of dailyTrend as any[]) {
      const day = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date)
      dailyCost[day] = Number(row.cost || 0)
      dailyInputTokens[day] = 0 // Not separately available from this aggregate
      dailyOutputTokens[day] = Number(row.tokens || 0)
      dailyRequests[day] = 0 // Not available from this aggregate
    }

    return NextResponse.json({
      summary: {
        today: { requests: todayAgg._count, cost: sumCost(todayAgg), tokens: sumTokens(todayAgg) },
        week: { requests: weekAgg._count, cost: sumCost(weekAgg), tokens: sumTokens(weekAgg) },
        month: { requests: monthAgg._count, cost: sumCost(monthAgg), tokens: sumTokens(monthAgg) },
        cacheRate,
        totalRequests: total30DayCount,
      },
      byModel: Object.entries(byModel).map(([model, data]) => ({ model, ...data })),
      byProvider: Object.entries(byProvider).map(([provider, data]) => ({ provider, ...data })),
      byEndpoint: Object.entries(byEndpoint).map(([endpoint, data]) => ({ endpoint, ...data })),
      dailyCost,
      dailyInputTokens,
      dailyOutputTokens,
      dailyRequests,
      activeModelsCount: activeModels.size,
      totalModelsCount: Object.keys(byModel).length,
    })
  } catch (error: any) {
    console.error('[admin/ai-usage/stats] Error:', error?.message || error)
    // FIX: Return 503 with error flag so frontend can distinguish empty data from broken DB
    return NextResponse.json({
      error: 'فشل في قراءة بيانات الاستخدام من قاعدة البيانات',
      debug: error?.message || String(error),
      summary: {
        today: { requests: 0, cost: 0, tokens: { input: 0, output: 0 } },
        week: { requests: 0, cost: 0, tokens: { input: 0, output: 0 } },
        month: { requests: 0, cost: 0, tokens: { input: 0, output: 0 } },
        cacheRate: 0, totalRequests: 0,
      },
      byModel: [],
      byProvider: [],
      byEndpoint: [],
      dailyCost: {},
      dailyInputTokens: {},
      dailyOutputTokens: {},
      dailyRequests: {},
      activeModelsCount: 0,
      totalModelsCount: 0,
    }, { status: 503 })
  }
}
