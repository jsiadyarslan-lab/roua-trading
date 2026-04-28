import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/health — Admin health check endpoint
 *
 * Performs health checks on all monitored API endpoints
 * and returns aggregated results.
 */
export async function GET() {
  const endpoints = [
    '/api/health',
    '/api/auth/session',
    '/api/exchange/quote/AAPL',
    '/api/exchange/quote/BTC-USD',
    '/api/scanner/scan',
    '/api/signals/smart',
    '/api/scanner/multi-tf/BTC-USD',
    '/api/portfolio/summary',
    '/api/positions',
    '/dashboard',
  ]

  const results = await Promise.allSettled(
    endpoints.map(async (path) => {
      const start = Date.now()
      try {
        // Use internal fetch with a timeout
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const res = await fetch(`${baseUrl}${path}`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' },
        })
        clearTimeout(timeout)

        const elapsed = Date.now() - start

        let status: 'healthy' | 'warning' | 'error' = 'healthy'
        if (!res.ok) status = 'error'
        else if (elapsed > 2000) status = 'warning'

        return {
          path,
          status,
          responseTime: elapsed,
          statusCode: res.status,
          lastChecked: new Date().toISOString(),
        }
      } catch (error: any) {
        const elapsed = Date.now() - start
        return {
          path,
          status: 'error' as const,
          responseTime: elapsed,
          statusCode: 0,
          lastChecked: new Date().toISOString(),
          error: error?.name || 'Unknown error',
        }
      }
    })
  )

  const healthResults = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    return {
      path: endpoints[i],
      status: 'error' as const,
      responseTime: 0,
      statusCode: 0,
      lastChecked: new Date().toISOString(),
      error: 'Check failed',
    }
  })

  const healthy = healthResults.filter(r => r.status === 'healthy').length
  const warnings = healthResults.filter(r => r.status === 'warning').length
  const errors = healthResults.filter(r => r.status === 'error').length
  const avgResponseTime = Math.round(
    healthResults.reduce((sum, r) => sum + r.responseTime, 0) / healthResults.length
  )

  return NextResponse.json({
    overall: errors === 0 ? (warnings === 0 ? 'healthy' : 'degraded') : 'unhealthy',
    summary: {
      total: endpoints.length,
      healthy,
      warnings,
      errors,
      avgResponseTime,
    },
    endpoints: healthResults,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
}
