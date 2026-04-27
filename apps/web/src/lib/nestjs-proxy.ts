import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * Shared NestJS API proxy with automatic session creation.
 *
 * This utility is used by catch-all Route Handlers (trading, engine,
 * portfolio, etc.) to proxy requests to the NestJS backend with proper
 * authentication headers injected from the roua_session cookie.
 *
 * Key features:
 * - Validates existing cookie against DB before trusting it (prevents 401 loops)
 * - Auto-creates a guest session if no valid roua_session cookie exists
 * - Sets the cookie on the response so subsequent requests work
 * - Injects both Authorization and x-roua-session headers
 * - Forwards the roua_session cookie to NestJS (for cookie-based auth)
 * - 30s timeout to prevent hanging connections
 * - Retry on 401: clears invalid cookie, creates new session, retries once
 * - Forwards relevant request headers and body
 */

const API_TARGET = process.env.API_INTERNAL_URL || 'http://localhost:3001'
const GUEST_EMAIL = 'guest@roua.auto'

/**
 * Force-create a new guest session, ignoring any existing cookie.
 * Used when the existing session is invalid/expired and we need a fresh one.
 */
async function forceCreateSession(): Promise<{
  token: string
} | null> {
  try {
    await ensureDbReady()

    // Find or create guest user
    let guestUser = await db.user.findUnique({ where: { email: GUEST_EMAIL } })

    if (!guestUser) {
      try {
        guestUser = await db.user.create({
          data: {
            email: GUEST_EMAIL,
            displayName: 'ضيف',
            tier: 'FREE',
          },
        })
      } catch (createErr: any) {
        // User might have been created by another concurrent request
        guestUser = await db.user.findUnique({ where: { email: GUEST_EMAIL } })
      }
    }

    if (!guestUser) {
      console.error('[nestjs-proxy] Failed to find/create guest user')
      return null
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

    console.log('[nestjs-proxy] Created new guest session for:', GUEST_EMAIL)
    return { token: newToken }
  } catch (error: any) {
    console.error('[nestjs-proxy] Failed to force-create session:', error?.message || error)
    return null
  }
}

/**
 * Ensure a valid session token exists — either from the cookie (validated
 * against DB) or by auto-creating a guest user + session.
 *
 * CRITICAL: This function validates the existing cookie against the database.
 * Without this validation, an expired/deleted session cookie would be trusted
 * and forwarded to NestJS, causing a 401, and the invalid cookie would persist
 * in the browser causing an infinite 401 loop.
 */
async function ensureSession(request: NextRequest): Promise<{
  token: string
  cookieAlreadySet: boolean
} | null> {
  // Check existing cookie first
  const existingToken = request.cookies.get('roua_session')?.value
  if (existingToken) {
    // ── VALIDATE the cookie against the database ──
    // Without this check, an expired/deleted session token would be
    // forwarded to NestJS → 401 → cookie stays in browser → infinite loop
    try {
      await ensureDbReady()
      const session = await db.session.findUnique({
        where: { token: existingToken },
      })
      if (session && session.expiresAt > new Date()) {
        // Cookie is valid — use it
        return { token: existingToken, cookieAlreadySet: true }
      }
      // Session is invalid/expired — treat as if no cookie exists
      // Clean up expired session
      if (session) {
        await db.session.delete({ where: { id: session.id } }).catch(() => {})
      }
      console.log('[nestjs-proxy] Existing cookie is invalid/expired — creating new session')
      // Fall through to create a new session below
    } catch (dbErr: any) {
      // DB error — can't validate, trust the cookie and let NestJS validate
      // This is safe because NestJS will return 401 if the session is invalid,
      // and our retry mechanism in proxyToNestJS() will handle it
      console.warn('[nestjs-proxy] DB error validating cookie:', dbErr?.message || dbErr)
      return { token: existingToken, cookieAlreadySet: true }
    }
  }

  // No valid cookie — try to auto-create a guest session
  const newSession = await forceCreateSession()
  if (newSession) {
    return { token: newSession.token, cookieAlreadySet: false }
  }

  return null
}

/**
 * Proxy a request to NestJS with auth headers injected.
 *
 * Includes 401 retry logic: if NestJS returns 401 (invalid session),
 * the proxy creates a new session and retries the request once.
 * This prevents infinite 401 loops when the browser has a stale cookie.
 *
 * @param request - The incoming Next.js request
 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @returns NextResponse with the proxied result
 */
export async function proxyToNestJS(request: NextRequest, method: string): Promise<NextResponse> {
  // Ensure we have a valid session token
  const session = await ensureSession(request)

  if (!session) {
    // Session creation failed — but instead of returning 401 immediately,
    // try to proxy the request anyway with whatever cookie the browser sent.
    // The NestJS AuthGuard also reads cookies, so it might work if the
    // cookie exists but our Prisma client couldn't verify it.
    const fallbackToken = request.cookies.get('roua_session')?.value
    if (fallbackToken) {
      // We have a cookie token but couldn't verify it — try anyway
      return proxyWithToken(request, method, fallbackToken, false, true)
    }

    return NextResponse.json(
      { success: false, error: 'لم يتم تقديم رمز المصادقة' },
      { status: 401 },
    )
  }

  return proxyWithToken(request, method, session.token, !session.cookieAlreadySet, true)
}

/**
 * Internal function that does the actual proxying with a known token.
 *
 * @param allowRetryOn401 - If true, when NestJS returns 401, create a new
 *   session and retry the request once. Prevents infinite 401 loops.
 */
async function proxyWithToken(
  request: NextRequest,
  method: string,
  token: string,
  setCookie: boolean,
  allowRetryOn401: boolean = true,
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl

  // Build target URL — pathname already includes /api prefix which NestJS expects
  const targetUrl = `${API_TARGET}${pathname}${search}`

  try {
    // Build headers for the proxied request
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': request.headers.get('content-type') || 'application/json',
      // Also inject x-roua-session as a fallback auth method
      'x-roua-session': token,
      // Forward the roua_session cookie so NestJS AuthGuard can read it directly
      'Cookie': `roua_session=${token}`,
    }

    // Forward relevant headers
    const forwardedHeaders = ['accept', 'user-agent', 'x-forwarded-for', 'x-real-ip']
    for (const h of forwardedHeaders) {
      const val = request.headers.get(h)
      if (val) headers[h] = val
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30s timeout
    }

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.text()
        if (body) fetchOptions.body = body
      } catch {
        // No body or failed to read — that's fine
      }
    }

    const response = await fetch(targetUrl, fetchOptions)

    // ── 401 Retry Logic ──
    // If NestJS returns 401 and we haven't retried yet, create a new
    // session and retry the request. This handles the case where:
    // 1. The cookie was valid when ensureSession() checked it
    // 2. But NestJS still rejects it (e.g., session was deleted between check and use)
    // 3. Or the DB validation in ensureSession() failed and we trusted a stale cookie
    if (response.status === 401 && allowRetryOn401) {
      console.warn(`[nestjs-proxy] 401 on ${method} ${pathname} — retrying with new session`)
      const newSession = await forceCreateSession()
      if (newSession) {
        // Retry with the new session token (allowRetryOn401=false to prevent loops)
        return proxyWithToken(request, method, newSession.token, true, false)
      }
    }

    // Forward the response with the same status
    const responseBody = await response.text()

    const responseHeaders: Record<string, string> = {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    }

    // Build the response
    const nextResponse = new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })

    // If we auto-created a session, set the cookie on the response
    // so the browser stores it for subsequent requests
    if (setCookie) {
      nextResponse.cookies.set('roua_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      })
    }

    // If we got a 401 on the retry (or couldn't create new session),
    // make sure the old invalid cookie is cleared by setting an expired one
    if (response.status === 401 && !setCookie) {
      // Clear the invalid cookie so the next request triggers a new session creation
      nextResponse.cookies.set('roua_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0, // Expire immediately
        path: '/',
      })
    }

    return nextResponse
  } catch (error: any) {
    console.error(`[nestjs-proxy] ${method} ${pathname} failed:`, error.message)

    // Return a clean error — don't leak internal details
    return NextResponse.json(
      {
        success: false,
        error: 'الخدمة غير متاحة حالياً',
        ...(process.env.NODE_ENV === 'development' && { debug: error.message }),
      },
      { status: 502 },
    )
  }
}

/**
 * Create all HTTP method handlers for a NestJS-proxied route.
 * Usage in a Route Handler file:
 *
 *   import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'
 *   const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
 *   export { GET, POST, PUT, PATCH, DELETE }
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
