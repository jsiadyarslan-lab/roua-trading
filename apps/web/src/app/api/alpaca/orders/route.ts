import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch, toAlpacaSymbol } from '@/lib/alpacaClient'
import { randomUUID } from 'crypto'

/**
 * POST /api/alpaca/orders
 * تنفيذ صفقة عبر Alpaca Paper Trading
 *
 * Body:
 * {
 *   symbol:     "AAPL" | "BTCUSD" | "BTC/USD"   (مطلوب)
 *   side:       "buy" | "sell"                    (مطلوب)
 *   qty:        number                            (مطلوب إذا لم يُحدَّد notional)
 *   notional:   number                            (بالدولار بدلاً من qty — اختياري)
 *   type:       "market" | "limit"                (افتراضي: market)
 *   limit_price: number                           (مطلوب إذا type=limit)
 *   time_in_force: "ioc" | "gtc" | "day"         (افتراضي: ioc للـ market)
 *   stop_loss:  number                            (اختياري)
 *   take_profit: number                           (اختياري)
 * }
 */
export async function POST(req: NextRequest) {
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

    // ── التحقق من المدخلات ──
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

    // ── بناء الـ payload ──
    const payload: Record<string, any> = {
      symbol:          alpacaSymbol,
      side:            side.toLowerCase(),
      type:            orderType,
      time_in_force:   orderType === 'market' ? 'ioc' : 'gtc',
      client_order_id: randomUUID(),
    }

    // الكمية: يمكن تحديد qty (قطعة) أو notional (مبلغ بالدولار)
    if (notional) {
      payload.notional = notional.toString()
    } else {
      payload.qty = qty.toString()
    }

    if (orderType === 'limit' && limit_price) {
      payload.limit_price = limit_price.toString()
    }

    // وقف الخسارة وجني الأرباح (bracket order)
    if (stop_loss || take_profit) {
      // Alpaca does NOT support bracket orders for Crypto (e.g. BTC/USD, ETH/USD)
      const isCrypto = symbol.includes('/') || ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'].some(c => symbol.toUpperCase().startsWith(c));
      if (isCrypto) {
        return NextResponse.json({ success: false, error: 'Alpaca لا يدعم تحديد جني الأرباح ووقف الخسارة للعملات الرقمية حالياً. يرجى ترك هذه الحقول فارغة للتنفيذ.' }, { status: 400 })
      }

      payload.order_class = 'bracket'
      payload.time_in_force = 'gtc' // Bracket orders require 'gtc' or 'day'
      if (stop_loss) {
        payload.stop_loss = { stop_price: stop_loss.toString() }
      }
      if (take_profit) {
        payload.take_profit = { limit_price: take_profit.toString() }
      }
    }

    console.log('[alpaca/orders] Placing order:', JSON.stringify(payload))

    // ── إرسال الطلب لـ Alpaca ──
    const res = await alpacaFetch('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[alpaca/orders] Alpaca rejected:', data)
      return NextResponse.json(
        { success: false, error: data.message || `Alpaca Error ${res.status}` },
        { status: res.status }
      )
    }

    // ── تنسيق الرد ──
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
      raw:            data,        // الرد الكامل للـ debugging
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
