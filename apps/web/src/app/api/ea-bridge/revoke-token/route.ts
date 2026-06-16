import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ea-bridge/revoke-token
 *
 * تعطيل توكن EA
 */
export async function POST(request: NextRequest) {
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
      return NextResponse.json({ success: false, error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session || session.isActive === false) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const body = await request.json()
    const { tokenId } = body

    if (!tokenId) {
      return NextResponse.json({ success: false, error: 'tokenId مطلوب' }, { status: 400 })
    }

    await db.eAToken.updateMany({
      where: { id: tokenId, userId: session.userId },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[ea-bridge] revoke-token error:', error?.message?.substring(0, 200))
    return NextResponse.json({ success: false, error: 'فشل في تعطيل التوكن' }, { status: 500 })
  }
}
