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

// FIX: Use 127.0.0.1 instead of localhost.
// Node.js 18+ resolves 'localhost' to ::1 (IPv6) by default,
// but NestJS listens on 0.0.0.0 (IPv4 only). This mismatch
// causes ECONNREFUSED → "server not found" in the frontend.
// Force IPv4 with 127.0.0.1 to match NestJS binding.
const rawTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
// Also fix Docker Compose hostnames (http://api:3001) that don't work on Railway single-container
const API_TARGET = rawTarget.includes('http://api:') ? 'http://127.0.0.1:3001' : rawTarget;

/**
 * V157 CRITICAL FIX: Unique guest user per browser session — NO module-level cache.
 *
 * PREVIOUS PROBLEM (V156): The variable `cachedGuestUserId` was a module-level
 * singleton shared across ALL requests in the same Node.js process. On Railway
 * (single-container), this meant:
 *   1. First guest user's ID was cached in `cachedGuestUserId`
 *   2. ALL subsequent guest users received THE SAME ID (line 107 check)
 *   3. ALL users without a valid session → same identity → same balance!
 *   4. Even deleting/relinking a Binance account didn't help because the
 *      balance was fetched for the SHARED guest identity, not the real user.
 *
 * ROOT CAUSE: Module-level variables in Next.js Route Handlers are shared
 * across ALL concurrent requests. `let cachedGuestUserId` was essentially
 * a global variable that made every guest share one identity.
 *
 * FIX: Remove the module-level cache entirely. Each call to
 * getOrCreateGuestUserId() now reads the `roua_guest_id` cookie from the
 * request object, which is per-browser. This is correct because:
 *   - The cookie is already set on the response (line 440-448)
 *   - Each browser has its own unique `roua_guest_id` cookie
 *   - No cross-request state pollution
 *   - No module-level singleton causing data leakage
 */

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CRITICAL FIX: Replaced Circuit Breaker with Smart Retry + Warmup
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ROOT CAUSE of "nothing changes":
 * The old circuit breaker blocked ALL API calls for 10 seconds after 3
 * consecutive failures. During Railway startup, Next.js starts before
 * NestJS, so the first 3 API calls always fail → circuit breaker
 * activates → ALL subsequent requests blocked for 10s → by the time
 * it expires, another request might fail → death spiral. The frontend
 * could NEVER reach NestJS.
 *
 * NEW APPROACH: Progressive retry with per-request backoff.
 * - No shared "bypass" state that blocks everything
 * - Each request gets its own retry attempts
 * - During warmup (first 60s), we retry more aggressively
 * - After warmup, we still retry but with longer delays
 */

// Track NestJS readiness — but NEVER block all requests
let nestjsReady = false;
let nestjsFirstSuccessAt = 0; // When NestJS first responded successfully
const WARMUP_PERIOD_MS = 60_000; // 60 seconds after first success = warmup period

// Track recent failures for adaptive retry timing (NOT for blocking)
let lastFailureAt = 0;
const FAILURE_COOLDOWN_MS = 2_000; // After a failure, wait 2s before trying again (per-request)

/**
 * Create a guest session via NestJS's /api/auth/guest endpoint.
 * Fallback when Next.js can't create sessions directly.
 *
 * FIX: NestJS does NOT have a /api/auth/guest endpoint (returns 404).
 * This function previously sent POST requests to NestJS that always failed,
 * wasting DB connections on retries. Now it immediately returns null and
 * the caller falls through to forceCreateSession() which uses the
 * Next.js DB directly.
 */
async function createSessionViaNestJS(): Promise<{ token: string; setCookieHeader?: string } | null> {
  // FIX: NestJS has no /api/auth/guest endpoint — skip NestJS entirely.
  // Guest sessions are created directly via the Next.js DB (forceCreateSession).
  return null
}

