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
 *
 * Resilience features:
 * - ensureDbReady() is non-throwing (won't cascade to 500)
 * - Retry logic for transient DB connection errors
 * - Returns 200 with { authenticated: false } on DB failure
 *   (not 500) to prevent infinite frontend retry loops
 */
const GUEST_EMAIL = 'guest@roua.auto'
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

/**
 * Execute a DB operation with retry logic for transient connection errors.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: any
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const msg = error?.message || ''
      // Only retry on transient connection errors, not on logical errors
      const isTransient =
        msg.includes('ECONNREFUSED') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('Connection refused') ||
        msg.includes('connection pool') ||
        msg.includes('P1001') || // Prisma: Can't reach database server
        msg.includes('P1002')    // Prisma: Database server timed out

      if (!isTransient || attempt === MAX_RETRIES) {
        break
      }
      console.warn(`[auth/me] ${label} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`, msg)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  throw lastError
}

export async function GET(request: NextRequest) {
  try {
    // Check if DB is ready — if not, return immediately instead of
    // attempting queries that will definitely fail
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      console.warn('[auth/me] Database is not ready — returning AUTH_SERVICE_UNAVAILABLE')
      return NextResponse.json(
        {
          authenticated: false,
          error: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'Database is temporarily unavailable. Please try again.',
        },
        { status: 200 }
      )
    }

    const sessionToken = request.cookies.get('roua_session')?.value

    // ── Check existing session ──
    if (sessionToken) {
      const session = await withRetry(
        () => db.session.findUnique({
          where: { token: sessionToken },
          include: { user: true },
        }),
        'findSession'
      )

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
    // The guest user gets FREE tier — upgrade by linking a real account.

    let guestUser = await withRetry(
      () => db.user.findUnique({ where: { email: GUEST_EMAIL } }),
      'findGuestUser'
    )

    if (!guestUser) {
      guestUser = await withRetry(
        () => db.user.create({
          data: {
            email: GUEST_EMAIL,
            displayName: 'ضيف',
            tier: 'FREE',
          },
        }),
        'createGuestUser'
      )
      console.log('[auth/me] Auto-created guest user:', guestUser.id)
    }

    // Create a new session for the guest user
    const newToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await withRetry(
      () => db.session.create({
        data: {
          userId: guestUser.id,
          token: newToken,
          expiresAt,
        },
      }),
      'createSession'
    )

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
  } catch (error: any) {
    console.error('[auth/me] Session check error:', error?.message || error)

    // Return 200 with authenticated: false instead of 500.
    // A 500 response causes the frontend to retry indefinitely,
    // creating a cascade of failures. Returning 200 with
    // authenticated: false lets the frontend handle the gracefully.
    return NextResponse.json(
      {
        authenticated: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'Database is temporarily unavailable. Please try again.',
      },
      { status: 200 }
    )
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
        }).catch(() => {})

        // Now delete the session
        await db.session.delete({ where: { id: session.id } })
      } else {
        // Session already gone or expired — clean up any remaining records
        await db.session.deleteMany({
          where: { token: sessionToken },
        }).catch(() => {})
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
