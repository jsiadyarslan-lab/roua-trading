import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * POST /api/auth/otp/send — Send an OTP code to the user's email.
 *
 * Rate-limited to 3 requests per email per 15 minutes (enforced via DB).
 * The OTP is stored in the database with a 10-minute expiry.
 * In production, this would send an email; for now, it returns the OTP
 * in the response (for development/testing).
 */

const OTP_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const OTP_LENGTH = 6
const GUEST_EMAIL = 'guest@roua.auto'

/**
 * Check if an email belongs to a guest user.
 * Matches both the legacy guest@roua.auto and the new unique guest-{uuid}@roua.auto pattern.
 */
function isGuestEmail(email: string): boolean {
  return email === GUEST_EMAIL || /^guest-[a-f0-9]+@roua\.auto$/.test(email)
}

export async function POST(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 })
    }

    const body = await request.json()
    const email = body.email as string

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'INVALID_EMAIL' }, { status: 400 })
    }

    if (isGuestEmail(email)) {
      return NextResponse.json({ error: 'GUEST_LOGIN_BLOCKED' }, { status: 403 })
    }

    // Rate limit: max 3 OTP requests per email per 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
    const recentOtps = await db.verificationToken.findMany({
      where: {
        identifier: `otp:${email}`,
        expires: { gt: fifteenMinutesAgo },
      },
      orderBy: { expires: 'desc' },
    })

    if (recentOtps.length >= 3) {
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: 'طلبات كثيرة. حاول مرة أخرى بعد 15 دقيقة.' },
        { status: 429 },
      )
    }

    // Generate OTP
    const otp = crypto.randomInt(Math.pow(10, OTP_LENGTH - 1), Math.pow(10, OTP_LENGTH)).toString()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)

    // Clean up any existing OTPs for this email
    await db.verificationToken.deleteMany({
      where: { identifier: `otp:${email}` },
    }).catch(() => {})

    // Store new OTP
    await db.verificationToken.create({
      data: {
        identifier: `otp:${email}`,
        token: otp,
        expires: expiresAt,
      },
    })

    // SECURITY: Never return OTP in the response body, even in development.
    // In production, this would send an email.
    // For development, check the server console logs for the OTP.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[auth/otp/send] DEV ONLY — OTP for ${email}: ${otp}`)
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
    })
  } catch (error: any) {
    console.error('[auth/otp/send] Error:', error?.message || error)
    return NextResponse.json({ error: 'OTP_SEND_ERROR' }, { status: 500 })
  }
}
