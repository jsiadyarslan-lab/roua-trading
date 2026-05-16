import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * GET /api/auth/sessions — List active sessions for the current user
 *
 * Returns all active sessions with device info for device management UI.
 * Uses the roua_session cookie to identify the user.
 *
 * DELETE /api/auth/sessions — Revoke all other sessions (logout from other devices)
 *   Body: { revokeAll: true, currentSessionId?: string }
 *
 * DELETE /api/auth/sessions — Revoke a specific session
 *   Body: { sessionId: string }
 */

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
      return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 })
    }

    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const currentSession = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!currentSession || !currentSession.isActive || currentSession.expiresAt < new Date()) {
      return NextResponse.json({ error: 'INVALID_SESSION' }, { status: 401 })
    }

    const isGuest = isGuestEmail(currentSession.user.email) || currentSession.user.id.startsWith('guest')
    if (isGuest) {
      return NextResponse.json({ sessions: [] })
    }

    const sessions = await db.session.findMany({
      where: {
        userId: currentSession.userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        updatedAt: true,
        token: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Mask tokens and IPs for security
    const maskedSessions = sessions.map((s) => ({
      id: s.id,
      isCurrent: s.token === sessionToken,
      device: s.deviceInfo ? JSON.parse(s.deviceInfo) : null,
      maskedIp: s.ipAddress ? maskIpAddress(s.ipAddress) : null,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      lastActive: s.updatedAt,
    }))

    return NextResponse.json({ sessions: maskedSessions })
  } catch (error: any) {
    console.error('[auth/sessions GET] Error:', error?.message || error)
    return NextResponse.json({ error: 'SESSIONS_FETCH_ERROR' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 })
    }

    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    }

    const currentSession = await db.session.findUnique({
      where: { token: sessionToken },
    })

    if (!currentSession || !currentSession.isActive) {
      return NextResponse.json({ error: 'INVALID_SESSION' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))

    if (body.revokeAll) {
      // Revoke all other sessions except the current one
      const result = await db.session.updateMany({
        where: {
          userId: currentSession.userId,
          isActive: true,
          token: { not: sessionToken },
        },
        data: { isActive: false },
      })

      return NextResponse.json({
        success: true,
        revokedCount: result.count,
        message: `تم إنهاء ${result.count} جلسة أخرى`,
      })
    }

    if (body.sessionId) {
      // Revoke a specific session
      const targetSession = await db.session.findUnique({
        where: { id: body.sessionId },
      })

      if (!targetSession) {
        return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 })
      }

      if (targetSession.userId !== currentSession.userId) {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
      }

      // Don't allow revoking the current session through this endpoint
      if (targetSession.token === sessionToken) {
        return NextResponse.json({ error: 'CANNOT_REVOKE_CURRENT_SESSION' }, { status: 400 })
      }

      await db.session.update({
        where: { id: body.sessionId },
        data: { isActive: false },
      })

      return NextResponse.json({ success: true, message: 'تم إنهاء الجلسة بنجاح' })
    }

    return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 })
  } catch (error: any) {
    console.error('[auth/sessions DELETE] Error:', error?.message || error)
    return NextResponse.json({ error: 'SESSION_DELETE_ERROR' }, { status: 500 })
  }
}

function maskIpAddress(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length >= 4) {
      parts[3] = 'xxx'
      return parts.join('.')
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':')
    if (parts.length >= 2) {
      parts[parts.length - 1] = 'xxx'
      return parts.join(':')
    }
  }
  return 'xxx.xxx.xxx.xxx'
}
