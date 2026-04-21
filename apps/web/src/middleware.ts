import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // ── BYPASS AUTH FOR PROTOTYPE PREVIEW ──
  // The root path currently redirects to /dashboard.
  // We disable the auth check so that production previews do not get stuck in a redirect loop.
  /*
  const session = request.cookies.get('roua_session')
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard')

  if (isDashboard && !session) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  */

  return NextResponse.next()
}

export const config = {
  matcher: '/dashboard/:path*',
}
