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
 * V268: Parse the `settings` JSON field and extract the extra fields
 * (indicators, chartType, visibleRange, timeframe, activeTool) that the
 * route handler accepts but the Prisma schema doesn't have dedicated
 * columns for. These fields are stored INSIDE the `settings` JSON field
 * to avoid a schema migration.
 *
 * Returns: { settings, drawings, indicators, chartType, visibleRange, timeframe, activeTool }
 */
function expandSettings(pref: any) {
  if (!pref) return null;
  let settings: any = {};
  try { settings = JSON.parse(pref.settings || '{}'); } catch { settings = {}; }

  return {
    ...pref,
    settings,
    // V268: extract extra fields from the settings JSON
    indicators: settings.indicators ?? [],
    chartType: settings.chartType ?? 'candle',
    visibleRange: settings.visibleRange ?? null,
    timeframe: settings.timeframe ?? '15min',
    activeTool: settings.activeTool ?? 'cursor',
  };
}

/**
 * V268: Merge the extra fields into the `settings` JSON field before saving.
 * This is the inverse of expandSettings — we pack indicators/chartType/etc.
 * into settings so they persist without a schema migration.
 */
function packSettings(
  existingSettings: string,
  updates: { settings?: any; indicators?: any; chartType?: any; visibleRange?: any; timeframe?: any; activeTool?: any },
): string {
  let settings: any = {};
  try { settings = JSON.parse(existingSettings || '{}'); } catch { settings = {}; }

  // If caller provided a new settings object, merge it (don't replace)
  if (updates.settings !== undefined) {
    settings = { ...settings, ...updates.settings };
  }
  // Pack the extra fields INTO settings
  if (updates.indicators !== undefined) settings.indicators = updates.indicators;
  if (updates.chartType !== undefined) settings.chartType = updates.chartType;
  if (updates.visibleRange !== undefined) settings.visibleRange = updates.visibleRange;
  if (updates.timeframe !== undefined) settings.timeframe = updates.timeframe;
  if (updates.activeTool !== undefined) settings.activeTool = updates.activeTool;

  return JSON.stringify(settings);
}

/**
 * GET /api/chart-preference?symbol=BTC/USD
 *
 * Returns the chart preference for the authenticated user and symbol.
 * V268: Now correctly returns indicators, chartType, visibleRange,
 * timeframe, activeTool — these are stored inside the `settings` JSON
 * field (no schema migration needed).
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

    // V268: Expand the settings JSON to expose the extra fields at top level
    return NextResponse.json({ success: true, data: expandSettings(pref) })
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
 * V268: All fields are packed into the existing `settings` + `drawings`
 * columns — NO schema migration required. The extra fields (indicators,
 * chartType, etc.) are stored as nested keys inside `settings` JSON.
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
    const userExists = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!userExists) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // V268: Fetch the existing preference so we can merge settings (not replace)
    const existing = await db.chartPreference.findUnique({
      where: { userId_symbol: { userId, symbol } },
      select: { settings: true },
    });

    // Pack the extra fields into the settings JSON column
    const packedSettings = packSettings(existing?.settings || '{}', {
      settings,
      indicators,
      chartType,
      visibleRange,
      timeframe,
      activeTool,
    });

    // Build update/create object — only the two columns that exist in the schema
    const updateData: Record<string, any> = { settings: packedSettings };
    if (drawings !== undefined) updateData.drawings = JSON.stringify(drawings);

    const createData: Record<string, any> = {
      userId,
      symbol,
      settings: packedSettings,
      drawings: drawings ? JSON.stringify(drawings) : '[]',
    };

    const pref = await db.chartPreference.upsert({
      where: { userId_symbol: { userId, symbol } },
      update: updateData as any,
      create: createData as any,
    })

    // V268: Expand the saved settings to expose the extra fields at top level
    return NextResponse.json({ success: true, data: expandSettings(pref) })
  } catch (error) {
    console.error('ChartPreference POST Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
