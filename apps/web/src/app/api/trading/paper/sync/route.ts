import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/trading/paper/sync
 * POST /api/trading/paper/sync
 *
 * P4 FIX: Paper trades are currently only in localStorage (lost on clear).
 * This route provides a sync endpoint to persist paper trade state.
 *
 * Strategy: Use PaperOrder model in NestJS via proxy.
 * The frontend (usePaperTradesStore) can call this to:
 *   GET  — load saved paper trades from server
 *   POST — save current paper trades snapshot to server
 *
 * If NestJS is unavailable, returns empty (graceful degradation).
 *
 * MOBILE FIX: Now supports Authorization header + x-roua-session header
 * from iOS/Android clients, not just cookies.
 */

export const dynamic = 'force-dynamic'

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

/**
 * Build auth headers for proxying to NestJS.
 * Supports cookie-based (web), Authorization header (mobile), and x-roua-session (mobile).
 */
function buildAuthHeaders(req: NextRequest, contentType?: string): Record<string, string> {
  const sessionToken = extractSessionToken(req)
  const headers: Record<string, string> = {}

  if (contentType) {
    headers['Content-Type'] = contentType
  }

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`
    headers['x-roua-session'] = sessionToken
    headers['Cookie'] = `roua_session=${sessionToken}`
  } else {
    // Fallback: forward raw cookie header for browser clients
    const rawCookie = req.headers.get('cookie')
    if (rawCookie) {
      headers['Cookie'] = rawCookie
    }
  }

  return headers
}

export async function GET(req: NextRequest) {
  const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

  try {
    const res = await fetch(`${baseUrl}/api/trading/paper/orders?status=FILLED&limit=200`, {
      signal: AbortSignal.timeout(6000),
      headers: buildAuthHeaders(req),
    })

    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({ success: true, source: 'nestjs', data })
    }
  } catch {
    // NestJS unavailable
  }

  // Graceful fallback — tells frontend to use localStorage
  return NextResponse.json({
    success: true,
    source: 'local',
    data: [],
    note: 'NestJS unavailable — paper trades are stored in localStorage only',
  })
}

export async function POST(req: NextRequest) {
  const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

  try {
    const body = await req.json()

    const res = await fetch(`${baseUrl}/api/trading/paper/sync`, {
      method: 'POST',
      signal: AbortSignal.timeout(6000),
      headers: buildAuthHeaders(req, 'application/json'),
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({ success: true, source: 'nestjs', data })
    }
  } catch {
    // NestJS unavailable — silently accept, localStorage is source of truth
  }

  return NextResponse.json({
    success: true,
    source: 'local',
    note: 'Saved to localStorage only — NestJS sync unavailable',
  })
}
