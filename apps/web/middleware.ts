import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA: Image/icon assets must bypass locale routing.
// The next-intl middleware redirects /icon-192.png → /ar/icon-192.png
// which breaks PWA icons. We rewrite them to the API route.
//
// /sw.js and /manifest.json do NOT need bypassing — they are served
// from public/ before middleware runs.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PWA_IMAGE_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
  '/favicon.svg',
  '/offline.html',
];

const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm|js|json)$/i;

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── PWA images: rewrite to API route ──
  if (PWA_IMAGE_ASSETS.includes(pathname)) {
    const url = new URL(`/api/pwa-asset?file=${pathname.slice(1)}`, request.url);
    return NextResponse.rewrite(url);
  }

  // ── Static files: pass through ──
  if (STATIC_FILE_REGEX.test(pathname)) {
    return NextResponse.next();
  }

  // ── Internal routes: pass through ──
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/socket.io')
  ) {
    return NextResponse.next();
  }

  // ── Locale routing ──
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next|static|socket.io).*)'],
};
