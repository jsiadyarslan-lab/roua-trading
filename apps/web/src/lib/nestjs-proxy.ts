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
 * - Auto-creates a guest session if no roua_session cookie exists
 * - Sets the cookie on the response so subsequent requests work
 * - Injects both Authorization and x-roua-session headers
 * - Forwards the roua_session cookie to NestJS (for cookie-based auth)
 * - 30s timeout to prevent hanging connections
 * - Forwards relevant request headers and body
 * - Retry logic for session creation
 */

const API_TARGET = process.env.API_INTERNAL_URL || 'http://localhost:3001'
const GUEST_EMAIL = 'guest@roua.auto'

/**
 * Ensure a valid session token exists — either from the cookie or by
 * auto-creating a guest user + session. Returns the session token and
 * a boolean indicating whether the cookie needs to be set on the response.
 */
async function ensureSession(request: NextRequest): Promise<{
  token: string
  cookieAlreadySet: boolean
} | null> {
  // Check existing cookie first
  const existingToken = request.cookies.get('roua_session')?.value
  if (existingToken) {
    return { token: existingToken, cookieAlreadySet: true }
  }

  // No cookie — try to auto-create a guest session
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

    return { token: newToken, cookieAlreadySet: false }
  } catch (error: any) {
    console.error('[nestjs-proxy] Failed to auto-create session:', error?.message || error)
    return null
  }
}

/**
 * Proxy a request to NestJS with auth headers injected.
 *
 * @param request - The incoming Next.js request
 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @returns NextResponse with the proxied result
 */
export async function proxyToNestJS(request: NextRequest, method: string): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl

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
      return proxyWithToken(request, method, fallbackToken, false)
    }

    return NextResponse.json(
      { success: false, error: 'لم يتم تقديم رمز المصادقة' },
      { status: 401 },
    )
  }

  return proxyWithToken(request, method, session.token, !session.cookieAlreadySet)
}

/**
 * Internal function that does the actual proxying with a known token.
 */
async function proxyWithToken(
  request: NextRequest,
  method: string,
  token: string,
  setCookie: boolean,
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
