import createMiddleware from 'next-intl/middleware';
import { routing } from '../i18n/routing';
import { NextRequest, NextResponse } from 'next/server';

// ── Smart locale detection ──
const LOCALE_PROXIMITY: Record<string, string> = {
  pt: 'es', it: 'es', ca: 'es', gl: 'es',
  ro: 'fr',
  nl: 'en', de: 'en', sv: 'en', no: 'en', da: 'en', fi: 'en',
  ru: 'en', uk: 'en', pl: 'en', cs: 'en',
  zh: 'en', ja: 'en', ko: 'en', hi: 'en', th: 'en', vi: 'en', id: 'en', ms: 'en',
  az: 'tr', kk: 'tr', uz: 'tr', ky: 'tr',
  ku: 'ar', fa: 'ar', he: 'ar', ur: 'ar',
};

function detectLocaleFromBrowser(acceptLanguage: string): string | null {
  if (!acceptLanguage) return null;
  const languages = acceptLanguage.split(',').map(lang => {
    const [code, qStr] = lang.trim().split(';');
    const q = qStr ? parseFloat(qStr.split('=')[1]) : 1;
    return { code: code.trim(), q };
  });
  languages.sort((a, b) => b.q - a.q);

  for (const { code } of languages) {
    const baseLang = code.split('-')[0].toLowerCase();
    if (routing.locales.includes(code.toLowerCase() as any)) return code.toLowerCase();
    if (routing.locales.includes(baseLang as any)) return baseLang;
    if (LOCALE_PROXIMITY[baseLang]) return LOCALE_PROXIMITY[baseLang];
  }
  return null;
}

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes, static files, _next
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if the URL already has a locale prefix
  const pathLocale = routing.locales.find(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );
  if (pathLocale) {
    return intlMiddleware(request);
  }

  // No locale prefix — detect and redirect
  // Priority: cookie → browser detection → default locale
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  let targetLocale = routing.defaultLocale;

  if (cookieLocale && routing.locales.includes(cookieLocale as any)) {
    targetLocale = cookieLocale;
  } else {
    const acceptLanguage = request.headers.get('accept-language') || '';
    const detected = detectLocaleFromBrowser(acceptLanguage);
    if (detected) targetLocale = detected;
  }

  // Redirect to the locale-prefixed URL
  const url = request.nextUrl.clone();
  url.pathname = `/${targetLocale}${pathname}`;
  const response = NextResponse.redirect(url);
  if (!cookieLocale) {
    response.cookies.set('NEXT_LOCALE', targetLocale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|static|.*\\..*).*)'],
};
