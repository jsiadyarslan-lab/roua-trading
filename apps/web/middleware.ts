import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL: Static assets MUST bypass locale routing.
// iOS Safari requires /icon-192.png, /manifest.json, /sw.js
// to be served directly without locale redirects (307).
// Without this, PWA installation fails on ALL browsers.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Regex for common static file extensions — catches ALL images, fonts, etc.
const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|json|js|css|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|html|map|wasm)$/i;

// Exact paths that must bypass locale routing (PWA requirements)
const STATIC_PATHS = new Set([
  '/manifest.json',
  '/sw.js',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
  '/favicon.svg',
  '/robots.txt',
  '/offline.html',
  '/apple-touch-icon.png',
]);

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ── BYPASS 1: Exact path match for PWA-critical files ──
  if (STATIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // ── BYPASS 2: Any path ending with a static file extension ──
  // This catches /icons/icon-192.png, /images/hero.webp, etc.
  if (STATIC_FILE_REGEX.test(pathname)) {
    return NextResponse.next();
  }

  // ── BYPASS 3: _next internal paths (should be in matcher exclude, but safety net) ──
  if (pathname.startsWith('/_next') || pathname.startsWith('/static')) {
    return NextResponse.next();
  }

  // ── BYPASS 4: API routes ──
  if (pathname.startsWith('/api/') || pathname.startsWith('/socket.io')) {
    return NextResponse.next();
  }

  // ── Apply next-intl locale routing for everything else ──
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except _next internals and static
  matcher: ['/((?!_next|static|socket.io).*)'],
};
