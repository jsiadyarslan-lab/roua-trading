import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

// ── Smart locale proximity mapping (must match middleware.ts) ──
const LOCALE_PROXIMITY: Record<string, string> = {
  // Spanish family
  ca: 'es', gl: 'es',
  // Chinese family
  zh_CN: 'zh', zh_TW: 'zh', zh_HK: 'zh', zh_SG: 'zh',
  // Portuguese family
  pt_BR: 'pt', pt_PT: 'pt',
  // Hindi family
  hi_IN: 'hi',
  // Korean
  ko_KR: 'ko',
  // Indonesian family
  id_ID: 'id',
  // Vietnamese
  vi_VN: 'vi',
  // Thai
  th_TH: 'th',
  // Italian
  it_IT: 'it', it_CH: 'it',
  // Polish
  pl_PL: 'pl',
  // Dutch family
  nl_BE: 'nl', nl_NL: 'nl', af: 'nl',
  // Malay family
  ms_MY: 'ms', ms_BN: 'ms',
  // Hebrew
  he_IL: 'he',
  // Swedish family
  sv_SE: 'sv', sv_FI: 'sv',
  // Ukrainian
  uk_UA: 'uk',
  // Persian family
  fa_IR: 'fa', fa_AF: 'fa', tg: 'fa',
  // Urdu
  ur_PK: 'ur', ur_IN: 'ur',
  // Filipino
  fil_PH: 'fil',
  // Danish
  da_DK: 'da', da_GL: 'da',
  // Norwegian
  no_NO: 'no', nb: 'no', nn: 'no', nb_NO: 'no', nn_NO: 'no',
  // Finnish
  fi_FI: 'fi',
  // Czech
  cs_CZ: 'cs', cs_SK: 'cs',
  // Hungarian
  hu_HU: 'hu',
  // Romanian
  ro_RO: 'ro', ro_MD: 'ro', mo: 'ro',
  // Bengali
  bn_BD: 'bn', bn_IN: 'bn',
  // Remaining proximity mappings (no dedicated locale yet)
  bg: 'ru', mk: 'ru', sr: 'ru', hr: 'ru', sl: 'ru', bs: 'ru',
  az: 'tr', kk: 'tr', uz: 'tr', ky: 'tr', tk: 'tr',
  ku: 'ar',
  eo: 'en',
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
