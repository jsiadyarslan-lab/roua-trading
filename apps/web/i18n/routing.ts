import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ar', 'en', 'fr', 'tr', 'es', 'zh', 'ru', 'hi', 'pt', 'de', 'ja'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});
