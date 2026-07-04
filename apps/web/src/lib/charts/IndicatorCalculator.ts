// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Indicator Calculator
// Uses `technicalindicators` for accurate calculations
// ═══════════════════════════════════════════════════════════

import type { CandleData, IndicatorKey, ActiveIndicator } from './types';
import { sanitizeTimeForIndicator as sanitizeTime, safeMax, safeMin } from './chart-utils';

// ── Lazy-load technicalindicators to avoid SSR issues ──
let _ti: typeof import('technicalindicators') | null = null;
async function getTI() {
  if (!_ti) {
    _ti = await import('technicalindicators');
  }
  return _ti;
}

// ── Result types ─────────────────────────────────────────
export interface OverlayResult {
  time: number;
  values: Record<string, number | null>;
}

export interface OscillatorResult {
  time: number;
  values: Record<string, number | null>;
}

export interface MACDResult {
  time: number;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface IchimokuResult {
  time: number;
  tenkan: number | null;
  kijun: number | null;
  senkouA: number | null;
  senkouB: number | null;
  chikou: number | null;
}

export interface BollingerResult {
  time: number;
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface SuperTrendResult {
  time: number;
  value: number | null;
  direction: 'up' | 'down' | null;
}

export interface PivotResult {
  time: number;
  pp: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
}

// ── Helper: extract arrays from candles ──────────────────
// sanitizeTime is now imported from chart-utils.ts (shared utility).
// Returns 0 for invalid inputs, which is safe for indicator calculations.

function closes(candles: CandleData[]): number[] {
  return candles.map(c => c.close);
}

function highs(candles: CandleData[]): number[] {
  return candles.map(c => c.high);
}

function lows(candles: CandleData[]): number[] {
  return candles.map(c => c.low);
}

function volumes(candles: CandleData[]): number[] {
  return candles.map(c => c.volume);
}

function hlc3(candles: CandleData[]): number[] {
  return candles.map(c => (c.high + c.low + c.close) / 3);
}

// ── Safe Math helpers imported from chart-utils ──
// safeMax/safeMin are now shared from chart-utils.ts to avoid duplication.
// They replace Math.max(...array) / Math.min(...array) which throw RangeError
// when the array exceeds the engine's argument limit (~65,536 in V8).

// ── SMA ─────────────────────────────────────────────────
export async function calcSMA(candles: CandleData[], period: number = 20): Promise<OverlayResult[]> {
  const ti = await getTI();
  const result = ti.SMA.calculate({ period, values: closes(candles) });
  return candles.map((c, i) => ({
    time: sanitizeTime(c.time),
    values: { sma: i < period - 1 ? null : result[i - period + 1] ?? null },
  }));
}

// ── EMA ─────────────────────────────────────────────────
export async function calcEMA(candles: CandleData[], period: number = 12): Promise<OverlayResult[]> {
  const ti = await getTI();
  const result = ti.EMA.calculate({ period, values: closes(candles) });
  return candles.map((c, i) => ({
    time: sanitizeTime(c.time),
    values: { ema: i < period - 1 ? null : result[i - period + 1] ?? null },
  }));
}

// ── Bollinger Bands ─────────────────────────────────────
export async function calcBB(candles: CandleData[], period: number = 20, stdDev: number = 2): Promise<BollingerResult[]> {
  const ti = await getTI();
  const result = ti.BollingerBands.calculate({ period, stdDev, values: closes(candles) });
  return candles.map((c, i) => {
    if (i < period - 1 || !result[i - period + 1]) {
      return { time: sanitizeTime(c.time), upper: null, middle: null, lower: null };
    }
    const r = result[i - period + 1];
    return { time: sanitizeTime(c.time), upper: r.upper, middle: r.middle, lower: r.lower };
  });
}

// ── VWAP ────────────────────────────────────────────────
// FIX: Add session reset logic. VWAP should reset at the start of each
// trading session (daily for crypto 00:00 UTC, or market open for stocks/forex).
// Without this, VWAP accumulates data from all previous sessions, becoming
// a long-term average that's useless for intraday trading. Professional
// traders use VWAP specifically because it resets daily, providing a fresh
// benchmark for each session's institutional order flow.
export function calcVWAP(candles: CandleData[]): OverlayResult[] {
  let cumVol = 0;
  let cumTP = 0;
  let lastSessionDate: string | null = null;

  return candles.map(c => {
    // Determine session boundary based on UTC date
    const date = new Date(c.time * 1000);
    const sessionKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;

    // Reset accumulated values when a new session starts
    if (lastSessionDate !== null && sessionKey !== lastSessionDate) {
      cumVol = 0;
      cumTP = 0;
    }
    lastSessionDate = sessionKey;

    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumTP += tp * c.volume;
    return {
      time: sanitizeTime(c.time),
      values: { vwap: cumVol > 0 ? cumTP / cumVol : null },
    };
  });
}

// ── Parabolic SAR ───────────────────────────────────────
export async function calcPSAR(candles: CandleData[], step: number = 0.02, max: number = 0.2): Promise<OverlayResult[]> {
  const ti = await getTI();
  const input = candles.map(c => ({ high: c.high, low: c.low, close: c.close }));
  const result = ti.PSAR.calculate({ step, max, high: highs(candles), low: lows(candles) });
  return candles.map((c, i) => ({
    time: sanitizeTime(c.time),
    values: { psar: i === 0 ? null : result[i - 1] ?? null },
  }));
}

// ── RSI ─────────────────────────────────────────────────
export async function calcRSI(candles: CandleData[], period: number = 14): Promise<OscillatorResult[]> {
  const ti = await getTI();
  const result = ti.RSI.calculate({ period, values: closes(candles) });
  return candles.map((c, i) => ({
    time: sanitizeTime(c.time),
    values: { rsi: i < period ? null : result[i - period] ?? null },
  }));
}

// ── MACD ────────────────────────────────────────────────
export async function calcMACD(
  candles: CandleData[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): Promise<MACDResult[]> {
  const ti = await getTI();
  const result = ti.MACD.calculate({
    values: closes(candles),
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const offset = slow + signal - 2;
  return candles.map((c, i) => {
    if (i < offset || !result[i - offset]) {
      return { time: sanitizeTime(c.time), macd: null, signal: null, histogram: null };
    }
    const r = result[i - offset];
    return { time: sanitizeTime(c.time), macd: r.MACD ?? null, signal: r.signal ?? null, histogram: r.histogram ?? null };
  });
}

// ── Stochastic ──────────────────────────────────────────
export async function calcStochastic(
  candles: CandleData[],
  kPeriod: number = 14,
  dPeriod: number = 3
): Promise<OscillatorResult[]> {
  const ti = await getTI();
  const result = ti.Stochastic.calculate({
    high: highs(candles),
    low: lows(candles),
    close: closes(candles),
    period: kPeriod,
    signalPeriod: dPeriod,
  });
  return candles.map((c, i) => {
    if (i < kPeriod - 1 || !result[i - kPeriod + 1]) {
      return { time: sanitizeTime(c.time), values: { k: null, d: null } };
    }
    const r = result[i - kPeriod + 1];
    return { time: sanitizeTime(c.time), values: { k: r.k, d: r.d } };
  });
}

// ── ATR ─────────────────────────────────────────────────
export async function calcATR(candles: CandleData[], period: number = 14): Promise<OscillatorResult[]> {
  const ti = await getTI();
  const result = ti.ATR.calculate({
    high: highs(candles),
    low: lows(candles),
    close: closes(candles),
    period,
  });
  return candles.map((c, i) => ({
    time: sanitizeTime(c.time),
    values: { atr: i < period ? null : result[i - period] ?? null },
  }));
}

// ── ADX ─────────────────────────────────────────────────
export async function calcADX(candles: CandleData[], period: number = 14): Promise<OscillatorResult[]> {
  const ti = await getTI();
  const result = ti.ADX.calculate({
    high: highs(candles),
    low: lows(candles),
    close: closes(candles),
    period,
  });
  return candles.map((c, i) => {
    if (i < period * 2 || !result[i - period * 2]) {
      return { time: sanitizeTime(c.time), values: { adx: null, pdi: null, mdi: null } };
    }
    const r = result[i - period * 2];
    return { time: sanitizeTime(c.time), values: { adx: r.adx, pdi: r.pdi, mdi: r.mdi } };
  });
}

// ── CCI ─────────────────────────────────────────────────
export async function calcCCI(candles: CandleData[], period: number = 20): Promise<OscillatorResult[]> {
  const ti = await getTI();
  const result = ti.CCI.calculate({
    high: highs(candles),
    low: lows(candles),
    close: closes(candles),
    period,
  });
  return candles.map((c, i) => ({
    time: sanitizeTime(c.time),
    values: { cci: i < period - 1 ? null : result[i - period + 1] ?? null },
  }));
}

// ── Ichimoku Cloud ──────────────────────────────────────
// FIX: Proper Ichimoku implementation with 26-period displacement.
// Senkou Span A and Senkou Span B must be shifted FORWARD by basePeriod (26)
// candles into the future. Without this displacement, the cloud is drawn at
// the current candle instead of 26 candles ahead, which makes the indicator
// useless for predicting support/resistance.
// Chikou Span is shifted BACKWARD by basePeriod (26) candles.
export function calcIchimoku(
  candles: CandleData[],
  conversionPeriod: number = 9,
  basePeriod: number = 26,
  spanBPeriod: number = 52
): IchimokuResult[] {
  const len = candles.length;
  const displacement = basePeriod; // Standard Ichimoku uses 26-period displacement

  // Step 1: Calculate raw Tenkan, Kijun, SenkouA, SenkouB values
  const rawTenkan: (number | null)[] = new Array(len).fill(null);
  const rawKijun: (number | null)[] = new Array(len).fill(null);
  const rawSenkouA: (number | null)[] = new Array(len).fill(null);
  const rawSenkouB: (number | null)[] = new Array(len).fill(null);

  for (let i = 0; i < len; i++) {
    // Tenkan-sen (Conversion Line): (highest high + lowest low) / 2 over conversionPeriod
    if (i >= conversionPeriod - 1) {
      const slice = candles.slice(i - conversionPeriod + 1, i + 1);
      rawTenkan[i] = (safeMax(slice.map(c => c.high)) + safeMin(slice.map(c => c.low))) / 2;
    }

    // Kijun-sen (Base Line): (highest high + lowest low) / 2 over basePeriod
    if (i >= basePeriod - 1) {
      const slice = candles.slice(i - basePeriod + 1, i + 1);
      rawKijun[i] = (safeMax(slice.map(c => c.high)) + safeMin(slice.map(c => c.low))) / 2;
    }

    // Senkou Span A: (Tenkan + Kijun) / 2 — will be displaced forward
    if (rawTenkan[i] !== null && rawKijun[i] !== null) {
      rawSenkouA[i] = (rawTenkan[i]! + rawKijun[i]!) / 2;
    }

    // Senkou Span B: (highest high + lowest low) / 2 over spanBPeriod — will be displaced forward
    if (i >= spanBPeriod - 1) {
      const slice = candles.slice(i - spanBPeriod + 1, i + 1);
      rawSenkouB[i] = (safeMax(slice.map(c => c.high)) + safeMin(slice.map(c => c.low))) / 2;
    }
  }

  // Step 2: Build results with proper displacement
  const results: IchimokuResult[] = new Array(len);

  for (let i = 0; i < len; i++) {
    // Tenkan and Kijun are NOT displaced — they are drawn at the current candle
    const tenkan = rawTenkan[i];
    const kijun = rawKijun[i];

    // Senkou Span A: displaced FORWARD by `displacement` periods
    // The value calculated at index i is drawn at index i + displacement
    // For the current candle, we need the value from displacement periods ago
    const senkouASourceIdx = i - displacement;
    const senkouA = senkouASourceIdx >= 0 ? rawSenkouA[senkouASourceIdx] : null;

    // Senkou Span B: displaced FORWARD by `displacement` periods
    const senkouBSourceIdx = i - displacement;
    const senkouB = senkouBSourceIdx >= 0 ? rawSenkouB[senkouBSourceIdx] : null;

    // Chikou Span: displaced BACKWARD by `displacement` periods
    // Standard Ichimoku: Chikou at position i shows the CURRENT close (candles[i].close)
    // plotted 26 bars to the LEFT. Equivalently, when aligned to the price series,
    // at chart position i, Chikou shows the close from `displacement` bars AGO.
    //
    // BUG-017 FIX: Old code used `candles[i + displacement].close` — looking INTO THE FUTURE.
    // This is look-ahead bias — makes backtests look accurate but is invalid for live trading.
    // New code: `candles[i - displacement].close` — shows the close from 26 bars ago.
    // This is the correct standard Ichimoku Chikou Span.
    const chikou = i - displacement >= 0 ? candles[i - displacement].close : null;

    results[i] = {
      time: sanitizeTime(candles[i].time),
      tenkan,
      kijun,
      senkouA,
      senkouB,
      chikou,
    };
  }

  // Step 3: Add forward-looking Senkou projections for the last `displacement` candles
  // The cloud extends `displacement` periods into the future beyond current price.
  // We append these as additional result entries with future timestamps.
  // The timestamp for each future point is extrapolated from the candle interval.
  if (len >= 2) {
    const avgInterval = candles[len - 1].time - candles[len - 2].time;
    if (avgInterval > 0) {
      for (let d = 1; d <= displacement; d++) {
        const srcIdx = len - d; // Raw values from the end of the data
        const futureTime = sanitizeTime(candles[len - 1].time + avgInterval * d);

        results.push({
          time: futureTime,
          tenkan: null,  // Tenkan/Kijun don't extend into the future
          kijun: null,
          senkouA: rawSenkouA[srcIdx] ?? null,
          senkouB: rawSenkouB[srcIdx] ?? null,
          chikou: null,
        });
      }
    }
  }

  return results;
}

// ── SuperTrend ──────────────────────────────────────────
// FIX: Use Wilder's ATR (RMA — Running Moving Average) instead of SMA.
// The original implementation used simple averaging (SMA) for ATR calculation,
// but the correct SuperTrend formula requires Wilder's smoothing (RMA), which
// gives more weight to recent data and is the standard used by TradingView,
// Binance, and all major platforms. The difference is significant:
//   SMA: atr[i] = sum(TR[i-period+1..i]) / period  (equal weight)
//   RMA: atr[i] = (prev_atr * (period-1) + TR[i]) / period  (exponential decay)
// This changes the SuperTrend band positions noticeably, especially in
// volatile markets where the SMA's equal weighting causes lag.
export function calcSuperTrend(
  candles: CandleData[],
  period: number = 10,
  multiplier: number = 3
): SuperTrendResult[] {
  const results: SuperTrendResult[] = [];

  // Step 1: Calculate True Range values
  const trVals: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].open;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose)
    );
    trVals.push(tr);
  }

