import { MetadataRoute } from 'next'

/**
 * V267: Sitemap now emits ALL 32 locales × 8 routes = 256 URLs.
 *
 * Previously only 8 Arabic URLs were declared, meaning Google could not
 * discover the localized variants (/en/dashboard, /fr/dashboard, /ja/dashboard, etc.).
 * This was the single biggest SEO gap — 31 of 32 markets were invisible to search engines.
 *
 * Each entry includes `alternates.languages` so Google understands the locale variants
 * of the same content (avoids duplicate-content penalty + ensures correct locale is
 * served to users in each market).
 *
 * Routes are limited to public-facing pages (landing, login, public dashboard routes
 * that work without auth). Authenticated-only routes are intentionally excluded.
 */
const ALL_LOCALES = [
  'ar', 'en', 'fr', 'tr', 'es', 'zh', 'ru', 'hi', 'pt', 'de',
  'ja', 'ko', 'id', 'vi', 'th', 'it', 'pl', 'nl', 'ms', 'he',
  'sv', 'uk', 'fa', 'ur', 'fil', 'da', 'no', 'fi', 'cs', 'hu',
  'ro', 'bn',
] as const;

const ROUTES = [
  { path: '', priority: 1.0, changeFrequency: 'daily' as const },           // landing
  { path: '/login', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/dashboard', priority: 0.9, changeFrequency: 'daily' as const },
  { path: '/dashboard/signals', priority: 0.8, changeFrequency: 'hourly' as const },
  { path: '/dashboard/scanner', priority: 0.8, changeFrequency: 'hourly' as const },
  { path: '/dashboard/news', priority: 0.7, changeFrequency: 'hourly' as const },
  { path: '/dashboard/portfolio', priority: 0.7, changeFrequency: 'daily' as const },
  { path: '/dashboard/ai', priority: 0.6, changeFrequency: 'weekly' as const },
];

const BASE_URL = 'https://roua-trading-production.up.railway.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const route of ROUTES) {
    for (const locale of ALL_LOCALES) {
      // 'ar' is the default locale — no prefix (per routing.ts: localePrefix: 'as-needed').
      const localePrefix = locale === 'ar' ? '' : `/${locale}`;
      const url = `${BASE_URL}${localePrefix}${route.path}`;

      // Build hreflang alternates map: { 'ar': '/', 'en': '/en', ... }
      // For non-root routes, the locale prefix is prepended to the path.
      const languages: Record<string, string> = {};
      for (const altLocale of ALL_LOCALES) {
        const altPrefix = altLocale === 'ar' ? '' : `/${altLocale}`;
        languages[altLocale] = `${altPrefix}${route.path}`;
      }

      entries.push({
        url,
        lastModified: new Date(),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: { languages },
      });
    }
  }

  return entries;
}
