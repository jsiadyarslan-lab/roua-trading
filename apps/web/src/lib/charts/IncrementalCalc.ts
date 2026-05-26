// ═══════════════════════════════════════════════════════════
// Incremental Pattern Calculation — O(1) per candle update
// Maintains PatternState object with all intermediate data
// Avoids full recalculation from scratch on every new candle
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';
import { detectZigZag, type SwingPoint } from './zigzag';

// ── Incremental State ────────────────────────────────────
export interface IncrementalState {
  // Running ATR
  atr: number;
  atrPeriod: number;
  trueRanges: number[];  // Circular buffer for ATR calc

  // Running pivot tracking
  lastPivots: SwingPoint[];
  pivotBuffer: SwingPoint[];  // Unconfirmed pivots

  // Running price stats
  highestHigh: number;
  lowestLow: number;
  avgVolume: number;
  volumeSum: number;
  candleCount: number;

  // Running EMA for quick trend detection
  ema9: number;
  ema20: number;
  ema50: number;

  // Swing detection state
  pendingHigh: { price: number; index: number; time: number } | null;
  pendingLow: { price: number; index: number; time: number } | null;

  // Last update metadata
  lastCandleTime: number;
  lastCandleCount: number;
  initialized: boolean;
}

// ── Create fresh state ───────────────────────────────────
export function createIncrementalState(): IncrementalState {
  return {
    atr: 0,
    atrPeriod: 14,
    trueRanges: [],
    lastPivots: [],
    pivotBuffer: [],
    highestHigh: 0,
    lowestLow: Infinity,
    avgVolume: 0,
    volumeSum: 0,
    candleCount: 0,
    ema9: 0,
    ema20: 0,
    ema50: 0,
    pendingHigh: null,
    pendingLow: null,
    lastCandleTime: 0,
    lastCandleCount: 0,
    initialized: false,
  };
}

// ── Initialize state from full candle history (once) ─────
export function initializeState(
  state: IncrementalState,
  candles: CandleData[]
): IncrementalState {
  if (candles.length < 30) return state;

  // Calculate initial ATR
  state.atr = calcATR(candles, state.atrPeriod);

  // Calculate initial EMAs
  const closes = candles.map(c => c.close);
  state.ema9 = calcEMA(closes, 9);
  state.ema20 = calcEMA(closes, 20);
  state.ema50 = calcEMA(closes, 50);

  // Initial pivots from ZigZag
  state.lastPivots = detectZigZag(candles, { depth: 5, deviation: 0.003, backstep: 3, maxPivots: 30 });

  // Initial stats
  state.highestHigh = Math.max(...candles.slice(-100).map(c => c.high));
  state.lowestLow = Math.min(...candles.slice(-100).map(c => c.low));
  state.volumeSum = candles.slice(-50).reduce((s, c) => s + c.volume, 0);
  state.avgVolume = state.volumeSum / Math.min(50, candles.length);
  state.candleCount = candles.length;
  state.lastCandleTime = candles[candles.length - 1].time;
  state.lastCandleCount = candles.length;
  state.initialized = true;

  return state;
}

// ── Incremental update with single new candle — O(1) ─────
export function updateIncremental(
  state: IncrementalState,
  newCandle: CandleData,
  prevCandle: CandleData | null
): IncrementalState {
  if (!state.initialized) return state;

  state.candleCount++;
  state.lastCandleTime = newCandle.time;

  // ── ATR: Incremental True Range ──
  if (prevCandle) {
    const tr = Math.max(
      newCandle.high - newCandle.low,
      Math.abs(newCandle.high - prevCandle.close),
      Math.abs(newCandle.low - prevCandle.close)
    );
    state.trueRanges.push(tr);
    if (state.trueRanges.length > state.atrPeriod) {
      state.trueRanges.shift();
    }
    // Recalculate ATR from buffer
    if (state.trueRanges.length >= state.atrPeriod) {
      state.atr = state.trueRanges.slice(-state.atrPeriod).reduce((s, v) => s + v, 0) / state.atrPeriod;
    }
  }

  // ── EMAs: Incremental update ──
  if (state.ema9 > 0) {
    state.ema9 = emaUpdate(state.ema9, newCandle.close, 9);
  }
  if (state.ema20 > 0) {
    state.ema20 = emaUpdate(state.ema20, newCandle.close, 20);
  }
  if (state.ema50 > 0) {
    state.ema50 = emaUpdate(state.ema50, newCandle.close, 50);
  }

  // ── Running stats ──
  if (newCandle.high > state.highestHigh) state.highestHigh = newCandle.high;
  if (newCandle.low < state.lowestLow) state.lowestLow = newCandle.low;
  state.volumeSum += newCandle.volume;
  state.avgVolume = state.volumeSum / Math.min(50, state.candleCount);

  // ── Quick pivot check ──
  // Track potential new swing points without full ZigZag recalc
  if (!state.pendingHigh || newCandle.high > state.pendingHigh.price) {
    state.pendingHigh = { price: newCandle.high, index: state.candleCount - 1, time: newCandle.time };
  }
  if (!state.pendingLow || newCandle.low < state.pendingLow.price) {
    state.pendingLow = { price: newCandle.low, index: state.candleCount - 1, time: newCandle.time };
  }

  state.lastCandleCount = state.candleCount;
  return state;
}

// ── Check if full recalculation is needed ────────────────
export function needsFullRecalc(state: IncrementalState, currentCandleCount: number): boolean {
  // Full recalc every 50 candles to prevent drift
  if (currentCandleCount - state.lastCandleCount > 50) return true;
  // Full recalc if ATR drifts too much (sanity check)
  if (state.atr <= 0) return true;
  return false;
}

// ── Get quick trend from EMA state ───────────────────────
export function getQuickTrend(state: IncrementalState): {
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
} {
  if (state.ema9 === 0 || state.ema20 === 0) return { trend: 'neutral', strength: 0 };

  const emaDiff = (state.ema9 - state.ema20) / state.ema20;
  const strength = Math.min(1, Math.abs(emaDiff) * 50); // Normalize

  return {
    trend: emaDiff > 0.001 ? 'bullish' : emaDiff < -0.001 ? 'bearish' : 'neutral',
    strength,
  };
}

// ── Get quick volatility regime ──────────────────────────
export function getQuickVolatilityRegime(state: IncrementalState, price: number): 'low' | 'normal' | 'high' | 'extreme' {
  if (state.atr <= 0 || price <= 0) return 'normal';
  const atrPct = state.atr / price;
  if (atrPct < 0.005) return 'low';
  if (atrPct < 0.015) return 'normal';
  if (atrPct < 0.04) return 'high';
  return 'extreme';
}

// ── Helpers ──────────────────────────────────────────────

function calcEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function emaUpdate(prevEma: number, newValue: number, period: number): number {
  const k = 2 / (period + 1);
  return newValue * k + prevEma * (1 - k);
}
