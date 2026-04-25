import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for dashboard routes
 *
 * Checks for the roua_session cookie to determine if the user is authenticated.
 * If not authenticated, redirects to the login page.
 *
 * API routes (/api/*) and static assets are excluded from this check.
 */
export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get('roua_session')?.value
  const { pathname } = request.nextUrl

  // Allow API routes and static assets through
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }

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
