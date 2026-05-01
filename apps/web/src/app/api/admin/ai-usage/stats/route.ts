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

    // All logs for last 30 days
    const allLogs = await db.aiUsageLog.findMany({ where: { createdAt: { gte: thirtyDaysAgo } } })

    // Recent logs (last 1 hour) for model activity detection
    const recentLogs = await db.aiUsageLog.findMany({ where: { createdAt: { gte: oneHourAgo } } })
    const activeProviders = new Set(recentLogs.map(l => l.provider))
    const activeModels = new Set(recentLogs.map(l => l.model))

    // Cost by model with enhanced metrics
    const byModel: Record<string, {
      provider: string
      requests: number
      inputTokens: number
      outputTokens: number
      cost: number
      avgLatency: number
      errors: number
      successRate: number
      lastUsed: Date | null
      isActive: boolean
    }> = {}

    for (const log of allLogs) {
      if (!byModel[log.model]) {
        byModel[log.model] = {
          provider: log.provider, requests: 0, inputTokens: 0, outputTokens: 0,
          cost: 0, avgLatency: 0, errors: 0, successRate: 0, lastUsed: null, isActive: false,
        }
      }
      byModel[log.model].requests++
      byModel[log.model].inputTokens += log.inputTokens
      byModel[log.model].outputTokens += log.outputTokens
      byModel[log.model].cost += Number(log.costUsd)
      byModel[log.model].avgLatency += log.latencyMs
      if (!log.success) byModel[log.model].errors++
      // Track last usage
      if (!byModel[log.model].lastUsed || log.createdAt > byModel[log.model].lastUsed!) {
        byModel[log.model].lastUsed = log.createdAt
      }
    }

    // Compute derived metrics
    for (const key of Object.keys(byModel)) {
      const m = byModel[key]
      if (m.requests > 0) {
        m.avgLatency = Math.round(m.avgLatency / m.requests)
        m.successRate = Math.round(((m.requests - m.errors) / m.requests) * 100)
      }
      m.isActive = activeModels.has(key)
    }

    // Cost by endpoint with token data
    const byEndpoint: Record<string, { requests: number; cost: number; inputTokens: number; outputTokens: number }> = {}
    for (const log of allLogs) {
      if (!byEndpoint[log.endpoint]) {
        byEndpoint[log.endpoint] = { requests: 0, cost: 0, inputTokens: 0, outputTokens: 0 }
      }
      byEndpoint[log.endpoint].requests++
      byEndpoint[log.endpoint].cost += Number(log.costUsd)
      byEndpoint[log.endpoint].inputTokens += log.inputTokens
      byEndpoint[log.endpoint].outputTokens += log.outputTokens
    }

    // Cache hit rate
    const cachedCount = allLogs.filter(l => l.cached).length
    const cacheRate = allLogs.length > 0 ? Math.round((cachedCount / allLogs.length) * 100) : 0

    // Daily cost + token trend
    const dailyCost: Record<string, number> = {}
    const dailyInputTokens: Record<string, number> = {}
    const dailyOutputTokens: Record<string, number> = {}
    const dailyRequests: Record<string, number> = {}
    for (const log of allLogs) {
      const day = log.createdAt.toISOString().split('T')[0]
      dailyCost[day] = (dailyCost[day] || 0) + Number(log.costUsd)
      dailyInputTokens[day] = (dailyInputTokens[day] || 0) + log.inputTokens
      dailyOutputTokens[day] = (dailyOutputTokens[day] || 0) + log.outputTokens
      dailyRequests[day] = (dailyRequests[day] || 0) + 1
    }

    // Provider summary
    const byProvider: Record<string, { models: number; requests: number; inputTokens: number; outputTokens: number; cost: number; isActive: boolean }> = {}
    for (const log of allLogs) {
      if (!byProvider[log.provider]) {
        byProvider[log.provider] = { models: 0, requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, isActive: false }
      }
      byProvider[log.provider].requests++
      byProvider[log.provider].inputTokens += log.inputTokens
      byProvider[log.provider].outputTokens += log.outputTokens
      byProvider[log.provider].cost += Number(log.costUsd)
    }
    // Count unique models per provider and check activity
    for (const [modelKey, modelData] of Object.entries(byModel)) {
      if (!byProvider[modelData.provider]) {
        byProvider[modelData.provider] = { models: 0, requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, isActive: false }
      }
      byProvider[modelData.provider].models++
      if (modelData.isActive) byProvider[modelData.provider].isActive = true
    }

    return NextResponse.json({
      summary: {
        today: { requests: todayLogs.length, cost: sumCost(todayLogs), tokens: sumTokens(todayLogs) },
        week: { requests: weekLogs.length, cost: sumCost(weekLogs), tokens: sumTokens(weekLogs) },
        month: { requests: monthLogs.length, cost: sumCost(monthLogs), tokens: sumTokens(monthLogs) },
        cacheRate,
        totalRequests: allLogs.length,
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
