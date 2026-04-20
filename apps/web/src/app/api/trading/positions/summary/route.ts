import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * GET /api/trading/positions/summary
 * Returns aggregated position summary for the authenticated user.
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

    const positions = await db.position.findMany({
      where: { userId: session.userId, status: 'OPEN' },
    })

    const totalPositions = positions.length
    const totalValue = positions.reduce((sum, p) => sum + (p.quantity * (p.currentPrice || p.entryPrice)), 0)
    const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)

    const closedPositions = await db.position.findMany({
      where: { userId: session.userId, status: 'CLOSED' },
    })
    const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        totalPositions,
        totalValue,
        unrealizedPnl,
        realizedPnl,
      },
    })
  } catch (error: any) {
    console.error('[trading/positions/summary] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب ملخص المراكز' },
      { status: 500 }
    )
  }
}
