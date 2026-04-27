import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * Custom session check endpoint at /api/auth/me
 * (NOT at /api/auth/session which conflicts with NextAuth's built-in endpoint)
 *
 * Checks the roua_session cookie and returns user info.
 * If no session exists, auto-creates a guest user + session
 * so the platform works without requiring login.
 */
const GUEST_EMAIL = 'guest@roua.auto'

export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    const sessionToken = request.cookies.get('roua_session')?.value

    // ── Check existing session ──
    if (sessionToken) {
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      })

      if (session && session.expiresAt > new Date()) {
        return NextResponse.json({
          authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
            displayName: session.user.displayName,
            tier: session.user.tier,
          },
        })
      }

      // Session expired — clean up
      if (session) {
        await db.session.delete({ where: { id: session.id } }).catch(() => {})
      }
    }

    // ── No valid session — auto-create guest user + session ──
    // This ensures the platform works out-of-the-box without requiring login.
    // The guest user gets PREMIUM tier for full feature access.

    let guestUser = await db.user.findUnique({ where: { email: GUEST_EMAIL } })

    if (!guestUser) {
      guestUser = await db.user.create({
        data: {
          email: GUEST_EMAIL,
          displayName: 'ضيف',
          tier: 'PREMIUM',
        },
      })
      console.log('[auth/me] Auto-created guest user:', guestUser.id)
    }

    // Create a new session for the guest user
    const newToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await db.session.create({
      data: {
        userId: guestUser.id,
        token: newToken,
        expiresAt,
      },
    })

    console.log('[auth/me] Auto-created guest session for:', GUEST_EMAIL)

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: guestUser.id,
        email: guestUser.email,
        displayName: guestUser.displayName,
        tier: guestUser.tier,
      },
    })

    // Set the session cookie so subsequent requests are authenticated
    response.cookies.set('roua_session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}

/**
 * Logout: DELETE /api/auth/me
 */
export async function DELETE(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('roua_session')?.value

    if (sessionToken) {
      // Find the session first so we can log the userId before deleting
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        select: { id: true, userId: true },
      })

      if (session) {
        // Audit log before deletion
        await db.auditLog.create({
          data: {
            userId: session.userId,
            action: 'AUTH_LOGOUT',
            resource: 'session',
          },
        })

        // Now delete the session
        await db.session.delete({ where: { id: session.id } })
      } else {
        // Session already gone or expired — clean up any remaining records
        await db.session.deleteMany({
          where: { token: sessionToken },
        })
      }
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete('roua_session')

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}
