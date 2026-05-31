import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Resolve userId from session cookie, with DEV_MODE fallback.
 * DATA ISOLATION: Returns 401 in production when no session is found,
 * rather than defaulting to a shared 'default-user' ID which would
 * let unauthenticated users read/write shared chart preferences.
 */
async function resolveUserId(req: Request): Promise<string | null> {
  // DEV_MODE auto-authenticate (mirrors /api/auth/me logic)
  if (process.env.DEV_MODE === '1' && process.env.NODE_ENV !== 'production') {
    return 'dev-user-00000000'
  }

  try {
    await ensureDbReady()
    const sessionToken = (req as NextRequest).cookies.get('roua_session')?.value
    if (sessionToken) {
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        select: { userId: true, expiresAt: true },
      })
      if (session && session.expiresAt > new Date()) {
        return session.userId
      }
    }
  } catch (error) {
    console.warn('[chart-preference] Session lookup failed:', error)
  }

  return null
}

/**
 * GET /api/chart-preference?symbol=BTC/USD
 *
 * Returns the chart preference for the authenticated user and symbol.
 * Now includes indicators, chartType, visibleRange, timeframe, activeTool
 * in addition to the existing settings and drawings.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || 'global'
    const userId = await resolveUserId(req)

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const pref = await db.chartPreference.findUnique({
      where: { userId_symbol: { userId, symbol } }
    })

    return NextResponse.json({ success: true, data: pref })
  } catch (error) {
    console.error('ChartPreference GET Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

/**
 * POST /api/chart-preference?symbol=BTC/USD
 *
 * Save chart preference for the authenticated user and symbol.
 * Body can include any subset of:
 *   { settings, drawings, indicators, chartType, visibleRange, timeframe, activeTool }
 *
 * All fields are optional — only provided fields are updated (partial update).
 * This allows saving just the visible range change without overwriting indicators.
 */
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || 'global'
    const userId = await resolveUserId(req)

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const { settings, drawings, indicators, chartType, visibleRange, timeframe, activeTool } = body

    // ANTI-PHANTOM-USER FIX: Removed user.upsert that created phantom users
    // (user-{@rouatrading.com) for every chart preference save.
    // The user MUST already exist (created via auth flow) — if not, return 401.
    const userExists = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!userExists) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // Build update object — only include fields that are provided (partial update)
    const updateData: Record<string, any> = {}
    if (settings !== undefined) updateData.settings = JSON.stringify(settings)
    if (drawings !== undefined) updateData.drawings = JSON.stringify(drawings)
    if (indicators !== undefined) updateData.indicators = JSON.stringify(indicators)
    if (chartType !== undefined) updateData.chartType = chartType
    if (visibleRange !== undefined) updateData.visibleRange = JSON.stringify(visibleRange)
    if (timeframe !== undefined) updateData.timeframe = timeframe
    if (activeTool !== undefined) updateData.activeTool = activeTool

    // Build create object — include all fields with defaults
    const createData: Record<string, any> = {
      userId,
      symbol,
      settings: settings ? JSON.stringify(settings) : '{}',
      drawings: drawings ? JSON.stringify(drawings) : '[]',
      indicators: indicators ? JSON.stringify(indicators) : '[]',
      chartType: chartType || 'candle',
      visibleRange: visibleRange ? JSON.stringify(visibleRange) : 'null',
      timeframe: timeframe || '15min',
      activeTool: activeTool || 'cursor',
    }

    const pref = await db.chartPreference.upsert({
      where: { userId_symbol: { userId, symbol } },
      update: updateData,
      create: createData,
    })

    return NextResponse.json({ success: true, data: pref })
  } catch (error) {
    console.error('ChartPreference POST Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
