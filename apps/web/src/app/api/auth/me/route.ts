import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
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

const GUEST_EMAIL = 'guest@roua.auto'

export async function GET(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({
        authenticated: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
      })
    }

    // Check if a specific email was requested (for email login flow)
    const requestedEmail = request.nextUrl.searchParams.get('email')

    const sessionToken = request.cookies.get('roua_session')?.value

    // ── Check existing session ──
    if (sessionToken && !requestedEmail) {
      try {
        const session = await db.session.findUnique({
          where: { token: sessionToken },
          include: { user: true },
        })
        if (session && session.expiresAt > new Date()) {
          const isGuestUser = session.user.email === GUEST_EMAIL || session.user.id.startsWith('guest')

          // FIX: Return guest sessions with isGuest flag instead of deleting them.
          // This unifies behavior with NestJS AuthGuard which auto-creates guests.
          // The frontend can show a banner prompting login for guest users.
          return NextResponse.json({
            authenticated: !isGuestUser,
            isGuest: isGuestUser,
            user: {
              id: session.user.id,
              email: session.user.email,
              displayName: session.user.displayName,
              tier: session.user.tier,
              isGuest: isGuestUser,
            },
          })
        }
        // Session expired — clean up
        if (session) {
          await db.session.delete({ where: { id: session.id } }).catch(() => {})
        }
      } catch (dbErr: any) {
        console.warn('[auth/me] Session check failed:', dbErr?.message || dbErr)
      }
    }

    // ── Email login flow: ?email=xxx ──
    if (requestedEmail) {
      // Block guest email
      if (requestedEmail === GUEST_EMAIL) {
        return NextResponse.json({
          authenticated: false,
          error: 'GUEST_LOGIN_BLOCKED',
        })
      }

      // Find or create user with this email
      let user = await db.user.findUnique({ where: { email: requestedEmail } }).catch(() => null)

      if (!user) {
        try {
          user = await db.user.create({
            data: {
              email: requestedEmail,
              displayName: requestedEmail.split('@')[0],
              tier: 'FREE',
            },
          })
        } catch {
          user = await db.user.findUnique({ where: { email: requestedEmail } })
        }
      }

      if (!user) {
        return NextResponse.json({
          authenticated: false,
          error: 'USER_CREATION_FAILED',
        })
      }

      // Create a new session
      const newToken = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      try {
        await db.session.create({
          data: { userId: user.id, token: newToken, expiresAt },
        })
      } catch {
        return NextResponse.json({
          authenticated: false,
          error: 'SESSION_CREATION_FAILED',
        })
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
 * Logout: DELETE /api/auth/me
 */
export async function DELETE(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('roua_session')?.value
    if (sessionToken) {
      await db.session.deleteMany({ where: { token: sessionToken } }).catch(() => {})
    }
  } catch { /* Ignore */ }

  const response = NextResponse.json({ success: true })
  response.cookies.delete('roua_session')
  return response
}