  // Step 2: Calculate ATR using Wilder's smoothing (RMA)
  // First ATR value is a simple average of the first `period` TR values
  // Subsequent values use: ATR[i] = (ATR[i-1] * (period-1) + TR[i]) / period
  const atrVals: (number | null)[] = [];
  let firstATR: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      atrVals.push(null);
      continue;
    }
    if (firstATR === null) {
      // First ATR: simple average of the first `period` TR values
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += trVals[j];
      }
      firstATR = sum / period;
      atrVals.push(firstATR);
    } else {
      // Wilder's smoothing: RMA
      const prevATR = atrVals[i - 1]!;
      const currentATR = (prevATR * (period - 1) + trVals[i]) / period;
      atrVals.push(currentATR);
    }
  }

  let prevUpper = 0;
  let prevLower = 0;
  let prevDirection: 'up' | 'down' = 'up';

  for (let i = 0; i < candles.length; i++) {
    if (atrVals[i] === null) {
      results.push({ time: sanitizeTime(candles[i].time), value: null, direction: null });
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const upperBand = hl2 + multiplier * atrVals[i]!;
    const lowerBand = hl2 - multiplier * atrVals[i]!;

    const finalUpper = (upperBand < prevUpper || candles[i - 1]?.close > prevUpper) ? upperBand : prevUpper;
    const finalLower = (lowerBand > prevLower || candles[i - 1]?.close < prevLower) ? lowerBand : prevLower;

    let direction: 'up' | 'down';
    let supertrend: number;

    if (prevDirection === 'up') {
      direction = candles[i].close < finalLower ? 'down' : 'up';
    } else {
      direction = candles[i].close > finalUpper ? 'up' : 'down';
    }

    supertrend = direction === 'up' ? finalLower : finalUpper;

    prevUpper = finalUpper;
    prevLower = finalLower;
    prevDirection = direction;

    results.push({ time: sanitizeTime(candles[i].time), value: supertrend, direction });
  }

  return results;
}

