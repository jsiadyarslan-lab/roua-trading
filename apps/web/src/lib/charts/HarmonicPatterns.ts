// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Harmonic Patterns Detection
// Implements ZigZag algorithm to find pivot points and maps them
// to XABCD structures like Gartley, Butterfly, Bat, Crab.
// ═══════════════════════════════════════════════════════════

import type { CandleData, AIPattern } from './types';

interface PivotPoint {
 index: number;
 time: number;
 price: number;
 type: 'high' | 'low';
}

// 1. Find local extrema (ZigZag)
function findPivots(candles: CandleData[], depth = 5, deviation = 0.5): PivotPoint[] {
 const pivots: PivotPoint[] = [];
 if (candles.length < depth * 2) return pivots;

 let lastPivotType: 'high' | 'low' | null = null;
 let lastPivotPrice = 0;

 for (let i = depth; i < candles.length - depth; i++) {
 const c = candles[i];
 let isHigh = true;
 let isLow = true;

 // Check surrounding candles
 for (let j = i - depth; j <= i + depth; j++) {
 if (i === j) continue;
 if (candles[j].high > c.high) isHigh = false;
 if (candles[j].low < c.low) isLow = false;
 }

 if (isHigh) {
 if (lastPivotType === 'high' && c.high > lastPivotPrice) {
 // Update last high
 pivots[pivots.length - 1] = { index: i, time: c.time, price: c.high, type: 'high' };
 lastPivotPrice = c.high;
 } else if (lastPivotType !== 'high') {
 const change = lastPivotPrice === 0 ? 100 : Math.abs(c.high - lastPivotPrice) / lastPivotPrice * 100;
 if (change >= deviation) {
 pivots.push({ index: i, time: c.time, price: c.high, type: 'high' });
 lastPivotType = 'high';
 lastPivotPrice = c.high;
 }
 }
 } else if (isLow) {
 if (lastPivotType === 'low' && c.low < lastPivotPrice) {
 // Update last low
 pivots[pivots.length - 1] = { index: i, time: c.time, price: c.low, type: 'low' };
 lastPivotPrice = c.low;
 } else if (lastPivotType !== 'low') {
 const change = lastPivotPrice === 0 ? 100 : Math.abs(c.low - lastPivotPrice) / lastPivotPrice * 100;
 if (change >= deviation) {
 pivots.push({ index: i, time: c.time, price: c.low, type: 'low' });
 lastPivotType = 'low';
 lastPivotPrice = c.low;
 }
 }
 }
 }

 return pivots;
}

// Helper to check ratio with tolerance
function matchRatio(value: number, target: number, tolerance = 0.08): boolean {
 return value >= target * (1 - tolerance) && value <= target * (1 + tolerance);
}

// 2. Identify XABCD patterns
export function detectHarmonicPatterns(candles: CandleData[]): AIPattern[] {
 const patterns: AIPattern[] = [];
 if (!candles || candles.length < 20) return patterns;

 // Using a smaller depth to find smaller patterns on intra-day charts
 const pivots = findPivots(candles, 3, 0.2);
 if (pivots.length < 5) return patterns;

 for (let i = 0; i <= pivots.length - 5; i++) {
 const X = pivots[i];
 const A = pivots[i + 1];
 const B = pivots[i + 2];
 const C = pivots[i + 3];
 const D = pivots[i + 4];

 // Must alternate high/low
 if (X.type === A.type || A.type === B.type || B.type === C.type || C.type === D.type) continue;

 const XA = Math.abs(A.price - X.price);
 const AB = Math.abs(B.price - A.price);
 const BC = Math.abs(C.price - B.price);
 const CD = Math.abs(D.price - C.price);
 const XD = Math.abs(D.price - X.price);

 const ab_xa = AB / XA;
 const bc_ab = BC / AB;
 const cd_bc = CD / BC;
 const xd_xa = XD / XA;

 const direction = D.type === 'low' ? 'bullish' : 'bearish';
 const shapeColor = direction === 'bullish' ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)';
 const shapePoints = [
 { time: X.time, price: X.price },
 { time: A.time, price: A.price },
 { time: B.time, price: B.price },
 { time: X.time, price: X.price },
 { time: B.time, price: B.price },
 { time: C.time, price: C.price },
 { time: D.time, price: D.price },
 { time: B.time, price: B.price },
 ];

 let patternType = '';
 let confidence = 0.6;

 // ── Gartley ──
 // AB = 0.618 XA
 // BC = 0.382 or 0.886 AB
 // CD = 1.27 or 1.618 BC
 // AD = 0.786 XA
 if (matchRatio(ab_xa, 0.618, 0.1) && matchRatio(xd_xa, 0.786, 0.1)) {
 patternType = 'Gartley';
 confidence = 0.85;
 }
 // ── Butterfly ──
 // AB = 0.786 XA
 // CD = 1.618 to 2.618 BC
 // AD = 1.27 or 1.618 XA
 else if (matchRatio(ab_xa, 0.786, 0.1) && (matchRatio(xd_xa, 1.27, 0.1) || matchRatio(xd_xa, 1.618, 0.1))) {
 patternType = 'Butterfly';
 confidence = 0.85;
 }
 // ── Bat ──
 // AB = 0.382 or 0.5 XA
 // AD = 0.886 XA
 else if ((matchRatio(ab_xa, 0.382, 0.1) || matchRatio(ab_xa, 0.5, 0.1)) && matchRatio(xd_xa, 0.886, 0.1)) {
 patternType = 'Bat';
 confidence = 0.8;
 }
 // ── Crab ──
 // AB = 0.382 to 0.618 XA
 // AD = 1.618 XA
 else if (ab_xa >= 0.382 && ab_xa <= 0.618 && matchRatio(xd_xa, 1.618, 0.15)) {
 patternType = 'Crab';
 confidence = 0.8;
 }

 if (patternType) {
 patterns.push({
 type: patternType,
 labelAr: `pattern ${patternType === 'Gartley' ? '' : patternType === 'Butterfly' ? '' : patternType === 'Bat' ? 'Bat' : ''} `,
 time: D.time,
 price: D.price,
 confidence,
 direction,
 shapeType: 'harmonic',
 shapePoints,
 shapeColor,
 });
 // Skip the matched points to avoid overlapping patterns
 i += 4; 
 }
 }

 return patterns;
}

