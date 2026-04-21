import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // ── DEV BYPASS: skip auth in local development ──
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const session = request.cookies.get('roua_session')
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard')

  if (isDashboard && !session) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/dashboard/:path*',
}
