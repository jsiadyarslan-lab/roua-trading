import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * DELETE /api/portfolio/credentials/[id]
 * Deletes an exchange credential.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbReady()

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

    const { id } = await params

    // Verify the credential belongs to this user
    const credential = await db.exchangeCredential.findUnique({
      where: { id },
    })

    if (!credential || credential.userId !== session.userId) {
      return NextResponse.json(
        { success: false, error: 'المفتاح غير موجود' },
        { status: 404 }
      )
    }

    await db.exchangeCredential.delete({
      where: { id },
    })

    // Log the deletion
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'CREDENTIAL_DELETED',
        resource: `exchange:${credential.exchange}:${credential.label}`,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[portfolio/credentials] DELETE Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في حذف المفتاح' },
      { status: 500 }
    )
  }
}
