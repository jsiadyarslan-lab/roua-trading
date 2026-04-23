import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export async function DELETE(request: NextRequest) {
  try {
    await ensureDbReady()
    
    // Check authentication
    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    // Delete all signals for this user
    await db.signal.deleteMany({
      where: { userId: session.userId }
    })

    return NextResponse.json({ success: true, message: 'تم حذف جميع الإشارات بنجاح' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
