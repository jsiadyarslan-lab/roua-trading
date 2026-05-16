import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portfolio/summary
 *
 * CRITICAL FIX: This route previously returned FAKE DATA ($10,000 paper-trading
 * balance) when NestJS was unreachable. This masked the real problem — the user
 * thought "nothing changed" when in reality the backend was completely down.
 *
 * Now: When NestJS is unreachable, returns HTTP 502 with an error message
 * so the frontend can show the user that the service is unavailable.
 * The frontend (usePositionsStore) has its own fallback logic for paper trading.
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

  try {
    // Build auth headers from the incoming request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Forward session cookie and header
    const sessionCookie = req.cookies.get('roua_session')?.value
    if (sessionCookie) {
      headers['Cookie'] = `roua_session=${sessionCookie}`
      headers['x-roua-session'] = sessionCookie
      headers['Authorization'] = `Bearer ${sessionCookie}`
    }

    // Forward the incoming Cookie header as fallback
    const rawCookie = req.headers.get('cookie')
    if (rawCookie && !headers['Cookie']) {
      headers['Cookie'] = rawCookie
    }

    // Try NestJS trading positions summary (the real endpoint)
    const res = await fetch(`${baseUrl}/api/trading/positions/summary`, {
      signal: AbortSignal.timeout(10000),
      headers,
    })

    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({
        success: true,
        source: 'nestjs',
        data: data.data || data,
      })
    }

    // If NestJS returned a client error (401, 403), forward it as-is
    if (res.status >= 400 && res.status < 500) {
      return NextResponse.json({
        success: false,
        source: 'nestjs',
        error: `NestJS returned ${res.status}`,
      }, { status: res.status })
    }

    // NestJS returned 5xx — it's having problems
    return NextResponse.json({
      success: false,
      source: 'nestjs',
      error: `NestJS server error: ${res.status}`,
    }, { status: res.status })
  } catch {
    // NestJS unreachable — return 502 instead of fake data!
    // The frontend (usePositionsStore) will use its own paper trading fallback.
    return NextResponse.json({
      success: false,
      offline: true,
      error: 'خدمة المحفظة غير متاحة حالياً',
    }, { status: 502 })
  }
}
