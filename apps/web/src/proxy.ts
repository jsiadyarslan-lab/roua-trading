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
 */

// ── i18n Configuration ──
const SUPPORTED_LOCALES = ['ar', 'en', 'fr', 'tr', 'es', 'zh', 'ru', 'hi', 'pt', 'de', 'ja']
const DEFAULT_LOCALE = 'ar'

// Smart locale proximity — maps unsupported browser locales to closest supported one
const LOCALE_PROXIMITY: Record<string, string> = {
  it: 'es', ca: 'es', gl: 'es',
  ro: 'fr',
  nl: 'de', sv: 'de', no: 'de', da: 'de', fi: 'de',
  uk: 'ru', pl: 'ru', cs: 'ru', bg: 'ru',
  zh_CN: 'zh', zh_TW: 'zh', zh_HK: 'zh', zh_SG: 'zh',
  ko: 'zh', th: 'zh', vi: 'zh', id: 'zh', ms: 'zh',
  az: 'tr', kk: 'tr', uz: 'tr', ky: 'tr',
  ku: 'ar', fa: 'ar', he: 'ar', ur: 'hi',
  pt_BR: 'pt', pt_PT: 'pt',
  hi_IN: 'hi',
}

/**
 * Detect locale from cookie or Accept-Language header.
 * Priority: NEXT_LOCALE cookie > Accept-Language proximity mapping > default (ar)
 */
function detectLocale(request: NextRequest): string {
  // 1. Cookie (highest priority — user's explicit choice)
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
    return cookieLocale
  }

  // 2. Browser Accept-Language header with proximity mapping
  const acceptLanguage = request.headers.get('accept-language') || ''
  const languages = acceptLanguage.split(',').map(lang => {
    const [code, qStr] = lang.trim().split(';')
    const q = qStr ? parseFloat(qStr.split('=')[1]) : 1
    return { code: code.trim(), q }
  })
  languages.sort((a, b) => b.q - a.q)

  for (const { code } of languages) {
    const baseLang = code.split('-')[0].toLowerCase()
    // Exact match
    if (SUPPORTED_LOCALES.includes(code.toLowerCase())) return code.toLowerCase()
    // Base language match
    if (SUPPORTED_LOCALES.includes(baseLang)) return baseLang
    // Proximity mapping
    if (LOCALE_PROXIMITY[baseLang]) return LOCALE_PROXIMITY[baseLang]
  }

  // 3. Default
  return DEFAULT_LOCALE
}

/**
 * Check if a pathname already has a locale prefix.
 * Returns the locale if found, null otherwise.
 */
function extractLocaleFromPath(pathname: string): string | null {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale
    }
  }
  return null
}

/**
 * Strip the locale prefix from a pathname.
 * e.g., /ar/login → /login, /en/dashboard → /dashboard
 */
function stripLocalePrefix(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}`) return '/'
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1)
  }
  return pathname
}

/**
 * Add security headers to a response.
 */
function addSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  response.headers.delete('x-powered-by')

  const { pathname } = request.nextUrl
  const isStaticAsset =
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/_next/image') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|woff2?|ttf|eot|css|js|map)$/i)

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

  // ── Static assets: pass through with security headers ──
  if (pathname.startsWith('/_next/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── Socket.IO: rewrite to NestJS backend ──
  if (pathname.startsWith('/socket.io')) {
    const apiInternalUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'
    const targetUrl = new URL(request.url)
    try {
      const apiParsed = new URL(apiInternalUrl)
      targetUrl.protocol = apiParsed.protocol || 'http:'
      targetUrl.hostname = apiParsed.hostname
      targetUrl.port = apiParsed.port || '3001'
    } catch {
      targetUrl.protocol = 'http:'
      targetUrl.hostname = '127.0.0.1'
      targetUrl.port = '3001'
    }
    return addSecurityHeaders(NextResponse.rewrite(targetUrl), request)
  }

  // ── API routes: pass through with security headers ──
  if (pathname.startsWith('/api/')) {
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // ── i18n: Locale detection & redirect ──
  // With localePrefix:'always', ALL paths must have a locale prefix.
  // If the path doesn't have one, detect the best locale and redirect.
  const pathLocale = extractLocaleFromPath(pathname)

  if (!pathLocale) {
    // No locale prefix in URL — detect and redirect
    const targetLocale = detectLocale(request)
    const url = request.nextUrl.clone()
    url.pathname = `/${targetLocale}${pathname}`
    const response = NextResponse.redirect(url)
    // Set cookie so we don't re-detect on every request
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
  // Strip locale prefix to check the actual route
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
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|logo\\.svg|logo-.*\\.png|sw\\.js|manifest\\.json|robots\\.txt).*)',
  ],
}
