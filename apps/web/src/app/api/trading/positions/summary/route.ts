import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trading/positions/summary
 *
 * P1 FIX: This route was missing (404) causing usePositionsStore to always
 * fallback to equity=0 and buyingPower=0, which broke BotEngine risk calc.
 *
 * Proxies to NestJS /api/trading/positions/summary.
 * If NestJS is unavailable, returns an unavailable response instead of a
 * synthetic shared balance.
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

  try {
    // Try NestJS first
    const res = await fetch(`${baseUrl}/api/trading/positions/summary`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'Cookie': req.headers.get('cookie') || '',
        'x-roua-session': req.cookies.get('roua_session')?.value || '',
      },
    })

    const data = await res.json().catch(() => null)
    return NextResponse.json(
      data || {
        success: false,
        error: 'Trading API unavailable',
      },
      { status: res.status },
    )
  } catch (error) {
    console.warn('[positions/summary] NestJS unavailable:', error)
  }

  return NextResponse.json(
    {
      success: false,
      source: 'nestjs-unavailable',
      error: 'قاعدة بيانات التداول غير متاحة حالياً، ولا يمكن عرض رصيد افتراضي لحساب حقيقي.',
      data: {
        totalPositions: 0,
        totalValue: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        totalBalance: 0,
        totalExposure: 0,
        currency: 'USD',
        mode: 'unavailable',
      },
    },
    { status: 503 },
  )
}
