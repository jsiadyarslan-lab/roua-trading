// ═══════════════════════════════════════════════════════════
// ROUA Chart — Shared Utilities
// Single source of truth for common chart helper functions
// and constants to eliminate code duplication.
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Time Sanitization ─────────────────────────────────────
// Ensures time is always a Unix timestamp (seconds), never a
// Date object or string. Prevents the fatal "Cannot update
// oldest data, last time=[object Object]" error from LWC.

export function sanitizeTime(t: unknown): number | null {
  if (typeof t === 'number' && isFinite(t)) return t;
  if (t instanceof Date) return Math.floor(t.getTime() / 1000);
  if (typeof t === 'string') {
    const ts = new Date(t).getTime();
    return isFinite(ts) ? Math.floor(ts / 1000) : null;
  }
  return null;
}

/**
 * Sanitize time for indicator calculations — returns 0 instead of null
 * for invalid inputs (indicators need a numeric fallback, not null).
 */
export function sanitizeTimeForIndicator(t: unknown): number {
  if (typeof t === 'number' && isFinite(t)) return t;
  if (t instanceof Date) return Math.floor(t.getTime() / 1000);
  if (typeof t === 'string') {
    const ts = new Date(t).getTime();
    return isFinite(ts) ? Math.floor(ts / 1000) : 0;
  }
  return 0;
}

// ── Value Validation ─────────────────────────────────────
// Checks if a value is a valid finite number (not null, undefined, NaN, or Infinity).
// Essential for filtering LWC data — passing NaN/Infinity crashes LWC with "Value is null".

export function isValidNumber(v: unknown): v is number {
  return v !== null && v !== undefined && typeof v === 'number' && isFinite(v);
}

// ── OHLC Sanitization ─────────────────────────────────────
// FIX: Binance 1m/5m data often has "near-flat" candles where the OHLC range
// is microscopically small (e.g., $0.01 on a $73,000 BTC price). These render
// as invisible dots because the candle body/wicks are less than 1 pixel tall.
//
// The old sanitization only checked `high === low` (exactly flat), missing
// near-flat candles where high-low is just a few cents. This function ensures
// the OHLC range is ALWAYS at least 0.05% of the close price, which produces
// a visible candle body on any timeframe and zoom level.
//
// Minimum range = close * MIN_OHLC_RANGE_RATIO (0.0005 = 0.05%)
// For BTC @ $73,000: min range = $36.50 (clearly visible)
// For EUR/USD @ 1.08: min range = $0.00054 (2 pips — visible on forex)
// For XAU/USD @ $2,300: min range = $1.15 (visible)

export const MIN_OHLC_RANGE_RATIO = 0.00001; // 0.001% — only expand truly flat candles (range=$0 on $73K BTC)
// NOTE: Previous value was 0.0005 (0.05%) which artificially expanded 73.8% of
// Binance 1m candles by $36.50 each, destroying real price action. Real Binance
// 1m candles have ranges as small as $0.01 (1 cent tick size), which is valid
// micro-consolidation — NOT a "dot". Only candles with range=0 (exactly flat)
// or range < 0.001% (sub-pixel at any zoom) need expansion.

export interface SanitizeOhlcResult {
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Sanitize OHLC values to ensure:
 * 1. high >= max(open, close) and low <= min(open, close)
 * 2. The range (high - low) is at least MIN_OHLC_RANGE_RATIO * close
 *    (prevents "dot" rendering on near-flat candles from Binance 1m/5m data)
 * 3. All values are valid finite numbers > 0
 */
export function sanitizeOhlc(open: number, high: number, low: number, close: number): SanitizeOhlcResult {
  // Ensure valid numbers
  if (!isValidNumber(close) || close <= 0) return { open, high, low, close };
  if (!isValidNumber(open) || open <= 0) open = close;
  if (!isValidNumber(high) || high <= 0) high = Math.max(open, close);
  if (!isValidNumber(low) || low <= 0) low = Math.min(open, close);

  // Enforce OHLC relationships: high >= max(open, close), low <= min(open, close)
  if (high < Math.max(open, close)) high = Math.max(open, close);
  if (low > Math.min(open, close)) low = Math.min(open, close);

  // FIX: Check if the range is too small to render visibly.
  // Near-flat candles (e.g., high-low = $0.01 on $73,000 BTC) render as dots
  // because the body/wicks are less than 1 pixel. Expand the range to at least
  // MIN_OHLC_RANGE_RATIO * close, centered on the candle's midpoint.
  const range = high - low;
  const minRange = close * MIN_OHLC_RANGE_RATIO;

  if (range < minRange) {
    const midpoint = (high + low) / 2;
    const halfMin = minRange / 2;
    high = midpoint + halfMin;
    low = midpoint - halfMin;
    // Re-enforce after expansion: high must cover open/close, low must cover them
    if (high < Math.max(open, close)) high = Math.max(open, close);
    if (low > Math.min(open, close)) low = Math.min(open, close);
  }

  return { open, high, low, close };
}

// ── Storage Key Helper ───────────────────────────────────
// Generates a prefixed localStorage key that includes the userId.
// Prevents data leakage between different user sessions.
// Used by: useChartStateStore, ChartTemplate, DrawingManager,
// usePaperTradesStore, useNotificationStore, useSymbolStore,
// usePositionsStore, useBotStore, useContentAgentStore

let _cachedUserId: string | null = null;

function getUserId(): string {
  if (_cachedUserId !== null) return _cachedUserId;
  try {
    // Try to read from Zustand persisted store
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('roua-auth-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        const uid = parsed?.state?.user?.id;
        if (uid) {
          _cachedUserId = String(uid);
          return _cachedUserId;
        }
      }
    }
  } catch { /* ignore */ }
  return 'guest';
}

