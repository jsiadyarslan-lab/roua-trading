import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { createSessionSafely } from '@/lib/session-create'
import crypto from 'crypto'

/**
 * POST /api/auth/refresh — Refresh an existing session.
 *
 * Supports two refresh mechanisms:
 * 1. Sliding session: If the session will expire within 60 minutes, creates a new session
 * 2. Refresh token: If the session access token is expired but a valid refresh token exists,
 *    creates a new session with device info from the original session.
 *
 * The refresh token is stored in the `roua_refresh` httpOnly cookie (30-day TTL).
 * The access token is stored in the `roua_session` httpOnly cookie (24h TTL).
 */

const REFRESH_THRESHOLD_MS = 60 * 60 * 1000 // Refresh if expiring within 60 minutes
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours (access token)
const REFRESH_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days (refresh token)
const GUEST_EMAIL = 'guest@roua.auto'

/**
 * Check if an email belongs to a guest user.
 * Matches both the legacy guest@roua.auto and the new unique guest-{uuid}@roua.auto pattern.
 */
function isGuestEmail(email: string): boolean {
  return email === GUEST_EMAIL || /^guest-[a-f0-9]+@roua\.auto$/.test(email)
}

/**
 * Parse user-agent string into structured device info
 */
function parseUserAgent(userAgent?: string | null): { browser: string; os: string; type: string; device: string } | null {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()

  let type = 'desktop'
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) type = 'mobile'
  else if (/ipad|tablet|kindle|silk/i.test(ua)) type = 'tablet'

  let browser = 'Unknown'
  if (ua.includes('edg/')) browser = 'Edge'
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome'
  else if (ua.includes('firefox/')) browser = 'Firefox'
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari'
  else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'Opera'

  let os = 'Unknown'
  if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('mac os')) os = 'macOS'
  else if (ua.includes('linux')) os = 'Linux'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS'

  return { browser, os, type, device: type }
}

