import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy for route protection + security headers + i18n locale — Next.js 16
 *
 * Handles THREE concerns:
 * 1. i18n locale detection & redirect — ensures all paths have a locale prefix
 *    (e.g., /login → /ar/login, /dashboard → /en/dashboard)
 * 2. Route protection — /dashboard/* and /mobile/* require session cookie
 * 3. Security headers — HSTS, CSP, X-Frame-Options, cache control, etc.
 *
 * Migrated from middleware.ts to proxy.ts for Next.js 16 compatibility.
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * PWA FIX: Static asset files (icons, manifest, SW) must NOT be redirected
 * by locale detection. They are served directly from public/ without locale prefix.
 */

// ── i18n Configuration ──
const SUPPORTED_LOCALES = ['ar', 'en', 'fr', 'tr', 'es', 'zh', 'ru', 'hi', 'pt', 'de', 'ja', 'ko', 'id', 'vi', 'th', 'it', 'pl', 'nl', 'ms', 'he', 'sv', 'uk', 'fa', 'ur', 'fil', 'da', 'no', 'fi', 'cs', 'hu', 'ro', 'bn']
const DEFAULT_LOCALE = 'ar'

// Smart locale proximity — maps unsupported browser locales to closest supported one
const LOCALE_PROXIMITY: Record<string, string> = {
  ca: 'es', gl: 'es',
  zh_CN: 'zh', zh_TW: 'zh', zh_HK: 'zh', zh_SG: 'zh',
  pt_BR: 'pt', pt_PT: 'pt',
  hi_IN: 'hi',
  ko_KR: 'ko',
  id_ID: 'id',
  vi_VN: 'vi',
  th_TH: 'th',
  it_IT: 'it', it_CH: 'it',
  pl_PL: 'pl',
  nl_BE: 'nl', nl_NL: 'nl', af: 'nl',
  ms_MY: 'ms', ms_BN: 'ms',
  he_IL: 'he',
  sv_SE: 'sv', sv_FI: 'sv',
  uk_UA: 'uk',
  fa_IR: 'fa', fa_AF: 'fa', tg: 'fa',
  ur_PK: 'ur', ur_IN: 'ur',
  fil_PH: 'fil',
  da_DK: 'da', da_GL: 'da',
  no_NO: 'no', nb: 'no', nn: 'no', nb_NO: 'no', nn_NO: 'no',
  fi_FI: 'fi',
  cs_CZ: 'cs', cs_SK: 'cs',
  hu_HU: 'hu',
  ro_RO: 'ro', ro_MD: 'ro', mo: 'ro',
  bn_BD: 'bn', bn_IN: 'bn',
  bg: 'ru', mk: 'ru', sr: 'ru', hr: 'ru', sl: 'ru', bs: 'ru',
  az: 'tr', kk: 'tr', uz: 'tr', ky: 'tr', tk: 'tr',
  ku: 'ar',
  eo: 'en',
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA CRITICAL: These static files must NEVER be locale-redirected.
// They live in public/ and must be served at their exact paths.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const STATIC_FILE_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|mp3|mp4|webm|pdf|xml|txt|map|wasm|js|json|html|css)$/i

/**
 * Detect locale from cookie or Accept-Language header.
 */
function detectLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
    return cookieLocale
  }

  const acceptLanguage = request.headers.get('accept-language') || ''
  const languages = acceptLanguage.split(',').map(lang => {
    const [code, qStr] = lang.trim().split(';')
    const q = qStr ? parseFloat(qStr.split('=')[1]) : 1
    return { code: code.trim(), q }
  })
  languages.sort((a, b) => b.q - a.q)

  for (const { code } of languages) {
    const baseLang = code.split('-')[0].toLowerCase()
    if (SUPPORTED_LOCALES.includes(code.toLowerCase())) return code.toLowerCase()
    if (SUPPORTED_LOCALES.includes(baseLang)) return baseLang
    if (LOCALE_PROXIMITY[baseLang]) return LOCALE_PROXIMITY[baseLang]
  }

  return DEFAULT_LOCALE
}

function extractLocaleFromPath(pathname: string): string | null {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale
    }
  }
  return null
}

