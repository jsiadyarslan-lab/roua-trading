import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy for route protection — Next.js 16
 *
 * Protects all /dashboard/* routes (except /dashboard/admin/login).
 * - /dashboard/* routes: require roua_session cookie (non-guest)
 * - /dashboard/admin/* routes: require roua_admin_session cookie
 * - All other routes: pass through
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
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // ── Admin routes: check roua_admin_session ──
  if (pathname.startsWith('/dashboard/admin')) {
    // Admin login page is always accessible
    if (pathname === '/dashboard/admin/login') {
      return NextResponse.next()
    }

    const adminSession = request.cookies.get('roua_admin_session')?.value
    if (!adminSession) {
      return NextResponse.redirect(new URL('/dashboard/admin/login', request.url))
    }

    return NextResponse.next()
  }

  // ── Dashboard routes: require roua_session ──
  if (pathname.startsWith('/dashboard')) {
    const sessionToken = request.cookies.get('roua_session')?.value

    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
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
