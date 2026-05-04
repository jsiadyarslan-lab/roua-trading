import { NextRequest, NextResponse } from 'next/server'

/**
 * Middleware — Enforces authentication for dashboard routes.
 *
 * BUG FIX: Previously, the dashboard was accessible without any server-side
 * auth check (AuthGuard component allowed guests through). This middleware
 * ensures that /dashboard routes require at least a session cookie.
 *
 * - If no `roua_session` cookie exists on a /dashboard route → redirect to /login
 * - API routes and static assets are not affected
 * - The landing page, login page, and mobile routes are public
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    const sessionToken = request.cookies.get('roua_session')?.value

    if (!sessionToken) {
      // No session cookie — redirect to login with callback URL
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all dashboard routes except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, etc.
     */
    '/dashboard/:path*',
  ],
}
