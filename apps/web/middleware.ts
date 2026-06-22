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

  // V400: Bypass next-intl for /socket — let next.config.ts rewrite handle it.
  // next-intl was intercepting /socket and trying to add a locale prefix
  // (e.g., /ar/socket), which caused 404 because the rewrite never ran.
  if (pathname === '/socket' || pathname.startsWith('/socket/')) {
    return NextResponse.next();
  }

  // All other routes: use next-intl middleware
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except:
  // - /api (API routes)
  // - /_next (Next.js internals)
  // - /static (static files)
  // - /pwa (PWA entry point)
  // - Common static file extensions (images, fonts, etc.)
  //
  // V400: /socket is NOT excluded — we handle it explicitly in the middleware
  // function above (bypassing next-intl). This is necessary because:
  //   1. If we exclude /socket from the matcher, next.config.ts rewrites should
  //      handle it. But in some Next.js 16 configurations, the rewrite doesn't
  //      fire if middleware doesn't run first.
  //   2. By letting middleware run but returning NextResponse.next() immediately,
  //      we ensure the request passes through to the rewrite layer without
  //      next-intl interfering.
  matcher: ['/((?!api|_next|static|pwa|.*\\..*).*)'],
};
