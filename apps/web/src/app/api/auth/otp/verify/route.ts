import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * POST /api/auth/otp/verify — Verify an OTP code and create a session.
 *
 * Flow:
 * 1. Rate-limit by IP + email (max 5 attempts per 5 minutes)
 * 2. Look up the OTP in VerificationToken table
 * 3. Check if it's expired
 * 4. If valid, find or create the user
 * 5. Create a session
 * 6. Delete the used OTP
 * 7. Return user data with session cookie
 *
 * SECURITY: Rate limiting prevents brute-force attacks on the 6-digit OTP.
 * Without it, an attacker could try all 1,000,000 combinations in minutes.
 */

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days (reduced from 30 days for security)
const GUEST_EMAIL = 'guest@roua.auto'
const MAX_OTP_ATTEMPTS = 5
const OTP_ATTEMPT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const MAX_INVALID_ATTEMPTS_LOCKOUT = 5 // After 5 wrong attempts, lock for 30 minutes
const LOCKOUT_DURATION_MS = 30 * 60 * 1000 // 30 minutes

// In-memory rate limit store (resets on server restart — acceptable for this use case)
const otpAttemptStore = new Map<string, { count: number; firstAttemptAt: number }>()
const otpLockoutStore = new Map<string, { until: number }>()

function getRateLimitKey(email: string, ip: string): string {
  return `${email}:${ip}`
}

// Clean up stale entries every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, value] of otpAttemptStore) {
      if (now - value.firstAttemptAt > OTP_ATTEMPT_WINDOW_MS) {
        otpAttemptStore.delete(key)
      }
    }
    for (const [key, value] of otpLockoutStore) {
      if (value.until < now) {
        otpLockoutStore.delete(key)
      }
    }
  }, 10 * 60 * 1000)
}

export async function POST(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 })
    }

    const body = await request.json()
    const email = body.email as string
    const otp = body.otp as string

    if (!email || !otp) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 })
    }

    // Validate OTP format (must be exactly 6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'INVALID_OTP_FORMAT', message: 'رمز التحقق غير صالح' }, { status: 400 })
    }

    if (email === GUEST_EMAIL) {
      return NextResponse.json({ error: 'GUEST_LOGIN_BLOCKED' }, { status: 403 })
    }

    // ── Rate limiting: check lockout ──
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    const rateLimitKey = getRateLimitKey(email, clientIp)

    const lockout = otpLockoutStore.get(rateLimitKey)
    if (lockout && lockout.until > Date.now()) {
      const remainingSeconds = Math.ceil((lockout.until - Date.now()) / 1000)
      return NextResponse.json({
        error: 'TOO_MANY_ATTEMPTS',
        message: `محاولات كثيرة. حاول مرة أخرى بعد ${remainingSeconds} ثانية.`,
      }, { status: 429 })
    }

    // ── Rate limiting: check attempt count ──
    const attempts = otpAttemptStore.get(rateLimitKey)
    if (attempts && attempts.count >= MAX_OTP_ATTEMPTS) {
      const elapsed = Date.now() - attempts.firstAttemptAt
      if (elapsed < OTP_ATTEMPT_WINDOW_MS) {
        return NextResponse.json({
          error: 'RATE_LIMITED',
          message: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.',
        }, { status: 429 })
      }
      // Window expired — reset counter
      otpAttemptStore.delete(rateLimitKey)
    }

    // Increment attempt counter
    const current = otpAttemptStore.get(rateLimitKey)
    if (current) {
      current.count++
    } else {
      otpAttemptStore.set(rateLimitKey, { count: 1, firstAttemptAt: Date.now() })
    }

    // Look up the OTP
    const storedOtp = await db.verificationToken.findUnique({
      where: {
        identifier_token: {
          identifier: `otp:${email}`,
          token: otp,
        },
      },
    })

    if (!storedOtp) {
      // Track invalid attempts for lockout
      const currentAttempts = otpAttemptStore.get(rateLimitKey)
      if (currentAttempts && currentAttempts.count >= MAX_INVALID_ATTEMPTS_LOCKOUT) {
        otpLockoutStore.set(rateLimitKey, { until: Date.now() + LOCKOUT_DURATION_MS })
        return NextResponse.json({
          error: 'LOCKED_OUT',
          message: 'تم حظر المحاولات لمدة 30 دقيقة بسبب المحاولات الخاطئة المتكررة.',
        }, { status: 429 })
      }
      return NextResponse.json({ error: 'INVALID_OTP', message: 'رمز التحقق غير صحيح' }, { status: 400 })
    }

    // Check expiry
    if (storedOtp.expires < new Date()) {
      await db.verificationToken.delete({ where: { id: storedOtp.id } }).catch(() => {})
      return NextResponse.json({ error: 'OTP_EXPIRED', message: 'انتهت صلاحية رمز التحقق' }, { status: 400 })
    }

    // OTP is valid — delete it
    await db.verificationToken.delete({ where: { id: storedOtp.id } }).catch(() => {})

    // Find or create user
    let user = await db.user.findUnique({ where: { email } }).catch(() => null)

    if (!user) {
      try {
        user = await db.user.create({
          data: {
            email,
            displayName: email.split('@')[0],
            tier: 'FREE',
          },
        })
      } catch {
        user = await db.user.findUnique({ where: { email } })
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'USER_CREATION_FAILED' }, { status: 500 })
    }

    // Create session
    const newToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

    try {
      await db.session.create({
        data: { userId: user.id, token: newToken, expiresAt },
      })
    } catch {
      return NextResponse.json({ error: 'SESSION_CREATION_FAILED' }, { status: 500 })
    }

    const response = NextResponse.json({
      authenticated: true,
      isGuest: false,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tier: user.tier,
        isGuest: false,
      },
    })

    response.cookies.set('roua_session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[auth/otp/verify] Error:', error?.message || error)
    return NextResponse.json({ error: 'OTP_VERIFY_ERROR' }, { status: 500 })
  }
}
