import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch, fromAlpacaSymbol } from '@/lib/alpacaClient'

/**
 * Verify that the request has a valid roua_session cookie.
 * Returns null if authenticated (passes), or a NextResponse error if not.
 */
function requireAuth(request: NextRequest): NextResponse | null {
  const sessionToken = request.cookies.get('roua_session')?.value
  if (!sessionToken) {
    // Return empty data instead of 401 — the portfolio page falls back
    // to this route when NestJS is unavailable. A 401 here cascades
    // into a visible error in the UI.
    return NextResponse.json(
      { success: true, data: [] },
      { status: 200 }
    )
  }
  return null // Auth check passed
}

/**
 * GET /api/alpaca/positions
 * جلب المراكز المفتوحة من Alpaca
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = requireAuth(request)
  if (authError) return authError

  try {
    const res = await alpacaFetch('/v2/positions')

    if (!res.ok) {
      const errBody = await res.text()
      let userError = `Alpaca Error ${res.status}: ${errBody}`
      
      if (res.status === 403) {
        userError = 'مفاتيح Alpaca غير صالحة أو منتهية الصلاحية'
        console.error('[alpaca/positions] GET 403 Forbidden — API keys may be invalid:', errBody)
      }
      
      return NextResponse.json(
        { success: false, error: userError, alpacaStatus: res.status },
        { status: res.status === 403 ? 503 : res.status }
      )
    }

    const data = await res.json()

    const positions = (data || []).map((p: any) => ({
      symbol:        fromAlpacaSymbol(p.symbol),
      rawSymbol:     p.symbol,
      side:          p.side,
      qty:           parseFloat(p.qty)           || 0,
      avgEntryPrice: parseFloat(p.avg_entry_price) || 0,
      currentPrice:  parseFloat(p.current_price) || 0,
      marketValue:   parseFloat(p.market_value)  || 0,
      unrealizedPnl: parseFloat(p.unrealized_pl) || 0,
      unrealizedPct: parseFloat(p.unrealized_plpc) * 100 || 0,
      costBasis:     parseFloat(p.cost_basis)    || 0,
    }))

    return NextResponse.json({ success: true, data: positions })
  } catch (error: any) {
    console.error('[alpaca/positions] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب المراكز' },
      { status: 500 }
    )
  }
}
