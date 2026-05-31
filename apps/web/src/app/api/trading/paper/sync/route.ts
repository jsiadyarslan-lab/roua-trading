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
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

  try {
    const res = await fetch(`${baseUrl}/api/trading/paper/orders?status=FILLED&limit=200`, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'Cookie': req.headers.get('cookie') || '',
        'x-roua-session': req.cookies.get('roua_session')?.value || '',
      },
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
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || '',
        'x-roua-session': req.cookies.get('roua_session')?.value || '',
      },
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
