import { NextResponse } from 'next/server'
import { alpacaFetch, fromAlpacaSymbol } from '@/lib/alpacaClient'

/**
 * GET /api/alpaca/positions
 * جلب المراكز المفتوحة من Alpaca
 */
export async function GET() {
  try {
    const res = await alpacaFetch('/v2/positions')

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json(
        { success: false, error: `Alpaca Error ${res.status}: ${errBody}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    const positions = (data || []).map((p: any) => ({
      symbol:        fromAlpacaSymbol(p.symbol),
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
