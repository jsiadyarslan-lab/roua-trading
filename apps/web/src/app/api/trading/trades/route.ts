import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * GET /api/trading/trades
 * Fetches trade history for the authenticated user.
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
    const limit = parseInt(searchParams.get('limit') || '50')

    const trades = await db.trade.findMany({
      where: { userId: session.userId },
      orderBy: { executedAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ success: true, data: trades })
  } catch (error: any) {
    console.error('[trading/trades] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب سجل الصفقات' },
      { status: 500 }
    )
  }
}
