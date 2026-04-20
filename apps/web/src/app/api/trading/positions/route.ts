import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * GET /api/trading/positions
 * Fetches open positions for the authenticated user.
 * Uses local Prisma/SQLite — no NestJS backend needed.
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
      where: {
        userId: session.userId,
        status: 'OPEN',
      },
      orderBy: { openedAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: positions })
  } catch (error: any) {
    console.error('[trading/positions] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب المراكز' },
      { status: 500 }
    )
  }
}
