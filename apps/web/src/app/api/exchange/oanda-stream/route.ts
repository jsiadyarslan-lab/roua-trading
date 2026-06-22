import { NextRequest } from 'next/server'

/**
 * GET /api/exchange/oanda-stream?symbols=EUR/USD,GBP/USD,...
 *
 * V364: Next.js proxy for OANDA SSE stream.
 * Forwards to NestJS /api/exchange/oanda-stream which holds the OANDA
 * streaming connection and forwards prices as Server-Sent Events.
 *
 * This MUST be a streaming proxy — it forwards the response body
 * chunk-by-chunk, not buffering it. This gives the browser real-time
 * price updates via SSE (same latency as Binance WS for crypto).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get('symbols') || ''
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  const targetUrl = `${backendUrl}/api/exchange/oanda-stream?symbols=${encodeURIComponent(symbols)}`

  try {
    const backendRes = await fetch(targetUrl, {
      headers: { 'Accept': 'text/event-stream' },
      signal: AbortSignal.timeout(0), // No timeout — long-lived stream
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
