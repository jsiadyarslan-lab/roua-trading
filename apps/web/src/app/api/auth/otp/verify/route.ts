import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * POST /api/auth/otp/verify — Verify an OTP code and create a session.
 *
 * Flow:
 * 1. Look up the OTP in VerificationToken table
 * 2. Check if it's expired
 * 3. If valid, find or create the user
 * 4. Create a session
 * 5. Delete the used OTP
 * 6. Return user data with session cookie
 */

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const GUEST_EMAIL = 'guest@roua.auto'

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

    if (email === GUEST_EMAIL) {
      return NextResponse.json({ error: 'GUEST_LOGIN_BLOCKED' }, { status: 403 })
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
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[auth/otp/verify] Error:', error?.message || error)
    return NextResponse.json({ error: 'OTP_VERIFY_ERROR' }, { status: 500 })
  }
}
