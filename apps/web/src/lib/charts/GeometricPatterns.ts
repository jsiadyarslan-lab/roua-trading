// ═══════════════════════════════════════════════════════════
// Geometric Pattern Detector
// Double Top/Bottom, Head & Shoulders, Triangles, Wedges, Flags
// STANDALONE — pure data, no chart imports
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { safeMax, safeMin } from './chart-utils';

export interface GeometricPattern {
 type: string;
 labelAr: string;
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number;
 startTime: number;
 endTime: number;
 // Key price points for drawing
 points: { time: number; price: number }[];
 // Target price
 target?: number;
 stopLoss?: number;
}

function pivots(candles: CandleData[], n = 3) {
 const highs: { i: number; time: number; price: number }[] = [];
 const lows: { i: number; time: number; price: number }[] = [];
 for (let i = n; i < candles.length - n; i++) {
 const c = candles[i];
 let isHigh = true, isLow = true;
 for (let j = i - n; j <= i + n; j++) {
 if (j === i) continue;
 if (candles[j].high >= c.high) isHigh = false;
 if (candles[j].low <= c.low) isLow = false;
 }
 if (isHigh) highs.push({ i, time: c.time, price: c.high });
 if (isLow) lows.push({ i, time: c.time, price: c.low });
 }
 return { highs, lows };
}

// ── Double Top ────────────────────────────────────────────
function detectDoubleTop(candles: CandleData[]): GeometricPattern | null {
 const { highs, lows } = pivots(candles.slice(-60), 3);
 if (highs.length < 2 || lows.length < 1) return null;
 const h1 = highs[highs.length - 2];
 const h2 = highs[highs.length - 1];
 const neck = lows.find(l => l.i > h1.i && l.i < h2.i);
 if (!neck) return null;
 const diff = Math.abs(h1.price - h2.price) / h1.price;
 if (diff > 0.02) return null; // tops must be within 2%
 const last = candles[candles.length - 1];
 const range = h1.price - neck.price;
 return {
 type: 'Double Top', labelAr: 'high ', direction: 'bearish',
 confidence: Math.min(0.85, 0.6 + (1 - diff / 0.02) * 0.25),
 startTime: h1.time, endTime: last.time,
 points: [{ time: h1.time, price: h1.price }, { time: neck.time, price: neck.price }, { time: h2.time, price: h2.price }, { time: last.time, price: neck.price }],
 target: neck.price - range, stopLoss: Math.max(h1.price, h2.price) * 1.005,
 };
}

// ── Double Bottom ─────────────────────────────────────────
function detectDoubleBottom(candles: CandleData[]): GeometricPattern | null {
 const { highs, lows } = pivots(candles.slice(-60), 3);
 if (lows.length < 2 || highs.length < 1) return null;
 const l1 = lows[lows.length - 2];
 const l2 = lows[lows.length - 1];
 const neck = highs.find(h => h.i > l1.i && h.i < l2.i);
 if (!neck) return null;
 const diff = Math.abs(l1.price - l2.price) / l1.price;
 if (diff > 0.02) return null;
 const last = candles[candles.length - 1];
 const range = neck.price - l1.price;
 return {
 type: 'Double Bottom', labelAr: 'low ', direction: 'bullish',
 confidence: Math.min(0.85, 0.6 + (1 - diff / 0.02) * 0.25),
 startTime: l1.time, endTime: last.time,
 points: [{ time: l1.time, price: l1.price }, { time: neck.time, price: neck.price }, { time: l2.time, price: l2.price }, { time: last.time, price: neck.price }],
 target: neck.price + range, stopLoss: Math.min(l1.price, l2.price) * 0.995,
 };
}

// ── Head & Shoulders ──────────────────────────────────────
function detectHeadShoulders(candles: CandleData[]): GeometricPattern | null {
 const { highs, lows } = pivots(candles.slice(-80), 3);
 if (highs.length < 3) return null;
 const s1 = highs[highs.length - 3];
 const head = highs[highs.length - 2];
 const s2 = highs[highs.length - 1];
 // Head must be highest
 if (head.price <= s1.price || head.price <= s2.price) return null;
 // Shoulders roughly equal
 const shoulderDiff = Math.abs(s1.price - s2.price) / s1.price;
 if (shoulderDiff > 0.03) return null;
 const neckLows = lows.filter(l => l.i > s1.i && l.i < s2.i);
 if (neckLows.length < 2) return null;
 const neckPrice = (neckLows[0].price + neckLows[neckLows.length - 1].price) / 2;
 const last = candles[candles.length - 1];
 return {
 type: 'Head and Shoulders', labelAr: ' ', direction: 'bearish',
 confidence: 0.78,
 startTime: s1.time, endTime: last.time,
 points: [{ time: s1.time, price: s1.price }, { time: head.time, price: head.price }, { time: s2.time, price: s2.price }, { time: last.time, price: neckPrice }],
 target: neckPrice - (head.price - neckPrice),
 stopLoss: head.price * 1.005,
 };
}

