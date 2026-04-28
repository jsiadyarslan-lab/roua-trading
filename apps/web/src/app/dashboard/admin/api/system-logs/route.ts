import { NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

type LogLevel = 'info' | 'warning' | 'error'

interface LogEntry {
  id: string
  level: LogLevel
  message: string
  source: string
  timestamp: string
}

/**
 * /dashboard/admin/api/system-logs — Real system logs from the database
 *
 * Fetches from AuditLog and AiUsageLog (error entries).
 * Returns structured log entries — NO fake data.
 */
export async function GET(request: Request) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ logs: [], error: 'قاعدة البيانات غير متاحة' })
    }

    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level') as LogLevel | 'all' | null
    const search = searchParams.get('search')?.toLowerCase() || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

    const logs: LogEntry[] = []

    // 1. Fetch AuditLog entries
    const auditLogs = await db.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    })

    for (const entry of auditLogs) {
      const logLevel: LogLevel = isAuditError(entry.action) ? 'error' : isAuditWarning(entry.action) ? 'warning' : 'info'
      const message = buildAuditMessage(entry)

      logs.push({
        id: `audit-${entry.id}`,
        level: logLevel,
        message,
        source: entry.resource || 'audit',
        timestamp: entry.createdAt.toISOString(),
      })
    }

    // 2. Fetch failed AiUsageLog entries (errors)
    const failedAiLogs = await db.aiUsageLog.findMany({
      where: { success: false },
      take: Math.floor(limit / 2),
      orderBy: { createdAt: 'desc' },
    })

    for (const entry of failedAiLogs) {
      const message = `[ai] ${entry.provider}/${entry.model} — ${entry.endpoint}: ${entry.errorMessage || 'unknown error'} (${entry.latencyMs}ms)`
      logs.push({
        id: `ai-err-${entry.id}`,
        level: 'error',
        message,
        source: entry.provider || 'ai',
        timestamp: entry.createdAt.toISOString(),
      })
    }

    // 3. Fetch successful AiUsageLog entries with high latency (warnings)
    const slowAiLogs = await db.aiUsageLog.findMany({
      where: {
        success: true,
        latencyMs: { gte: 3000 },
      },
      take: Math.floor(limit / 4),
      orderBy: { createdAt: 'desc' },
    })

    for (const entry of slowAiLogs) {
      const message = `[ai] ${entry.provider}/${entry.model} — ${entry.endpoint}: slow response ${entry.latencyMs}ms`
      logs.push({
        id: `ai-warn-${entry.id}`,
        level: 'warning',
        message,
        source: entry.provider || 'ai',
        timestamp: entry.createdAt.toISOString(),
      })
    }

    // 4. Fetch recent successful AiUsageLog entries (info)
    const recentAiLogs = await db.aiUsageLog.findMany({
      where: { success: true, latencyMs: { lt: 3000 } },
      take: Math.floor(limit / 4),
      orderBy: { createdAt: 'desc' },
    })

    for (const entry of recentAiLogs) {
      const cached = entry.cached ? ' (cached)' : ''
      const message = `[ai] ${entry.provider}/${entry.model} — ${entry.endpoint}: ${entry.inputTokens}in/${entry.outputTokens}out${cached} (${entry.latencyMs}ms)`
      logs.push({
        id: `ai-info-${entry.id}`,
        level: 'info',
        message,
        source: entry.provider || 'ai',
        timestamp: entry.createdAt.toISOString(),
      })
    }

    // 5. Fetch recent order events as info logs
    const recentOrderEvents = await db.orderEvent.findMany({
      take: Math.floor(limit / 4),
      orderBy: { timestamp: 'desc' },
      include: { order: { select: { symbol: true, side: true } } },
    })

    for (const entry of recentOrderEvents) {
      const symbol = entry.order?.symbol || '—'
      const side = entry.order?.side || '—'
      const message = `[order] ${entry.eventType} — ${symbol} ${side}${entry.payload ? ` | ${entry.payload.substring(0, 80)}` : ''}`
      const logLevel: LogLevel = entry.eventType === 'RISK_REJECTED' ? 'error' : entry.eventType === 'CANCELLED' ? 'warning' : 'info'
      logs.push({
        id: `order-${entry.id}`,
        level: logLevel,
        message,
        source: 'order-engine',
        timestamp: entry.timestamp.toISOString(),
      })
    }

    // Sort by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply filters
    let filtered = logs
    if (level && level !== 'all') {
      filtered = filtered.filter(l => l.level === level)
    }
    if (search) {
      filtered = filtered.filter(l => l.message.toLowerCase().includes(search) || l.source.toLowerCase().includes(search))
    }

    // Limit final result
    filtered = filtered.slice(0, limit)

    // Counts
    const counts = {
      all: logs.length,
      info: logs.filter(l => l.level === 'info').length,
      warning: logs.filter(l => l.level === 'warning').length,
      error: logs.filter(l => l.level === 'error').length,
    }

    return NextResponse.json({ logs: filtered, counts })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[admin/system-logs] Error:', message)
    return NextResponse.json({
      logs: [],
      counts: { all: 0, info: 0, warning: 0, error: 0 },
      error: 'فشل في جلب السجلات',
    })
  }
}

function isAuditError(action: string): boolean {
  const errorActions = ['delete', 'failed', 'error', 'reject', 'revoke', 'disconnect', 'disable']
  return errorActions.some(e => action.toLowerCase().includes(e))
}

function isAuditWarning(action: string): boolean {
  const warningActions = ['update', 'change', 'modify', 'login_fail', 'reset', 'expire', 'timeout']
  return warningActions.some(e => action.toLowerCase().includes(e))
}

function buildAuditMessage(entry: { action: string; resource: string; details?: string | null; ipAddress?: string | null }): string {
  const parts = [`[${entry.resource}] ${entry.action}`]
  if (entry.details) parts.push(`— ${entry.details.substring(0, 100)}`)
  if (entry.ipAddress) parts.push(`(${entry.ipAddress})`)
  return parts.join(' ')
}
