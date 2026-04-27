import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for dashboard routes and API auth injection
 *
 * 1. For API routes that are rewritten to NestJS (trading, engine, signals,
 *    portfolio, ai, analytics, neural, health, news/nest):
 *    → Extracts roua_session cookie and injects Authorization: Bearer header
 *    → This ensures NestJS AuthGuard can validate the session
 *
 * 2. For dashboard routes:
 *    → Checks for roua_session cookie and redirects to /login if missing
 *    → Currently disabled (ENABLE_AUTH !== '1')
 */

// API paths that are rewritten to NestJS and need auth header injection
const NESTJS_PROXY_PATHS = [
  '/api/trading/',
  '/api/engine/',
  '/api/signals/',
  '/api/portfolio/',
  '/api/ai/analyze',
  '/api/ai/models',
  '/api/ai/consensus-nest',
  '/api/analytics/',
  '/api/neural/optimize',
  '/api/neural/compare',
  '/api/neural/export',
  '/api/neural/apply-recommendation',
  '/api/health',
  '/api/news/nest/',
]

function isNestjsProxiedPath(pathname: string): boolean {
  return NESTJS_PROXY_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── API routes: inject Authorization header from cookie ──
  if (pathname.startsWith('/api/')) {
    // Only inject auth for routes that are proxied to NestJS
    if (isNestjsProxiedPath(pathname)) {
      const sessionToken = request.cookies.get('roua_session')?.value

      if (sessionToken) {
        // Clone request headers and add Authorization + custom x-roua-session header
        const requestHeaders = new Headers(request.headers)
        requestHeaders.set('Authorization', `Bearer ${sessionToken}`)
        // Also inject x-roua-session as a fallback auth method.
        // If Next.js rewrites fail to forward the cookie, the NestJS
        // AuthGuard can still read this custom header.
        requestHeaders.set('x-roua-session', sessionToken)

        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        })
      }
    }

    // For other API routes (auth, exchange, alpaca, etc.) or when no session,
    // just pass through — the NestJS AuthGuard will handle 401 if needed
    return NextResponse.next()
  }

  // ── Static assets: pass through ──
  if (pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }

  // ── Dashboard routes: auth check ──
  // Currently DISABLED — all routes are accessible without authentication.
  // To re-enable: set ENABLE_AUTH=1 env var
  if (process.env.ENABLE_AUTH !== '1') {
    return NextResponse.next()
  }

  // ── Auth enabled: check for session cookie ──
  const sessionToken = request.cookies.get('roua_session')?.value

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Dashboard routes (auth protection)
    '/dashboard/:path*',
    '/dashboard',
    // API routes (auth header injection for NestJS proxies)
    '/api/trading/:path*',
    '/api/engine/:path*',
    '/api/signals/:path*',
    '/api/portfolio/:path*',
    '/api/ai/:path*',
    '/api/analytics/:path*',
    '/api/neural/:path*',
    '/api/health',
    '/api/news/nest/:path*',
  ],
}
