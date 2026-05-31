import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch, toAlpacaSymbol } from '@/lib/alpacaClient'
import { randomUUID } from 'crypto'
import { verifyUserSession } from '@/lib/session-auth'

/**
 * POST /api/alpaca/orders
 * تنفيذ صفقة عبر Alpaca Paper Trading
 */
export async function POST(req: NextRequest) {
  const auth = await verifyUserSession(req)
  if (auth.error) return auth.error

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

    let alpacaSymbol: string
    try {
      alpacaSymbol = toAlpacaSymbol(symbol)
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: e.message || 'رمز الأصل غير صالح' },
        { status: 400 }
      )
    }
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

    // FIX: Use auth.session.userId (NOT auth.user.id — verifyUserSession returns
    // { session: { userId }, error }, NOT { user: { id } }. The old auth.user.id
    // was undefined, causing "Cannot read properties of undefined (reading 'id')"
    // which crashed the route handler with a 500 error.
    const res = await alpacaFetch('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { userId: auth.session.userId })

    // FIX: Handle fallback responses from alpacaFetch (e.g. 503 when credentials not configured)
    // These are proper NextResponse objects, but we need to check for the offline flag.
    let data: any
    try {
      data = await res.json()
    } catch (parseErr: any) {
      console.error('[alpaca/orders] Failed to parse response:', parseErr.message)
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة استجابة Alpaca' },
        { status: 502 }
      )
    }

    // FIX: Detect alpacaFetch fallback responses (offline/no credentials)
    if (data?.offline || data?.error === 'ALPACA_CREDENTIALS_NOT_CONFIGURED') {
      return NextResponse.json(
        { success: false, error: 'ALPACA_CREDENTIALS_NOT_CONFIGURED', offline: true },
        { status: 503 }
      )
    }

    if (!res.ok) {
      // Provide user-friendly error messages for common Alpaca errors
      const errMsg = data.message || data.error || `Alpaca Error ${res.status}`
      let userError = errMsg
      
      if (res.status === 403) {
        userError = 'مفاتيح Alpaca غير صالحة أو منتهية الصلاحية. تحقق من ALPACA_API_KEY و ALPACA_API_SECRET في متغيرات البيئة.'
        console.error('[alpaca/orders] 403 Forbidden — API keys may be invalid or expired:', errMsg)
      } else if (res.status === 422) {
        userError = `طلب غير صالح: ${errMsg}`
      }
      
      return NextResponse.json(
        { success: false, error: userError, alpacaStatus: res.status },
        { status: res.status === 403 ? 503 : res.status }
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
  const auth = await verifyUserSession(req)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'open'
    const limit  = searchParams.get('limit')  || '20'

    // FIX: Use auth.session.userId (NOT auth.user.id)
    const res = await alpacaFetch(`/v2/orders?status=${status}&limit=${limit}`, undefined, { userId: auth.session.userId })

    // FIX: Handle fallback responses from alpacaFetch (503 when no credentials)
    let getData: any
    try {
      getData = await res.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة استجابة Alpaca', offline: true },
        { status: 503 }
      )
    }

    // FIX: Detect alpacaFetch fallback responses (offline/no credentials)
    if (getData?.offline || getData?.error === 'ALPACA_CREDENTIALS_NOT_CONFIGURED') {
      return NextResponse.json(
        { success: false, data: [], error: 'ALPACA_CREDENTIALS_NOT_CONFIGURED', offline: true },
        { status: 503 }
      )
    }

    if (!res.ok) {
      const errMsg = getData?.message || getData?.error || `Alpaca Error ${res.status}`
      let userError = errMsg
      
      if (res.status === 403) {
        userError = 'مفاتيح Alpaca غير صالحة أو منتهية الصلاحية'
        console.error('[alpaca/orders] GET 403 Forbidden — API keys may be invalid:', errMsg)
      }
      
      return NextResponse.json(
        { success: false, error: userError, alpacaStatus: res.status },
        { status: res.status === 403 ? 503 : res.status }
      )
    }

    const orders = (getData || []).map((o: any) => ({
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

/**
 * DELETE /api/alpaca/orders?orderId=xxx
 * إلغاء أمر مفتوح عبر Alpaca Paper Trading
 */
export async function DELETE(req: NextRequest) {
  const auth = await verifyUserSession(req)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId مطلوب (query param)' },
        { status: 400 }
      )
    }

    const res = await alpacaFetch(`/v2/orders/${orderId}`, {
      method: 'DELETE',
    }, { userId: auth.session.userId })

    // Handle fallback responses from alpacaFetch (503 when credentials not configured)
    let data: any
    try {
      data = await res.json()
    } catch {
      // Alpaca returns 204 No Content on successful delete — no JSON body
      if (res.ok || res.status === 204) {
        return NextResponse.json({ success: true, orderId })
      }
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة استجابة Alpaca', offline: true },
        { status: 503 }
      )
    }

    // Detect alpacaFetch fallback responses (offline/no credentials)
    if (data?.offline || data?.error === 'ALPACA_CREDENTIALS_NOT_CONFIGURED') {
      return NextResponse.json(
        { success: false, error: 'ALPACA_CREDENTIALS_NOT_CONFIGURED', offline: true },
        { status: 503 }
      )
    }

    if (!res.ok) {
      const errMsg = data.message || data.error || `Alpaca Error ${res.status}`
      let userError = errMsg

      if (res.status === 403) {
        userError = 'مفاتيح Alpaca غير صالحة أو منتهية الصلاحية'
        console.error('[alpaca/orders] DELETE 403 Forbidden — API keys may be invalid:', errMsg)
      } else if (res.status === 404) {
        userError = 'الأمر غير موجود أو تم إلغاؤه مسبقاً'
      }

      return NextResponse.json(
        { success: false, error: userError, alpacaStatus: res.status },
        { status: res.status === 403 ? 503 : res.status }
      )
    }

    return NextResponse.json({ success: true, orderId })
  } catch (error: any) {
    console.error('[alpaca/orders] DELETE Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في إلغاء الأمر' },
      { status: 500 }
    )
  }
}
