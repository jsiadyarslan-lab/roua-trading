import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * DELETE /api/signals/[id]
 * Cancels (deletes) a signal.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbReady()

    const { id } = await params

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

    // Update signal status to CANCELLED
    await db.signal.updateMany({
      where: { id, userId: session.userId },
      data: { status: 'CANCELLED' },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[signals/delete] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في إلغاء الإشارة' },
      { status: 500 }
    )
  }
}