function stripLocalePrefix(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}`) return '/'
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1)
  }
  return pathname
}

function addSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  response.headers.delete('x-powered-by')

  const { pathname } = request.nextUrl
  const isStaticAsset =
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/_next/image') ||
    STATIC_FILE_REGEX.test(pathname)

  if (isStaticAsset) {
    response.headers.set('Cache-Control', 'public, max-age=86400, immutable')
  } else if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  } else {
    response.headers.set('Cache-Control', 'public, s-maxage=0, must-revalidate')
  }

  if (request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '0')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')

  if (!response.headers.get('Content-Security-Policy')) {
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' https: data:",
      "connect-src 'self' wss: https: ws:",
      "frame-src https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '))
  }

  return response
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── CRITICAL: RSC payload requests MUST pass through immediately ──
  const isRSC =
    request.headers.get('rsc') === '1' ||
    request.nextUrl.searchParams.has('_rsc') ||
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('next-router-state-tree') !== null

  if (isRSC) {
    return NextResponse.next()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PWA CRITICAL FIX: Static files MUST pass through WITHOUT locale
  // redirect. Files like /icon-192.png, /manifest.json, /sw.js, etc.
  // are served from public/ and must NOT be redirected to /ar/icon-192.png.
  // This was the root cause of PWA not working on mobile for 50+ attempts!
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (STATIC_FILE_REGEX.test(pathname)) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Static assets (_next): pass through with security headers ──
  if (pathname.startsWith('/_next/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Socket.IO: rewrite to local Route Handler ──
  // V393: Previous approaches failed:
  //   V388: NextResponse.rewrite(externalUrl) — fetch() buffers, breaks Socket.IO
  //   V389: next.config.ts rewrites — may not apply correctly with proxy.ts in Next.js 16
  //
  // NEW APPROACH: Rewrite /socket.io* to /api/socket-io-proxy (LOCAL Route Handler),
  // then the Route Handler does manual fetch() proxy to NestJS with proper
  // cookie/header forwarding. This is the most reliable pattern because:
  //   1. proxy.ts handles the rewrite (guaranteed to run before Route Handlers)
  //   2. Route Handler does the actual HTTP proxy (full control over headers)
  //   3. No dependency on next.config.ts rewrites (which may conflict with proxy.ts)
  if (pathname === '/socket.io' || pathname.startsWith('/socket.io/')) {
    const url = request.nextUrl.clone();
    // Preserve the path after /socket.io (e.g., /socket.io/1/ → /api/socket-io-proxy/1/)
    const subPath = pathname === '/socket.io' ? '' : pathname.substring('/socket.io'.length);
    url.pathname = '/api/socket-io-proxy' + subPath;
    return addSecurityHeaders(NextResponse.rewrite(url), request)
  }

  // ── API routes: pass through with security headers ──
  if (pathname.startsWith('/api/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── i18n: Locale detection & redirect ──
  const pathLocale = extractLocaleFromPath(pathname)

  if (!pathLocale) {
    const targetLocale = detectLocale(request)
    const url = request.nextUrl.clone()
    url.pathname = `/${targetLocale}${pathname}`
    const response = NextResponse.redirect(url)
    if (!request.cookies.get('NEXT_LOCALE')?.value) {
      response.cookies.set('NEXT_LOCALE', targetLocale, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
      })
    }
    return response
  }

  // ── Path HAS a locale prefix — apply route protection ──
  const barePath = stripLocalePrefix(pathname)

  // ── Admin API routes: pass through ──
  if (barePath.startsWith('/dashboard/admin/api/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Admin routes: check roua_admin_session ──
  if (barePath.startsWith('/dashboard/admin')) {
    if (barePath === '/dashboard/admin/login') {
      return addSecurityHeaders(NextResponse.next(), request)
    }
    const adminSession = request.cookies.get('roua_admin_session')?.value
    if (!adminSession) {
      return addSecurityHeaders(NextResponse.redirect(new URL(`/${pathLocale}/dashboard/admin/login`, request.url)), request)
    }
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Dashboard routes: require roua_session cookie ──
  if (barePath.startsWith('/dashboard') || barePath.startsWith('/mobile')) {
    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      const loginUrl = new URL(`/${pathLocale}/login`, request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return addSecurityHeaders(NextResponse.redirect(loginUrl), request)
    }
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── All other routes: pass through with security headers ──
  return addSecurityHeaders(NextResponse.next(), request)
}

export const config = {
  // NOTE: Next.js 16 does NOT support complex regex (lookaheads, groups) in matchers.
  // We use a simple catch-all and handle ALL filtering inside proxy().
  // Static files, _next, API routes are handled early in proxy() with NextResponse.next().
  matcher: ['/:path*'],
}
