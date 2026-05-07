import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js Middleware — Route protection + security headers
 *
 * CRITICAL: This file MUST be named middleware.ts in src/ to be recognized
 * by Next.js. The old proxy.ts file was completely ignored by Next.js.
 *
 * This middleware:
 * 1. Passes _next/* static assets immediately (no processing)
 * 2. Passes RSC payload requests immediately (critical for navigation)
 * 3. Protects /dashboard/* and /mobile/* with session cookie check
 * 4. Handles mobile/desktop auto-redirect based on user-agent
 * 5. Adds security headers to all responses
 */

function addSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  response.headers.delete('x-powered-by')

  if (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '0')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  if (!response.headers.get('Content-Security-Policy')) {
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' https: data:",
        "connect-src 'self' wss: https: ws:",
        "frame-src https://challenges.cloudflare.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
    )
  }

  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. RSC payload requests: MUST pass through immediately ──
  // These are the client-side navigation fetch requests Next.js makes
  // when you click a link. They have _rsc= in the query string or
  // the RSC header. Intercepting them causes "Node cannot be found" errors
  // and navigation failures.
  const isRSC = request.headers.get('rsc') === '1' ||
    request.nextUrl.searchParams.has('_rsc') ||
    request.headers.get('next-router-prefetch') === '1'

  if (isRSC) {
    return NextResponse.next()
  }

  // ── 2. Static assets: pass through immediately ──
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.svg' ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/robots.txt' ||
    pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|css|js)$/)
  ) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── 3. Socket.IO proxy to NestJS ──
  if (pathname.startsWith('/socket.io')) {
    const apiInternalUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'
    const targetUrl = new URL(request.url)
    try {
      const apiParsed = new URL(apiInternalUrl)
      targetUrl.protocol = apiParsed.protocol || 'http:'
      targetUrl.hostname = apiParsed.hostname
      targetUrl.port = apiParsed.port || '3001'
    } catch {
      targetUrl.protocol = 'http:'
      targetUrl.hostname = '127.0.0.1'
      targetUrl.port = '3001'
    }
    return addSecurityHeaders(NextResponse.rewrite(targetUrl), request)
  }

  // ── 4. Admin routes ──
  if (pathname.startsWith('/dashboard/admin')) {
    if (pathname === '/dashboard/admin/login') {
      return addSecurityHeaders(NextResponse.next(), request)
    }
    const adminSession = request.cookies.get('roua_admin_session')?.value
    if (!adminSession) {
      return addSecurityHeaders(
        NextResponse.redirect(new URL('/dashboard/admin/login', request.url)),
        request
      )
    }
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── 5. Protected routes: require session ──
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/mobile')) {
    const sessionToken = request.cookies.get('roua_session')?.value

    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return addSecurityHeaders(NextResponse.redirect(loginUrl), request)
    }

    // ── 6. Mobile/Desktop auto-redirect ──
    // Only redirect on direct page loads (not RSC fetches, already handled above)
    const userAgent = request.headers.get('user-agent') || ''
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)

    if (isMobile && pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/admin')) {
      const mobilePath = pathname.replace('/dashboard', '/mobile')
      return addSecurityHeaders(NextResponse.redirect(new URL(mobilePath, request.url)), request)
    }

    if (!isMobile && pathname.startsWith('/mobile')) {
      const desktopPath = pathname.replace('/mobile', '/dashboard')
      return addSecurityHeaders(NextResponse.redirect(new URL(desktopPath, request.url)), request)
    }

    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── 7. All other routes: pass through ──
  return addSecurityHeaders(NextResponse.next(), request)
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|logo\\.svg|logo-.*\\.png|sw\\.js|manifest\\.json|robots\\.txt|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.webp|.*\\.gif|.*\\.svg|.*\\.ico|.*\\.woff|.*\\.woff2).*)',
  ],
}
