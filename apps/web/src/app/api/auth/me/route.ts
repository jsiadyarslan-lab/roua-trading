import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Custom session check endpoint at /api/auth/me
 * (NOT at /api/auth/session which conflicts with NextAuth's built-in endpoint)
 *
 * Checks the roua_session cookie and returns user info.
 */
export async function GET(request: NextRequest) {
  try {
    // ── DEV_MODE: auto-authenticate with a dev user ──
    // When DEV_MODE=1, all requests are treated as authenticated
    // using a built-in dev user. No login required.
    // 🔒 PRODUCTION SAFETY: Block DEV_MODE in production environment
    if (process.env.DEV_MODE === '1' && process.env.NODE_ENV !== 'production') {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: 'dev-user-00000000',
          email: 'dev@roua.local',
          displayName: 'Dev User',
          tier: 'PREMIUM',
        },
      })
    }

    await ensureDbReady()

    const sessionToken = request.cookies.get('roua_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await db.session.delete({ where: { id: session.id } })
      }
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        tier: session.user.tier,
      },
    })
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