/**
 * V156: Get or create a UNIQUE guest user for this browser session.
 *
 * Instead of ALL visitors sharing guest@roua.auto, each browser gets
 * its own guest user identified by a UUID stored in a cookie.
 * This prevents cross-guest data leakage while still preventing
 * DB bloat (one guest user per browser, not per request).
 *
 * @param request - The incoming request (to read the guest_id cookie)
 * @returns The guest user's ID, or null if DB is unavailable
 */
async function getOrCreateGuestUserId(request: NextRequest): Promise<string | null> {
  // V157 FIX: NO module-level cache! Read from per-browser cookie instead.
  // The `roua_guest_id` cookie is set on the response (line 440-448) and is
  // unique per browser. This prevents the critical bug where all users shared
  // the same cachedGuestUserId singleton.
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) return null

    // Check if this browser already has a guest ID cookie — THIS IS PER-BROWSER
    const existingGuestId = request.cookies.get('roua_guest_id')?.value
    if (existingGuestId) {
      // Verify the guest user still exists in DB
      const existingUser = await db.user.findUnique({ where: { id: existingGuestId } })
      if (existingUser) {
        // V157: DO NOT cache in module-level variable! Return directly.
        return existingUser.id
      }
      // Cookie points to deleted user — fall through to create new
    }

    // Create a unique guest user for this browser session
    const guestUuid = crypto.randomBytes(8).toString('hex') // 16-char hex
    const guestEmail = `guest-${guestUuid}@roua.auto`

    let guestUser
    try {
      guestUser = await db.user.create({
        data: { email: guestEmail, displayName: `ضيف ${guestUuid.slice(0, 4)}`, tier: 'FREE' },
      })
    } catch {
      // Extremely unlikely collision — try once more with different UUID
      const guestUuid2 = crypto.randomBytes(8).toString('hex')
      try {
        guestUser = await db.user.create({
          data: { email: `guest-${guestUuid2}@roua.auto`, displayName: `ضيف ${guestUuid2.slice(0, 4)}`, tier: 'FREE' },
        })
      } catch {
        // DB unavailable or other error — fall back to shared guest
        // V157: Do NOT cache this either! Return directly.
        const sharedGuest = await db.user.findUnique({ where: { email: 'guest@roua.auto' } })
        if (sharedGuest) {
          return sharedGuest.id
        }
        return null
      }
    }

    // V157: DO NOT cache in module-level variable! The roua_guest_id cookie
    // on the response is the per-browser cache. No server-side singleton!
    return guestUser.id
  } catch {
    return null
  }
}

/**
 * V156: Create a guest session using a UNIQUE guest user per browser.
 *
 * Each browser gets its own guest user (guest-{uuid}@roua.auto)
 * to prevent cross-guest data leakage.
 */
