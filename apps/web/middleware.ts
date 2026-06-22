import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

// With localePrefix: 'as-needed', the default locale (ar) works at root /,
// while non-default locales use prefixes: /en/dashboard, /fr/dashboard, etc.
// The [locale] dynamic segment in app router handles the locale resolution.

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // V396: Socket.IO proxy — rewrite to local Route Handler.
  //
  // ROOT CAUSE OF 404:
  //   - middleware.ts matcher excluded 'socket.io' (so middleware never ran for it)
  //   - proxy.ts is NOT a recognized middleware file in Next.js 16 (only middleware.ts is)
  //   - So /socket.io/ requests went directly to Next.js router
  //   - Next.js router doesn't match paths with dots (.) — treats them as static files
  //   - Result: 404
  //
  // Socket.IO WORKS on backend (confirmed via /api/health — returns 200 with handshake).
  // The problem was ONLY in the Next.js proxy layer.
  //
  // FIX: Handle /socket.io in middleware.ts directly. Rewrite to /api/socket-io-proxy
  // Route Handler, which does manual fetch() proxy to NestJS.
  if (pathname === '/socket.io' || pathname.startsWith('/socket.io/')) {
    const url = request.nextUrl.clone();
    // Preserve the path after /socket.io (e.g., /socket.io/1/ → /api/socket-io-proxy/1/)
    const subPath = pathname === '/socket.io' ? '' : pathname.substring('/socket.io'.length);
    url.pathname = '/api/socket-io-proxy' + subPath;
    return NextResponse.rewrite(url);
  }

  // All other routes: use next-intl middleware
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames EXCEPT:
  // - /api (API routes — handled by Route Handlers)
  // - /_next (Next.js internals)
  // - /static (static files)
  // - /pwa (PWA entry point)
  // - Common static file extensions (images, fonts, etc.)
  //
  // V396: REMOVED 'socket.io' from the exclusion list — we now handle it
  // explicitly in the middleware function above. Without this change,
  // /socket.io requests were never processed by middleware and hit
  // Next.js router directly, which returned 404 (paths with dots
  // are treated as static files).
  // V397: Two matcher groups — Next.js uses OR logic (if ANY matches, middleware runs).
  //
  // Group 1: General routes (excludes paths with dots — for static files like .png, .css)
  // Group 2: Explicit /socket.io matchers (override the dot exclusion)
  //
  // Without Group 2, /socket.io was excluded by `.*\\..*` in Group 1,
  // so middleware never ran for it → 404.
  matcher: [
    '/((?!api|_next|static|pwa|.*\\..*).*)',
    '/socket.io',
    '/socket.io/:path*',
  ],
};
