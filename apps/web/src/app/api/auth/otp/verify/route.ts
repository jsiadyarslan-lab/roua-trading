import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { createSessionSafely } from '@/lib/session-create'
import crypto from 'crypto'

/**
 * POST /api/auth/otp/verify — Verify an OTP code and create a session.
 *
 * Flow:
 * 1. Rate-limit by IP + email (max 5 attempts per 5 minutes)
 * 2. Look up the OTP in VerificationToken table
 * 3. Check if it's expired
 * 4. If valid, find or create the user
 * 5. Create a session with device info and refresh token
 * 6. Delete the used OTP
 * 7. Return user data with session + refresh cookies
 */

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days for OTP-verified users
const GUEST_EMAIL = 'guest@roua.auto'

/**
 * Check if an email belongs to a guest user.
 * Matches both the legacy guest@roua.auto and the new unique guest-{uuid}@roua.auto pattern.
 */
function isGuestEmail(email: string): boolean {
  return email === GUEST_EMAIL || /^guest-[a-f0-9]+@roua\.auto$/.test(email)
}
const MAX_OTP_ATTEMPTS = 5
const OTP_ATTEMPT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const MAX_INVALID_ATTEMPTS_LOCKOUT = 5
const LOCKOUT_DURATION_MS = 30 * 60 * 1000 // 30 minutes

const otpAttemptStore = new Map<string, { count: number; firstAttemptAt: number }>()
const otpLockoutStore = new Map<string, { until: number }>()

function getRateLimitKey(email: string, ip: string): string {
  return `${email}:${ip}`
}

function parseUserAgent(userAgent?: string | null) {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()

  let type = 'desktop'
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) type = 'mobile'
  else if (/ipad|tablet|kindle|silk/i.test(ua)) type = 'tablet'

  let browser = 'Unknown'
  if (ua.includes('edg/')) browser = 'Edge'
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome'
  else if (ua.includes('firefox/')) browser = 'Firefox'
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari'
  else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'Opera'

  let os = 'Unknown'
  if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('mac os')) os = 'macOS'
  else if (ua.includes('linux')) os = 'Linux'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS'

  return { browser, os, type, device: type }
}

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

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'INVALID_OTP_FORMAT', message: 'رمز التحقق غير صالح' }, { status: 400 })
    }

    if (isGuestEmail(email)) {
      return NextResponse.json({ error: 'GUEST_LOGIN_BLOCKED' }, { status: 403 })
    }

    // ── Rate limiting ──
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

    const attempts = otpAttemptStore.get(rateLimitKey)
    if (attempts && attempts.count >= MAX_OTP_ATTEMPTS) {
      const elapsed = Date.now() - attempts.firstAttemptAt
      if (elapsed < OTP_ATTEMPT_WINDOW_MS) {
        return NextResponse.json({
          error: 'RATE_LIMITED',
          message: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.',
        }, { status: 429 })
      }
      otpAttemptStore.delete(rateLimitKey)
    }

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

    if (storedOtp.expires < new Date()) {
      await db.verificationToken.delete({ where: { id: storedOtp.id } }).catch(() => {})
      return NextResponse.json({ error: 'OTP_EXPIRED', message: 'انتهت صلاحية رمز التحقق' }, { status: 400 })
    }

    await db.verificationToken.delete({ where: { id: storedOtp.id } }).catch(() => {})

    // Find or create user
    let user = await db.user.findUnique({ where: { email } }).catch(() => null)

    if (!user) {
      try {
        user = await db.user.create({
          data: { email, displayName: email.split('@')[0], tier: 'FREE' },
        })
      } catch {
        user = await db.user.findUnique({ where: { email } })
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'USER_CREATION_FAILED' }, { status: 500 })
    }

    // Create session with device info
    const userAgent = request.headers.get('user-agent')
    const ipAddress = clientIp !== 'unknown' ? clientIp : null
    const deviceInfo = parseUserAgent(userAgent)
    const newToken = crypto.randomBytes(32).toString('hex')
    const newRefreshToken = crypto.randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

    const createdToken = await createSessionSafely({
      userId: user.id,
      token: newToken,
      refreshToken: newRefreshToken,
      deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : null,
      ipAddress,
      userAgent,
      isActive: true,
      expiresAt,
    })

    if (!createdToken) {
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

    response.cookies.set('roua_refresh', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[auth/otp/verify] Error:', error?.message || error)
    return NextResponse.json({ error: 'OTP_VERIFY_ERROR' }, { status: 500 })
  }
}
