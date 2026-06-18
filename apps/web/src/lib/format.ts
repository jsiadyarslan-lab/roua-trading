/**
 * V268: Locale-aware formatting utilities.
 *
 * These helpers replace the hardcoded 'en-US' / 'en' calls scattered across
 * the codebase. They accept the user's locale (from useLocale()) and pass it
 * to Intl.NumberFormat / Intl.DateTimeFormat so users see numbers, currencies,
 * and dates in their locale's native format.
 *
 * Usage in client components:
 *   import { useLocale } from 'next-intl';
 *   import { formatCurrency, formatNumber, formatDate } from '@/lib/format';
 *   const locale = useLocale();
 *   <span>{formatCurrency(1234.56, locale)}</span>
 *
 * Usage in server components / API routes:
 *   import { formatCurrency } from '@/lib/format';
 *   <span>{formatCurrency(1234.56, 'fr')}</span>
 *
 * Defaults:
 *   - currency: USD (most trading pairs are USD-denominated)
 *   - decimals: 2 for currency, adaptive for plain numbers
 *   - date style: medium (e.g., "Jun 18, 2026, 3:04 PM")
 *
 * Fallback: if Intl data for a locale isn't available in the runtime,
 * Intl.* silently falls back to 'en-US' — no crash.
 */

/**
 * Format a number as a currency string in the user's locale.
 *
 * Examples:
 *   formatCurrency(1234.56, 'en') → "$1,234.56"
 *   formatCurrency(1234.56, 'fr') → "1 234,56 $US"
 *   formatCurrency(1234.56, 'ar') → "١٬٢٣٤٫٥٦ $US"
 *   formatCurrency(1234.56, 'de') → "1.234,56 $"
 *   formatCurrency(1234.56, 'ja') → "$1,234.56"
 */
export function formatCurrency(
  value: number | null | undefined,
  locale: string = 'en',
  currency: string = 'USD',
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(value);
  } catch {
    // Fallback for invalid locale codes
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(value);
  }
}

/**
 * Format a number with locale-aware grouping and decimals.
 *
 * Examples:
 *   formatNumber(1234.567, 'en') → "1,234.57"
 *   formatNumber(1234.567, 'fr') → "1 234,57"
 *   formatNumber(1234.567, 'de') → "1.234,57"
 */
export function formatNumber(
  value: number | null | undefined,
  locale: string = 'en',
  decimals: number = 2,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options,
    }).format(value);
  }
}

/**
 * Format a price with adaptive decimals based on magnitude.
 * - Prices >= 1000: 2 decimals
 * - Prices 1-999: 2 decimals
 * - Prices 0.01-0.99: 4 decimals
 * - Prices < 0.01: 6 decimals
 *
 * Examples:
 *   formatPrice(65432.10, 'en') → "65,432.10"
 *   formatPrice(0.0875, 'en') → "0.087500"
 *   formatPrice(0.0001234, 'en') → "0.000123"
 */
export function formatPrice(
  value: number | null | undefined,
  locale: string = 'en',
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  let decimals = 2;
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) decimals = 6;
  else if (abs < 1) decimals = 4;
  else if (abs < 100) decimals = 2;
  else decimals = 2;
  return formatNumber(value, locale, decimals);
}

/**
 * Format a percentage value.
 *
 * Examples:
 *   formatPercent(12.5, 'en') → "12.50%"
 *   formatPercent(12.5, 'fr') → "12,50 %"
 *   formatPercent(-3.2, 'ar') → "‐٣٫٢٠٪"
 */
export function formatPercent(
  value: number | null | undefined,
  locale: string = 'en',
  decimals: number = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value / 100);
  } catch {
    return `${value.toFixed(decimals)}%`;
  }
}

/**
 * Format a date in the user's locale.
 *
 * Examples:
 *   formatDate(new Date(), 'en') → "Jun 18, 2026, 3:04 PM"
 *   formatDate(new Date(), 'fr') → "18 juin 2026, 15:04"
 *   formatDate(new Date(), 'ar') → "١٨ يونيو ٢٠٢٦، ٣:٠٤ م"
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  locale: string = 'en',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  if (!date) return '—';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(d);
  }
}

/**
 * Format a date with only the date part (no time).
 *
 * Examples:
 *   formatDateOnly(new Date(), 'en') → "Jun 18, 2026"
 *   formatDateOnly(new Date(), 'fr') → "18 juin 2026"
 */
export function formatDateOnly(
  date: Date | string | number | null | undefined,
  locale: string = 'en',
): string {
  return formatDate(date, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date with only the time part.
 *
 * Examples:
 *   formatTime(new Date(), 'en') → "3:04 PM"
 *   formatTime(new Date(), 'fr') → "15:04"
 */
export function formatTime(
  date: Date | string | number | null | undefined,
  locale: string = 'en',
): string {
  return formatDate(date, locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a relative time (e.g., "3 minutes ago", "in 2 hours").
 *
 * Examples:
 *   formatRelativeTime(-300000, 'en') → "5 minutes ago"
 *   formatRelativeTime(-300000, 'fr') → "il y a 5 minutes"
 *
 * @param deltaMs Time difference in milliseconds. Negative = past, positive = future.
 */
export function formatRelativeTime(deltaMs: number, locale: string = 'en'): string {
  if (!Number.isFinite(deltaMs)) return '—';
  const seconds = Math.round(deltaMs / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (Math.abs(days) >= 1) return rtf.format(-days, 'day');
    if (Math.abs(hours) >= 1) return rtf.format(-hours, 'hour');
    if (Math.abs(minutes) >= 1) return rtf.format(-minutes, 'minute');
    return rtf.format(-seconds, 'second');
  } catch {
    // Fallback
    const absSec = Math.abs(seconds);
    if (absSec < 60) return `${absSec}s ago`;
    if (absSec < 3600) return `${Math.round(absSec / 60)}m ago`;
    if (absSec < 86400) return `${Math.round(absSec / 3600)}h ago`;
    return `${Math.round(absSec / 86400)}d ago`;
  }
}
