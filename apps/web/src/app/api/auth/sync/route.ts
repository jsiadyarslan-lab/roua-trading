import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-config'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * /api/auth/sync — Create roua_session from NextAuth session
 *
 * After Google OAuth, NextAuth creates its own session (JWT + cookie).
 * But our dashboard uses roua_session cookie for auth checks.
 * This endpoint bridges the gap:
 * 1. Gets the NextAuth session (which includes Google user info)
 * 2. Creates a roua_session in our DB
 * 3. Sets the roua_session cookie
 * 4. Returns the user info
 *
 * The dashboard calls this on load if no roua_session exists.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    // Check if user already has a valid roua_session
    const existingToken = request.cookies.get('roua_session')?.value
    if (existingToken) {
      const existingSession = await db.session.findUnique({
        where: { token: existingToken },
        include: { user: true },
      })
      if (existingSession && existingSession.expiresAt > new Date()) {
        // Already have a valid session
        return NextResponse.json({
          authenticated: true,
          user: {
            id: existingSession.user.id,
            email: existingSession.user.email,
            displayName: existingSession.user.displayName,
            tier: existingSession.user.tier,
          },
        })
      }
    }

    // No valid roua_session — try to get NextAuth session
    let session
    try {
      session = await getServerSession(getAuthOptions())
    } catch {
      // NextAuth not configured — fall through to guest user
    }

    // If no NextAuth session, auto-create a guest user (same as /api/auth/me)
    const GUEST_EMAIL = 'guest@roua.auto'
    const email = session?.user?.email || GUEST_EMAIL

    // Find or create user
    let user = await db.user.findUnique({ where: { email } })

    if (!user) {
      user = await db.user.create({
        data: {
          email,
          displayName: session?.user?.name || email.split('@')[0],
          avatar: session?.user?.image || null,
          ...(email === GUEST_EMAIL ? { tier: 'PREMIUM' } : {}),
        },
      })
    }

    // Create roua_session
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await db.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt,
      },
    })

    console.log(`[auth/sync] Created roua_session for ${email}`)

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tier: user.tier,
      },
    })

    response.cookies.set('roua_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[auth/sync] Error:', error)
    return NextResponse.json({ authenticated: false, error: String(error) }, { status: 500 })
  }
}
