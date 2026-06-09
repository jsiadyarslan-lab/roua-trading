import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { createSessionSafely } from '@/lib/session-create'
import crypto from 'crypto'

/**
 * /api/auth/me — Authentication endpoint
 *
 * Checks existing session or creates one for email login flow.
 * NO automatic guest creation — users must login to access the platform.
 *
 * Flow:
 * 1. If roua_session cookie exists → validate and return user
 * 2. If ?email=xxx provided → find/create user + session (email login)
 * 3. Otherwise → return { authenticated: false }
 */




const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
const REFRESH_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Parse user-agent string into structured device info
 */
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

export async function GET(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({
        authenticated: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
      })
    }

    const requestedEmail = request.nextUrl.searchParams.get('email')
    // Mobile app support: read session token from cookie OR Authorization header
    let sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        sessionToken = authHeader.substring(7)
      }
    }
    // Also check x-roua-session header (custom header sent by mobile app)
    if (!sessionToken) {
      sessionToken = request.headers.get('x-roua-session')
    }

    // ── Check existing session ──
    if (sessionToken && !requestedEmail) {
      try {
        const session = await db.session.findUnique({
          where: { token: sessionToken },
          include: { user: true },
        })
        if (session && session.isActive && session.expiresAt > new Date()) {
          // FIX: Mobile clients need tokens in the response body because
          // URLSession doesn't reliably expose Set-Cookie headers.
          // When X-Platform header is present (ios/android), include tokens
          // so the mobile app can store them in Keychain/EncryptedSharedPreferences.
          const isMobile = request.headers.get('x-platform')?.toLowerCase() === 'ios'
            || request.headers.get('x-platform')?.toLowerCase() === 'android'

          const responseBody: Record<string, any> = {
            authenticated: true,
            user: {
              id: session.user.id,
              email: session.user.email,
              displayName: session.user.displayName,
              tier: session.user.tier,
            },
          }

          // Include tokens in body for mobile clients
          if (isMobile) {
            responseBody.sessionToken = sessionToken
            // Look up the refresh token for this session
            if (session.refreshToken) {
              responseBody.refreshToken = session.refreshToken
            }
          }

          return NextResponse.json(responseBody)
        }
        // Session expired or inactive — clean up
        if (session) {
          await db.session.update({
            where: { id: session.id },
            data: { isActive: false },
          }).catch(() => {})
        }
      } catch (dbErr: any) {
        console.warn('[auth/me] Session check failed:', dbErr?.message || dbErr)
      }
    }

    // ── Email login flow: ?email=xxx ──
    if (requestedEmail) {


      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
        return NextResponse.json({
          authenticated: false,
          error: 'INVALID_EMAIL',
        })
      }

      const user = await db.user.findUnique({
        where: { email: requestedEmail },
        include: {
          accounts: { take: 1 },
        },
      }).catch(() => null)

      if (!user) {
        return NextResponse.json({
          authenticated: false,
          error: 'USER_NOT_FOUND',
          message: 'هذا البريد غير مسجل. استخدم رمز التحقق للتسجيل أولاً.',
        })
      }

      let hasValidSession = false
      if (sessionToken) {
        try {
          const existingSession = await db.session.findFirst({
            where: { token: sessionToken, userId: user.id, isActive: true, expiresAt: { gt: new Date() } },
          })
          hasValidSession = !!existingSession
        } catch { /* Ignore DB errors */ }
      }

      let hasOtpVerification = false
      try {
        const otpRecord = await db.verificationToken.findFirst({
          where: { identifier: requestedEmail },
        })
        hasOtpVerification = !!otpRecord
      } catch { /* Ignore DB errors */ }

      // ── Verification check ──
      // A user is considered verified if ANY of these is true:
      // 1. Has a passkey registered (passkeyId)
      // 2. Has an OAuth account linked (e.g., Google, GitHub) — checked by provider
      // 3. Has completed OTP verification
      // 4. Has a currently valid session (re-login after previous verification)
      const hasGoogleAccount = user.accounts.some(a => a.provider === 'google')
      const isVerified = !!(user.passkeyId || hasGoogleAccount || hasOtpVerification || hasValidSession)

      if (!isVerified) {
        return NextResponse.json({
          authenticated: false,
          error: 'EMAIL_NOT_VERIFIED',
          message: 'يرجى التحقق من بريدك الإلكتروني عبر رمز التحقق أولاً.',
        })
      }

      // Create session with device info
      const userAgent = request.headers.get('user-agent')
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || null
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
        return NextResponse.json({
          authenticated: false,
          error: 'SESSION_CREATION_FAILED',
        })
      }

      // CRITICAL FIX: Include tokens in response body for mobile clients
      // that can't read httpOnly Set-Cookie headers.
      const isMobile = request.headers.get('x-platform')?.toLowerCase() === 'ios'
        || request.headers.get('x-platform')?.toLowerCase() === 'android'

      const responseBody: Record<string, any> = {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          tier: user.tier,
        },
      }

      if (isMobile) {
        responseBody.sessionToken = newToken
        responseBody.refreshToken = newRefreshToken
      }

      const response = NextResponse.json(responseBody)

      response.cookies.set('roua_session', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 24 hours
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
    }

    // ── No session, no email → not authenticated ──
    return NextResponse.json({
      authenticated: false,
      error: 'NO_SESSION',
    })
  } catch (error: any) {
    console.error('[auth/me] Error:', error?.message || error)
    return NextResponse.json({
      authenticated: false,
      error: 'AUTH_ERROR',
    })
  }
}

