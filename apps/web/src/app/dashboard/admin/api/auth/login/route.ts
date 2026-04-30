import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword) {
      console.warn('[admin/auth/login] WARNING: ADMIN_PASSWORD environment variable is not set. Login is disabled for security. Set ADMIN_PASSWORD to enable admin login.')
      return NextResponse.json(
        { error: 'تسجيل الدخول معطل — لم يتم تعيين كلمة مرور المسؤول (ADMIN_PASSWORD) في متغيرات البيئة' },
        { status: 403 }
      )
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 })
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    // Clean up expired sessions
    await db.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => {})

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await db.adminSession.create({
      data: { token, expiresAt },
    })

    const response = NextResponse.json({ success: true })
    response.cookies.set('roua_admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    })

    return response
  } catch (error: any) {
    console.error('[admin/auth/login] Error:', error?.message || error)
    return NextResponse.json({ error: 'حدث خطأ في تسجيل الدخول' }, { status: 500 })
  }
}
