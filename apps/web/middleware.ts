import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL: Static assets MUST bypass locale routing.
// The next-intl middleware redirects /icon-192.png → /ar/icon-192.png
// which breaks PWA. These bypasses ensure PWA files are served directly.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// PWA static files that must be served without locale redirect
const PWA_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
  '/favicon.svg',
  '/manifest.json',
  '/sw.js',
  '/offline.html',
];

// Regex for static file extensions (including .js and .json for PWA)
const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm|js|json)$/i;

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
