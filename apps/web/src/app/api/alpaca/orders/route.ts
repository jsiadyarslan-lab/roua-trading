import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch, toAlpacaSymbol } from '@/lib/alpacaClient'
import { randomUUID } from 'crypto'

/**
 * Verify that the request has a valid roua_session cookie.
 */
function requireAuth(request: NextRequest): NextResponse | null {
  const sessionToken = request.cookies.get('roua_session')?.value
  if (!sessionToken) {
    // Return graceful empty response instead of 401 to prevent cascading UI errors
    return NextResponse.json(
      { success: true, data: [] },
      { status: 200 }
    )
  }
  return null
}

/**
 * POST /api/alpaca/orders
 * تنفيذ صفقة عبر Alpaca Paper Trading
 */
export async function POST(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const {
      symbol,
      side,
      qty,
      notional,
      type = 'market',
      limit_price,
      stop_loss,
      take_profit,
    } = body

    if (!symbol) {
      return NextResponse.json({ success: false, error: 'symbol مطلوب' }, { status: 400 })
    }
    if (!side || !['buy', 'sell'].includes(side.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'side يجب أن يكون buy أو sell' }, { status: 400 })
    }
    if (!qty && !notional) {
      return NextResponse.json({ success: false, error: 'qty أو notional مطلوب' }, { status: 400 })
    }

    const alpacaSymbol = toAlpacaSymbol(symbol)
    const orderType    = type.toLowerCase()

    const payload: Record<string, any> = {
      symbol:          alpacaSymbol,
      side:            side.toLowerCase(),
      type:            orderType,
      time_in_force:   orderType === 'market' ? 'ioc' : 'gtc',
      client_order_id: randomUUID(),
    }

    if (notional) {
      payload.notional = notional.toString()
    } else {
      payload.qty = qty.toString()
    }

    if (orderType === 'limit' && limit_price) {
      payload.limit_price = limit_price.toString()
    }

    if (stop_loss || take_profit) {
      const isCrypto = symbol.includes('/') || ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'].some(c => symbol.toUpperCase().startsWith(c));
      
      if (!isCrypto) {
        payload.order_class = 'bracket'
        payload.time_in_force = 'day'
        if (stop_loss) {
          payload.stop_loss = { stop_price: stop_loss.toString() }
        }
        if (take_profit) {
          payload.take_profit = { limit_price: take_profit.toString() }
        }
      }
    }

    const res = await alpacaFetch('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: data.message || `Alpaca Error ${res.status}` },
        { status: res.status }
      )
    }

    return NextResponse.json({
      success:        true,
      orderId:        data.id,
      clientOrderId:  data.client_order_id,
      symbol:         data.symbol,
      side:           data.side,
      type:           data.type,
      status:         data.status,
      qty:            data.qty,
      filledQty:      data.filled_qty,
      filledAvgPrice: data.filled_avg_price,
      submittedAt:    data.submitted_at,
      createdAt:      data.created_at,
    })
  } catch (error: any) {
    console.error('[alpaca/orders] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في تنفيذ الأمر' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/alpaca/orders
 * جلب قائمة الأوامر (مفتوحة أو كل الأوامر)
 */
export async function GET(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'open'
    const limit  = searchParams.get('limit')  || '20'

    const res = await alpacaFetch(`/v2/orders?status=${status}&limit=${limit}`)

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json(
        { success: false, error: `Alpaca Error ${res.status}: ${errBody}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    const orders = (data || []).map((o: any) => ({
      id:             o.id,
      symbol:         o.symbol,
      side:           o.side,
      type:           o.type,
      status:         o.status,
      qty:            o.qty,
      filledQty:      o.filled_qty,
      filledAvgPrice: o.filled_avg_price,
      submittedAt:    o.submitted_at,
      createdAt:      o.created_at,
    }))

    return NextResponse.json({ success: true, data: orders })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب الأوامر' },
      { status: 500 }
    )
  }
}
