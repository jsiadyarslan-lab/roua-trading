import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // ── DEV BYPASS: skip auth in local development ──
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const session = request.cookies.get('roua_session')
  const { pathname } = request.nextUrl

  // Protected Routes: /dashboard and everything under it
  const isProtected = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  if (isProtected && !session) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
  ],
}
