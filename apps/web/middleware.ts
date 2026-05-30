import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL FIX: Static files must NEVER be redirected by
// next-intl locale routing. The intlMiddleware redirects
// /icon-192.png → /ar/icon-192.png which breaks PWA.
//
// IMPORTANT: NextResponse.next() does NOT prevent the redirect
// because next-intl's middleware internally uses rewrite/redirect.
// We must explicitly SKIP calling intlMiddleware for static files.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm|js|json|html)$/i;

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Static files: DO NOT call intlMiddleware, just continue ──
  if (STATIC_FILE_REGEX.test(pathname)) {
    const response = NextResponse.next();
    response.headers.set('X-PWA-Bypass', 'true');
    return response;
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

  // ── Locale routing (ONLY for non-static, non-API routes) ──
  return intlMiddleware(request);
}

export const config = {
  // NOTE: Next.js 16 does NOT support complex regex (lookaheads, groups) in matchers.
  // We use a simple catch-all and handle ALL filtering inside middleware().
  // Static files, _next, API routes are handled early with NextResponse.next().
  matcher: ['/:path*'],
};