// ── Pivot Points ────────────────────────────────────────
export function calcPivot(candles: CandleData[]): PivotResult[] {
  return candles.map((c, i) => {
    if (i === 0) {
      return { time: sanitizeTime(c.time), pp: null, r1: null, r2: null, r3: null, s1: null, s2: null, s3: null };
    }
    const prev = candles[i - 1];
    const pp = (prev.high + prev.low + prev.close) / 3;
    const r1 = 2 * pp - prev.low;
    const s1 = 2 * pp - prev.high;
    const r2 = pp + (prev.high - prev.low);
    const s2 = pp - (prev.high - prev.low);
    const r3 = prev.high + 2 * (pp - prev.low);
    const s3 = prev.low - 2 * (prev.high - pp);
    return { time: sanitizeTime(c.time), pp, r1, r2, r3, s1, s2, s3 };
  });
}

// ── Donchian Channel ───────────────────────────────────
export interface DonchianResult {
  time: number;
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export function calcDonchian(candles: CandleData[], period: number = 20): DonchianResult[] {
  return candles.map((c, i) => {
    if (i < period - 1) {
      return { time: sanitizeTime(c.time), upper: null, middle: null, lower: null };
    }
    const slice = candles.slice(i - period + 1, i + 1);
    const upper = safeMax(slice.map(x => x.high));
    const lower = safeMin(slice.map(x => x.low));
    const middle = (upper + lower) / 2;
    return { time: sanitizeTime(c.time), upper, middle, lower };
  });
}

// ── Master Calculation Function ─────────────────────────
export async function calculateIndicator(
  indicator: ActiveIndicator,
  candles: CandleData[]
): Promise<any[]> {
  const p = indicator.params;
  switch (indicator.key) {
    case 'sma':        return calcSMA(candles, p.period as number);
    case 'ema':        return calcEMA(candles, p.period as number);
    case 'bb':         return calcBB(candles, p.period as number, p.stdDev as number);
    case 'vwap':       return Promise.resolve(calcVWAP(candles));
    case 'psar':       return calcPSAR(candles, p.step as number, p.max as number);
    case 'ichimoku':   return Promise.resolve(calcIchimoku(candles, p.conversion as number, p.base as number, p.spanB as number));
    case 'supertrend': return Promise.resolve(calcSuperTrend(candles, p.period as number, p.multiplier as number));
    case 'pivot':      return Promise.resolve(calcPivot(candles));
    case 'donchian':   return Promise.resolve(calcDonchian(candles, p.period as number));
    case 'rsi':        return calcRSI(candles, p.period as number);
    case 'macd':       return calcMACD(candles, p.fast as number, p.slow as number, p.signal as number);
    case 'stochastic': return calcStochastic(candles, p.kPeriod as number, p.dPeriod as number);
    case 'atr':        return calcATR(candles, p.period as number);
    case 'adx':        return calcADX(candles, p.period as number);
    case 'cci':        return calcCCI(candles, p.period as number);
    default:           return [];
  }
}

// ── Heikin-Ashi Transform ───────────────────────────────
export function toHeikinAshi(candles: CandleData[]): CandleData[] {
  if (!candles.length) return [];  // FIX: Prevent crash on empty array — accessing candles[0] would throw TypeError
  const results: CandleData[] = [];
  let prevHaOpen = (candles[0].open + candles[0].close) / 2;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0
      ? (c.open + c.close) / 2
      : (prevHaOpen + results[i - 1].close) / 2; // Correct: use previous HA open and HA close
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    results.push({ time: sanitizeTime(c.time), open: haOpen, high: haHigh, low: haLow, close: haClose, volume: c.volume });
    prevHaOpen = haOpen;
  }

  return results;
}
