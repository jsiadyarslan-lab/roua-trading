import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy for route protection + security headers — Next.js 16
 *
 * Protects all /dashboard/* routes (except /dashboard/admin/login).
 * - /dashboard/* routes: require roua_session cookie (non-guest)
 * - /dashboard/admin/* routes: require roua_admin_session cookie
 * - All other routes: pass through
 *
 * Also adds security headers to ALL responses:
 * - HSTS, X-Content-Type-Options, X-Frame-Options, CSP, etc.
 * - These complement the NestJS Helmet headers for /api/* routes
 * - Fills the gap for HTML pages that had no security headers before
 *
 * Migrated from middleware.ts to proxy.ts for Next.js 16 compatibility.
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 */

/**
 * Add security headers to a response.
 * These headers protect against XSS, clickjacking, MIME sniffing, etc.
 */
function addSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  // ── Remove X-Powered-By header (information disclosure) ──
  response.headers.delete('x-powered-by')

  // ── HSTS — Force HTTPS (1 year, include subdomains, preload) ──
  if (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // ── X-Content-Type-Options — Prevent MIME-type sniffing ──
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // ── X-Frame-Options — Prevent clickjacking ──
  response.headers.set('X-Frame-Options', 'DENY')

  // ── Referrer-Policy — Limit referrer information ──
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // ── X-XSS-Protection — Disabled (modern approach, CSP is better) ──
  response.headers.set('X-XSS-Protection', '0')

  // ── Permissions-Policy — Restrict browser features ──
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )

  // ── Cross-Origin policies ──
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')

  // ── CSP for HTML pages (complements NestJS CSP for API routes) ──
  // Only set CSP if not already set by NestJS (avoid double CSP on /api/*)
  if (!response.headers.get('Content-Security-Policy')) {
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-eval required by Next.js 16 runtime
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' https: data:",
        "connect-src 'self' wss: https: ws:",  // WebSocket + API connections
        "frame-src https://challenges.cloudflare.com",  // Cloudflare Turnstile for CAPTCHA
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
    )
  }

  return response
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── CRITICAL: RSC payload requests MUST pass through immediately ──
  // These are the fetch requests Next.js App Router makes when navigating
  // between pages (client-side routing). They carry the RSC header or
  // _rsc= query param. ANY interception — redirects, auth checks, header
  // injection — breaks the navigation and causes "Node cannot be found"
  // errors and page freeze. This bypass MUST be the very first check.
  const isRSC =
    request.headers.get('rsc') === '1' ||
    request.nextUrl.searchParams.has('_rsc') ||
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('next-router-state-tree') !== null

  if (isRSC) {
    return NextResponse.next()
  }

  // ── Static assets: pass through with security headers ──
  if (pathname.startsWith('/_next/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Socket.IO: rewrite to NestJS backend ──
  // FIX: Socket.IO runs on NestJS (port 3001). Next.js has no /socket.io route,
  // so we must forward all /socket.io requests to NestJS.
  //
  // PROBLEM: Next.js applies a trailing-slash redirect (308) BEFORE proxy.ts
  // rewrites take effect. So /socket.io/ (with slash) gets redirected to
  // /socket.io (without slash). After the redirect, the client makes a new
  // request to /socket.io which goes through proxy.ts again, but by then
  // the Socket.IO handshake may fail because the path changed.
  //
  // SOLUTION: We use NextResponse.rewrite() which transparently forwards the
  // request to NestJS WITHOUT a client-side redirect. This works for both
  // /socket.io and /socket.io/ paths. Socket.IO will use HTTP long-polling
  // through the rewrite, and automatically falls back from WebSocket if
  // WS upgrade fails (WebSocket upgrades can't go through middleware rewrites).
  if (pathname.startsWith('/socket.io')) {
    const apiInternalUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'
    const targetUrl = new URL(request.url)
    try {
      const apiParsed = new URL(apiInternalUrl)
      targetUrl.protocol = apiParsed.protocol || 'http:'
      targetUrl.hostname = apiParsed.hostname
      targetUrl.port = apiParsed.port || '3001'
    } catch {
      // Fallback: construct URL manually
      targetUrl.protocol = 'http:'
      targetUrl.hostname = '127.0.0.1'
      targetUrl.port = '3001'
    }
    return addSecurityHeaders(NextResponse.rewrite(targetUrl), request)
  }

  // ── API routes: pass through with security headers ──
  // NestJS Helmet adds its own headers for /api/* routes
  if (pathname.startsWith('/api/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // NOTE: Mobile/desktop auto-redirect is intentionally removed.
  // User-agent-based redirects in the proxy intercept RSC navigation fetch
  // requests and send 308 redirects instead of RSC payloads, breaking
  // client-side navigation completely. Both /mobile and /dashboard routes
  // work independently without this redirect.

  // ── Admin API routes: pass through (auth handled by route handlers) ──
  if (pathname.startsWith('/dashboard/admin/api/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Admin routes: check roua_admin_session ──
  if (pathname.startsWith('/dashboard/admin')) {
    // Admin login page is always accessible
    if (pathname === '/dashboard/admin/login') {
      return addSecurityHeaders(NextResponse.next(), request)
    }

    const adminSession = request.cookies.get('roua_admin_session')?.value
    if (!adminSession) {
      return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard/admin/login', request.url)), request)
    }

    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Dashboard routes: require roua_session cookie ──
  // Guest access is now handled via /api/auth/guest which creates a proper
  // session + cookie. No more SKIP_LANDING env var dependency.
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/mobile')) {
    const sessionToken = request.cookies.get('roua_session')?.value

    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return addSecurityHeaders(NextResponse.redirect(loginUrl), request)
    }

    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── All other routes: pass through with security headers ──
  return addSecurityHeaders(NextResponse.next(), request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, logos, sw.js, manifest.json, robots.txt
     */
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|logo\\.svg|logo-.*\\.png|sw\\.js|manifest\\.json|robots\\.txt).*)',
  ],
}
