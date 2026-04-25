import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { randomUUID } from 'crypto'

/**
 * GET /api/trading/orders
 * Fetches orders for the authenticated user.
 *
 * POST /api/trading/orders
 * Creates a new order and opens a position.
 */
export async function GET(req: NextRequest) {
  try {
    await ensureDbReady()

    const sessionToken = req.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, any> = { userId: session.userId }
    if (symbol) where.symbol = symbol
    if (status) where.status = status

    const orders = await db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ success: true, data: orders })
  } catch (error: any) {
    console.error('[trading/orders GET] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب الطلبات' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDbReady()

    const sessionToken = req.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const body = await req.json()
    const { symbol, side, type, quantity, price, stopPrice, stopLoss, takeProfit, credentialId } = body
    const slValue = stopLoss || stopPrice
    const tpValue = takeProfit

    if (!symbol || !side || !quantity) {
      return NextResponse.json(
        { success: false, error: 'الزوج والاتجاه والكمية مطلوبون' },
        { status: 400 }
      )
    }

    let exchange = 'demo'

    // Validate credential belongs to user
    if (credentialId) {
      const cred = await db.exchangeCredential.findUnique({
        where: { id: credentialId },
      })
      if (!cred || cred.userId !== session.userId || !cred.isValid) {
        return NextResponse.json(
          { success: false, error: 'مفتاح API غير صالح' },
          { status: 400 }
        )
      }
      exchange = cred.exchange || 'demo'
    }

    // Get current price from our exchange API
    let executionPrice = price
    if (!executionPrice || type === 'MARKET') {
      try {
        const quoteRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/exchange/quote/${encodeURIComponent(symbol)}`
        )
        if (quoteRes.ok) {
          const quoteData = await quoteRes.json()
          if (quoteData.success && quoteData.data) {
            executionPrice = quoteData.data.price
          }
        }
      } catch {
        // Price fetch failed, use provided price or 0
      }
    }

    const orderPrice = executionPrice || price || 0

    // Create the order
    const order = await db.order.create({
      data: {
        userId: session.userId,
        exchangeCredentialId: credentialId || '',
        exchange,
        symbol,
        side: side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        type: (type || 'MARKET').toUpperCase() === 'LIMIT' ? 'LIMIT' : 'MARKET',
        quantity: parseFloat(String(quantity)),
        price: orderPrice ? orderPrice : null,
        stopLoss: slValue ? parseFloat(String(slValue)) : null,
        takeProfit: tpValue ? parseFloat(String(tpValue)) : null,
        status: 'FILLED',
        filledQuantity: parseFloat(String(quantity)),
        averagePrice: orderPrice || null,
        idempotencyKey: randomUUID(),
        clientOrderId: randomUUID(),
      },
    })

    // Create order event
    await db.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: 'CREATED',
        payload: JSON.stringify({ symbol, side, quantity, price: orderPrice }),
      },
    })

    await db.orderEvent.create({
      data: {
        orderId: order.id,
        eventType: 'FILLED',
        payload: JSON.stringify({ price: orderPrice, quantity }),
      },
    })

    // Auto-create a position for MARKET orders
    if (type === 'MARKET' && orderPrice) {
      await db.position.create({
        data: {
          userId: session.userId,
          credentialId: credentialId || '',
          exchange: 'demo',
          symbol,
          side: side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
          status: 'OPEN',
          quantity: parseFloat(String(quantity)),
          entryPrice: orderPrice,
          currentPrice: orderPrice,
          stopLoss: slValue ? parseFloat(String(slValue)) : null,
          takeProfit: tpValue ? parseFloat(String(tpValue)) : null,
          unrealizedPnl: 0,
        },
      })

      // Record trade
      await db.trade.create({
        data: {
          userId: session.userId,
          orderId: order.id,
          exchange: 'demo',
          symbol,
          side: side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
          type: 'ENTRY',
          quantity: parseFloat(String(quantity)),
          price: orderPrice,
        },
      })
    }

    return NextResponse.json({ success: true, data: order })
  } catch (error: any) {
    console.error('[trading/orders POST] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في إنشاء الطلب' },
      { status: 500 }
    )
  }
}
