import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch, fromAlpacaSymbol } from '@/lib/alpacaClient'
import { verifyUserSession } from '@/lib/session-auth'
import { db } from '@/lib/db'

/**
 * GET /api/alpaca/positions
 * جلب المراكز المفتوحة من Alpaca
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyUserSession(request)
  if (auth.error) return auth.error

  try {
    // 1. Fetch from Alpaca with user credentials handled automatically by alpacaFetch
    const res = await alpacaFetch('/v2/positions', {}, { userId: auth.session.userId })

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
      entryPrice:    parseFloat(p.avg_entry_price) || 0,
      avgEntryPrice: parseFloat(p.avg_entry_price) || 0,
      currentPrice:  parseFloat(p.current_price) || 0,
      marketValue:   parseFloat(p.market_value)  || 0,
      unrealizedPnl: parseFloat(p.unrealized_pl) || 0,
      unrealizedPct: parseFloat(p.unrealized_plpc) * 100 || 0,
      costBasis:     parseFloat(p.cost_basis)    || 0,
      stopLoss:      parseFloat(p.stop_loss)     || undefined,
      takeProfit:    parseFloat(p.take_profit)   || undefined,
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
