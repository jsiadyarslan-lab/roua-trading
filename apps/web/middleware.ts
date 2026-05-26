import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

// ── Smart locale detection ──
// Maps unsupported browser locales to the closest supported locale.
// This ensures visitors from Brazil (pt-BR) see Spanish, not Arabic.
const LOCALE_PROXIMITY: Record<string, string> = {
  // Portuguese → Spanish (closest Romance language we support)
  pt: 'es',
  // Italian → Spanish (closest Romance language we support)
  it: 'es',
  // Catalan → Spanish
  ca: 'es',
  // Galician → Spanish
  gl: 'es',
  // Romanian → French (closest Romance language)
  ro: 'fr',
  // Dutch → English
  nl: 'en',
  // German → English
  de: 'en',
  // Scandinavian → English
  sv: 'en',
  no: 'en',
  da: 'en',
  fi: 'en',
  // Slavic → English
  ru: 'en',
  uk: 'en',
  pl: 'en',
  cs: 'en',
  // Asian → English
  zh: 'en',
  ja: 'en',
  ko: 'en',
  hi: 'en',
  th: 'en',
  vi: 'en',
  id: 'en',
  ms: 'en',
  // Turkic languages → Turkish
  az: 'tr',
  kk: 'tr',
  uz: 'tr',
  ky: 'tr',
  // Kurdish → Arabic
  ku: 'ar',
  // Persian/Dari → Arabic
  fa: 'ar',
  // Hebrew → Arabic
  he: 'ar',
  // Urdu → Arabic
  ur: 'ar',
};

/**
 * Detects the best matching locale from the browser's Accept-Language header.
 * Priority: exact match → base language match → proximity mapping → default
 */
function detectLocaleFromBrowser(acceptLanguage: string): string | null {
  if (!acceptLanguage) return null;

  // Parse Accept-Language: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  const languages = acceptLanguage.split(',').map(lang => {
    const [code, qStr] = lang.trim().split(';');
    const q = qStr ? parseFloat(qStr.split('=')[1]) : 1;
    return { code: code.trim(), q };
  });

  // Sort by quality (highest first)
  languages.sort((a, b) => b.q - a.q);

  for (const { code } of languages) {
    const baseLang = code.split('-')[0].toLowerCase();

    // 1. Exact match (e.g., "ar" or "ar-SA")
    if (routing.locales.includes(code.toLowerCase() as any)) {
      return code.toLowerCase();
    }

    // 2. Base language match (e.g., "pt-BR" → base "pt")
    if (routing.locales.includes(baseLang as any)) {
      return baseLang;
    }

    // 3. Proximity mapping (e.g., "pt" → "es")
    if (LOCALE_PROXIMITY[baseLang]) {
      return LOCALE_PROXIMITY[baseLang];
    }
  }

  return null;
}

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip middleware for API routes, static files, _next ──
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.includes('.') // static files like favicon, images, etc.
  ) {
    return NextResponse.next();
  }

  // ── Check for existing locale cookie (user's explicit choice) ──
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && routing.locales.includes(cookieLocale as any)) {
    // User has explicitly chosen a locale — use standard intl middleware
    return intlMiddleware(request);
  }

  // ── Check if the URL already has a locale prefix ──
  const pathLocale = routing.locales.find(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );
  if (pathLocale) {
    // URL already has a locale — proceed normally
    return intlMiddleware(request);
  }

  // ── Smart detection for first-time visitors without cookie ──
  const acceptLanguage = request.headers.get('accept-language') || '';
  const detectedLocale = detectLocaleFromBrowser(acceptLanguage);

  if (detectedLocale && detectedLocale !== routing.defaultLocale) {
    // Redirect to the detected locale prefix
    // e.g., Brazilian visitor → /es/dashboard
    const url = request.nextUrl.clone();
    url.pathname = `/${detectedLocale}${pathname}`;
    const response = NextResponse.redirect(url);
    // Set cookie so we don't re-detect on every request
    response.cookies.set('NEXT_LOCALE', detectedLocale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
    return response;
  }

  // Default: Arabic (no prefix) or couldn't detect — use standard middleware
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except:
  // - API routes
  // - _next (Next.js internals)
  // - Static files (images, fonts, etc.)
  matcher: [
    '/((?!api|_next|static|.*\\..*).*)',
  ],
};
