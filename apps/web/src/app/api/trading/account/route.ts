import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trading/account
 *
 * CRITICAL FIX: This route previously returned FAKE DATA (empty positions,
 * zero balance) when NestJS was unreachable. This masked the real problem —
 * the user thought "nothing changed" when the backend was completely down.
 *
 * Now: When NestJS is unreachable, returns HTTP 502 with an error message.
 * The frontend (usePositionsStore) has its own fallback logic.
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'
  const sessionToken = req.cookies.get('roua_session')?.value

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`
      headers['x-roua-session'] = sessionToken
      headers['Cookie'] = `roua_session=${sessionToken}`
    }

    const res = await fetch(`${baseUrl}/api/trading/account`, {
      signal: AbortSignal.timeout(8000),
      headers,
    })

    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data)
    }

    // NestJS returned an error — forward it
    if (res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json({
        success: false,
        error: data.error || `NestJS returned ${res.status}`,
      }, { status: res.status })
    }

    // NestJS 5xx error
    return NextResponse.json({
      success: false,
      error: `NestJS server error: ${res.status}`,
    }, { status: res.status })
  } catch {
    // NestJS unreachable — return 502 instead of fake zero-balance data!
    // The frontend (usePositionsStore) will use its own paper trading fallback.
    return NextResponse.json({
      success: false,
      offline: true,
      error: 'خدمة الحساب غير متاحة حالياً',
    }, { status: 502 })
  }
}
