// ═══════════════════════════════════════════════════════════
// Elliott Wave Detector — Automatic Wave Count
// Detects 5-wave impulse and 3-wave corrective (ABC)
// STANDALONE
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

export interface ElliottWave {
  waveNumber: string; // '1','2','3','4','5','A','B','C'
  time: number;
  price: number;
  type: 'impulse' | 'corrective';
}

export interface ElliottPattern {
  type: '5-wave' | 'ABC';
  direction: 'bullish' | 'bearish';
  waves: ElliottWave[];
  currentWave: string;
  confidence: number;
  nextTarget?: number;
}

function findSwings(candles: CandleData[], n = 5): { highs: {time:number;price:number;i:number}[]; lows: {time:number;price:number;i:number}[] } {
  const highs: {time:number;price:number;i:number}[] = [];
  const lows: {time:number;price:number;i:number}[] = [];
  for (let i = n; i < candles.length - n; i++) {
    let isH = true, isL = true;
    for (let j = i-n; j <= i+n; j++) {
      if (j===i) continue;
      if (candles[j].high >= candles[i].high) isH = false;
      if (candles[j].low <= candles[i].low) isL = false;
    }
    if (isH) highs.push({ time: candles[i].time, price: candles[i].high, i });
    if (isL) lows.push({ time: candles[i].time, price: candles[i].low, i });
  }
  return { highs, lows };
}

export function detectElliottWaves(candles: CandleData[]): ElliottPattern | null {
  if (candles.length < 50) return null;
  // FIX: Use last 200 candles instead of 100. Elliott Wave patterns often span
  // 100+ candles for the full 5-wave structure. Using only 100 candles missed
  // longer-term wave patterns that are more reliable. Still cap at 200 to avoid
  // excessive computation on very large datasets.
  const { highs, lows } = findSwings(candles.slice(-200), 5);

  // Try bullish 5-wave: Low-High-Low-High-Low-High
  if (lows.length >= 3 && highs.length >= 3) {
    const w0 = lows[lows.length - 3]; // wave 1 start
    const w1 = highs[highs.length - 3]; // wave 1 top
    const w2 = lows[lows.length - 2]; // wave 2 bottom
    const w3 = highs[highs.length - 2]; // wave 3 top
    const w4 = lows[lows.length - 1]; // wave 4 bottom
    const w5 = highs[highs.length - 1]; // wave 5 top

    if (w1.i > w0.i && w2.i > w1.i && w3.i > w2.i && w4.i > w3.i && w5.i > w4.i) {
      // Wave 3 must be longest
      const w1len = w1.price - w0.price;
      const w3len = w3.price - w2.price;
      const w5len = w5.price - w4.price;
      if (w3len > w1len && w3len > w5len) {
        // Wave 2 must not retrace more than 100% of wave 1
        if (w2.price > w0.price && w4.price > w2.price) {
          // 61.8% retracement of Wave 1 from Wave 2 end
          const fib618 = (w2?.price || w1.price) + (w1.price - w0.price) * 0.618;
          // 161.8% extension from Wave 2 end
          const fib1618 = (w2?.price || w1.price) + (w1.price - w0.price) * 1.618;
          return {
            type: '5-wave', direction: 'bullish',
            waves: [
              { waveNumber: '1', time: w1.time, price: w1.price, type: 'impulse' },
              { waveNumber: '2', time: w2.time, price: w2.price, type: 'corrective' },
              { waveNumber: '3', time: w3.time, price: w3.price, type: 'impulse' },
              { waveNumber: '4', time: w4.time, price: w4.price, type: 'corrective' },
              { waveNumber: '5', time: w5.time, price: w5.price, type: 'impulse' },
            ],
            currentWave: '5',
            confidence: 0.68,
            nextTarget: fib1618,
          };
        }
      }
    }
  }

  // Try bearish 5-wave: High-Low-High-Low-High-Low
  if (highs.length >= 3 && lows.length >= 3) {
    const w0 = highs[highs.length - 3];
    const w1 = lows[lows.length - 3];
    const w2 = highs[highs.length - 2];
    const w3 = lows[lows.length - 2];
    const w4 = highs[highs.length - 1];
    const w5 = lows[lows.length - 1];

    if (w1.i > w0.i && w2.i > w1.i && w3.i > w2.i && w4.i > w3.i && w5.i > w4.i) {
      const w1len = w0.price - w1.price;
      const w3len = w2.price - w3.price;
      const w5len = w4.price - w5.price;
      if (w3len > w1len && w3len > w5len && w2.price < w0.price && w4.price < w2.price) {
        // Bearish Fibonacci extensions (mirror of bullish logic)
        // Wave 1 amplitude = w0.price - w1.price, projected downward from wave 2 top
        const w1amp = w0.price - w1.price;
        const fib618 = w2.price - w1amp * 0.618;   // 61.8% extension from wave 2 top
        const fib1618 = w2.price - w1amp * 1.618;   // 161.8% extension from wave 2 top
        return {
          type: '5-wave', direction: 'bearish',
          waves: [
            { waveNumber: '1', time: w1.time, price: w1.price, type: 'impulse' },
            { waveNumber: '2', time: w2.time, price: w2.price, type: 'corrective' },
            { waveNumber: '3', time: w3.time, price: w3.price, type: 'impulse' },
            { waveNumber: '4', time: w4.time, price: w4.price, type: 'corrective' },
            { waveNumber: '5', time: w5.time, price: w5.price, type: 'impulse' },
          ],
          currentWave: '5',
          confidence: 0.65,
          nextTarget: fib1618,
        };
      }
    }
  }

  return null;
}
