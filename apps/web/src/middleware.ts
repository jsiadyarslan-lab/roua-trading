import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
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
