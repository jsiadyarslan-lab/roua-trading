import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL: Static assets MUST bypass locale routing.
// The next-intl middleware with localePrefix: 'always' redirects
// /pwa-icon-192.png → /ar/pwa-icon-192.png (307) which breaks PWA.
//
// SOLUTION: Rewrite PWA asset URLs to the /api/pwa-asset route
// BEFORE intlMiddleware processes them. Use new URL() constructor
// to properly separate pathname and query parameters.
//
// NOTE: We use /pwa-icon-*.png instead of /icon-*.png because
// the old /icon-192.png URL was cached as a 307 redirect by
// Railway's CDN edge proxy (from the old headers() config with
// max-age=86400). New filenames bypass this cached redirect.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// PWA static files that must be served without locale redirect
const PWA_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
  '/favicon.svg',
  '/offline.html',
];

// Regex for static file extensions
const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm)$/i;

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── BYPASS 1: PWA-critical files — rewrite to API route ──
  if (PWA_ASSETS.includes(pathname)) {
    const url = new URL(`/api/pwa-asset?file=${pathname.slice(1)}`, request.url);
    return NextResponse.rewrite(url);
  }

  // ── BYPASS 2: Static files with extensions ──
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

  // ── Apply next-intl locale routing ──
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next|static|socket.io).*)'],
};
