import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL: Static assets MUST bypass locale routing.
// iOS Safari requires /icon-192.png, /manifest.json, /sw.js
// to be served directly without locale redirects (307).
// Without this, PWA installation fails on ALL browsers.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Regex for common static file extensions
const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|json|js|css|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|html|map|wasm)$/i;

// Exact paths that must bypass locale routing (PWA requirements)
const PWA_PATHS = [
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
];

export default function middleware(request: NextRequest) {
  // Use NextRequest.nextUrl for reliable URL parsing in middleware
  const { pathname } = request.nextUrl;

  // ── BYPASS 1: Exact path match for PWA-critical files ──
  // Use includes() instead of Set for Edge Runtime compatibility
  if (PWA_PATHS.includes(pathname)) {
    // Use rewrite() instead of next() to explicitly serve the file
    // and avoid any interference from next-intl or headers config
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathname;
    return NextResponse.rewrite(rewriteUrl);
  }

  // ── BYPASS 2: Any path ending with a static file extension ──
  if (STATIC_FILE_REGEX.test(pathname)) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathname;
    return NextResponse.rewrite(rewriteUrl);
  }

  // ── BYPASS 3: _next internal paths ──
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