/**
 * POST /api/auth/me — Email login flow (secure alternative to GET ?email=xxx)
 */
export async function POST(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({
        authenticated: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
      })
    }

    const body = await request.json().catch(() => ({}))
    const requestedEmail = body.email as string | undefined

    if (!requestedEmail) {
      return NextResponse.json({
        authenticated: false,
        error: 'MISSING_EMAIL',
      })
    }



    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
      return NextResponse.json({
        authenticated: false,
        error: 'INVALID_EMAIL',
      })
    }

    const user = await db.user.findUnique({
      where: { email: requestedEmail },
      include: {
        accounts: { take: 1 },
      },
    }).catch(() => null)

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        error: 'USER_NOT_FOUND',
        message: 'هذا البريد غير مسجل. استخدم رمز التحقق للتسجيل أولاً.',
      })
    }

    let hasOtpVerification = false
    try {
      const otpRecord = await db.verificationToken.findFirst({
        where: { identifier: requestedEmail },
      })
      hasOtpVerification = !!otpRecord
    } catch { /* Ignore DB errors */ }

    // ── Verification check (POST method) ──
    // Same logic as GET but without hasValidSession (POST is initial login attempt)
    const hasGoogleAccount = user.accounts.some(a => a.provider === 'google')
    const isVerified = !!(user.passkeyId || hasGoogleAccount || hasOtpVerification)

    if (!isVerified) {
      return NextResponse.json({
        authenticated: false,
        error: 'EMAIL_NOT_VERIFIED',
        message: 'يرجى التحقق من بريدك الإلكتروني عبر رمز التحقق أولاً.',
      })
    }

    // Create session with device info
    const userAgent = request.headers.get('user-agent')
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null
    const deviceInfo = parseUserAgent(userAgent)
    const newToken = crypto.randomBytes(32).toString('hex')
    const newRefreshToken = crypto.randomBytes(48).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

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
      return NextResponse.json({
        authenticated: false,
        error: 'SESSION_CREATION_FAILED',
      })
    }

    // CRITICAL FIX: Include tokens in response body for mobile clients
    // that can't read httpOnly Set-Cookie headers.
    const isMobile = request.headers.get('x-platform')?.toLowerCase() === 'ios'
      || request.headers.get('x-platform')?.toLowerCase() === 'android'

    const responseBody: Record<string, any> = {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tier: user.tier,
      },
    }

    if (isMobile) {
      responseBody.sessionToken = newToken
      responseBody.refreshToken = newRefreshToken
    }

    const response = NextResponse.json(responseBody)

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
    console.error('[auth/me POST] Error:', error?.message || error)
    return NextResponse.json({
      authenticated: false,
      error: 'AUTH_ERROR',
    })
  }
}

/**
 * Logout: DELETE /api/auth/me
 */
export async function DELETE(request: NextRequest) {
  try {
    // Mobile app support: read session from cookie OR Authorization header
    let sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        sessionToken = authHeader.substring(7)
      }
    }
    if (!sessionToken) {
      sessionToken = request.headers.get('x-roua-session')
    }
    if (sessionToken) {
      // Mark session as inactive instead of deleting (audit trail)
      await db.session.updateMany({
        where: { token: sessionToken, isActive: true },
        data: { isActive: false },
      }).catch(() => {})
    }
  } catch { /* Ignore */ }

  const response = NextResponse.json({ success: true })
  response.cookies.delete('roua_session')
  response.cookies.delete('roua_refresh')
  return response
}
