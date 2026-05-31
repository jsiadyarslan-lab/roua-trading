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
/**
 * Extract session token from request — checks cookie, Authorization header, and custom header.
 * Supports both browser clients (cookie-based) and mobile/native clients (header-based).
 */
function extractSessionToken(req: NextRequest): string | null {
  // 1. Check cookie (browser clients)
  const cookieToken = req.cookies.get('roua_session')?.value
  if (cookieToken) return cookieToken

  // 2. Check Authorization: Bearer <token> (mobile/native clients)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim()
    if (token) return token
  }

  // 3. Check x-roua-session custom header (mobile/native clients)
  const customHeader = req.headers.get('x-roua-session')
  if (customHeader?.trim()) return customHeader.trim()

  return null
}

export async function GET(req: NextRequest) {
  const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'
  const sessionToken = extractSessionToken(req)

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
