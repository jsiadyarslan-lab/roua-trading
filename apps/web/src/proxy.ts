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

  // ── Static assets: pass through with security headers ──
  if (pathname.startsWith('/_next/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── API routes: pass through with security headers ──
  // NestJS Helmet adds its own headers for /api/* routes
  if (pathname.startsWith('/api/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Detect mobile device using user agent ──
  const userAgent = request.headers.get('user-agent') || ''
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)

  // ── Mobile auto-redirects ──
  if (isMobile && pathname === '/dashboard') {
    return addSecurityHeaders(NextResponse.redirect(new URL('/mobile', request.url)), request)
  }
  if (isMobile && pathname.startsWith('/dashboard/')) {
    // Only redirect main pages, ignore admin
    if (!pathname.startsWith('/dashboard/admin')) {
      const mobilePath = pathname.replace('/dashboard', '/mobile')
      return addSecurityHeaders(NextResponse.redirect(new URL(mobilePath, request.url)), request)
    }
  }
  if (!isMobile && pathname.startsWith('/mobile')) {
    const desktopPath = pathname.replace('/mobile', '/dashboard')
    return addSecurityHeaders(NextResponse.redirect(new URL(desktopPath, request.url)), request)
  }

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

  // ── Dashboard routes: require roua_session ──
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
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.svg|logo-.*\\.png|sw\\.js|manifest\\.json|robots\\.txt).*)',
  ],
}
