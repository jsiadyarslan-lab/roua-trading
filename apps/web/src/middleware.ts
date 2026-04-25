import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for dashboard routes
 *
 * Currently DISABLED — all routes are accessible without authentication.
 * To re-enable auth later, uncomment the session check below and set
 * ENABLE_AUTH=1 in your environment variables.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow API routes and static assets through
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }

  // ── Auth is currently DISABLED for development ──
  // To re-enable: set ENABLE_AUTH=1 env var, then the middleware
  // will check for the roua_session cookie and redirect to /login
  // if missing. Make sure you also create a /login page first!
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
    '/dashboard/:path*',
    '/dashboard'
  ],
}