export function detectClassicPatterns(candles: CandleData[]): AIPattern[] {
 const patterns: AIPattern[] = [];
 if (!candles || candles.length < 15) return patterns;

 const pivots = findPivots(candles, 4, 0.3);
 if (pivots.length < 3) return patterns;

 // Double Top / Bottom
 for (let i = 0; i <= pivots.length - 3; i++) {
 const A = pivots[i];
 const B = pivots[i + 1];
 const C = pivots[i + 2];

 if (A.type === C.type && A.type !== B.type) {
 if (matchRatio(A.price, C.price, 0.02)) {
 patterns.push({
 type: A.type === 'high' ? 'Double Top' : 'Double Bottom',
 labelAr: A.type === 'high' ? 'high ' : 'low ',
 time: C.time,
 price: C.price,
 confidence: 0.75,
 direction: A.type === 'high' ? 'bearish' : 'bullish',
 shapeType: 'classic',
 shapePoints: [
 { time: A.time, price: A.price },
 { time: B.time, price: B.price },
 { time: C.time, price: C.price }
 ],
 shapeColor: A.type === 'high' ? 'rgba(255,71,87,0.3)' : 'rgba(0,255,163,0.3)',
 });
 }
 }
 }

 // Head and Shoulders
 for (let i = 0; i <= pivots.length - 5; i++) {
 const A = pivots[i]; // Left Shoulder
 const B = pivots[i + 1]; // Neck 1
 const C = pivots[i + 2]; // Head
 const D = pivots[i + 3]; // Neck 2
 const E = pivots[i + 4]; // Right Shoulder

 if (A.type === 'high' && C.type === 'high' && E.type === 'high') {
 if (C.price > A.price && C.price > E.price && matchRatio(A.price, E.price, 0.05) && matchRatio(B.price, D.price, 0.05)) {
 patterns.push({
 type: 'Head and Shoulders',
 labelAr: ' in',
 time: E.time,
 price: E.price,
 confidence: 0.85,
 direction: 'bearish',
 shapeType: 'classic',
 shapePoints: [
 { time: A.time, price: A.price },
 { time: B.time, price: B.price },
 { time: C.time, price: C.price },
 { time: D.time, price: D.price },
 { time: E.time, price: E.price }
 ],
 shapeColor: 'rgba(255,71,87,0.3)',
 });
 }
 } else if (A.type === 'low' && C.type === 'low' && E.type === 'low') {
 if (C.price < A.price && C.price < E.price && matchRatio(A.price, E.price, 0.05) && matchRatio(B.price, D.price, 0.05)) {
 patterns.push({
 type: 'Inverse Head and Shoulders',
 labelAr: ' in with',
 time: E.time,
 price: E.price,
 confidence: 0.85,
 direction: 'bullish',
 shapeType: 'classic',
 shapePoints: [
 { time: A.time, price: A.price },
 { time: B.time, price: B.price },
 { time: C.time, price: C.price },
 { time: D.time, price: D.price },
 { time: E.time, price: E.price }
 ],
 shapeColor: 'rgba(0,255,163,0.3)',
 });
 }
 }
 }

 return patterns;
}
