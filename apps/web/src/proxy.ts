import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy for dashboard route protection
 *
 * NOTE: API auth header injection has been moved to individual Route Handlers
 * (trading, engine, portfolio, analytics) which use the shared nestjs-proxy
 * utility. This is more reliable than proxy-based header injection because:
 * - Route Handlers have direct access to the request/response cycle
 * - They can auto-create sessions and set cookies on the response
 * - The proxy runs at the Edge Runtime by default, which has limited access
 *   to the database and cannot auto-create sessions
 *
 * This proxy now only handles dashboard route protection.
 * To enable auth-required dashboard access, set ENABLE_AUTH=1.
 *
 * Migrated from middleware.ts to proxy.ts for Next.js 16 compatibility.
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 */

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Static assets: pass through ──
  if (pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }

  // ── API routes: pass through ──
  // Auth injection is handled by individual Route Handlers
  if (pathname.startsWith('/api/')) {
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
  ],
}
