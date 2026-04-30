import { NextRequest, NextResponse } from 'next/server'

/**
 * Next.js Middleware — Server-side route protection for dashboard
 *
 * This middleware protects all /dashboard/* routes by checking for
 * the `roua_session` cookie. Without this, the dashboard could briefly
 * render before client-side AuthGuard redirects (security + UX issue).
 *
 * Public routes (no auth required):
 * - / (landing page)
 * - /login
 * - /api/* (API routes handle their own auth)
 * - /_next/* (Next.js internal)
 * - /admin/login (admin login page)
 */

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/admin/login',
]

const PUBLIC_PREFIXES = [
  '/api/',
  '/_next/',
  '/favicon',
  '/robots',
  '/sitemap',
  '/images/',
  '/fonts/',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip middleware for non-dashboard routes
  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next()
  }

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }

  // Allow public prefixes
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // Check for session cookie
  const sessionCookie = req.cookies.get('roua_session')
  
  if (!sessionCookie?.value) {
    // No session cookie — redirect to login
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Session cookie exists — allow through
  // (actual session validation happens in API routes)
  return NextResponse.next()
}

export const config = {
  // Only run on dashboard paths
  matcher: ['/dashboard/:path*'],
}
