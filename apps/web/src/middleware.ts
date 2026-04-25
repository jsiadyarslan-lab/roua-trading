import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for dashboard routes
 *
 * During development (NODE_ENV !== 'production'), authentication is skipped
 * so the developer can access the dashboard without logging in.
 *
 * In production, checks for the roua_session cookie and redirects to /login
 * if not authenticated. API routes (/api/*) and static assets are excluded.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow API routes and static assets through
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }

  // Skip authentication in development or when DEV_MODE is set
  // This allows accessing the dashboard without login during development.
  // Remove DEV_MODE env var when ready for production auth.
  if (process.env.NODE_ENV !== 'production' || process.env.DEV_MODE === '1') {
    return NextResponse.next()
  }

  // Production: check for session cookie
  const sessionToken = request.cookies.get('roua_session')?.value

  // If no session cookie, redirect to login
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
