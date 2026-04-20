import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * GET /api/trading/orders/[id]
 * Fetches a single order.
 *
 * DELETE /api/trading/orders/[id]
 * Cancels a pending order.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbReady()
    const { id } = await params

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

    const order = await db.order.findUnique({ where: { id } })
    if (!order || order.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: order })
  } catch (error: any) {
    console.error('[trading/orders/[id] GET] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب الطلب' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbReady()
    const { id } = await params

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

    const order = await db.order.findUnique({ where: { id } })
    if (!order || order.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (order.status !== 'PENDING' && order.status !== 'ACCEPTED') {
      return NextResponse.json(
        { success: false, error: 'لا يمكن إلغاء ططلب منفذ أو ملغي' },
        { status: 400 }
      )
    }

    await db.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await db.orderEvent.create({
      data: {
        orderId: id,
        eventType: 'CANCELLED',
        payload: JSON.stringify({ reason: 'user_cancelled' }),
      },
    })

    return NextResponse.json({ success: true, message: 'تم إلغاء الطلب' })
  } catch (error: any) {
    console.error('[trading/orders/[id] DELETE] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في إلغاء الطلب' },
      { status: 500 }
    )
  }
}
