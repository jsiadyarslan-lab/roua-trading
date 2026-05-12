import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/ai/keep-alive
 *
 * Keep-alive endpoint for preventing Railway/Render cold starts.
 * External cron services (cron-job.org, UptimeRobot, etc.) can ping
 * this endpoint periodically (e.g., every 5 minutes) to keep both
 * the Next.js app AND the NestJS backend awake.
 *
 * Behavior:
 * 1. Returns 200 OK immediately (fast response for the cron service)
 * 2. In the background, pings the NestJS /api/ai/models endpoint
 *    to trigger a cold start if it was sleeping
 * 3. Logs the keep-alive ping for monitoring
 *
 * The NestJS ping is fire-and-forget — we don't wait for it.
 * This ensures the cron service gets a fast response while still
 * waking up the backend.
 */

// Track keep-alive pings for monitoring
let lastKeepAliveAt = 0
let totalKeepAlivePings = 0
let lastNestJSPingSuccess = false

export async function GET(req: NextRequest) {
  const now = Date.now()
  lastKeepAliveAt = now
  totalKeepAlivePings++

  console.log(`[keep-alive] Ping received (#${totalKeepAlivePings}) at ${new Date(now).toISOString()}`)

  // ── Background: Wake up NestJS backend ──
  // Fire-and-forget: don't await, don't block the response
  const apiTargets = [
    process.env.API_INTERNAL_URL,
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3001',
  ].filter(Boolean) as string[]

  // Ping each possible NestJS target in the background
  for (const baseUrl of apiTargets) {
    const targetUrl = `${baseUrl}/api/ai/models`
    // Fire-and-forget — no await
    fetch(targetUrl, {
      method: 'GET',
      headers: { 'x-roua-session': 'keep-alive' },
      signal: AbortSignal.timeout(30000), // 30s timeout for cold start
    })
      .then((res) => {
        lastNestJSPingSuccess = res.ok
        console.log(`[keep-alive] NestJS ping ${res.ok ? 'SUCCESS' : 'FAILED'} (${targetUrl}) — status ${res.status}`)
      })
      .catch((err: any) => {
        lastNestJSPingSuccess = false
        console.warn(`[keep-alive] NestJS ping FAILED (${targetUrl}): ${err?.message || err}`)
      })
  }

  // Return immediately — don't wait for NestJS
  return NextResponse.json({
    success: true,
    message: 'Keep-alive ping received',
    timestamp: new Date(now).toISOString(),
    stats: {
      totalPings: totalKeepAlivePings,
      lastPingAt: new Date(lastKeepAliveAt).toISOString(),
      nestJSLastPingSuccess: lastNestJSPingSuccess,
      nestJSTargets: apiTargets.length,
    },
    hint: 'Set up a cron job (cron-job.org, UptimeRobot) to ping this endpoint every 5 minutes to prevent cold starts.',
  })
}
