import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// ── Rate limiting for admin login ──
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const LOCKOUT_MS = 30 * 60 * 1000 // 30 minutes after max attempts
const loginAttemptStore = new Map<string, { count: number; firstAttemptAt: number }>()
const loginLockoutStore = new Map<string, { until: number }>()

// Clean up stale entries every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, value] of loginAttemptStore) {
      if (now - value.firstAttemptAt > WINDOW_MS) loginAttemptStore.delete(key)
    }
    for (const [key, value] of loginLockoutStore) {
      if (value.until < now) loginLockoutStore.delete(key)
    }
  }, 10 * 60 * 1000)
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Compares two strings in constant time regardless of content.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Perform a dummy comparison to maintain constant time
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function POST(req: NextRequest) {
  try {
    // ── Rate limiting ──
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'

    const lockout = loginLockoutStore.get(clientIp)
    if (lockout && lockout.until > Date.now()) {
      const remainingSeconds = Math.ceil((lockout.until - Date.now()) / 1000)
      return NextResponse.json(
        { error: `محاولات كثيرة. حاول مرة أخرى بعد ${remainingSeconds} ثانية.` },
        { status: 429 }
      )
    }

    const { password } = await req.json()
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword) {
      console.warn('[admin/auth/login] WARNING: ADMIN_PASSWORD environment variable is not set. Login is disabled for security.')
      return NextResponse.json(
        { error: 'تسجيل الدخول معطل — لم يتم تعيين كلمة مرور المسؤول (ADMIN_PASSWORD) في متغيرات البيئة' },
        { status: 403 }
      )
    }

    // ── Timing-safe password comparison ──
    if (!timingSafeEqual(password, adminPassword)) {
      // Track failed attempts
      const current = loginAttemptStore.get(clientIp)
      if (current) {
        current.count++
        if (current.count >= MAX_ATTEMPTS) {
          loginLockoutStore.set(clientIp, { until: Date.now() + LOCKOUT_MS })
          loginAttemptStore.delete(clientIp)
        }
      } else {
        loginAttemptStore.set(clientIp, { count: 1, firstAttemptAt: Date.now() })
      }

      return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 })
    }

    // Reset rate limit on successful login
    loginAttemptStore.delete(clientIp)
    loginLockoutStore.delete(clientIp)

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    // Clean up expired sessions
    await db.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => {})

    // Use crypto.randomBytes for strong token (256-bit entropy)
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await db.adminSession.create({
      data: { token, expiresAt },
    })

    const response = NextResponse.json({ success: true })
    response.cookies.set('roua_admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // Changed from 'lax' to 'strict' for admin
      path: '/',
      maxAge: 24 * 60 * 60,
    })

    return response
  } catch (error: any) {
    console.error('[admin/auth/login] Error:', error?.message || error)
    return NextResponse.json({ error: 'حدث خطأ في تسجيل الدخول' }, { status: 500 })
  }
}
