import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * POST /api/auth/refresh — Refresh an existing session.
 *
 * If the session will expire within 60 minutes, creates a new session
 * with a fresh token and extends the expiry. Otherwise, just validates
 * the current session.
 *
 * This enables "sliding sessions" — as long as the user is active,
 * their session is automatically extended.
 */

const REFRESH_THRESHOLD_MS = 60 * 60 * 1000 // Refresh if expiring within 60 minutes
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const GUEST_EMAIL = 'guest@roua.auto'

export async function POST(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 })
    }

    const sessionToken = request.cookies.get('roua_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 })
    }

    // Look up existing session
    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'INVALID_SESSION' }, { status: 401 })
    }

    // Check if guest — reject
    const isGuestUser = session.user.email === GUEST_EMAIL || session.user.id.startsWith('guest')
    if (isGuestUser) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {})
      const response = NextResponse.json({ error: 'GUEST_SESSION_INVALID' }, { status: 401 })
      response.cookies.delete('roua_session')
      return response
    }

    // Session expired
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {})
      const response = NextResponse.json({ error: 'SESSION_EXPIRED' }, { status: 401 })
      response.cookies.delete('roua_session')
      return response
    }

    const now = new Date()
    const timeUntilExpiry = session.expiresAt.getTime() - now.getTime()

    // If session will expire within the threshold, create a new one
    if (timeUntilExpiry < REFRESH_THRESHOLD_MS) {
      // Create new session
      const newToken = crypto.randomBytes(32).toString('hex')
      const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

      await db.session.create({
        data: { userId: session.user.id, token: newToken, expiresAt: newExpiresAt },
      })

      // Delete old session
      await db.session.delete({ where: { id: session.id } }).catch(() => {})

      const response = NextResponse.json({
        refreshed: true,
        authenticated: true,
        isGuest: false,
        user: {
          id: session.user.id,
          email: session.user.email,
          displayName: session.user.displayName,
          tier: session.user.tier,
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
    }

    // Session is still fresh — just return user info
    return NextResponse.json({
      refreshed: false,
      authenticated: true,
      isGuest: false,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        tier: session.user.tier,
        isGuest: false,
      },
    })
  } catch (error: any) {
    console.error('[auth/refresh] Error:', error?.message || error)
    return NextResponse.json({ error: 'REFRESH_ERROR' }, { status: 500 })
  }
}
