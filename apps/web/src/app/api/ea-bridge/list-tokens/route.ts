import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ea-bridge/list-tokens
 *
 * جلب توكنات EA للمستخدم الحالي مباشرة من قاعدة البيانات
 */
export async function GET(request: NextRequest) {
  try {
    const sessionToken =
      request.cookies.get('roua_session')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('x-roua-session') ||
      ''

    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 })
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ success: true, data: [] })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session || session.isActive === false) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const tokens = await db.eAToken.findMany({
      where: { userId: session.userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      success: true,
      data: tokens.map(t => ({
        id: t.id,
        token: t.token,
        label: t.label,
        mt5AccountNumber: t.mt5AccountNumber,
        mt5Server: t.mt5Server,
        isActive: t.isActive,
        lastHeartbeatAt: t.lastHeartbeatAt?.toISOString() || null,
        createdAt: t.createdAt.toISOString(),
      })),
    })
  } catch (error: any) {
    console.error('[ea-bridge] list-tokens error:', error?.message?.substring(0, 200))
    return NextResponse.json({ success: true, data: [] })
  }
}
