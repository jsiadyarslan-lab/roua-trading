/**
 * i18n utility functions for RTL/LTR detection and locale support.
 *
 * Centralizes RTL locale detection so every file uses the same logic.
 * Supported RTL locales: ar (Arabic), he (Hebrew), fa (Farsi/Persian), ur (Urdu).
 */

/** Set of locale codes that use right-to-left text direction. */
export const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

/** Returns true if the given locale uses RTL text direction. */
export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

/** Returns 'rtl' for RTL locales, 'ltr' otherwise. */
export function getDirection(locale: string): 'rtl' | 'ltr' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
