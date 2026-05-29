import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Static assets that must bypass locale routing — iOS Safari PWA requires these
// to be served directly without redirects, otherwise PWA install fails.
const STATIC_ASSETS = [
  '/manifest.json',
  '/sw.js',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
  '/favicon.svg',
  '/robots.txt',
];

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Bypass locale redirect for static assets (critical for PWA on iOS)
  if (STATIC_ASSETS.includes(pathname)) {
    return NextResponse.next();
  }

  // Bypass for any file with an extension (images, fonts, etc.)
  const lastSegment = pathname.split('/').pop() || '';
  if (lastSegment.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except API routes, _next internals, static files, and socket.io
  matcher: ['/((?!api|_next|static|socket.io).*)'],
};
