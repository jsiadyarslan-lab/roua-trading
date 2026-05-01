import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Verify that the request has a valid admin session.
 *
 * Checks the `roua_admin_session` cookie against the AdminSession table.
 * Returns null if authenticated, or a NextResponse with 401/503 if not.
 *
 * Usage in API routes:
 * ```ts
 * const authError = await verifyAdminAuth(req)
 * if (authError) return authError
 * ```
 */
export async function verifyAdminAuth(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get('roua_admin_session')?.value

  if (!token) {
    return NextResponse.json(
      { error: 'غير مصرح — يرجى تسجيل الدخول' },
      { status: 401 }
    )
  }

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(
        { error: 'قاعدة البيانات غير متاحة' },
        { status: 503 }
      )
    }

    const session = await db.adminSession.findUnique({
      where: { token },
    })

    if (!session || session.expiresAt < new Date()) {
      // Clean up expired session
      if (session) {
        await db.adminSession.delete({ where: { token } }).catch(() => {})
      }
      return NextResponse.json(
        { error: 'انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً' },
        { status: 401 }
      )
    }

    // Session is valid
    return null
  } catch (error: any) {
    console.error('[admin-auth] Session verification error:', error?.message || error)
    return NextResponse.json(
      { error: 'فشل في التحقق من الهوية' },
      { status: 500 }
    )
  }
}
