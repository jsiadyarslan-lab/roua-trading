// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ZigZag Detector — Phase 1 of Autochartist-like engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Non-repainting ZigZag: only confirms pivots after Backstep bars.
// Matches MT5 ZigZag defaults: Depth=12, Deviation=5pts, Backstep=3
// but uses percentage-based deviation for crypto.
//
// Output: array of SwingPoint (high/low alternating, confirmed only)

import type { CandleData } from './types';

export interface SwingPoint {
  time: number;          // Unix timestamp
  price: number;         // pivot price
  type: 'high' | 'low'; // swing high or swing low
  index: number;         // bar index in input array
  strength: number;      // 1–10: how many bars confirm it
}

export interface ZigZagConfig {
  depth: number;         // min bars between pivots (default 12)
  deviation: number;     // min % move to accept new pivot (default 0.5%)
  backstep: number;      // min bars before confirming pivot (default 3)
  maxPivots: number;     // max pivots to return (default 200)
}

const DEFAULT_CONFIG: ZigZagConfig = {
  depth: 5,
  deviation: 0.003,  // 0.3% — good for crypto
  backstep: 3,
  maxPivots: 150,
};

export function detectZigZag(
  candles: CandleData[],
  config: Partial<ZigZagConfig> = {}
): SwingPoint[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!candles || candles.length < cfg.depth * 2) return [];

  const pivots: SwingPoint[] = [];
  let lastType: 'high' | 'low' | null = null;
  let lastPrice = 0;
  let lastIndex = 0;

  // Find highest high and lowest low in each depth window
  for (let i = cfg.depth; i < candles.length - cfg.backstep; i++) {
    const windowStart = Math.max(0, i - cfg.depth);
    const window = candles.slice(windowStart, i + 1);

    const windowHigh = Math.max(...window.map(c => c.high));
    const windowLow = Math.min(...window.map(c => c.low));
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    // Check if this bar is the highest in the window (swing high candidate)
    if (currentHigh === windowHigh) {
      // Confirm with backstep: price must not be exceeded in next backstep bars
      let confirmed = true;
      for (let j = i + 1; j <= Math.min(i + cfg.backstep, candles.length - 1); j++) {
        if (candles[j].high > currentHigh) { confirmed = false; break; }
      }

      if (confirmed && (lastType !== 'high' || currentHigh > lastPrice)) {
        if (lastType === 'high') {
          // Replace previous high if this one is higher
          if (pivots.length > 0 && pivots[pivots.length - 1].type === 'high') {
            pivots.pop();
          }
        }
        // Check deviation from last pivot
        const devPct = lastPrice > 0 ? Math.abs(currentHigh - lastPrice) / lastPrice : 1;
        if (devPct >= cfg.deviation) {
          const strength = Math.min(10, Math.floor(devPct / cfg.deviation));
          pivots.push({
            time: candles[i].time,
            price: currentHigh,
            type: 'high',
            index: i,
            strength: Math.max(1, strength),
          });
          lastType = 'high';
          lastPrice = currentHigh;
          lastIndex = i;
        }
      }
    }

    // Check if this bar is the lowest in the window (swing low candidate)
    if (currentLow === windowLow) {
      let confirmed = true;
      for (let j = i + 1; j <= Math.min(i + cfg.backstep, candles.length - 1); j++) {
        if (candles[j].low < currentLow) { confirmed = false; break; }
      }

      if (confirmed && (lastType !== 'low' || currentLow < lastPrice)) {
        if (lastType === 'low') {
          if (pivots.length > 0 && pivots[pivots.length - 1].type === 'low') {
            pivots.pop();
          }
        }
        const devPct = lastPrice > 0 ? Math.abs(currentLow - lastPrice) / lastPrice : 1;
        if (devPct >= cfg.deviation) {
          const strength = Math.min(10, Math.floor(devPct / cfg.deviation));
          pivots.push({
            time: candles[i].time,
            price: currentLow,
            type: 'low',
            index: i,
            strength: Math.max(1, strength),
          });
          lastType = 'low';
          lastPrice = currentLow;
          lastIndex = i;
        }
      }
    }
  }

  // Return last N pivots (most recent)
  return pivots.slice(-cfg.maxPivots);
}
