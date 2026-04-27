import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * /api/auth/sync — Ensure a valid roua_session exists
 *
 * Simplified: auto-creates a guest session for all requests.
 * No login required — the platform works out-of-the-box.
 */

export const runtime = 'nodejs'

const GUEST_EMAIL = 'guest@roua.auto'

export async function GET(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({
        authenticated: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
      }, { status: 200 })
    }

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
      }
    }

    // ── Step 2: Find or create guest user ──
    let user
    try {
      user = await db.user.findUnique({ where: { email: GUEST_EMAIL } })
    } catch (dbErr: any) {
      console.warn('[auth/sync] DB error finding user:', dbErr?.message || dbErr)
    }

    if (!user) {
      try {
        user = await db.user.create({
          data: {
            email: GUEST_EMAIL,
            displayName: 'ضيف',
            tier: 'FREE',
          },
        })
      } catch (dbErr: any) {
        try {
          user = await db.user.findUnique({ where: { email: GUEST_EMAIL } })
        } catch {
          // Give up
        }
      }
    }

    // ── Enforce FREE tier for guest users ──
    if (user && user.tier !== 'FREE') {
      console.warn(`[auth/sync] Guest user has tier '${user.tier}' — downgrading to FREE`)
      try {
        user = await db.user.update({
          where: { id: user.id },
          data: { tier: 'FREE' },
        })
      } catch { /* Non-critical */ }
    }

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        error: 'USER_CREATION_FAILED',
      }, { status: 200 })
    }

    // ── Step 3: Create roua_session ──
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

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
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[auth/sync] Unhandled error:', error)
    return NextResponse.json({
      authenticated: false,
      error: 'AUTH_SYNC_UNAVAILABLE',
    }, { status: 200 })
  }
}
