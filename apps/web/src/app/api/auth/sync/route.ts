import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * /api/auth/sync — Validate existing session
 *
 * NO automatic guest creation — users must login to access the platform.
 * Only validates existing sessions. Returns { authenticated: false } if no valid session.
 */

export const runtime = 'nodejs'

const GUEST_EMAIL = 'guest@roua.auto'

/**
 * Check if an email belongs to a guest user.
 * Matches both the legacy guest@roua.auto and the new unique guest-{uuid}@roua.auto pattern.
 */
function isGuestEmail(email: string): boolean {
  return email === GUEST_EMAIL || /^guest-[a-f0-9]+@roua\.auto$/.test(email)
}

export async function GET(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({
        authenticated: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
      })
    }

    // ── Check if user already has a valid roua_session ──
    // Mobile support: check cookie, Authorization header, and x-roua-session header
    let existingToken = request.cookies.get('roua_session')?.value
    if (!existingToken) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        existingToken = authHeader.substring(7).trim()
      }
    }
    if (!existingToken) {
      existingToken = request.headers.get('x-roua-session')?.trim() || null
    }
    if (existingToken) {
      try {
        const existingSession = await db.session.findUnique({
          where: { token: existingToken },
          include: { user: true },
        })
        if (existingSession && existingSession.isActive && existingSession.expiresAt > new Date()) {
          const isGuest = isGuestEmail(existingSession.user.email) || existingSession.user.id.startsWith('guest')

          if (isGuest) {
            await db.session.update({
              where: { id: existingSession.id },
              data: { isActive: false },
            }).catch(() => {})
            const response = NextResponse.json({
              authenticated: false,
              error: 'GUEST_SESSION_INVALID',
            })
            response.cookies.delete('roua_session')
            response.cookies.delete('roua_refresh')
            return response
          }

          return NextResponse.json({
            authenticated: true,
            isGuest: false,
            user: {
              id: existingSession.user.id,
              email: existingSession.user.email,
              displayName: existingSession.user.displayName,
              tier: existingSession.user.tier,
              isGuest: false,
            },
          })
        }
        // Session expired or inactive — clean up
        if (existingSession) {
          await db.session.update({
            where: { id: existingSession.id },
            data: { isActive: false },
          }).catch(() => {})
        }
      } catch (dbErr: any) {
        console.warn('[auth/sync] DB error checking existing session:', dbErr?.message || dbErr)
      }
    }

    // ── No valid session → not authenticated ──
    return NextResponse.json({
      authenticated: false,
      error: 'NO_SESSION',
    })
  } catch (error) {
    console.error('[auth/sync] Unhandled error:', error)
    return NextResponse.json({
      authenticated: false,
      error: 'AUTH_SYNC_UNAVAILABLE',
    })
  }
}