export async function POST(request: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, { status: 503 })
    }

    const sessionToken = request.cookies.get('roua_session')?.value
    const refreshToken = request.cookies.get('roua_refresh')?.value
    const userAgent = request.headers.get('user-agent')
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null
    const deviceInfo = parseUserAgent(userAgent)

    // ── Strategy 1: Try refresh token first (for cross-device session restoration) ──
    if (refreshToken && (!sessionToken || sessionToken.length === 0)) {
      try {
        const sessionByRefresh = await db.session.findUnique({
          where: { refreshToken },
          include: { user: true },
        })

        if (sessionByRefresh && sessionByRefresh.isActive) {
          const isGuest = isGuestEmail(sessionByRefresh.user.email) || sessionByRefresh.user.id.startsWith('guest')

          // Check refresh token expiry (30 days from creation)
          const refreshExpiryMs = sessionByRefresh.createdAt.getTime() + REFRESH_DURATION_MS
          if (Date.now() > refreshExpiryMs || isGuest) {
            // Refresh token expired — deactivate session
            await db.session.update({
              where: { id: sessionByRefresh.id },
              data: { isActive: false },
            }).catch(() => {})
            const response = NextResponse.json({ error: 'REFRESH_TOKEN_EXPIRED' }, { status: 401 })
            response.cookies.delete('roua_session')
            response.cookies.delete('roua_refresh')
            return response
          }

          // Deactivate old session
          await db.session.update({
            where: { id: sessionByRefresh.id },
            data: { isActive: false },
          })

          // Create new session with same device info
          const newToken = crypto.randomBytes(32).toString('hex')
          const newRefreshToken = crypto.randomBytes(48).toString('hex')
          const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS)

          const created = await createSessionSafely({
            userId: sessionByRefresh.user.id,
            token: newToken,
            refreshToken: newRefreshToken,
            deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : sessionByRefresh.deviceInfo,
            ipAddress: ipAddress || sessionByRefresh.ipAddress,
            userAgent: userAgent || sessionByRefresh.userAgent,
            isActive: true,
            expiresAt: newExpiresAt,
          })

          if (!created) {
            const response = NextResponse.json({ error: 'SESSION_CREATION_FAILED' }, { status: 500 })
            response.cookies.delete('roua_session')
            response.cookies.delete('roua_refresh')
            return response
          }

          const response = NextResponse.json({
            refreshed: true,
            authenticated: true,
            isGuest: false,
            user: {
              id: sessionByRefresh.user.id,
              email: sessionByRefresh.user.email,
              displayName: sessionByRefresh.user.displayName,
              tier: sessionByRefresh.user.tier,
              isGuest: false,
            },
          })

          response.cookies.set('roua_session', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60, // 24 hours
            path: '/',
          })

          response.cookies.set('roua_refresh', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60, // 30 days
            path: '/',
          })

          return response
        }
      } catch (dbErr: any) {
        console.warn('[auth/refresh] Refresh token lookup failed:', dbErr?.message || dbErr)
      }
    }

    // ── Strategy 2: Sliding session (existing logic, enhanced) ──
    if (sessionToken) {
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      })

      if (!session || !session.isActive) {
        const response = NextResponse.json({ error: 'INVALID_SESSION' }, { status: 401 })
        response.cookies.delete('roua_session')
        response.cookies.delete('roua_refresh')
        return response
      }

      const isGuestUser = isGuestEmail(session.user.email) || session.user.id.startsWith('guest')

      // Session expired
      if (session.expiresAt < new Date()) {
        await db.session.update({
          where: { id: session.id },
          data: { isActive: false },
        }).catch(() => {})

        // Check if we have a refresh token for this session
        if (refreshToken) {
          const sessionByRefresh = await db.session.findUnique({
            where: { refreshToken },
            include: { user: true },
          })

          if (sessionByRefresh && sessionByRefresh.isActive && !isGuestUser) {
            // Create new session from refresh token
            const newToken = crypto.randomBytes(32).toString('hex')
            const newRefreshToken = crypto.randomBytes(48).toString('hex')
            const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS)

            await db.session.update({
              where: { id: sessionByRefresh.id },
              data: { isActive: false },
            })

            const created = await createSessionSafely({
              userId: sessionByRefresh.user.id,
              token: newToken,
              refreshToken: newRefreshToken,
              deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : sessionByRefresh.deviceInfo,
              ipAddress: ipAddress || sessionByRefresh.ipAddress,
              userAgent: userAgent || sessionByRefresh.userAgent,
              isActive: true,
              expiresAt: newExpiresAt,
            })

            if (!created) {
              const response = NextResponse.json({ error: 'SESSION_CREATION_FAILED' }, { status: 500 })
              response.cookies.delete('roua_session')
              response.cookies.delete('roua_refresh')
              return response
            }

            const response = NextResponse.json({
              refreshed: true,
              authenticated: true,
              isGuest: false,
              user: {
                id: sessionByRefresh.user.id,
                email: sessionByRefresh.user.email,
                displayName: sessionByRefresh.user.displayName,
                tier: sessionByRefresh.user.tier,
                isGuest: false,
              },
            })

            response.cookies.set('roua_session', newToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 24 * 60 * 60,
              path: '/',
            })

            response.cookies.set('roua_refresh', newRefreshToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 30 * 24 * 60 * 60,
              path: '/',
            })

            return response
          }
        }

        const response = NextResponse.json({ error: 'SESSION_EXPIRED' }, { status: 401 })
        response.cookies.delete('roua_session')
        response.cookies.delete('roua_refresh')
        return response
      }

      const now = new Date()
      const timeUntilExpiry = session.expiresAt.getTime() - now.getTime()

      // If session will expire within the threshold, create a new one (sliding session)
      if (timeUntilExpiry < REFRESH_THRESHOLD_MS && !isGuestUser) {
        const newToken = crypto.randomBytes(32).toString('hex')
        const newRefreshToken = crypto.randomBytes(48).toString('hex')
        const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

        // Deactivate old session
        await db.session.update({
          where: { id: session.id },
          data: { isActive: false },
        })

        // Create new session with device info
        const created = await createSessionSafely({
          userId: session.user.id,
          token: newToken,
          refreshToken: newRefreshToken,
          deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : session.deviceInfo,
          ipAddress: ipAddress || session.ipAddress,
          userAgent: userAgent || session.userAgent,
          isActive: true,
          expiresAt: newExpiresAt,
        })

        if (!created) {
          const response = NextResponse.json({ error: 'SESSION_CREATION_FAILED' }, { status: 500 })
          response.cookies.delete('roua_session')
          response.cookies.delete('roua_refresh')
          return response
        }

        const response = NextResponse.json({
          refreshed: true,
          authenticated: true,
          isGuest: false,
          user: {
            id: session.user.id,
            email: session.user.email,
            displayName: session.user.displayName,
            tier: session.user.tier,
            isGuest: false,
          },
        })

        response.cookies.set('roua_session', newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60,
          path: '/',
        })

        response.cookies.set('roua_refresh', newRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60,
          path: '/',
        })

        return response
      }

      // Session is still fresh — just return user info
      return NextResponse.json({
        refreshed: false,
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

    // ── No session token and no refresh token ──
    return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 })
  } catch (error: any) {
    console.error('[auth/refresh] Error:', error?.message || error)
    return NextResponse.json({ error: 'REFRESH_ERROR' }, { status: 500 })
  }
}
