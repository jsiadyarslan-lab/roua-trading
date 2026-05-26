import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

// ── Smart locale proximity mapping (must match middleware.ts) ──
const LOCALE_PROXIMITY: Record<string, string> = {
  pt: 'es', it: 'es', ca: 'es', gl: 'es',
  ro: 'fr',
  nl: 'en', de: 'en', sv: 'en', no: 'en', da: 'en', fi: 'en',
  ru: 'en', uk: 'en', pl: 'en', cs: 'en',
  zh: 'en', ja: 'en', ko: 'en', hi: 'en', th: 'en', vi: 'en', id: 'en', ms: 'en',
  az: 'tr', kk: 'tr', uz: 'tr', ky: 'tr',
  ku: 'ar', fa: 'ar', he: 'ar', ur: 'ar',
};

function resolveLocale(acceptLanguage: string): string | null {
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

export default getRequestConfig(async ({ requestLocale }) => {
  // With localePrefix: 'as-needed', next-intl provides the locale
  // from the URL path (e.g., /en/dashboard → 'en') or from middleware.
  let locale = await requestLocale;

  // Fallback: if no locale resolved from path, try cookie → browser → proximity → default
  if (!locale || !routing.locales.includes(locale as any)) {
    // Try cookie (imported lazily to avoid issues in edge runtime)
    try {
      const { cookies, headers } = await import('next/headers');
      const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
      if (cookieLocale && routing.locales.includes(cookieLocale as any)) {
        locale = cookieLocale;
      }
      if (!locale) {
        const acceptLanguage = (await headers()).get('accept-language') || '';
        locale = resolveLocale(acceptLanguage) || routing.defaultLocale;
      }
    } catch {
      locale = routing.defaultLocale;
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
