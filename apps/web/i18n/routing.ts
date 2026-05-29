import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ar', 'en', 'fr', 'tr', 'es', 'zh', 'ru', 'hi', 'pt', 'de', 'ja', 'ko', 'id', 'vi', 'th', 'it', 'pl', 'nl', 'ms', 'he', 'sv', 'uk', 'fa', 'ur', 'fil', 'da', 'no', 'fi', 'cs', 'hu', 'ro', 'bn'],
  defaultLocale: 'ar',
  // PWA FIX: Changed from 'always' to 'as-needed'
  // With 'always', ALL paths without locale prefix get 307 redirected
  // (e.g., /icon-192.png → /ar/icon-192.png), which breaks PWA icons.
  // With 'as-needed', the default locale (ar) doesn't need a prefix,
  // so /icon-192.png is served directly without redirect.
  // Non-default locales still use prefixes: /en/dashboard, /fr/dashboard, etc.
  localePrefix: 'as-needed',
});