export function getStorageKey(prefix: string, suffix?: string): string {
  const userId = getUserId();
  const parts = [prefix, userId];
  if (suffix) parts.push(suffix);
  return parts.join(':');
}

/** Invalidate the cached user ID when auth state changes */
export function invalidateStorageKeyCache(): void {
  _cachedUserId = null;
}

// ── Chart Color Constants ────────────────────────────────
// Single source of truth for repeated color values across the chart system.
// Previously, volume colors were duplicated 6+ times.

export const CHART_COLORS = {
  // Candle colors
  upColor: '#3fb950',
  downColor: '#f85149',

  // Volume histogram colors (used in useChart.ts setCandles and updateCandle)
  volumeUp: 'rgba(63,185,80,0.25)',
  volumeDown: 'rgba(248,81,73,0.25)',

  // Indicator colors
  bbBand: 'rgba(88,166,255,0.5)',
  bbMiddle: 'rgba(88,166,255,0.3)',
  bbFill: 'rgba(88,166,255,0.08)',
  bbFillBottom: 'rgba(88,166,255,0.06)',

  macdLine: '#58a6ff',
  macdSignal: '#f97316',
  macdHistUp: 'rgba(63,185,80,0.5)',
  macdHistDown: 'rgba(248,81,73,0.5)',

  stochK: '#a855f7',
  stochD: '#fbbf24',

  adxLine: '#fbbf24',
  adxPdi: '#3fb950',
  adxMdi: '#f85149',

  ichimokuTenkan: '#2dd4bf',
  ichimokuKijun: '#f87171',
  ichimokuSenkouA: 'rgba(45,212,191,0.4)',
  ichimokuSenkouB: 'rgba(248,113,113,0.4)',
  ichimokuChikou: 'rgba(255,255,255,0.3)',
  ichimokuCloudTop: 'rgba(45,212,191,0.08)',
  ichimokuCloudBottom: 'rgba(248,113,113,0.08)',

  donchian: 'rgba(249,115,22,0.6)',
  donchianMiddle: 'rgba(249,115,22,0.3)',
  donchianFill: 'rgba(249,115,22,0.08)',

  superTrendUp: '#3fb950',
  superTrendDown: '#f85149',

  pivotPP: '#a78bfa',

  // Grid & crosshair
  grid: 'rgba(42,49,60,0.5)',
  crosshair: 'rgba(160,200,220,0.3)',
} as const;

// ── Binary Search ────────────────────────────────────────
// O(log n) replacement for candles.findIndex(c => c.time === target)
// Used in crosshair move handler (called on every mouse move).

export function binarySearchByTime(
  candles: ReadonlyArray<{ time: number }>,
  targetTime: number
): number {
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midTime = candles[mid].time;
    if (midTime === targetTime) return mid;
    if (midTime < targetTime) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1; // Not found
}

// ── Throttled Chart Updater ──────────────────────────────
// Buffers WebSocket candle updates and flushes once per animation frame.
// This prevents multiple setData()/update() calls per paint cycle,
// dramatically reducing CPU usage during high-frequency market conditions.
//
// Architecture:
//   WS message → buffer latest candle → rAF → flush to LWC series.update()
//
// This class BYPASSES React state for live data — candle updates go directly
// to the lightweight-charts series via update() (O(1)) instead of through
// setCandles() → setData() (O(n log n)).

export class ThrottledChartUpdater {
  private buffer: Map<number, CandleUpdateData> = new Map();
  private rafId: number = 0;
  private paused: boolean = false;
  private onFlush: (updates: CandleUpdateData[]) => void;

  constructor(onFlush: (updates: CandleUpdateData[]) => void) {
    this.onFlush = onFlush;
  }

