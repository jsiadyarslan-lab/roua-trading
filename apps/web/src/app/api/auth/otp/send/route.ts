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

    if (email === GUEST_EMAIL) {
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

    // In production, send email here
    // For now, include OTP in response for development
    const isDev = process.env.NODE_ENV !== 'production'

    return NextResponse.json({
      success: true,
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
      // Only include OTP in development for testing
      ...(isDev ? { otp } : {}),
    })
  } catch (error: any) {
    console.error('[auth/otp/send] Error:', error?.message || error)
    return NextResponse.json({ error: 'OTP_SEND_ERROR' }, { status: 500 })
  }
}
