// ═══════════════════════════════════════════════════════════
// UNIFY (4.1): Single source of truth for timeframe formats
// ═══════════════════════════════════════════════════════════
//
// Previously, timeframe-to-seconds, timeframe-to-label, and
// Binance interval mappings were duplicated across:
//   - useChartWebSocket.ts  (tfSecondsMap)
//   - RouaChart.tsx         (tfSecondsRef + TIMEFRAMES.find)
//   - SmartGrid.tsx         (TIMEFRAME_OPTIONS)
//   - config.ts             (BINANCE_INTERVALS)
//   - ScannerToolbar.tsx    (inline TIMEFRAMES)
//
// All consumers should import from this single file instead.
// ═══════════════════════════════════════════════════════════

import type { TimeframeOption } from './types';

// ── Timeframe → Seconds ──────────────────────────────────
export const TIMEFRAME_SECONDS: Record<string, number> = {
  '1s': 1, '5s': 5, '15s': 15, '30s': 30,
  '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
  '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '8h': 28800, '12h': 43200,
  '1day': 86400, '3day': 259200,
  '1week': 604800,
  '1month': 2592000, '3month': 7776000,
} as const;

// ── Timeframe → Arabic Labels ────────────────────────────
export const TIMEFRAME_LABELS_AR: Record<string, string> = {
  '1s': '١ ث', '5s': '٥ ث', '15s': '١٥ ث', '30s': '٣٠ ث',
  '1min': '١ د', '5min': '٥ د', '15min': '١٥ د', '30min': '٣٠ د',
  '1h': '١ س', '2h': '٢ س', '4h': '٤ س', '6h': '٦ س', '8h': '٨ س', '12h': '١٢ س',
  '1day': '١ ي', '3day': '٣ ي',
  '1week': '١ أ',
  '1month': '١ ش', '3month': '٣ ش',
} as const;

// ── Timeframe → English Labels ───────────────────────────
export const TIMEFRAME_LABELS_EN: Record<string, string> = {
  '1s': '1s', '5s': '5s', '15s': '15s', '30s': '30s',
  '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '8h': '8H', '12h': '12H',
  '1day': '1D', '3day': '3D',
  '1week': '1W',
  '1month': '1M', '3month': '3M',
} as const;

// ── Full Timeframe List (for dropdowns, toolbars, etc.) ──
export interface TimeframeInfo {
  value: string;       // Normalized API value (e.g. '1min', '1h', '1day')
  labelAr: string;     // Arabic display label
  labelEn: string;     // English display label
  minutes: number;     // Duration in minutes (fractional for seconds)
  seconds: number;     // Duration in seconds
  category: TimeframeOption['category'];
}

export const TIMEFRAME_LIST: TimeframeInfo[] = [
  { value: '1s',     labelAr: '١ ث',  labelEn: '1s',  minutes: 1/60,      seconds: 1,       category: 'seconds' },
  { value: '5s',     labelAr: '٥ ث',  labelEn: '5s',  minutes: 5/60,      seconds: 5,       category: 'seconds' },
  { value: '15s',    labelAr: '١٥ ث', labelEn: '15s', minutes: 15/60,     seconds: 15,      category: 'seconds' },
  { value: '30s',    labelAr: '٣٠ ث', labelEn: '30s', minutes: 30/60,     seconds: 30,      category: 'seconds' },
  { value: '1min',   labelAr: '١ د',  labelEn: '1m',  minutes: 1,         seconds: 60,      category: 'intraday' },
  { value: '5min',   labelAr: '٥ د',  labelEn: '5m',  minutes: 5,         seconds: 300,     category: 'intraday' },
  { value: '15min',  labelAr: '١٥ د', labelEn: '15m', minutes: 15,        seconds: 900,     category: 'intraday' },
  { value: '30min',  labelAr: '٣٠ د', labelEn: '30m', minutes: 30,        seconds: 1800,    category: 'intraday' },
  { value: '1h',     labelAr: '١ س',  labelEn: '1H',  minutes: 60,        seconds: 3600,    category: 'intraday' },
  { value: '2h',     labelAr: '٢ س',  labelEn: '2H',  minutes: 120,       seconds: 7200,    category: 'intraday' },
  { value: '4h',     labelAr: '٤ س',  labelEn: '4H',  minutes: 240,       seconds: 14400,   category: 'intraday' },
  { value: '6h',     labelAr: '٦ س',  labelEn: '6H',  minutes: 360,       seconds: 21600,   category: 'intraday' },
  { value: '8h',     labelAr: '٨ س',  labelEn: '8H',  minutes: 480,       seconds: 28800,   category: 'intraday' },
  { value: '12h',    labelAr: '١٢ س', labelEn: '12H', minutes: 720,       seconds: 43200,   category: 'intraday' },
  { value: '1day',   labelAr: '١ ي',  labelEn: '1D',  minutes: 1440,      seconds: 86400,   category: 'daily' },
  { value: '3day',   labelAr: '٣ ي',  labelEn: '3D',  minutes: 4320,      seconds: 259200,  category: 'daily' },
  { value: '1week',  labelAr: '١ أ',  labelEn: '1W',  minutes: 10080,     seconds: 604800,  category: 'weekly' },
  { value: '1month', labelAr: '١ ش',  labelEn: '1M',  minutes: 43200,     seconds: 2592000, category: 'monthly' },
  { value: '3month', labelAr: '٣ ش',  labelEn: '3M',  minutes: 129600,    seconds: 7776000, category: 'monthly' },
] as const;

