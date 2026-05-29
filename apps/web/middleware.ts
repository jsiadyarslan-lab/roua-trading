import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL: Image/icon assets MUST bypass locale routing.
// The next-intl middleware redirects /icon-192.png → /ar/icon-192.png
// which breaks PWA icons.
//
// NOTE: /sw.js and /manifest.json do NOT need bypassing — they are
// served directly from public/ by Next.js before middleware runs.
// Only image/icon files need this workaround because they match
// the middleware matcher and get redirected.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// PWA image/icon files that must be served without locale redirect
const PWA_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
  '/favicon.svg',
  '/offline.html',
];

// Regex for static file extensions (including .js and .json for safety)
const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm|js|json)$/i;

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── BYPASS 1: PWA-critical image/icon files — rewrite to API route ──
  if (PWA_ASSETS.includes(pathname)) {
    const url = new URL(`/api/pwa-asset?file=${pathname.slice(1)}`, request.url);
    return NextResponse.rewrite(url);
  }

  // ── BYPASS 2: Static files with extensions (catches .js, .json, etc.) ──
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
