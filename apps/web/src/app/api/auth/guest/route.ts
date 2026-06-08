import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { createSessionSafely } from '@/lib/session-create'
import crypto from 'crypto'

/**
 * /api/auth/guest — Create a guest session for demo/preview access
 *
 * SUSTAINABLE REPLACEMENT for the SKIP_LANDING env var hack.
 *
 * Flow:
 * 1. Generate a unique guest user ID and email
 * 2. Create a guest user in the database (or reuse existing session)
 * 3. Create a session with roua_session cookie
 * 4. Redirect to /dashboard
 *
 * The guest user gets view-only access (GuestGuard blocks actions).
 * GuestBanner shows a notice explaining it's a demo mode.
 *
 * Rate-limited: Each IP can only create 1 guest session per hour.
 */

const GUEST_SESSION_DURATION_MS = 2 * 60 * 60 * 1000 // 2 hours (shorter than real sessions)

/**
 * Check if the request comes from a mobile app.
 * Mobile apps send X-Platform: ios or X-Platform: android header.
 */
function isMobileClient(request: NextRequest): boolean {
  const platform = request.headers.get('x-platform')?.toLowerCase()
  return platform === 'ios' || platform === 'android'
}

export async function GET(request: NextRequest) {
  try {
    const isMobile = isMobileClient(request)

    // If user already has a valid session, redirect (web) or return JSON (mobile)
    const existingToken = request.cookies.get('roua_session')?.value
      || request.headers.get('x-roua-session')
      || (request.headers.get('authorization')?.startsWith('Bearer ') ? request.headers.get('authorization')!.substring(7) : null)

    if (existingToken) {
      try {
        const dbReady = await ensureDbReady()
        if (dbReady) {
          const session = await db.session.findUnique({
            where: { token: existingToken },
            include: { user: true },
          })
          if (session && session.isActive && session.expiresAt > new Date()) {
            // Already authenticated
            if (isMobile) {
              return NextResponse.json({
                authenticated: true,
                isGuest: true,
                sessionToken: existingToken,
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  displayName: session.user.displayName,
                  tier: session.user.tier,
                  isGuest: true,
                },
              })
            }
            return NextResponse.redirect(new URL('/dashboard', request.url))
          }
        }
      } catch {
        // Session check failed — continue to create guest session
      }
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      if (isMobile) {
        return NextResponse.json({ authenticated: false, error: 'DB_UNAVAILABLE' }, { status: 503 })
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'db_unavailable')
      return NextResponse.redirect(loginUrl)
    }

    // Rate limit: Check if this IP already has a recent guest session
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    try {
      const recentGuestSessions = await db.session.findFirst({
        where: {
          ipAddress,
          userAgent: { contains: 'guest' },
          isActive: true,
          expiresAt: { gt: new Date() },
          createdAt: { gt: oneHourAgo },
        },
      })
      if (recentGuestSessions) {
        // Reuse existing guest session
        if (isMobile) {
          const mobileUser = await db.user.findUnique({ where: { id: recentGuestSessions.userId } }).catch(() => null)
          return NextResponse.json({
            authenticated: true,
            isGuest: true,
            sessionToken: recentGuestSessions.token,
            user: mobileUser ? {
              id: mobileUser.id,
              email: mobileUser.email,
              displayName: mobileUser.displayName,
              tier: mobileUser.tier,
              isGuest: true,
            } : null,
          })
        }
        const response = NextResponse.redirect(new URL('/dashboard', request.url))
        response.cookies.set('roua_session', recentGuestSessions.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 2 * 60 * 60, // 2 hours
          path: '/',
        })
        return response
      }
    } catch {
      // Rate limit check failed — continue (don't block guest access)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // V169 FIX: UNIQUE guest user per session (DATA ISOLATION)
    //
    // ROOT CAUSE: Previously ALL guests shared guest@roua.auto, which
    // meant every guest user saw the same balance, positions, and trades.
    // Now: Each guest gets their own unique user account with isolated data.
    //
    // Guest cleanup: The maintenance cron job deletes guest-*@roua.auto
    // users whose sessions have all expired, preventing DB bloat.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let userId: string
    const guestUuid = crypto.randomBytes(8).toString('hex')
    const guestEmail = `guest-${guestUuid}@roua.auto`
    const guestDisplayName = `زائر ${guestUuid.substring(0, 6)}`
    let guestUser: any = null
    try {
      guestUser = await db.user.create({
        data: {
          email: guestEmail,
          displayName: guestDisplayName,
          tier: 'FREE',
        },
      })
    } catch {
      // Race condition or duplicate — try with a different UUID
      const altUuid = crypto.randomBytes(8).toString('hex')
      try {
        guestUser = await db.user.create({
          data: {
            email: `guest-${altUuid}@roua.auto`,
            displayName: `زائر ${altUuid.substring(0, 6)}`,
            tier: 'FREE',
          },
        })
      } catch {
        // Still failed
        if (isMobile) {
          return NextResponse.json({ authenticated: false, error: 'GUEST_CREATION_FAILED' }, { status: 500 })
        }
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('error', 'guest_creation_failed')
        return NextResponse.redirect(loginUrl)
      }
    }
    if (!guestUser) {
      if (isMobile) {
        return NextResponse.json({ authenticated: false, error: 'GUEST_CREATION_FAILED' }, { status: 500 })
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'guest_creation_failed')
      return NextResponse.redirect(loginUrl)
    }
    userId = guestUser.id

    // Create session for guest
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const refreshToken = crypto.randomBytes(48).toString('hex')
    const userAgent = request.headers.get('user-agent') || ''
    const expiresAt = new Date(Date.now() + GUEST_SESSION_DURATION_MS)

    const createdToken = await createSessionSafely({
      userId,
      token: sessionToken,
      refreshToken,
      deviceInfo: JSON.stringify({ type: 'guest', browser: 'unknown' }),
      ipAddress,
      userAgent: `guest:${userAgent}`,
      isActive: true,
      expiresAt,
    })

    if (!createdToken) {
      console.error('[auth/guest] Failed to create session for guest user:', userId)
      if (isMobile) {
        return NextResponse.json({ authenticated: false, error: 'SESSION_CREATION_FAILED' }, { status: 500 })
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'session_creation_failed')
      return NextResponse.redirect(loginUrl)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CRITICAL FIX: Mobile clients need JSON with tokens, NOT redirect!
    //
    // The iOS app uses URLSession which follows redirects automatically,
    // losing the Set-Cookie headers. Mobile apps need the session token
    // and refresh token in the JSON response body so they can store them
    // in the Keychain.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isMobile) {
      const response = NextResponse.json({
        authenticated: true,
        isGuest: true,
        sessionToken: sessionToken,
        refreshToken: refreshToken,
        user: {
          id: userId,
          email: guestEmail,
          displayName: guestDisplayName,
          tier: 'FREE',
          isGuest: true,
        },
      })

      // Also set cookies for any subsequent requests
      response.cookies.set('roua_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 2 * 60 * 60,
        path: '/',
      })
      response.cookies.set('roua_refresh', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
        path: '/',
      })

      return response
    }

    // Web clients: Set cookies and redirect to dashboard
    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    response.cookies.set('roua_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 2 * 60 * 60, // 2 hours
      path: '/',
    })
    response.cookies.set('roua_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 1 day (shorter than real sessions)
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[auth/guest] Error:', error?.message || error)
    if (isMobileClient(request)) {
      return NextResponse.json({ authenticated: false, error: 'GUEST_AUTH_ERROR' }, { status: 500 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'unknown')
    return NextResponse.redirect(loginUrl)
  }
}