// ── Backward-compatible TIMEFRAMES array (matches types.ts TimeframeOption[]) ──
// Maps TIMEFRAME_LIST entries to the legacy TimeframeOption format.
// Consumers that still use {label, value, minutes, category} can import this.
import { TIMEFRAMES } from './types';
export { TIMEFRAMES };

// ── Utility: Timeframe → Seconds ─────────────────────────
export function timeframeToSeconds(tf: string): number {
  return TIMEFRAME_SECONDS[normalizeTimeframe(tf)] ?? 60;
}

// ── Utility: Timeframe → Label ───────────────────────────
export function timeframeToLabel(tf: string, lang: 'ar' | 'en' = 'en'): string {
  const normalized = normalizeTimeframe(tf);
  if (lang === 'ar') {
    return TIMEFRAME_LABELS_AR[normalized] ?? tf;
  }
  return TIMEFRAME_LABELS_EN[normalized] ?? tf;
}

// ── Utility: Normalize Timeframe ─────────────────────────
// Converts variant formats to the canonical API value:
//   '1m' → '1min', '1H' → '1h', '1D' → '1day', '1W' → '1week', etc.
const NORMALIZE_MAP: Record<string, string> = {
  // Short minute aliases → canonical
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  // Uppercase hour aliases → lowercase canonical
  '1H': '1h', '2H': '2h', '4H': '4h', '6H': '6h', '8H': '8h', '12H': '12h',
  // Daily+ shorthand aliases → canonical
  '1D': '1day', '3D': '3day', '1W': '1week', '1M': '1month', '3M': '3month',
  // Binance-style → canonical
  '1d': '1day', '3d': '3day', '1w': '1week',
};

export function normalizeTimeframe(tf: string): string {
  return NORMALIZE_MAP[tf] ?? tf;
}

// ── Binance Interval Map ─────────────────────────────────
// Maps normalized (canonical) timeframe values to Binance API interval strings.
// Seconds-level timeframes map to '1m' (Binance minimum).
export const BINANCE_INTERVAL_MAP: Record<string, string> = {
  '1s': '1m', '5s': '1m', '15s': '1m', '30s': '1m',       // seconds → 1m (Binance min)
  '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
  '1day': '1d', '3day': '3d', '1week': '1w', '1month': '1M', '3month': '3M',
} as const;

// ── Convenience: Resolve a timeframe to Binance interval ──
export function timeframeToBinanceInterval(tf: string): string {
  return BINANCE_INTERVAL_MAP[normalizeTimeframe(tf)] ?? '1m';
}

// ── SmartGrid / MultiChart default timeframes ────────────
export const DEFAULT_MTF_TIMEFRAMES = ['15min', '1h', '4h', '1day', '5min', '1min'] as const;
