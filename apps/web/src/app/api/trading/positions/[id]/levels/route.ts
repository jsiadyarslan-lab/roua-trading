import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * POST /api/trading/positions/[id]/levels
 * Updates stop loss and take profit for a position.
 */
export async function POST(
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

    const body = await req.json()
    const { stopLoss, takeProfit } = body

    const position = await db.position.findUnique({ where: { id } })
    if (!position || position.userId !== session.userId) {
      return NextResponse.json({ success: false, error: 'المركز غير موجود' }, { status: 404 })
    }

    const updateData: Record<string, any> = {}
    if (stopLoss !== undefined && stopLoss !== null) updateData.stopLoss = parseFloat(String(stopLoss))
    if (takeProfit !== undefined && takeProfit !== null) updateData.takeProfit = parseFloat(String(takeProfit))

    await db.position.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, message: 'تم تحديث المستويات' })
  } catch (error: any) {
    console.error('[trading/positions/levels] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في تحديث المستويات' },
      { status: 500 }
    )
  }
}
