// ═══════════════════════════════════════════════════════════
// SMC Detector — Smart Money Concepts
// Order Blocks, Fair Value Gaps, BOS/CHoCH, Liquidity Sweeps
// STANDALONE — does NOT import from RouaChart or useChart
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  time: number;       // Unix seconds — left edge
  endTime: number;    // right edge (open for now)
  high: number;
  low: number;
  open: number;
  close: number;
  strength: number;   // 0-1
  broken: boolean;
}

export interface FairValueGap {
  type: 'bullish' | 'bearish';
  time: number;
  high: number;
  low: number;
  filled: boolean;
}

export interface StructureBreak {
  type: 'BOS' | 'CHoCH';
  direction: 'bullish' | 'bearish';
  time: number;
  price: number;
  prevSwingTime: number;
  prevSwingPrice: number;
}

// ── Order Blocks ─────────────────────────────────────────
export function detectOrderBlocks(candles: CandleData[], lookback = 50): OrderBlock[] {
  if (candles.length < 5) return [];
  const slice = candles.slice(-lookback);
  const atr = calcATR(slice);
  const threshold = atr * 1.5;
  const obs: OrderBlock[] = [];

  for (let i = 1; i < slice.length - 1; i++) {
    const c = slice[i];
    const next = slice[i + 1];
    const move = Math.abs(next.close - next.open);

    // Bearish OB: last bullish candle before big drop
    if (next.close < next.open && move > threshold && c.close > c.open) {
      const broken = slice.slice(i + 1).some(x => x.close > c.high);
      obs.push({ type: 'bearish', time: c.time, endTime: slice[slice.length - 1].time, high: c.high, low: c.low, open: c.open, close: c.close, strength: Math.min(1, move / (threshold * 2)), broken });
    }

    // Bullish OB: last bearish candle before big rise
    if (next.close > next.open && move > threshold && c.close < c.open) {
      const broken = slice.slice(i + 1).some(x => x.close < c.low);
      obs.push({ type: 'bullish', time: c.time, endTime: slice[slice.length - 1].time, high: c.high, low: c.low, open: c.open, close: c.close, strength: Math.min(1, move / (threshold * 2)), broken });
    }
  }

  // Return last 3 of each type (avoid clutter)
  const bull = obs.filter(o => o.type === 'bullish' && !o.broken).slice(-3);
  const bear = obs.filter(o => o.type === 'bearish' && !o.broken).slice(-3);
  return [...bull, ...bear];
}

// ── Fair Value Gaps ──────────────────────────────────────
export function detectFVG(candles: CandleData[], lookback = 50): FairValueGap[] {
  if (candles.length < 3) return [];
  const slice = candles.slice(-lookback);
  const fvgs: FairValueGap[] = [];

  for (let i = 1; i < slice.length - 1; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    const next = slice[i + 1];

    // Bullish FVG: gap between prev.high and next.low (upward impulse)
    if (next.low > prev.high && curr.close > curr.open) {
      const filled = slice.slice(i + 1).some(x => x.low <= prev.high);
      fvgs.push({ type: 'bullish', time: curr.time, high: next.low, low: prev.high, filled });
    }

    // Bearish FVG: gap between next.high and prev.low (downward impulse)
    if (next.high < prev.low && curr.close < curr.open) {
      const filled = slice.slice(i + 1).some(x => x.high >= prev.low);
      fvgs.push({ type: 'bearish', time: curr.time, high: prev.low, low: next.high, filled });
    }
  }

  return fvgs.filter(f => !f.filled).slice(-6);
}

// ── BOS / CHoCH ──────────────────────────────────────────
export function detectStructureBreaks(candles: CandleData[], lookback = 100): StructureBreak[] {
  if (candles.length < 10) return [];
  const slice = candles.slice(-lookback);
  const breaks: StructureBreak[] = [];

  // Find swing highs and lows
  const swingHighs: { time: number; price: number }[] = [];
  const swingLows: { time: number; price: number }[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const c = slice[i];
    if (c.high > slice[i-1].high && c.high > slice[i-2].high && c.high > slice[i+1].high && c.high > slice[i+2].high) {
      swingHighs.push({ time: c.time, price: c.high });
    }
    if (c.low < slice[i-1].low && c.low < slice[i-2].low && c.low < slice[i+1].low && c.low < slice[i+2].low) {
      swingLows.push({ time: c.time, price: c.low });
    }
  }

  // Detect BOS/CHoCH
  const lastHigh = swingHighs[swingHighs.length - 1];
  const lastLow = swingLows[swingLows.length - 1];
  const last = slice[slice.length - 1];

  if (lastHigh && last.close > lastHigh.price) {
    breaks.push({ type: 'BOS', direction: 'bullish', time: last.time, price: lastHigh.price, prevSwingTime: lastHigh.time, prevSwingPrice: lastHigh.price });
  }
  if (lastLow && last.close < lastLow.price) {
    breaks.push({ type: 'BOS', direction: 'bearish', time: last.time, price: lastLow.price, prevSwingTime: lastLow.time, prevSwingPrice: lastLow.price });
  }

  return breaks.slice(-4);
}

// ── All SMC in one call ───────────────────────────────────
export function detectSMC(candles: CandleData[]) {
  return {
    orderBlocks: detectOrderBlocks(candles),
    fvgs: detectFVG(candles),
    structureBreaks: detectStructureBreaks(candles),
  };
}