  /** Buffer a candle update. If multiple updates for the same time arrive
   *  between frames, only the latest is kept (coalescing). */
  push(candle: CandleUpdateData): void {
    if (this.paused) return;
    this.buffer.set(candle.time, candle);
    this.scheduleFlush();
  }

  /** Pause updates (when chart is paused by user) */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.cancelPending();
    }
  }

  /** Cancel all pending updates (on symbol/timeframe change) */
  cancelPending(): void {
    this.buffer.clear();
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** Force-flush any buffered updates immediately */
  flushNow(): void {
    if (this.buffer.size === 0) return;
    const updates = Array.from(this.buffer.values());
    this.buffer.clear();
    this.rafId = 0;
    this.onFlush(updates);
  }

  /** Destroy the updater — cancel all pending updates and remove references */
  destroy(): void {
    this.cancelPending();
    this.onFlush = () => {};
  }

  private scheduleFlush(): void {
    if (this.rafId !== 0) return; // Already scheduled
    this.rafId = requestAnimationFrame(() => {
      this.flushNow();
    });
  }
}

export interface CandleUpdateData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Max Candle Limit ─────────────────────────────────────
// Prevents the chart from loading unlimited historical candles.
// TradingView limits to ~5000; we use 3000 as a balance between
// indicator accuracy (needs enough data for long-period indicators
// like Ichimoku 52-period) and rendering performance.

export const MAX_VISIBLE_CANDLES = 3000;

// ── Gap Filling ──────────────────────────────────────────
// FIX: Lightweight-charts renders every time slot on the time axis when using
// UTCTimestamp (Unix seconds) with timeVisible:true. If candles are missing
// (e.g., Binance rate limit, maintenance, forex market closed), the chart shows
// visual GAPS between candles — empty spaces where the missing candles should be.
//
// This function fills those gaps by inserting "forward-fill" candles: each
// missing slot gets a candle with open=high=low=close=previous_close, volume=0.
// These render as tiny doji/cross candles that bridge the visual gap without
// introducing fake price action.
//
// Performance: O(n) where n = number of filled candles. For typical gaps
// (a few hours of missing 1m data = ~60-240 fill candles), this is negligible.
// A safety cap prevents pathological cases (e.g., 1d timeframe with years of gaps).

export function fillTimeGaps(
  candles: CandleData[],
  intervalSeconds: number,
  maxFillCount: number = 500,
): CandleData[] {
  if (candles.length < 2 || intervalSeconds <= 0) return candles;

  const filled: CandleData[] = [candles[0]];
  let fillCount = 0;

  for (let i = 1; i < candles.length; i++) {
    const prevTime = candles[i - 1].time;
    const currTime = candles[i].time;
    const expectedNext = prevTime + intervalSeconds;

    // Only fill if there's a gap of at least 1 interval and we haven't hit the cap
    if (currTime > expectedNext && fillCount < maxFillCount) {
      let fillTime = expectedNext;
      const prevClose = candles[i - 1].close;

      while (fillTime < currTime && fillCount < maxFillCount) {
        filled.push({
          time: fillTime,
          open: prevClose,
          high: prevClose,
          low: prevClose,
          close: prevClose,
          volume: 0,
        });
        fillTime += intervalSeconds;
        fillCount++;
      }
    }

    filled.push(candles[i]);
  }

  return filled;
}

// ── Timeframe to Seconds ──────────────────────────────────
// Maps timeframe strings (e.g., '1m', '5m', '1h', '1d') to seconds.
// Used by fillTimeGaps and WebSocket candle alignment.

export function timeframeToSeconds(tf: string): number {
  const map: Record<string, number> = {
    '1s': 1, '5s': 5, '15s': 15, '30s': 30,
    '1m': 60, '5m': 300, '15m': 900, '1min': 60, '5min': 300, '15min': 900,
    '30m': 1800, '30min': 1800,
    '1h': 3600, '2h': 7200, '4h': 14400,
    '1d': 86400, '1day': 86400,
    '1w': 604800, '1week': 604800,
    '1M': 2592000, '1month': 2592000, '3M': 7776000, '3month': 7776000,
  };
  return map[tf] || 60; // Default to 60s (1m)
}

// ── Safe Math Helpers ────────────────────────────────────────
// Math.max(...array) / Math.min(...array) throws RangeError when
// the array exceeds the engine's argument limit (~65,536 in V8).
// These loop-based alternatives handle arrays of any size safely.
// MUST be used instead of Math.max(...spread) / Math.min(...spread)
// anywhere the array size is not guaranteed to be tiny (< 100).

export function safeMax(arr: number[]): number {
  if (arr.length === 0) return -Infinity;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

export function safeMin(arr: number[]): number {
  if (arr.length === 0) return Infinity;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i];
  }
  return min;
}
