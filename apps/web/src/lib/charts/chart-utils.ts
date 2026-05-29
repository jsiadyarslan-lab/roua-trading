// ═══════════════════════════════════════════════════════════
// ROUA Chart — Shared Utilities
// Single source of truth for common chart helper functions
// and constants to eliminate code duplication.
// ═══════════════════════════════════════════════════════════

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
