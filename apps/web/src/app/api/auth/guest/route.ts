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

export async function GET(request: NextRequest) {
  try {
    // If user already has a valid session, redirect to dashboard
    const existingToken = request.cookies.get('roua_session')?.value
    if (existingToken) {
      try {
        const dbReady = await ensureDbReady()
        if (dbReady) {
          const session = await db.session.findUnique({
            where: { token: existingToken },
            include: { user: true },
          })
          if (session && session.isActive && session.expiresAt > new Date()) {
            // Already authenticated — redirect to dashboard
            return NextResponse.redirect(new URL('/dashboard', request.url))
          }
        }
      } catch {
        // Session check failed — continue to create guest session
      }
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      // DB not available — redirect to login with error
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

    // ANTI-PHANTOM-USER FIX: Use the SHARED guest user instead of creating
    // a new one per session. This prevents DB bloat from thousands of
    // guest-{uuid}@roua.auto phantom accounts.
    // Each guest still gets their own unique SESSION token, but all guests
    // share the same user account. This is safe because GuestGuard blocks
    // data-modifying actions for guest users.
    let userId: string
    const guestDisplayName = 'زائر تجريبي'
    let guestUser = await db.user.findUnique({ where: { email: 'guest@roua.auto' } })
    if (!guestUser) {
      try {
        guestUser = await db.user.create({
          data: {
            email: 'guest@roua.auto',
            displayName: guestDisplayName,
            tier: 'FREE',
          },
        })
      } catch {
        // Race condition: another request created it first
        guestUser = await db.user.findUnique({ where: { email: 'guest@roua.auto' } })
      }
    }
    if (!guestUser) {
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
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'session_creation_failed')
      return NextResponse.redirect(loginUrl)
    }

    // Set cookies and redirect to dashboard
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
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'unknown')
    return NextResponse.redirect(loginUrl)
  }
}
