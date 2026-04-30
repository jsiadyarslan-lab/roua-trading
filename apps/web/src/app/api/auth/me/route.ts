import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * /api/auth/me — Auto-authentication endpoint
 *
 * Simplified: always ensures a valid session exists.
 * No login required — auto-creates guest user + session.
 * The platform works out-of-the-box.
 */

const GUEST_EMAIL = 'guest@roua.auto'

export async function GET(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      // DB unavailable — return a mock session so the frontend doesn't break
      return NextResponse.json({
        authenticated: true,
        isGuest: true,
        user: {
          id: 'guest-offline',
          email: GUEST_EMAIL,
          displayName: 'ضيف',
          tier: 'FREE',
          isGuest: true,
        },
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
          return NextResponse.json({
            authenticated: true,
            isGuest: session.user.email === GUEST_EMAIL || session.user.id.startsWith('guest'),
            user: {
              id: session.user.id,
              email: session.user.email,
              displayName: session.user.displayName,
              tier: session.user.tier,
              isGuest: session.user.email === GUEST_EMAIL || session.user.id.startsWith('guest'),
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

    // ── Determine which email to use ──
    const targetEmail = requestedEmail || GUEST_EMAIL

    // ── Find or create user ──
    let user = await db.user.findUnique({ where: { email: targetEmail } }).catch(() => null)

    if (!user) {
      try {
        user = await db.user.create({
          data: {
            email: targetEmail,
            displayName: targetEmail === GUEST_EMAIL ? 'ضيف' : targetEmail.split('@')[0],
            tier: 'FREE',
          },
        })
      } catch {
        user = await db.user.findUnique({ where: { email: targetEmail } })
      }
    }

    if (!user) {
      // Can't create user — return mock session
      const isGuestUser = targetEmail === GUEST_EMAIL
      return NextResponse.json({
        authenticated: true,
        isGuest: isGuestUser,
        user: { id: 'guest-fallback', email: targetEmail, displayName: targetEmail === GUEST_EMAIL ? 'ضيف' : targetEmail.split('@')[0], tier: 'FREE', isGuest: isGuestUser },
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
      // Session creation failed — return user without cookie
      return NextResponse.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          tier: user.tier,
        },
      })
    }

    const isGuestUser = user.email === GUEST_EMAIL || user.id.startsWith('guest')

    const response = NextResponse.json({
      authenticated: true,
      isGuest: isGuestUser,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tier: user.tier,
        isGuest: isGuestUser,
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
    console.error('[auth/me] Error:', error?.message || error)
    // NEVER return 500 — always return a valid session
    return NextResponse.json({
      authenticated: true,
      isGuest: true,
      user: { id: 'guest-error', email: GUEST_EMAIL, displayName: 'ضيف', tier: 'FREE', isGuest: true },
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
