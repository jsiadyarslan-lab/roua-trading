import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady, resetDbInitialized } from '@/lib/db'
import crypto from 'crypto'

/**
 * Simplified NestJS API proxy with auto-authentication.
 *
 * This utility proxies requests from Next.js Route Handlers to the
 * NestJS backend. It automatically ensures a valid session exists
 * so ALL requests succeed — no 401 errors.
 *
 * Key features:
 * - Auto-creates a guest session if none exists
 * - Validates existing cookies against DB
 * - Falls back gracefully if DB is unavailable
 * - 30s timeout to prevent hanging connections
 * - Sets roua_session cookie on response
 */

const API_TARGET = process.env.API_INTERNAL_URL || 'http://localhost:3001'
const GUEST_EMAIL = 'guest@roua.auto'

/**
 * Create a guest session via NestJS's /api/auth/guest endpoint.
 * Fallback when Next.js can't create sessions directly.
 */
async function createSessionViaNestJS(): Promise<{ token: string } | null> {
  try {
    const response = await fetch(`${API_TARGET}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.sessionToken) {
        return { token: data.sessionToken }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Force-create a new guest session via Next.js DB.
 */
async function forceCreateSession(): Promise<{ token: string } | null> {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) return null

    // Find or create guest user
    let guestUser = await db.user.findUnique({ where: { email: GUEST_EMAIL } })

    if (!guestUser) {
      try {
        guestUser = await db.user.create({
          data: { email: GUEST_EMAIL, displayName: 'ضيف', tier: 'FREE' },
        })
      } catch {
        guestUser = await db.user.findUnique({ where: { email: GUEST_EMAIL } })
      }
    }

    if (!guestUser) return null

    // Enforce FREE tier
    if (guestUser.tier !== 'FREE') {
      try {
        guestUser = await db.user.update({
          where: { id: guestUser.id },
          data: { tier: 'FREE' },
        })
      } catch { /* Non-critical */ }
    }

    // Create session
    const newToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await db.session.create({
      data: { userId: guestUser.id, token: newToken, expiresAt },
    })

    return { token: newToken }
  } catch (error: any) {
    resetDbInitialized()
    return null
  }
}

/**
 * Ensure a valid session token exists.
 * Always returns a token — never returns null.
 */
async function ensureSession(request: NextRequest): Promise<{
  token: string
  cookieAlreadySet: boolean
}> {
  // Check existing cookie
  const existingToken = request.cookies.get('roua_session')?.value
  if (existingToken) {
    try {
      const dbReady = await ensureDbReady()
      if (dbReady) {
        const session = await db.session.findUnique({
          where: { token: existingToken },
        })
        if (session && session.expiresAt > new Date()) {
          return { token: existingToken, cookieAlreadySet: true }
        }
        // Invalid/expired — clean up
        if (session) {
          await db.session.delete({ where: { id: session.id } }).catch(() => {})
        }
      } else {
        // DB unavailable — trust the cookie, NestJS will validate
        return { token: existingToken, cookieAlreadySet: true }
      }
    } catch {
      // DB error — trust the cookie
      return { token: existingToken, cookieAlreadySet: true }
    }
  }

  // No valid cookie — auto-create guest session
  const newSession = await forceCreateSession()
  if (newSession) {
    return { token: newSession.token, cookieAlreadySet: false }
  }

  // Next.js DB failed — try NestJS fallback
  const nestjsSession = await createSessionViaNestJS()
  if (nestjsSession) {
    return { token: nestjsSession.token, cookieAlreadySet: false }
  }

  // ── Last resort: generate a token and try anyway ──
  // Even if we can't create a DB session, the NestJS AuthGuard
  // will auto-authenticate, so the request will still work
  const fallbackToken = existingToken || crypto.randomBytes(32).toString('hex')
  console.warn('[nestjs-proxy] Could not create DB session — using fallback token')
  return { token: fallbackToken, cookieAlreadySet: !!existingToken }
}

/**
 * Proxy a request to NestJS with auth headers injected.
 */
export async function proxyToNestJS(request: NextRequest, method: string): Promise<NextResponse> {
  const session = await ensureSession(request)
  return proxyWithToken(request, method, session.token, !session.cookieAlreadySet)
}

/**
 * Internal function that does the actual proxying.
 * @param retryCount - Number of 401 retries attempted so far (max 2)
 */
async function proxyWithToken(
  request: NextRequest,
  method: string,
  token: string,
  setCookie: boolean,
  retryCount = 0,
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl
  const targetUrl = `${API_TARGET}${pathname}${search}`

  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': request.headers.get('content-type') || 'application/json',
      'x-roua-session': token,
      'Cookie': `roua_session=${token}`,
    }

    // Forward relevant headers
    const forwardedHeaders = ['accept', 'user-agent', 'x-forwarded-for', 'x-real-ip']
    for (const h of forwardedHeaders) {
      const val = request.headers.get(h)
      if (val) headers[h] = val
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000),
    }

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.text()
        if (body) fetchOptions.body = body
      } catch { /* No body */ }
    }

    const response = await fetch(targetUrl, fetchOptions)

    // If NestJS returns 401, the AuthGuard should have auto-authenticated.
    // This means something is wrong with the session. Create a new one and retry.
    // Max 2 retries to prevent infinite loops.
    if (response.status === 401 && retryCount < 2) {
      console.warn(`[nestjs-proxy] 401 on ${method} ${pathname} — retrying with new session (attempt ${retryCount + 1}/2)`)
      const newSession = await forceCreateSession()
      if (newSession) {
        return proxyWithToken(request, method, newSession.token, true, retryCount + 1)
      }
      // Can't create new session — try NestJS fallback
      const nestjsSession = await createSessionViaNestJS()
      if (nestjsSession) {
        return proxyWithToken(request, method, nestjsSession.token, true, retryCount + 1)
      }
    }

    // Forward the response
    const responseBody = await response.text()
    const responseHeaders: Record<string, string> = {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    }

    const nextResponse = new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })

    // Set cookie if we auto-created a session
    if (setCookie) {
      nextResponse.cookies.set('roua_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      })
    }

    // Clear invalid cookie on 401
    if (response.status === 401 && !setCookie) {
      nextResponse.cookies.set('roua_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
    }

    return nextResponse
  } catch (error: any) {
    // FIX: Return 502 (Bad Gateway) instead of 200 when NestJS is offline.
    // Previously returned HTTP 200 with `offline: true`, which:
    // 1. Masks real errors from monitoring/alerting systems
    // 2. Makes debugging impossible (looks like success)
    // 3. Prevents frontend error boundaries from triggering
    console.warn(`[nestjs-proxy] ${method} ${pathname} offline — returning 502`)

    return NextResponse.json(
      {
        success: false,
        offline: true,
        error: 'الخدمة غير متاحة حالياً',
      },
      { status: 502 },
    )
  }
}

/**
 * Create all HTTP method handlers for a NestJS-proxied route.
 */
export function createNestJSProxyHandlers() {
  return {
    GET: (request: NextRequest) => proxyToNestJS(request, 'GET'),
    POST: (request: NextRequest) => proxyToNestJS(request, 'POST'),
    PUT: (request: NextRequest) => proxyToNestJS(request, 'PUT'),
    PATCH: (request: NextRequest) => proxyToNestJS(request, 'PATCH'),
    DELETE: (request: NextRequest) => proxyToNestJS(request, 'DELETE'),
  }
}
