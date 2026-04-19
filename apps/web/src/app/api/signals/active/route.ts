import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * GET /api/signals/active
 * Fetches active signals for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    // Check authentication
    const sessionToken = request.cookies.get('roua_session')?.value
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

    // Fetch active signals
    const signals = await db.signal.findMany({
      where: {
        userId: session.userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: signals })
  } catch (error: any) {
    console.error('[signals/active] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب الإشارات' },
      { status: 500 }
    )
  }
}
