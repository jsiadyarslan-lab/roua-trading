import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Static files bypass locale routing.
// All files with standard static extensions (png, jpg, svg, ico, js, json, etc.)
// must pass through WITHOUT locale prefixing. next-intl would redirect
// /icon-192.png → /ar/icon-192.png (404), breaking PWA.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm|js|json|html)$/i;

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Static files: pass through without locale routing ──
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
