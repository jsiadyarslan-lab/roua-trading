import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * /api/auth/sync — Ensure a valid roua_session exists
 *
 * This endpoint ensures the user has a valid roua_session cookie.
 * It no longer depends on NextAuth's getServerSession (which was
 * causing 500 errors in production). Instead, it works identically
 * to /api/auth/me:
 * 1. Check if existing roua_session cookie is valid
 * 2. If not, try reading NextAuth JWT from cookies directly
 * 3. Fall back to auto-creating a guest user + session
 *
 * The dashboard calls this on load if no roua_session exists.
 */

// Explicitly set Node.js runtime — avoids Edge Runtime issues with crypto/DB
export const runtime = 'nodejs'

const GUEST_EMAIL = 'guest@roua.auto'

export async function GET(request: NextRequest) {
  try {
    // ensureDbReady is non-throwing — logs warnings but won't block
    await ensureDbReady()

    // ── Step 1: Check if user already has a valid roua_session ──
    const existingToken = request.cookies.get('roua_session')?.value
    if (existingToken) {
      try {
        const existingSession = await db.session.findUnique({
          where: { token: existingToken },
          include: { user: true },
        })
        if (existingSession && existingSession.expiresAt > new Date()) {
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
        // Session expired — clean up
        if (existingSession) {
          await db.session.delete({ where: { id: existingSession.id } }).catch(() => {})
        }
      } catch (dbErr: any) {
        console.warn('[auth/sync] DB error checking existing session:', dbErr?.message || dbErr)
        // Continue to create a new session
      }
    }

    // ── Step 2: Try to get user info from NextAuth JWT cookie ──
    // Instead of calling getServerSession() which causes 500 errors,
    // we read the next-auth session JWT cookie directly.
    let nextAuthEmail: string | null = null
    let nextAuthName: string | null = null
    try {
      const sessionCookie = request.cookies.get('next-auth.session-token')?.value
        || request.cookies.get('__Secure-next-auth.session-token')?.value
      if (sessionCookie) {
        // The JWT token has a payload we can decode (it's base64)
        const parts = sessionCookie.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
          nextAuthEmail = payload?.email || null
          nextAuthName = payload?.name || null
        }
      }
    } catch {
      // NextAuth cookie parsing failed — use guest user
    }

    // ── Step 3: Find or create user ──
    const email = nextAuthEmail || GUEST_EMAIL

    let user
    try {
      user = await db.user.findUnique({ where: { email } })
    } catch (dbErr: any) {
      console.warn('[auth/sync] DB error finding user:', dbErr?.message || dbErr)
    }

    if (!user) {
      try {
        user = await db.user.create({
          data: {
            email,
            displayName: nextAuthName || email.split('@')[0],
            ...(email === GUEST_EMAIL ? { tier: 'PREMIUM' } : {}),
          },
        })
      } catch (dbErr: any) {
        // User might have been created by another concurrent request
        try {
          user = await db.user.findUnique({ where: { email } })
        } catch {
          // Give up — return gracefully
        }
      }
    }

    if (!user) {
      // Can't create/find user — return gracefully
      return NextResponse.json({
        authenticated: false,
        error: 'USER_CREATION_FAILED',
      }, { status: 200 })
    }

    // ── Step 4: Create roua_session ──
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    try {
      await db.session.create({
        data: {
          userId: user.id,
          token: sessionToken,
          expiresAt,
        },
      })
    } catch (dbErr: any) {
      console.error('[auth/sync] Failed to create session:', dbErr?.message || dbErr)
      return NextResponse.json({
        authenticated: false,
        error: 'SESSION_CREATION_FAILED',
      }, { status: 200 })
    }

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
      maxAge: 30 * 24 * 60 * 60, // 30 days — matches /api/auth/me
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[auth/sync] Unhandled error:', error)
    // Return 200 with authenticated: false instead of 500.
    // A 500 response causes the frontend to retry indefinitely,
    // creating a cascade of failures. Returning 200 with
    // authenticated: false lets the frontend handle it gracefully.
    return NextResponse.json(
      {
        authenticated: false,
        error: 'AUTH_SYNC_UNAVAILABLE',
        message: 'Authentication sync failed. Please try again.',
      },
      { status: 200 },
    )
  }
}
