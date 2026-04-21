import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Allow all requests to pass through to break the redirect loop.
  // The client-side dashboard components and hooks (like useAuth) 
  // will handle unauthenticated states gracefully.
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/dashboard'
  ],
}
