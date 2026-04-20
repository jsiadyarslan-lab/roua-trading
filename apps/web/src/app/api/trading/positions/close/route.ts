import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * POST /api/trading/positions/close
 * Closes a position (fully or partially).
 */
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
    const { positionId, quantity } = body

    if (!positionId) {
      return NextResponse.json({ success: false, error: 'معرف المركز مطلوب' }, { status: 400 })
    }

    const position = await db.position.findUnique({
      where: { id: positionId },
    })

    if (!position || position.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'المركز غير موجود' }, { status: 404 })
    }

    if (position.status !== 'OPEN') {
      return NextResponse.json({ success: false, error: 'المركز ليس مفتوحاً' }, { status: 400 })
    }

    const closeQty = quantity && quantity < position.quantity ? quantity : position.quantity
    const isPartial = closeQty < position.quantity

    if (isPartial) {
      // Partial close: update quantity and PnL
      const closedPnl = (position.unrealizedPnl || 0) * (closeQty / position.quantity)
      await db.position.update({
        where: { id: positionId },
        data: {
          quantity: position.quantity - closeQty,
          realizedPnl: (position.realizedPnl || 0) + closedPnl,
          unrealizedPnl: (position.unrealizedPnl || 0) - closedPnl,
        },
      })

      // Record trade
      await db.trade.create({
        data: {
          userId: session.userId,
          positionId,
          exchange: position.exchange,
          symbol: position.symbol,
          side: position.side,
          type: 'PARTIAL_EXIT',
          quantity: closeQty,
          price: position.currentPrice || position.entryPrice,
          pnl: closedPnl,
        },
      })
    } else {
      // Full close
      const closedPnl = position.unrealizedPnl || 0
      await db.position.update({
        where: { id: positionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          realizedPnl: (position.realizedPnl || 0) + closedPnl,
          unrealizedPnl: 0,
        },
      })

      // Record trade
      await db.trade.create({
        data: {
          userId: session.userId,
          positionId,
          exchange: position.exchange,
          symbol: position.symbol,
          side: position.side,
          type: 'EXIT',
          quantity: position.quantity,
          price: position.currentPrice || position.entryPrice,
          pnl: closedPnl,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: isPartial ? 'تم إغلاق المركز جزئياً' : 'تم إغلاق المركز بنجاح',
    })
  } catch (error: any) {
    console.error('[trading/positions/close] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في إغلاق المركز' },
      { status: 500 }
    )
  }
}
