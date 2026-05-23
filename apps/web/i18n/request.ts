import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { cookies, headers } from 'next/headers';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // 1. Cookie takes highest priority (user's explicit choice)
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
  if (cookieLocale && routing.locales.includes(cookieLocale as any)) {
    locale = cookieLocale;
  }

  // 2. Browser Accept-Language header
  if (!locale) {
    const acceptLanguage = (await headers()).get('accept-language') || '';
    const browserLocale = acceptLanguage.split(',')[0]?.split('-')[0];
    if (browserLocale && routing.locales.includes(browserLocale as any)) {
      locale = browserLocale;
    }
  }

  // 3. Default to Arabic
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
