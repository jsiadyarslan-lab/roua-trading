import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL: Static assets MUST bypass locale routing.
// The next-intl middleware with localePrefix: 'always' redirects
// /icon-192.png → /ar/icon-192.png (307) which breaks PWA.
//
// SOLUTION: Rewrite PWA asset URLs to the /api/pwa-asset route
// INSIDE the middleware, BEFORE intlMiddleware processes them.
// API routes are never redirected by intlMiddleware.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// PWA static files that must be served without locale redirect
const PWA_ASSET_MAP: Record<string, string> = {
  '/icon-192.png': '/api/pwa-asset?file=icon-192.png',
  '/icon-512.png': '/api/pwa-asset?file=icon-512.png',
  '/logo-192.png': '/api/pwa-asset?file=logo-192.png',
  '/logo-512.png': '/api/pwa-asset?file=logo-512.png',
  '/favicon.ico': '/api/pwa-asset?file=favicon.ico',
  '/favicon.svg': '/api/pwa-asset?file=favicon.svg',
  '/offline.html': '/api/pwa-asset?file=offline.html',
};

// Regex for static file extensions (images, fonts, etc.)
const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm)$/i;

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── BYPASS 1: Rewrite PWA assets to API route (before intlMiddleware) ──
  const pwaDestination = PWA_ASSET_MAP[pathname];
  if (pwaDestination) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pwaDestination;
    // Clear locale cookie to prevent any further locale processing
    const response = NextResponse.rewrite(rewriteUrl);
    return response;
  }

  // ── BYPASS 2: Static files with extensions (not in PWA map) ──
  // These are handled by Next.js static file serving and don't need locale
  if (STATIC_FILE_REGEX.test(pathname)) {
    return NextResponse.next();
  }

  // ── BYPASS 3: _next internals, API, socket.io ──
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/socket.io')
  ) {
    return NextResponse.next();
  }

  // ── Apply next-intl locale routing for everything else ──
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next|static|socket.io).*)'],
};
