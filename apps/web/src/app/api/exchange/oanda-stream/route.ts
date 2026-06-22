import { NextRequest } from 'next/server'

/**
 * GET /api/exchange/oanda-stream?symbols=EUR/USD,GBP/USD,...
 *
 * V366: Next.js proxy for OANDA SSE stream.
 * Forwards to NestJS /api/exchange/oanda-stream which holds the OANDA
 * streaming connection and forwards prices as Server-Sent Events.
 *
 * V366 FIX: Removed AbortSignal.timeout(0) — it aborts the request IMMEDIATELY
 * (0ms = instant abort), killing the SSE connection before it starts.
 * Now uses no signal (long-lived connection, cleaned up on client disconnect).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes — allow long-lived SSE

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get('symbols') || ''
  const backendUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001'
  const targetUrl = `${backendUrl}/api/exchange/oanda-stream?symbols=${encodeURIComponent(symbols)}`

  try {
    const backendRes = await fetch(targetUrl, {
      headers: { 'Accept': 'text/event-stream' },
      // V366: No timeout signal — SSE is a long-lived connection.
      // AbortSignal.timeout(0) was aborting immediately (0ms = instant).
    })

    if (!backendRes.ok || !backendRes.body) {
      return new Response(
        JSON.stringify({ error: `Backend returned ${backendRes.status}` }),
        { status: backendRes.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Stream the SSE response directly to the browser
    return new Response(backendRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