// ── Ascending Triangle ────────────────────────────────────
function detectAscendingTriangle(candles: CandleData[]): GeometricPattern | null {
 const slice = candles.slice(-40);
 const { highs, lows } = pivots(slice, 2);
 if (highs.length < 3 || lows.length < 3) return null;
 // Resistance flat: tops roughly equal
 const topPrices = highs.slice(-3).map(h => h.price);
 const topRange = (safeMax(topPrices) - safeMin(topPrices)) / safeMax(topPrices);
 if (topRange > 0.015) return null;
 // Support rising: each low higher than previous
 const botPrices = lows.slice(-3).map(l => l.price);
 if (botPrices[1] <= botPrices[0] || botPrices[2] <= botPrices[1]) return null;
 const resistance = (topPrices[0] + topPrices[topPrices.length - 1]) / 2;
 const last = candles[candles.length - 1];
 return {
 type: 'Ascending Triangle', labelAr: 'triangle bullish', direction: 'bullish',
 confidence: 0.72,
 startTime: slice[0].time, endTime: last.time,
 points: highs.slice(-3).map(h => ({ time: h.time, price: h.price })).concat(lows.slice(-3).map(l => ({ time: l.time, price: l.price }))),
 target: resistance * 1.03,
 stopLoss: botPrices[botPrices.length - 1] * 0.995,
 };
}

// ── Descending Triangle ───────────────────────────────────
function detectDescendingTriangle(candles: CandleData[]): GeometricPattern | null {
 const slice = candles.slice(-40);
 const { highs, lows } = pivots(slice, 2);
 if (highs.length < 3 || lows.length < 3) return null;
 const botPrices = lows.slice(-3).map(l => l.price);
 const botRange = (safeMax(botPrices) - safeMin(botPrices)) / safeMax(botPrices);
 if (botRange > 0.015) return null;
 const topPrices = highs.slice(-3).map(h => h.price);
 if (topPrices[1] >= topPrices[0] || topPrices[2] >= topPrices[1]) return null;
 const support = (botPrices[0] + botPrices[botPrices.length - 1]) / 2;
 const last = candles[candles.length - 1];
 return {
 type: 'Descending Triangle', labelAr: 'triangle bearish', direction: 'bearish',
 confidence: 0.72,
 startTime: slice[0].time, endTime: last.time,
 points: highs.slice(-3).map(h => ({ time: h.time, price: h.price })).concat(lows.slice(-3).map(l => ({ time: l.time, price: l.price }))),
 target: support * 0.97,
 stopLoss: topPrices[topPrices.length - 1] * 1.005,
 };
}

// ── Rising Wedge ──────────────────────────────────────────
function detectRisingWedge(candles: CandleData[]): GeometricPattern | null {
 const slice = candles.slice(-40);
 const { highs, lows } = pivots(slice, 2);
 if (highs.length < 3 || lows.length < 3) return null;
 const topP = highs.slice(-3).map(h => h.price);
 const botP = lows.slice(-3).map(l => l.price);
 // Both rising but lows rising faster (converging upward)
 if (topP[1] <= topP[0] || topP[2] <= topP[1]) return null;
 if (botP[1] <= botP[0] || botP[2] <= botP[1]) return null;
 const topSlope = (topP[2] - topP[0]) / topP[0];
 const botSlope = (botP[2] - botP[0]) / botP[0];
 if (botSlope <= topSlope) return null;
 const last = candles[candles.length - 1];
 return {
 type: 'Rising Wedge', labelAr: 'in bullish', direction: 'bearish',
 confidence: 0.70,
 startTime: slice[0].time, endTime: last.time,
 points: highs.slice(-3).map(h => ({ time: h.time, price: h.price })).concat(lows.slice(-3).map(l => ({ time: l.time, price: l.price }))),
 target: botP[0] * 0.97,
 };
}

// ── Falling Wedge ─────────────────────────────────────────
function detectFallingWedge(candles: CandleData[]): GeometricPattern | null {
 const slice = candles.slice(-40);
 const { highs, lows } = pivots(slice, 2);
 if (highs.length < 3 || lows.length < 3) return null;
 const topP = highs.slice(-3).map(h => h.price);
 const botP = lows.slice(-3).map(l => l.price);
 if (topP[1] >= topP[0] || topP[2] >= topP[1]) return null;
 if (botP[1] >= botP[0] || botP[2] >= botP[1]) return null;
 const topSlope = (topP[0] - topP[2]) / topP[0];
 const botSlope = (botP[0] - botP[2]) / botP[0];
 if (botSlope <= topSlope) return null;
 const last = candles[candles.length - 1];
 return {
 type: 'Falling Wedge', labelAr: 'in bearish', direction: 'bullish',
 confidence: 0.70,
 startTime: slice[0].time, endTime: last.time,
 points: highs.slice(-3).map(h => ({ time: h.time, price: h.price })).concat(lows.slice(-3).map(l => ({ time: l.time, price: l.price }))),
 target: topP[0] * 1.03,
 };
}

// ── Main detector ─────────────────────────────────────────
export function detectGeometricPatterns(candles: CandleData[]): GeometricPattern[] {
 if (candles.length < 40) return [];
 const results: GeometricPattern[] = [];
 const detectors = [
 detectDoubleTop, detectDoubleBottom,
 detectHeadShoulders,
 detectAscendingTriangle, detectDescendingTriangle,
 detectRisingWedge, detectFallingWedge,
 ];
 for (const fn of detectors) {
 try { const r = fn(candles); if (r) results.push(r); } catch {}
 }
 return results.sort((a, b) => b.confidence - a.confidence);
}
