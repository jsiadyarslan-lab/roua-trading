import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Detect mobile device using user agent
  const userAgent = request.headers.get('user-agent') || ''
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)

  // Auto-redirect mobile users from /dashboard to /mobile
  if (isMobile && pathname === '/dashboard') {
    return NextResponse.redirect(new URL('/mobile', request.url))
  }
  
  // Same for sub-routes
  if (isMobile && pathname.startsWith('/dashboard/')) {
    const mobilePath = pathname.replace('/dashboard', '/mobile')
    return NextResponse.redirect(new URL(mobilePath, request.url))
  }

  // Auto-redirect desktop users from /mobile to /dashboard
  if (!isMobile && pathname.startsWith('/mobile')) {
    const desktopPath = pathname.replace('/mobile', '/dashboard')
    // Fallback to main dashboard if exact route doesn't match perfectly
    return NextResponse.redirect(new URL(desktopPath === '/dashboard' ? '/dashboard' : '/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/mobile/:path*'],
}
