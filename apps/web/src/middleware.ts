import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware: Skip landing page when SKIP_LANDING=true env var is set.
 * Works at the edge — no client-side flash or delay.
 * Remove or set SKIP_LANDING=false to restore the landing page.
 */
export function middleware(request: NextRequest) {
  // Only apply to the root path (landing page)
  if (request.nextUrl.pathname === '/') {
    const skipLanding = process.env.SKIP_LANDING === 'true';
    if (skipLanding) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