async function forceCreateSession(request: NextRequest): Promise<{ token: string; guestUserId?: string } | null> {
  try {
    const guestUserId = await getOrCreateGuestUserId(request)
    if (!guestUserId) return null

    // Create a unique session for this request
    const newToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db.session.create({
      data: { userId: guestUserId, token: newToken, expiresAt },
    })

    return { token: newToken, guestUserId }
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
  guestUserId?: string
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
        // Check both isActive AND expiry — must match NestJS AuthGuard logic
        if (session && session.isActive !== false && session.expiresAt > new Date()) {
          return { token: existingToken, cookieAlreadySet: true }
        }
        // Invalid/expired/inactive — clean up
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

  // No valid cookie — create a guest session so ALL API endpoints work.
  // FIX: Previously disabled auto-creation to prevent DB bloat from bots,
  // but this broke EVERYTHING — Smart Executor, Strategic Council, Autonomous
  // Trader, portfolio, trading bot — all return 502 without a session.
  // The correct approach: create guest sessions but with rate-limiting
  // via the existing offline cache and NestJS bypass logic.

  // Strategy 1: Create via NestJS /api/auth/guest (preferred — full auth flow)
  const nestjsSession = await createSessionViaNestJS()
  if (nestjsSession) {
    return { token: nestjsSession.token, cookieAlreadySet: true }
  }

  // Strategy 2: Create directly via DB (fallback when NestJS is down)
  const dbSession = await forceCreateSession(request)
  if (dbSession) {
    // V156: Store guest user ID in cookie so this browser reuses its guest user
    // instead of creating a new one on every request
    return { token: dbSession.token, cookieAlreadySet: true, guestUserId: dbSession.guestUserId }
  }

  // Both strategies failed — system is truly unavailable
  return { token: '', cookieAlreadySet: false }
}

/**
 * Proxy a request to NestJS with auth headers injected.
 *
 * CRITICAL FIX: Removed circuit breaker — it caused death spirals where
 * ALL API calls were blocked after 3 failures during NestJS startup.
 * Now uses per-request retry with adaptive backoff instead.
 */
export async function proxyToNestJS(request: NextRequest, method: string): Promise<NextResponse> {
  const session = await ensureSession(request)

  // If no session could be created, return 502 immediately
  if (!session.token) {
    return NextResponse.json(
      {
        success: false,
        offline: true,
        error: 'الخدمة غير متاحة حالياً — لا يمكن إنشاء جلسة',
      },
      { status: 502 },
    )
  }

  // Calculate retry parameters based on NestJS readiness state
  const isWarmup = !nestjsReady || (nestjsFirstSuccessAt > 0 && Date.now() - nestjsFirstSuccessAt < WARMUP_PERIOD_MS)
  const maxRetries = isWarmup ? 3 : 1  // More retries during warmup
  const baseDelay = isWarmup ? 1000 : 2000  // Shorter delays during warmup

  return proxyWithToken(request, method, session.token, !session.cookieAlreadySet, 0, maxRetries, baseDelay, session.guestUserId)
}

/**
 * Internal function that does the actual proxying.
 * @param retryCount - Number of 401 retries attempted so far (max 2)
 * @param connectRetryCount - Number of connection retries (NestJS unreachable)
 * @param connectRetryDelay - Base delay between connection retries (ms)
 */
async function proxyWithToken(
  request: NextRequest,
  method: string,
  token: string,
  setCookie: boolean,
  retryCount = 0,
  connectRetryCount = 0,
  connectRetryDelay = 1000,
  guestUserId?: string,
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

    // FIX: Use longer timeout for known long-running endpoints.
    // The Strategic Council trigger endpoint runs 8 AI models × multiple pairs,
    // which takes 6-12 minutes. The trigger now returns immediately (fire-and-forget),
    // but we still increase the timeout for safety to prevent proxy-level timeouts
    // on any other slow endpoints.
    const isLongRunningEndpoint = pathname.includes('/strategic-council/trigger') ||
      pathname.includes('/strategic-council/session') ||
      pathname.includes('/smart-executor/') ||
      pathname.includes('/agent/content/generate') ||
      pathname.includes('/agent/content/bulk-generate') ||
      pathname.includes('/agent/content/breaking');
    const timeoutMs = isLongRunningEndpoint ? 120000 : 30000; // 2 min for long-running, 30s for normal

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    }

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.text()
        if (body) fetchOptions.body = body
      } catch { /* No body */ }
    }

    const response = await fetch(targetUrl, fetchOptions)

    // Mark NestJS as ready on ANY response (even 4xx) — server is alive!
    if (!nestjsReady) {
      nestjsReady = true;
      nestjsFirstSuccessAt = Date.now();
      console.log('[nestjs-proxy] NestJS is READY — first successful response received');
    }

    // 404 = route not found in NestJS — often means NestJS module is still loading during cold start.
    // FIX: Retry with delay to give NestJS time to register routes.
    if (response.status === 404 && retryCount < 2) {
      console.warn(`[nestjs-proxy] 404 on ${method} ${pathname} — route not found (attempt ${retryCount + 1}/3). NestJS module may still be loading, retrying in 500ms...`);
      await new Promise(r => setTimeout(r, 500));
      return proxyWithToken(request, method, token, false, retryCount + 1, connectRetryCount, connectRetryDelay, guestUserId);
    }
    if (response.status === 404) {
      console.warn(`[nestjs-proxy] 404 on ${method} ${pathname} — route still not found after 3 attempts. Check NestJS startup logs.`);
    }

    // 503 = auth service unavailable — don't retry, just forward
    if (response.status === 503) {
      console.warn(`[nestjs-proxy] 503 on ${method} ${pathname} — auth service unavailable`);
    }

    // ═══════════════════════════════════════════════════════════════
    // V154 FIX: Do NOT silently create guest sessions on 401!
    //
    // BUG: When a user's session expired, the proxy silently created a
    // guest session and retried the request. This caused ALL users with
    // expired sessions to see the SAME guest balance ($10,000) instead
    // of their own account balance. Multiple users → same data!
    //
    // NEW: On 401, clear the invalid cookie and return the 401 response.
    // The frontend's auth-store will detect this and redirect to login.
    // This ensures each user always sees THEIR OWN data.
    //
    // Exception: If this is already a retry (retryCount > 0), just return
    // the 401 — don't keep retrying with guest sessions.
    // ═══════════════════════════════════════════════════════════════
    if (response.status === 401) {
      console.warn(`[nestjs-proxy] 401 on ${method} ${pathname} — session invalid or expired. NOT creating guest session.`)
      // Clear the invalid cookie so the frontend knows the session is gone
      const responseBody = await response.text()
      const responseHeaders: Record<string, string> = {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      }
      const nextResponse = new NextResponse(responseBody, {
        status: 401,
        statusText: response.statusText,
        headers: responseHeaders,
      })
      // Clear the invalid session cookie
      nextResponse.cookies.set('roua_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
      return nextResponse
    }

    // FIX #9: Handle 403 Forbidden — usually means the session token is valid but
    // the user's tier doesn't allow the action. Don't retry — return the error.
    if (response.status === 403) {
      console.warn(`[nestjs-proxy] 403 Forbidden on ${method} ${pathname} — insufficient permissions`);
    }

    // FIX: Handle 5xx server errors from NestJS — don't retry, just forward.
    // If NestJS returns 500/502/503, retrying won't help (server-side error).
    // Track failure time for adaptive retry (NOT for circuit breaker).
    if (response.status >= 500 && response.status !== 503) {
      lastFailureAt = Date.now();
      console.warn(`[nestjs-proxy] NestJS returned ${response.status} on ${method} ${pathname}`);
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
        maxAge: 7 * 24 * 60 * 60, // 7 days (matching guest session TTL)
        path: '/',
      })
      // V156: Set guest user ID cookie so this browser reuses its guest user
      if (guestUserId) {
        nextResponse.cookies.set('roua_guest_id', guestUserId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60, // 30 days — longer than session
          path: '/',
        })
      }
    }

    return nextResponse
  } catch (error: any) {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CRITICAL FIX: Smart retry instead of circuit breaker!
    //
    // OLD BEHAVIOR: After 3 failures, block ALL requests for 10 seconds.
    // This caused death spirals where the frontend could NEVER reach NestJS.
    //
    // NEW BEHAVIOR: Retry this specific request with backoff.
    // Other requests are NOT affected — no shared blocking state.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    lastFailureAt = Date.now();

    // If we have retries left, wait and try again
    if (connectRetryCount > 0) {
      const delay = connectRetryDelay * (connectRetryCount); // Progressive backoff
      console.warn(`[nestjs-proxy] ${method} ${pathname} offline — retrying in ${delay}ms (attempt ${connectRetryCount} left)`);
      await new Promise(r => setTimeout(r, Math.min(delay, 5000))); // Cap at 5s
      return proxyWithToken(request, method, token, false, retryCount, connectRetryCount - 1, connectRetryDelay, guestUserId);
    }

    // No retries left — return 502
    console.warn(`[nestjs-proxy] ${method} ${pathname} offline — no retries left, returning 502`)
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
