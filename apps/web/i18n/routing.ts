import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ar', 'en', 'fr', 'tr', 'es', 'zh', 'ru', 'hi', 'pt', 'de', 'ja', 'ko', 'id', 'vi', 'th', 'it', 'pl', 'nl', 'ms', 'he', 'sv', 'uk', 'fa', 'ur', 'fil', 'da', 'no', 'fi', 'cs', 'hu', 'ro', 'bn'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});
