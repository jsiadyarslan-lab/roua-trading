// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Indicator Calculator
// Uses `technicalindicators` for accurate calculations
// ═══════════════════════════════════════════════════════════

import type { CandleData, IndicatorKey, ActiveIndicator } from './types';

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
// FIX: sanitizeTime ensures every candle's time is a Unix timestamp number (seconds).
// This prevents the fatal "Cannot update oldest data, last time=[object Object]" error
// from lightweight-charts when a Date object or string leaks into the time field.
const sanitizeTime = (t: any): number => {
  if (typeof t === 'number' && isFinite(t)) return t;
  if (t instanceof Date) return Math.floor(t.getTime() / 1000);
  if (typeof t === 'string') { const ts = new Date(t).getTime(); return isFinite(ts) ? Math.floor(ts / 1000) : 0; }
  return 0;
};

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
export function calcVWAP(candles: CandleData[]): OverlayResult[] {
  let cumVol = 0;
  let cumTP = 0;
  return candles.map(c => {
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
export function calcIchimoku(
  candles: CandleData[],
  conversionPeriod: number = 9,
  basePeriod: number = 26,
  spanBPeriod: number = 52
): IchimokuResult[] {
  const results: IchimokuResult[] = [];

  for (let i = 0; i < candles.length; i++) {
    const tenkan = i >= conversionPeriod - 1
      ? (() => {
          const slice = candles.slice(i - conversionPeriod + 1, i + 1);
          return (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
        })()
      : null;

    const kijun = i >= basePeriod - 1
      ? (() => {
          const slice = candles.slice(i - basePeriod + 1, i + 1);
          return (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
        })()
      : null;

    const senkouA = (tenkan !== null && kijun !== null) ? (tenkan + kijun) / 2 : null;

    const senkouB = i >= spanBPeriod - 1
      ? (() => {
          const slice = candles.slice(i - spanBPeriod + 1, i + 1);
          return (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
        })()
      : null;

    const chikou = i < candles.length - basePeriod ? candles[i].close : null;

    results.push({
      time: sanitizeTime(candles[i].time),
      tenkan,
      kijun,
      senkouA,
      senkouB,
      chikou,
    });
  }

  return results;
}

// ── SuperTrend ──────────────────────────────────────────
export function calcSuperTrend(
  candles: CandleData[],
  period: number = 10,
  multiplier: number = 3
): SuperTrendResult[] {
  const results: SuperTrendResult[] = [];
  // Calculate ATR first
  const atrVals: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      atrVals.push(null);
      continue;
    }
    let atrSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const prevClose = j > 0 ? candles[j - 1].close : candles[j].open;
      const tr = Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - prevClose),
        Math.abs(candles[j].low - prevClose)
      );
      atrSum += tr;
    }
    atrVals.push(atrSum / period);
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
    const upper = Math.max(...slice.map(x => x.high));
    const lower = Math.min(...slice.map(x => x.low));
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
