import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/monitor/status — Monitor agent status
 *
 * Checks if the monitor agent is actually alive by pinging its health endpoint.
 * The monitor agent runs on Railway and exposes a /health endpoint.
 *
 * Environment variables checked (in order of priority):
 *   MONITOR_AGENT_URL  — e.g. https://roua-monitor-production.up.railway.app
 *   MONITOR_URL        — alternative name
 *   AGENT_HEALTH_URL   — generic agent health URL
 */

// Cache the last known status to avoid hammering the agent on every request
let cachedStatus: {
  running: boolean
  lastCheck: string | null
  agentUrl: string | null
  latency: number | null
  checkedAt: number
} = {
  running: false,
  lastCheck: null,
  agentUrl: null,
  latency: null,
  checkedAt: 0,
}

const CACHE_TTL_MS = 30_000 // 30 seconds cache

function getMonitorAgentUrl(): string | null {
  return (
    process.env.MONITOR_AGENT_URL ||
    process.env.MONITOR_URL ||
    process.env.AGENT_HEALTH_URL ||
    null
  )
}

async function pingAgentHealth(agentUrl: string): Promise<{
  running: boolean
  latency: number
  details?: Record<string, unknown>
}> {
  const healthUrl = `${agentUrl.replace(/\/$/, '')}/health`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000) // 10s timeout

  try {
    const start = Date.now()
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    })
    clearTimeout(timeout)
    const latency = Date.now() - start

    if (res.ok) {
      let details: Record<string, unknown> | undefined
      try {
        details = await res.json()
      } catch {
        // Non-JSON response is fine — 200 means healthy
      }
      return { running: true, latency, details }
    }

    // Non-200 response — agent might be unhealthy but reachable
    return { running: false, latency }
  } catch {
    clearTimeout(timeout)
    return { running: false, latency: -1 }
  }
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const agentUrl = getMonitorAgentUrl()
  const now = Date.now()

  // Return cached status if still fresh
  if (cachedStatus.checkedAt && (now - cachedStatus.checkedAt) < CACHE_TTL_MS) {
    return NextResponse.json({
      running: cachedStatus.running,
      lastCheck: cachedStatus.lastCheck,
      latency: cachedStatus.latency,
      agentUrl: cachedStatus.agentUrl,
      message: cachedStatus.running
        ? 'وكيل المراقبة يعمل بشكل طبيعي'
        : 'وكيل المراقبة غير متاح',
      checkInterval: 60,
      endpoints: [
        { path: '/', label: 'الصفحة الرئيسية' },
        { path: '/api/health', label: 'فحص الصحة' },
        { path: '/api/auth/session', label: 'الجلسات' },
        { path: '/api/exchange/quote/BTC/USD', label: 'أسعار BTC' },
        { path: '/api/scanner/scan', label: 'الماسح' },
        { path: '/api/signals/smart', label: 'الإشارات' },
        { path: '/api/portfolio/sanctuary', label: 'المحفظة' },
        { path: '/api/ai/status', label: 'حالة AI' },
        { path: '/api/news/feed', label: 'الأخبار' },
        { path: '/api/neural/models', label: 'النماذج العصبية' },
      ],
    })
  }

  // No URL configured — agent is not deployed or not configured
  if (!agentUrl) {
    cachedStatus = {
      running: false,
      lastCheck: new Date().toISOString(),
      agentUrl: null,
      latency: null,
      checkedAt: now,
    }

    return NextResponse.json({
      running: false,
      lastCheck: cachedStatus.lastCheck,
      agentUrl: null,
      latency: null,
      message: 'وكيل المراقبة غير مفعل — قم بتعيين MONITOR_AGENT_URL في متغيرات البيئة',
      checkInterval: 60,
      endpoints: [
        { path: '/', label: 'الصفحة الرئيسية' },
        { path: '/api/health', label: 'فحص الصحة' },
        { path: '/api/auth/session', label: 'الجلسات' },
        { path: '/api/exchange/quote/BTC/USD', label: 'أسعار BTC' },
        { path: '/api/scanner/scan', label: 'الماسح' },
        { path: '/api/signals/smart', label: 'الإشارات' },
        { path: '/api/portfolio/sanctuary', label: 'المحفظة' },
        { path: '/api/ai/status', label: 'حالة AI' },
        { path: '/api/news/feed', label: 'الأخبار' },
        { path: '/api/neural/models', label: 'النماذج العصبية' },
      ],
    })
  }

  // Ping the agent's health endpoint
  const result = await pingAgentHealth(agentUrl)

  cachedStatus = {
    running: result.running,
    lastCheck: new Date().toISOString(),
    agentUrl,
    latency: result.latency >= 0 ? result.latency : null,
    checkedAt: now,
  }

  return NextResponse.json({
    running: result.running,
    lastCheck: cachedStatus.lastCheck,
    agentUrl,
    latency: cachedStatus.latency,
    agentDetails: result.details || null,
    message: result.running
      ? 'وكيل المراقبة يعمل بشكل طبيعي'
      : 'وكيل المراقبة لا يستجيب — تحقق من حالة النشر على Railway',
    checkInterval: 60,
    endpoints: [
      { path: '/', label: 'الصفحة الرئيسية' },
      { path: '/api/health', label: 'فحص الصحة' },
      { path: '/api/auth/session', label: 'الجلسات' },
      { path: '/api/exchange/quote/BTC/USD', label: 'أسعار BTC' },
      { path: '/api/scanner/scan', label: 'الماسح' },
      { path: '/api/signals/smart', label: 'الإشارات' },
      { path: '/api/portfolio/sanctuary', label: 'المحفظة' },
      { path: '/api/ai/status', label: 'حالة AI' },
      { path: '/api/news/feed', label: 'الأخبار' },
      { path: '/api/neural/models', label: 'النماذج العصبية' },
    ],
  })
}
