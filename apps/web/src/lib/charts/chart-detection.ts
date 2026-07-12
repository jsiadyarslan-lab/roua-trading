// ═══════════════════════════════════════════════════════════════════════
// ROUA Chart Detection Engine — ZigZag-based Pattern Detection
//
// Based on deep research into:
// - AutoChartist detection pipeline: ZigZag → Swing Points → Pattern Match
// - Algorithmic pattern detection (Lo, Mamaysky, Wang 2000)
// - ATR-adaptive thresholds for dynamic markets
//
// KEY PRINCIPLE: Trend lines draw on the LAST pattern only, not all candles.
// After a pattern break, a new pattern is drawn.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';
import type { Time } from 'lightweight-charts';

// ── Core Types ─────────────────────────────────────────────────────

export interface SwingPoint {
 index: number;
 time: number;
 price: number;
 type: 'HIGH' | 'LOW';
 structureLabel?: 'HH' | 'HL' | 'LH' | 'LL'; // Market structure
}

export interface DetectedTrendLine {
 startPoint: { time: number; price: number };
 endPoint: { time: number; price: number };
 type: 'support' | 'resistance';
 touchCount: number;
 strength: number; // 0-1
}

export interface DetectedPattern {
 type: string; // 'HEAD_AND_SHOULDERS', 'DOUBLE_TOP', etc.
 direction: 'bullish' | 'bearish' | 'neutral';
 confidence: number; // 0-1
 points: SwingPoint[]; // Pattern defining points
 neckline?: { start: { time: number; price: number }; end: { time: number; price: number } };
 targetPrice?: number;
 breakoutPrice?: number;
}

export interface DetectedHarmonic {
 type: string; // 'GARTLEY', 'BAT', 'BUTTERFLY', 'CRAB', 'CYPHER', 'SHARK'
 direction: 'bullish' | 'bearish';
 confidence: number;
 points: { // XABCD points
 X: { index: number; time: number; price: number };
 A: { index: number; time: number; price: number };
 B: { index: number; time: number; price: number };
 C: { index: number; time: number; price: number };
 D: { index: number; time: number; price: number };
 };
 ratios: { ab_xa: number; bc_ab: number; cd_bc: number; ad_xa: number };
 prLevel: number; // Potential Reversal Zone
}

export interface DetectedBOS {
 type: 'BOS' | 'CHoCH';
 direction: 'bullish' | 'bearish';
 breakIndex: number;
 breakTime: number;
 breakPrice: number;
 brokenLevel: number;
}

export interface DetectedElliott {
 waveCount: 3 | 5;
 direction: 'bullish' | 'bearish';
 labels: { waveNumber: number; index: number; time: number; price: number }[];
 confidence: number;
}

export interface SRLevel {
 price: number;
 type: 'support' | 'resistance';
 strength: number;
 touchCount: number;
}

export interface FVGZone {
 type: 'bullish' | 'bearish';
 highPrice: number;
 lowPrice: number;
 startIndex: number;
 startTime: number;
 endIndex: number;
 endTime: number;
 filled: boolean;
}


// ═══════════════════════════════════════════════════════════════════════
// 1. ZIGZAG INDICATOR — The Foundation
// ═══════════════════════════════════════════════════════════════════════

/**
 * ATR-based ZigZag — adapts to market volatility.
 * This is the foundation for ALL pattern detection.
 * Based on AutoChartist's approach: adaptive threshold using ATR.
 */
export function computeZigZag(
 candles: CandleData[],
 atrMultiplier: number = 2.0,
 lookback: number = 14,
): SwingPoint[] {
 if (candles.length < 10) return [];

 const swingPoints: SwingPoint[] = [];
 let state: 'UNKNOWN' | 'UP' | 'DOWN' = 'UNKNOWN';
 let lastHighIdx = 0, lastLowIdx = 0;
 let lastHigh = candles[0].high, lastLow = candles[0].low;

 // Calculate ATR for dynamic threshold
 const atr = computeATR(candles, lookback);

 for (let i = 1; i < candles.length; i++) {
 const threshold = (atr[i] || (candles[i].high - candles[i].low)) * atrMultiplier;

 const changeFromHigh = lastHigh - candles[i].low;
 const changeFromLow = candles[i].high - lastLow;

 if (state === 'UNKNOWN') {
 if (changeFromHigh >= threshold) {
 swingPoints.push({ index: lastHighIdx, time: candles[lastHighIdx].time, price: lastHigh, type: 'HIGH' });
 state = 'DOWN';
 lastLow = candles[i].low;
 lastLowIdx = i;
 } else if (changeFromLow >= threshold) {
 swingPoints.push({ index: lastLowIdx, time: candles[lastLowIdx].time, price: lastLow, type: 'LOW' });
 state = 'UP';
 lastHigh = candles[i].high;
 lastHighIdx = i;
 } else {
 if (candles[i].high > lastHigh) { lastHigh = candles[i].high; lastHighIdx = i; }
 if (candles[i].low < lastLow) { lastLow = candles[i].low; lastLowIdx = i; }
 }
 } else if (state === 'UP') {
 if (candles[i].high > lastHigh) {
 lastHigh = candles[i].high;
 lastHighIdx = i;
 }
 if (changeFromHigh >= threshold) {
 swingPoints.push({ index: lastHighIdx, time: candles[lastHighIdx].time, price: lastHigh, type: 'HIGH' });
 state = 'DOWN';
 lastLow = candles[i].low;
 lastLowIdx = i;
 }
 } else if (state === 'DOWN') {
 if (candles[i].low < lastLow) {
 lastLow = candles[i].low;
 lastLowIdx = i;
 }
 if (changeFromLow >= threshold) {
 swingPoints.push({ index: lastLowIdx, time: candles[lastLowIdx].time, price: lastLow, type: 'LOW' });
 state = 'UP';
 lastHigh = candles[i].high;
 lastHighIdx = i;
 }
 }
 }

 // Label market structure (HH, HL, LH, LL)
 return labelMarketStructure(swingPoints);
}

/** Simple ATR calculation */
function computeATR(candles: CandleData[], period: number = 14): number[] {
 const atr: number[] = [candles[0].high - candles[0].low];
 for (let i = 1; i < candles.length; i++) {
 const tr = Math.max(
 candles[i].high - candles[i].low,
 Math.abs(candles[i].high - candles[i - 1].close),
 Math.abs(candles[i].low - candles[i - 1].close),
 );
 atr.push(i < period ? tr : (atr[i - 1] * (period - 1) + tr) / period);
 }
 return atr;
}

/** Label market structure: HH (Higher High), HL (Higher Low), LH (Lower High), LL (Lower Low) */
function labelMarketStructure(swings: SwingPoint[]): SwingPoint[] {
 for (let i = 2; i < swings.length; i++) {
 if (swings[i].type === 'HIGH') {
 const prevHigh = findPrevSwing(swings, i, 'HIGH');
 if (prevHigh !== null) {
 swings[i].structureLabel = swings[i].price > swings[prevHigh].price ? 'HH' : 'LH';
 }
 } else {
 const prevLow = findPrevSwing(swings, i, 'LOW');
 if (prevLow !== null) {
 swings[i].structureLabel = swings[i].price < swings[prevLow].price ? 'LL' : 'HL';
 }
 }
 }
 return swings;
}

function findPrevSwing(swings: SwingPoint[], currentIndex: number, type: 'HIGH' | 'LOW'): number | null {
 for (let i = currentIndex - 1; i >= 0; i--) {
 if (swings[i].type === type) return i;
 }
 return null;
}


// ═══════════════════════════════════════════════════════════════════════
// 2. TREND LINE DETECTION — Last Pattern Only
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect trend lines from ZigZag swing points.
 * KEY: Only draws on the CURRENT/RECENT pattern, not all candles.
 * A trend line connects 2+ swing points of the same type with no breaks.
 */
export function detectTrendLines(candles: CandleData[], swings: SwingPoint[]): DetectedTrendLine[] {
 if (swings.length < 4) return [];

 const lines: DetectedTrendLine[] = [];

 // Support lines: connect swing LOWs
 const swingLows = swings.filter(s => s.type === 'LOW');
 for (let i = swingLows.length - 1; i >= Math.max(0, swingLows.length - 3); i--) {
 for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
 const line = tryCreateTrendLine(candles, swingLows[j], swingLows[i], 'support');
 if (line) lines.push(line);
 }
 }

 // Resistance lines: connect swing HIGHs
 const swingHighs = swings.filter(s => s.type === 'HIGH');
 for (let i = swingHighs.length - 1; i >= Math.max(0, swingHighs.length - 3); i--) {
 for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
 const line = tryCreateTrendLine(candles, swingHighs[j], swingHighs[i], 'resistance');
 if (line) lines.push(line);
 }
 }

 // Return strongest lines, max 4
 return lines
 .sort((a, b) => b.strength - a.strength)
 .slice(0, 4);
}

function tryCreateTrendLine(
 candles: CandleData[],
 start: SwingPoint,
 end: SwingPoint,
 type: 'support' | 'resistance',
): DetectedTrendLine | null {
 const slope = (end.price - start.price) / (end.index - start.index);

 // Count touches: how many times price approaches the line without breaking it
 let touches = 2; // Start and end points
 const tolerance = (candles[end.index].high - candles[end.index].low) * 0.3;

 for (let i = start.index + 1; i < end.index; i++) {
 const linePrice = start.price + slope * (i - start.index);
 const candle = candles[i];

 if (type === 'support') {
 // Check if low touches the line
 if (Math.abs(candle.low - linePrice) < tolerance) {
 touches++;
 }
 // Check if line is broken (close below support)
 if (candle.close < linePrice - tolerance) {
 return null; // Line is broken, invalid
 }
 } else {
 // Check if high touches the line
 if (Math.abs(candle.high - linePrice) < tolerance) {
 touches++;
 }
 // Check if line is broken (close above resistance)
 if (candle.close > linePrice + tolerance) {
 return null;
 }
 }
 }

 // Extend the line to the current price
 const lastCandleIndex = candles.length - 1;
 const extendedPrice = start.price + slope * (lastCandleIndex - start.index);

 return {
 startPoint: { time: start.time, price: start.price },
 endPoint: { time: candles[lastCandleIndex].time, price: extendedPrice },
 type,
 touchCount: touches,
 strength: Math.min(1, touches * 0.2 + (end.index - start.index) * 0.002),
 };
}


// ═══════════════════════════════════════════════════════════════════════
// 3. CLASSIC PATTERN DETECTION (AutoChartist-style)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect classic chart patterns from ZigZag swing points.
 * Types: Head & Shoulders, Double Top/Bottom, Triangles, Wedges, Channels
 */
export function detectClassicPatterns(swings: SwingPoint[]): DetectedPattern[] {
 const patterns: DetectedPattern[] = [];
 if (swings.length < 5) return patterns;

 // Head & Shoulders (need 6 points: L-H-L-H-L-H)
 patterns.push(...detectHeadAndShoulders(swings));

 // Double Top/Bottom (need 4 points: L-H-L-H or H-L-H-L)
 patterns.push(...detectDoubleTopBottom(swings));

 // Triangles (need 5+ points with converging/diverging lines)
 patterns.push(...detectTriangles(swings));

 return patterns.filter(p => p.confidence > 0.3);
}

function detectHeadAndShoulders(swings: SwingPoint[]): DetectedPattern[] {
 const patterns: DetectedPattern[] = [];

 for (let i = 0; i <= swings.length - 6; i++) {
 const s = swings.slice(i, i + 6);

 // Bearish H&S: L-H-L-H-L-H where middle H is highest
 if (s[0].type === 'LOW' && s[1].type === 'HIGH' && s[2].type === 'LOW' &&
 s[3].type === 'HIGH' && s[4].type === 'LOW' && s[5].type === 'HIGH') {

 const ls = s[1].price, head = s[3].price, rs = s[5].price;
 const nl1 = s[2].price, nl2 = s[4].price;

 if (head > ls && head > rs) {
 const shoulderRatio = Math.min(ls, rs) / Math.max(ls, rs);
 const necklineDiff = Math.abs(nl1 - nl2) / head;

 if (shoulderRatio > 0.85 && necklineDiff < 0.05) {
 const confidence = shoulderRatio * 0.4 + (1 - necklineDiff / 0.05) * 0.3 + 0.3;
 patterns.push({
 type: 'HEAD_AND_SHOULDERS',
 direction: 'bearish',
 confidence,
 points: [...s],
 neckline: { start: { time: s[2].time, price: nl1 }, end: { time: s[4].time, price: nl2 } },
 targetPrice: nl1 - (head - Math.max(nl1, nl2)),
 breakoutPrice: Math.min(nl1, nl2),
 });
 }
 }
 }

 // Bullish Inverse H&S: H-L-H-L-H-L where middle L is lowest
 if (s[0].type === 'HIGH' && s[1].type === 'LOW' && s[2].type === 'HIGH' &&
 s[3].type === 'LOW' && s[4].type === 'HIGH' && s[5].type === 'LOW') {

 const ls = s[1].price, head = s[3].price, rs = s[5].price;
 const nl1 = s[2].price, nl2 = s[4].price;

 if (head < ls && head < rs) {
 const shoulderRatio = Math.min(ls, rs) / Math.max(ls, rs);
 const necklineDiff = Math.abs(nl1 - nl2) / ls;

 if (shoulderRatio > 0.85 && necklineDiff < 0.05) {
 patterns.push({
 type: 'INVERSE_HEAD_AND_SHOULDERS',
 direction: 'bullish',
 confidence: shoulderRatio * 0.4 + (1 - necklineDiff / 0.05) * 0.3 + 0.3,
 points: [...s],
 neckline: { start: { time: s[2].time, price: nl1 }, end: { time: s[4].time, price: nl2 } },
 targetPrice: nl1 + (Math.min(nl1, nl2) - head),
 breakoutPrice: Math.max(nl1, nl2),
 });
 }
 }
 }
 }
 return patterns;
}

function detectDoubleTopBottom(swings: SwingPoint[]): DetectedPattern[] {
 const patterns: DetectedPattern[] = [];

 for (let i = 0; i <= swings.length - 4; i++) {
 const s = swings.slice(i, i + 4);

 // Double Top: L-H-L-H (two peaks at similar level)
 if (s[0].type === 'LOW' && s[1].type === 'HIGH' && s[2].type === 'LOW' && s[3].type === 'HIGH') {
 const peakRatio = Math.min(s[1].price, s[3].price) / Math.max(s[1].price, s[3].price);
 if (peakRatio > 0.97) {
 patterns.push({
 type: 'DOUBLE_TOP',
 direction: 'bearish',
 confidence: peakRatio,
 points: [...s],
 neckline: { start: { time: s[0].time, price: s[0].price }, end: { time: s[2].time, price: s[2].price } },
 targetPrice: s[2].price - (Math.max(s[1].price, s[3].price) - s[2].price),
 breakoutPrice: s[2].price,
 });
 }
 }

 // Double Bottom: H-L-H-L (two troughs at similar level)
 if (s[0].type === 'HIGH' && s[1].type === 'LOW' && s[2].type === 'HIGH' && s[3].type === 'LOW') {
 const troughRatio = Math.min(s[1].price, s[3].price) / Math.max(s[1].price, s[3].price);
 if (troughRatio > 0.97) {
 patterns.push({
 type: 'DOUBLE_BOTTOM',
 direction: 'bullish',
 confidence: troughRatio,
 points: [...s],
 neckline: { start: { time: s[0].time, price: s[0].price }, end: { time: s[2].time, price: s[2].price } },
 targetPrice: s[2].price + (s[2].price - Math.min(s[1].price, s[3].price)),
 breakoutPrice: s[2].price,
 });
 }
 }
 }
 return patterns;
}

function detectTriangles(swings: SwingPoint[]): DetectedPattern[] {
 const patterns: DetectedPattern[] = [];
 if (swings.length < 5) return patterns;

 for (let i = 0; i <= swings.length - 5; i++) {
 const segment = swings.slice(i, i + 5);
 const highs = segment.filter(s => s.type === 'HIGH');
 const lows = segment.filter(s => s.type === 'LOW');

 if (highs.length < 2 || lows.length < 2) continue;

 const highSlope = linearRegressionSlope(highs.map(h => ({ x: h.index, y: h.price })));
 const lowSlope = linearRegressionSlope(lows.map(l => ({ x: l.index, y: l.price })));
 const highR2 = linearRegressionR2(highs.map(h => ({ x: h.index, y: h.price })));
 const lowR2 = linearRegressionR2(lows.map(l => ({ x: l.index, y: l.price })));

 let triangleType: string | null = null;
 let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';

 if (Math.abs(highSlope) < 0.001 && lowSlope > 0) {
 triangleType = 'ASCENDING_TRIANGLE';
 direction = 'bullish';
 } else if (highSlope < 0 && Math.abs(lowSlope) < 0.001) {
 triangleType = 'DESCENDING_TRIANGLE';
 direction = 'bearish';
 } else if (highSlope < 0 && lowSlope > 0) {
 triangleType = 'SYMMETRICAL_TRIANGLE';
 direction = 'neutral';
 } else if (highSlope > 0 && lowSlope < 0) {
 triangleType = 'EXPANDING_TRIANGLE';
 direction = 'neutral';
 } else if (highSlope > 0 && lowSlope > 0 && highSlope > lowSlope) {
 triangleType = 'RISING_WEDGE';
 direction = 'bearish';
 } else if (highSlope < 0 && lowSlope < 0 && Math.abs(lowSlope) > Math.abs(highSlope)) {
 triangleType = 'FALLING_WEDGE';
 direction = 'bullish';
 }

 if (triangleType && highR2 > 0.5 && lowR2 > 0.5) {
 patterns.push({
 type: triangleType,
 direction,
 confidence: (highR2 + lowR2) / 2,
 points: [...segment],
 });
 }
 }
 return patterns;
}

function linearRegressionSlope(points: { x: number; y: number }[]): number {
 const n = points.length;
 if (n < 2) return 0;
 const sumX = points.reduce((s, p) => s + p.x, 0);
 const sumY = points.reduce((s, p) => s + p.y, 0);
 const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
 const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
 const denom = n * sumX2 - sumX * sumX;
 return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function linearRegressionR2(points: { x: number; y: number }[]): number {
 const n = points.length;
 if (n < 2) return 0;
 const meanY = points.reduce((s, p) => s + p.y, 0) / n;
 const ssTotal = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
 if (ssTotal === 0) return 1;
 const slope = linearRegressionSlope(points);
 const meanX = points.reduce((s, p) => s + p.x, 0) / n;
 const intercept = meanY - slope * meanX;
 const ssResidual = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
 return Math.max(0, 1 - ssResidual / ssTotal);
}


// ═══════════════════════════════════════════════════════════════════════
// 4. HARMONIC PATTERN DETECTION (XABCD)
// ═══════════════════════════════════════════════════════════════════════

const HARMONIC_PATTERNS: Record<string, { AB_XA: [number, number]; BC_AB: [number, number]; CD_BC: [number, number]; AD_XA: [number, number] }> = {
 GARTLEY: { AB_XA: [0.618, 0.618], BC_AB: [0.382, 0.886], CD_BC: [1.13, 1.618], AD_XA: [0.786, 0.786] },
 BAT: { AB_XA: [0.382, 0.50], BC_AB: [0.382, 0.886], CD_BC: [1.618, 2.618], AD_XA: [0.886, 0.886] },
 BUTTERFLY: { AB_XA: [0.786, 0.786], BC_AB: [0.382, 0.886], CD_BC: [1.618, 2.618], AD_XA: [1.27, 1.27] },
 CRAB: { AB_XA: [0.382, 0.618], BC_AB: [0.382, 0.886], CD_BC: [2.618, 3.618], AD_XA: [1.618, 1.618] },
 CYPHER: { AB_XA: [0.382, 0.618], BC_AB: [1.272, 1.414], CD_BC: [0.786, 0.786], AD_XA: [0.786, 0.786] },
 SHARK: { AB_XA: [0.446, 0.618], BC_AB: [1.13, 1.618], CD_BC: [0.886, 1.13], AD_XA: [1.618, 2.24] },
};

export function detectHarmonicPatterns(swings: SwingPoint[], tolerance: number = 0.25): DetectedHarmonic[] {
 const patterns: DetectedHarmonic[] = [];
 if (swings.length < 5) return patterns;

 // Check ALL swing combinations for broader detection
 // FIX: Was only checking last 8 swings which missed many patterns.
 // Now check all, but prioritie recent ones.
 const startIdx = 0;

 for (let i = startIdx; i <= swings.length - 5; i++) {
 const X = swings[i], A = swings[i + 1], B = swings[i + 2], C = swings[i + 3], D = swings[i + 4];

 // Validate alternating pattern
 if (X.type === A.type || A.type === B.type || B.type === C.type || C.type === D.type) continue;

 const XA = Math.abs(A.price - X.price);
 const AB = Math.abs(B.price - A.price);
 const BC = Math.abs(C.price - B.price);
 const CD = Math.abs(D.price - C.price);
 const AD = Math.abs(D.price - A.price);

 if (XA === 0 || AB === 0 || BC === 0) continue;

 const ab_xa = AB / XA;
 const bc_ab = BC / AB;
 const cd_bc = CD / BC;
 const ad_xa = AD / XA;

 // BUG-001 FIX: Harmonic direction was INVERTED.
 // Bullish harmonic: X is HIGH, A is LOW (X→A is DOWN) → price expected to reverse UP.
 // Bearish harmonic: X is LOW, A is HIGH (X→A is UP) → price expected to reverse DOWN.
 // Old (wrong): X.price < A.price ? 'bullish' : 'bearish'
 // → X lower, A higher (X→A UP) = bearish harmonic, but labeled bullish. INVERTED.
 // New (correct): X.price < A.price ? 'bearish' : 'bullish'
 const direction = X.price < A.price ? 'bearish' : 'bullish';

 for (const [patternName, ratios] of Object.entries(HARMONIC_PATTERNS)) {
 if (
 isWithinTolerance(ab_xa, ratios.AB_XA, tolerance) &&
 isWithinTolerance(bc_ab, ratios.BC_AB, tolerance) &&
 isWithinTolerance(cd_bc, ratios.CD_BC, tolerance) &&
 isWithinTolerance(ad_xa, ratios.AD_XA, tolerance)
 ) {
 const confidence = calculateHarmonicConfidence(
 { ab_xa, bc_ab, cd_bc, ad_xa }, ratios, tolerance,
 );

 patterns.push({
 type: patternName,
 direction,
 confidence,
 points: {
 X: { index: X.index, time: X.time, price: X.price },
 A: { index: A.index, time: A.time, price: A.price },
 B: { index: B.index, time: B.time, price: B.price },
 C: { index: C.index, time: C.time, price: C.price },
 D: { index: D.index, time: D.time, price: D.price },
 },
 ratios: { ab_xa, bc_ab, cd_bc, ad_xa },
 prLevel: D.price,
 });
 }
 }
 }

 // FIX: Return the most recent patterns (by point D time) with highest confidence,
 // limited to 4. Previously could return stale patterns from old swings.
 return patterns
 .sort((a, b) => {
 // Prefer recent patterns (higher D point index)
 const timeDiff = (b.points.D.index || 0) - (a.points.D.index || 0);
 if (timeDiff !== 0) return timeDiff;
 return b.confidence - a.confidence;
 })
 .slice(0, 4);
}

function isWithinTolerance(actual: number, target: [number, number], tolerance: number): boolean {
 return actual >= target[0] * (1 - tolerance) && actual <= target[1] * (1 + tolerance);
}

function calculateHarmonicConfidence(
 actual: { ab_xa: number; bc_ab: number; cd_bc: number; ad_xa: number },
 target: { AB_XA: [number, number]; BC_AB: [number, number]; CD_BC: [number, number]; AD_XA: [number, number] },
 tolerance: number,
): number {
 const idealAB = (target.AB_XA[0] + target.AB_XA[1]) / 2;
 const idealBC = (target.BC_AB[0] + target.BC_AB[1]) / 2;
 const idealCD = (target.CD_BC[0] + target.CD_BC[1]) / 2;
 const idealAD = (target.AD_XA[0] + target.AD_XA[1]) / 2;

 const scoreAB = 1 - Math.min(1, Math.abs(actual.ab_xa - idealAB) / (idealAB * tolerance));
 const scoreBC = 1 - Math.min(1, Math.abs(actual.bc_ab - idealBC) / (idealBC * tolerance));
 const scoreCD = 1 - Math.min(1, Math.abs(actual.cd_bc - idealCD) / (idealCD * tolerance));
 const scoreAD = 1 - Math.min(1, Math.abs(actual.ad_xa - idealAD) / (idealAD * tolerance));

 return scoreAB * 0.2 + scoreBC * 0.2 + scoreCD * 0.2 + scoreAD * 0.4;
}


// ═══════════════════════════════════════════════════════════════════════
// 5. BOS / CHoCH DETECTION (Smart Money Concepts)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detect Break of Structure (BOS) and Change of Character (CHoCH).
 * BOS = break in the direction of the trend (continuation)
 * CHoCH = break against the trend (reversal)
 * KEY RULE: Must use candle body close, not wick
 */
export function detectBOS(candles: CandleData[], swings: SwingPoint[]): DetectedBOS[] {
 const breaks: DetectedBOS[] = [];
 if (swings.length < 4 || candles.length < 20) return breaks;

 // Determine initial trend
 let currentTrend: 'uptrend' | 'downtrend' = 'uptrend';
 const recentSwings = swings.slice(-6);
 const recentHighs = recentSwings.filter(s => s.type === 'HIGH').map(s => s.price);
 const recentLows = recentSwings.filter(s => s.type === 'LOW').map(s => s.price);
 if (recentHighs.length >= 2 && recentLows.length >= 2) {
 currentTrend = (recentHighs[recentHighs.length - 1] > recentHighs[recentHighs.length - 2] &&
 recentLows[recentLows.length - 1] > recentLows[recentLows.length - 2])
 ? 'uptrend' : 'downtrend';
 }

 // Check recent candles for structure breaks
 const lookbackStart = Math.max(swings[0].index, candles.length - 50);

 for (let i = lookbackStart; i < candles.length; i++) {
 const close = candles[i].close;

 // Find the most recent swing high and low before this candle
 const recentHigh = getLastSwingBefore(swings, i, 'HIGH');
 const recentLow = getLastSwingBefore(swings, i, 'LOW');

 if (!recentHigh || !recentLow) continue;

 // Bullish BOS: Close breaks above recent swing high in uptrend
 if (close > recentHigh.price && currentTrend === 'uptrend') {
 breaks.push({
 type: 'BOS',
 direction: 'bullish',
 breakIndex: i,
 breakTime: candles[i].time,
 breakPrice: close,
 brokenLevel: recentHigh.price,
 });
 }

 // Bearish CHoCH: Close breaks below recent swing low in uptrend
 if (close < recentLow.price && currentTrend === 'uptrend') {
 breaks.push({
 type: 'CHoCH',
 direction: 'bearish',
 breakIndex: i,
 breakTime: candles[i].time,
 breakPrice: close,
 brokenLevel: recentLow.price,
 });
 currentTrend = 'downtrend';
 }

 // Bearish BOS: Close breaks below recent swing low in downtrend
 if (close < recentLow.price && currentTrend === 'downtrend') {
 breaks.push({
 type: 'BOS',
 direction: 'bearish',
 breakIndex: i,
 breakTime: candles[i].time,
 breakPrice: close,
 brokenLevel: recentLow.price,
 });
 }

 // Bullish CHoCH: Close breaks above recent swing high in downtrend
 if (close > recentHigh.price && currentTrend === 'downtrend') {
 breaks.push({
 type: 'CHoCH',
 direction: 'bullish',
 breakIndex: i,
 breakTime: candles[i].time,
 breakPrice: close,
 brokenLevel: recentHigh.price,
 });
 currentTrend = 'uptrend';
 }
 }

 // FIX: Deduplicate BOS breaks at similar price levels using ATR-relative
 // threshold instead of fixed decimal rounding. The old approach
 // (Math.round(level * 100) / 100) was fragile:
 // - For BTC ($100k): 2 decimals = $100 gap → different breaks at same level
 // - For EUR/USD (1.08): 2 decimals = $0.01 gap → too coarse
 // ATR-relative threshold: two breaks are "same level" if within ATR/4
 const atr = candles.length >= 14 ? (() => {
 const sl2 = candles.slice(-14);
 // V225 FIX: True Range must use PREVIOUS candle's close, not current candle's close.
 // The old code used c.close (current candle's own close) which is mathematically wrong.
 // True Range = max(high-low, |high-prevClose|, |low-prevClose|)
 const trs = sl2.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - sl2[i - 1].close), Math.abs(c.low - sl2[i - 1].close)));
 return trs.reduce((s, v) => s + v, 0) / trs.length;
 })() : candles.length > 0 ? (candles[candles.length - 1].high - candles[candles.length - 1].low) : 0;

 const threshold = atr / 4; // Two breaks within ATR/4 are considered same level
 const dedupedBreaks: DetectedBOS[] = [];

 for (const br of breaks) {
 const isDuplicate = dedupedBreaks.some(existing =>
 Math.abs(existing.brokenLevel - br.brokenLevel) < threshold &&
 existing.type === br.type &&
 existing.direction === br.direction
 );
 if (!isDuplicate) {
 dedupedBreaks.push(br);
 } else {
 // If this break is more significant (later = more relevant), replace the old one
 const existingIdx = dedupedBreaks.findIndex(existing =>
 Math.abs(existing.brokenLevel - br.brokenLevel) < threshold &&
 existing.type === br.type &&
 existing.direction === br.direction
 );
 if (existingIdx >= 0 && br.breakIndex > dedupedBreaks[existingIdx].breakIndex) {
 dedupedBreaks[existingIdx] = br; // Keep the more recent break
 }
 }
 }

 // Return the most recent breaks (max 6)
 return dedupedBreaks.slice(-6);
}

function getLastSwingBefore(swings: SwingPoint[], candleIndex: number, type: 'HIGH' | 'LOW'): SwingPoint | null {
 for (let i = swings.length - 1; i >= 0; i--) {
 if (swings[i].type === type && swings[i].index < candleIndex) {
 return swings[i];
 }
 }
 return null;
}


// ═══════════════════════════════════════════════════════════════════════
// 6. ELLIOTT WAVE DETECTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Simplified Elliott Wave detection.
 * Looks for 5-wave impulse or 3-wave corrective patterns.
 * FIX: Made detection more lenient — relaxed wave ratio requirements
 * and always provides at least a 3-wave count from recent swings.
 */
export function detectElliottWaves(swings: SwingPoint[]): DetectedElliott | null {
 if (swings.length < 3) return null;

 // Try to find a 5-wave impulse in recent swings
 const startIdx = Math.max(0, swings.length - 10);

 for (let i = startIdx; i <= swings.length - 5; i++) {
 const pts = swings.slice(i, i + 5);

 // Bullish 5-wave: LOW-HIGH-LOW-HIGH-LOW (ascending)
 if (pts.every((p, idx) => idx % 2 === 0 ? p.type === 'LOW' : p.type === 'HIGH')) {
 const [w0, w1, w2, w3, w4] = pts;
 const wave1 = w1.price - w0.price;
 const wave2 = w1.price - w2.price;
 const wave3 = w3.price - w2.price;
 const wave4 = w3.price - w4.price;

 // FIX: Relaxed conditions — wave 3 just needs to be positive and
 // wave 2 shouldn't retrace more than 100% of wave 1. Removed the
 // strict requirement that wave3 >= wave1 * 0.5.
 if (wave3 > 0 && wave2 > 0 && wave4 > 0) {
 return {
 waveCount: 5,
 direction: 'bullish',
 labels: [
 { waveNumber: 0, index: w0.index, time: w0.time, price: w0.price },
 { waveNumber: 1, index: w1.index, time: w1.time, price: w1.price },
 { waveNumber: 2, index: w2.index, time: w2.time, price: w2.price },
 { waveNumber: 3, index: w3.index, time: w3.time, price: w3.price },
 { waveNumber: 4, index: w4.index, time: w4.time, price: w4.price },
 { waveNumber: 5, index: w4.index, time: w4.time, price: w4.price },
 ],
 confidence: Math.min(0.9, 0.5 + (wave3 / wave1 > 1 ? 0.2 : 0)),
 };
 }
 }

 // Bearish 5-wave: HIGH-LOW-HIGH-LOW-HIGH (descending)
 if (pts.every((p, idx) => idx % 2 === 0 ? p.type === 'HIGH' : p.type === 'LOW')) {
 const [w0, w1, w2, w3, w4] = pts;
 const wave1 = w0.price - w1.price;
 const wave2 = w2.price - w1.price;
 const wave3 = w2.price - w3.price;
 const wave4 = w4.price - w3.price;

 // FIX: Same relaxed conditions as bullish
 if (wave3 > 0 && wave2 > 0 && wave4 > 0) {
 return {
 waveCount: 5,
 direction: 'bearish',
 labels: [
 { waveNumber: 0, index: w0.index, time: w0.time, price: w0.price },
 { waveNumber: 1, index: w1.index, time: w1.time, price: w1.price },
 { waveNumber: 2, index: w2.index, time: w2.time, price: w2.price },
 { waveNumber: 3, index: w3.index, time: w3.time, price: w3.price },
 { waveNumber: 4, index: w4.index, time: w4.time, price: w4.price },
 { waveNumber: 5, index: w4.index, time: w4.time, price: w4.price },
 ],
 confidence: Math.min(0.9, 0.5 + (wave3 / wave1 > 1 ? 0.2 : 0)),
 };
 }
 }
 }

 // FIX: Always provide a 3-wave count from the last 3 swings.
 // Previously, the 3-wave fallback had a confusing type check that
 // often failed. Now we simply use the last 3 alternating swings.
 if (swings.length >= 3) {
 const last3 = swings.slice(-3);
 // Ensure alternating types
 if (last3[0].type !== last3[1].type && last3[1].type !== last3[2].type) {
 const isBull = last3[2].price > last3[0].price;
 return {
 waveCount: 3,
 direction: isBull ? 'bullish' : 'bearish',
 labels: last3.map((s, i) => ({
 waveNumber: i === 0 ? 0 : i === 1 ? 1 : 2,
 index: s.index,
 time: s.time,
 price: s.price,
 })),
 confidence: 0.4,
 };
 }
 }

 return null;
}


// ═══════════════════════════════════════════════════════════════════════
// 7. SUPPORT/RESISTANCE DETECTION (Clustering-based)
// ═══════════════════════════════════════════════════════════════════════

export function detectSRLevels(candles: CandleData[], clusterThreshold: number = 0.01): SRLevel[] {
 if (candles.length < 20) return [];

 // Find pivot points (fractal method)
 const pivots: { price: number; type: 'HIGH' | 'LOW' }[] = [];
 for (let i = 2; i < candles.length - 2; i++) {
 if (candles[i].high > candles[i-1].high && candles[i].high > candles[i-2].high &&
 candles[i].high > candles[i+1].high && candles[i].high > candles[i+2].high) {
 pivots.push({ price: candles[i].high, type: 'HIGH' });
 }
 if (candles[i].low < candles[i-1].low && candles[i].low < candles[i-2].low &&
 candles[i].low < candles[i+1].low && candles[i].low < candles[i+2].low) {
 pivots.push({ price: candles[i].low, type: 'LOW' });
 }
 }

 // Cluster nearby pivots
 const sorted = [...pivots].sort((a, b) => a.price - b.price);
 const clusters: { prices: number[]; types: Set<string> }[] = [];
 let current: typeof clusters[0] | null = null;

 for (const pivot of sorted) {
 if (!current || Math.abs(pivot.price - current.prices[0]) / current.prices[0] > clusterThreshold) {
 current = { prices: [pivot.price], types: new Set([pivot.type]) };
 clusters.push(current);
 } else {
 current.prices.push(pivot.price);
 current.types.add(pivot.type);
 }
 }

 return clusters
 .map(cluster => {
 const avgPrice = cluster.prices.reduce((a, b) => a + b, 0) / cluster.prices.length;
 const hasHigh = cluster.types.has('HIGH');
 const hasLow = cluster.types.has('LOW');
 return {
 price: avgPrice,
 type: (hasHigh && hasLow ? 'resistance' : hasHigh ? 'resistance' : 'support') as 'support' | 'resistance',
 strength: Math.min(1, cluster.prices.length * 0.2),
 touchCount: cluster.prices.length,
 };
 })
 .sort((a, b) => b.strength - a.strength)
 .slice(0, 6);
}


// ═══════════════════════════════════════════════════════════════════════
// 8. FVG (Fair Value Gap) DETECTION
// ═══════════════════════════════════════════════════════════════════════

export function detectFVGs(candles: CandleData[]): FVGZone[] {
 const fvgs: FVGZone[] = [];
 if (candles.length < 3) return fvgs;

 // FIX: Scan more candles — was only 30, now 60, because FVGs from
 // earlier can still be relevant for unfilled ones.
 const lookback = Math.min(60, candles.length);
 const startIdx = candles.length - lookback;

 // Calculate ATR for minimum gap filter — tiny gaps are noise, not real FVGs
 const atr = computeATR(candles, 14);
 const recentATR = atr[atr.length - 1] || (candles[candles.length - 1].high - candles[candles.length - 1].low);
 // FIX: Lowered minimum gap from 0.3x to 0.15x ATR. Crypto charts
 // often have small gaps that are still valid FVGs. The 0.3x filter
 // was too aggressive and caused FVG overlay to show nothing.
 const minGapSie = recentATR * 0.15;

 for (let i = startIdx + 2; i < candles.length; i++) {
 const prev = candles[i - 2];
 const mid = candles[i - 1]; // Middle candle — confirms impulse direction
 const curr = candles[i];

 // Bullish FVG: gap between prev high and curr low
 // FIX: Removed the requirement that middle candle must be bullish.
 // In crypto, FVGs can form even when the middle candle isn't strongly
 // directional. The gap itself is the signal.
 if (curr.low > prev.high) {
 const gapSie = curr.low - prev.high;
 if (gapSie >= minGapSie) {
 fvgs.push({
 type: 'bullish',
 highPrice: curr.low,
 lowPrice: prev.high,
 startIndex: i - 2,
 startTime: prev.time,
 endIndex: i,
 endTime: curr.time,
 filled: false,
 });
 }
 }

 // Bearish FVG: gap between prev low and curr high
 if (curr.high < prev.low) {
 const gapSie = prev.low - curr.high;
 if (gapSie >= minGapSie) {
 fvgs.push({
 type: 'bearish',
 highPrice: prev.low,
 lowPrice: curr.high,
 startIndex: i - 2,
 startTime: prev.time,
 endIndex: i,
 endTime: curr.time,
 filled: false,
 });
 }
 }
 }

 // Check if recent price has filled any FVGs
 const lastPrice = candles[candles.length - 1].close;
 for (const fvg of fvgs) {
 if (lastPrice >= fvg.lowPrice && lastPrice <= fvg.highPrice) {
 fvg.filled = true;
 }
 }

 // Return up to 5 most recent unfilled FVGs
 return fvgs.filter(f => !f.filled).slice(-5);
}

// ═══════════════════════════════════════════════════════════════════════
// 9. ORDER BLOCK (OB) DETECTION — Phase 4
// ═══════════════════════════════════════════════════════════════════════

export interface OrderBlock {
 type: 'bullish' | 'bearish';
 highPrice: number; // Top of the order block one
 lowPrice: number; // Bottom of the order block one
 startIndex: number; // Index of the OB candle
 startTime: number; // Time of the OB candle
 endIndex: number; // Index where OB was confirmed (BOS candle)
 endTime: number; // Time where OB was confirmed
 strength: number; // 1-5 based on volume and breakout momentum
 mitigated: boolean; // Whether price has returned to the OB one
 mitigationIndex?: number; // Index where mitigation happened
 mitigationTime?: number; // Time where mitigation happened
 labelAr: string; // Arabic label for display
}

/**
 * PHASE 4: Detect Order Blocks from BOS breaks.
 *
 * An Order Block is the last bearish candle before a bullish BOS
 * (or the last bullish candle before a bearish BOS). It represents
 * the institutional order that caused the breakout.
 *
 * Key rules:
 * - Bullish OB: Last bearish (close < open) candle before bullish BOS
 * - Bearish OB: Last bullish (close > open) candle before bearish BOS
 * - OB one = [candle open, candle close] (body only, not wicks)
 * - Strength based on: volume ratio, BOS momentum, ATR relative sie
 * - Mitigation: price returns to OB one after confirmation
 */
export function detectOrderBlocks(
 candles: CandleData[],
 bosBreaks: DetectedBOS[],
): OrderBlock[] {
 const obs: OrderBlock[] = [];
 if (candles.length < 20 || bosBreaks.length === 0) return obs;

 const atrValues = computeATR(candles, 14);
 const recentATR = atrValues[atrValues.length - 1] || (candles[candles.length - 1].high - candles[candles.length - 1].low);

 for (const bos of bosBreaks) {
 // Search backwards from the BOS candle for the OB candle
 const searchStart = Math.max(0, bos.breakIndex - 10);
 let obCandle: CandleData | null = null;
 let obIndex = -1;

 if (bos.direction === 'bullish') {
 // Bullish OB: Find last bearish candle (close < open) before BOS
 for (let i = bos.breakIndex - 1; i >= searchStart; i--) {
 const c = candles[i];
 if (c.close < c.open) { // Bearish candle
 obCandle = c;
 obIndex = i;
 break;
 }
 }
 } else {
 // Bearish OB: Find last bullish candle (close > open) before BOS
 for (let i = bos.breakIndex - 1; i >= searchStart; i--) {
 const c = candles[i];
 if (c.close > c.open) { // Bullish candle
 obCandle = c;
 obIndex = i;
 break;
 }
 }
 }

 if (!obCandle || obIndex < 0) continue;

 // OB one is the candle body (open-close range, not wicks)
 const obHigh = Math.max(obCandle.open, obCandle.close);
 const obLow = Math.min(obCandle.open, obCandle.close);

 // Calculate strength (1-5)
 // - Volume ratio: OB candle volume vs average
 // - BOS momentum: how far price moved beyond the BOS level
 // - OB sie relative to ATR
 const avgVolume = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
 const volRatio = avgVolume > 0 ? (obCandle.volume || 0) / avgVolume : 1;
 const obSieATR = recentATR > 0 ? (obHigh - obLow) / recentATR : 1;
 const bosMomentum = Math.abs(bos.breakPrice - bos.brokenLevel) / (recentATR || 1);

 let strength = 1;
 if (volRatio > 2) strength++;
 if (volRatio > 3) strength++;
 if (obSieATR > 0.5) strength++;
 if (bosMomentum > 1.5) strength++;
 strength = Math.min(5, Math.max(1, strength));

 // Check if OB has been mitigated (price returned to OB one)
 let mitigated = false;
 let mitigationIndex: number | undefined;
 let mitigationTime: number | undefined;
 for (let i = bos.breakIndex + 1; i < candles.length; i++) {
 const c = candles[i];
 if (c.low <= obHigh && c.high >= obLow) {
 // Price entered the OB one
 // For bullish OB: mitigation means price dipped into OB one
 // For bearish OB: mitigation means price rallied into OB one
 if ((bos.direction === 'bullish' && c.low <= obHigh) ||
 (bos.direction === 'bearish' && c.high >= obLow)) {
 mitigated = true;
 mitigationIndex = i;
 mitigationTime = c.time;
 break;
 }
 }
 }

 obs.push({
 type: bos.direction,
 highPrice: obHigh,
 lowPrice: obLow,
 startIndex: obIndex,
 startTime: obCandle.time,
 endIndex: bos.breakIndex,
 endTime: bos.breakTime,
 strength,
 mitigated,
 mitigationIndex,
 mitigationTime,
 labelAr: bos.direction === 'bullish' ? 'but ' : 'but ',
 });
 }

 // Deduplicate: if two OBs overlap significantly (within 0.5 ATR), keep the stronger one
 const deduped: OrderBlock[] = [];
 for (const ob of obs) {
 const overlapping = deduped.find(d =>
 Math.abs(d.highPrice - ob.highPrice) < recentATR * 0.5 &&
 Math.abs(d.lowPrice - ob.lowPrice) < recentATR * 0.5
 );
 if (!overlapping) {
 deduped.push(ob);
 } else if (ob.strength > overlapping.strength) {
 // Replace with stronger OB
 const idx = deduped.indexOf(overlapping);
 deduped[idx] = ob;
 }
 }

 return deduped.slice(0, 8); // Max 8 order blocks
}

// ═══════════════════════════════════════════════════════════════════════
// 10. ENHANCED FVG DETECTION with Fill Tracking — Phase 4
// ═══════════════════════════════════════════════════════════════════════

export interface FVGZoneEnhanced extends FVGZone {
 fillPercent: number; // 0 = unfilled, 1 = fully filled
 fillHighPrice: number; // Highest price that entered the gap
 fillLowPrice: number; // Lowest price that entered the gap
 confluenceWithOB: boolean; // Whether this FVG overlaps with an Order Block
 obLabel?: string; // Label of overlapping OB
}

/**
 * PHASE 4: Enhanced FVG detection with fill tracking and OB confluence.
 *
 * Improvements over basic detectFVGs:
 * 1. Tracks partial fills (what % of the gap has been filled)
 * 2. Returns both filled and unfilled FVGs (filled ones are still useful for context)
 * 3. Detects confluence with Order Blocks (FVG + OB = high-probability one)
 * 4. More accurate fill detection using candle bodies, not just close price
 */
export function detectFVGsEnhanced(
 candles: CandleData[],
 orderBlocks: OrderBlock[],
): FVGZoneEnhanced[] {
 const fvgs: FVGZoneEnhanced[] = [];
 if (candles.length < 3) return fvgs;

 const lookback = Math.min(60, candles.length);
 const startIdx = candles.length - lookback;

 const atrValues = computeATR(candles, 14);
 const recentATR = atrValues[atrValues.length - 1] || (candles[candles.length - 1].high - candles[candles.length - 1].low);
 const minGapSie = recentATR * 0.15;

 for (let i = startIdx + 2; i < candles.length; i++) {
 const prev = candles[i - 2];
 const curr = candles[i];

 // Bullish FVG
 if (curr.low > prev.high) {
 const gapSie = curr.low - prev.high;
 if (gapSie >= minGapSie) {
 const gapHigh = curr.low;
 const gapLow = prev.high;

 // Check fill percentage: how much of the gap has been filled by subsequent candles
 let fillHighPrice = gapHigh;
 let fillLowPrice = gapLow;
 let fillPercent = 0;

 for (let j = i + 1; j < candles.length; j++) {
 const c = candles[j];
 // Check if this candle intrudes into the gap
 if (c.low <= gapHigh && c.high >= gapLow) {
 // Calculate how much of the gap was filled
 const intrusionHigh = Math.min(c.high, gapHigh);
 const intrusionLow = Math.max(c.low, gapLow);
 const intrusionSie = intrusionHigh - intrusionLow;
 const gapSie2 = gapHigh - gapLow;
 const thisFill = gapSie2 > 0 ? intrusionSie / gapSie2 : 0;
 fillPercent = Math.max(fillPercent, thisFill);
 fillHighPrice = Math.min(fillHighPrice, intrusionHigh);
 fillLowPrice = Math.max(fillLowPrice, intrusionLow);
 }
 // For bullish FVG, if price drops below gap, it's fully filled
 if (c.low <= gapLow) {
 fillPercent = 1;
 break;
 }
 }

 // Check confluence with Order Blocks
 let confluenceWithOB = false;
 let obLabel: string | undefined;
 for (const ob of orderBlocks) {
 // FVG overlaps with OB if their price ranges intersect
 if (gapHigh >= ob.lowPrice && gapLow <= ob.highPrice) {
 confluenceWithOB = true;
 obLabel = ob.labelAr;
 break;
 }
 }

 fvgs.push({
 type: 'bullish',
 highPrice: gapHigh,
 lowPrice: gapLow,
 startIndex: i - 2,
 startTime: prev.time,
 endIndex: i,
 endTime: curr.time,
 filled: fillPercent >= 0.8,
 fillPercent,
 fillHighPrice,
 fillLowPrice,
 confluenceWithOB,
 obLabel,
 });
 }
 }

 // Bearish FVG
 if (curr.high < prev.low) {
 const gapSie = prev.low - curr.high;
 if (gapSie >= minGapSie) {
 const gapHigh = prev.low;
 const gapLow = curr.high;

 let fillHighPrice = gapHigh;
 let fillLowPrice = gapLow;
 let fillPercent = 0;

 for (let j = i + 1; j < candles.length; j++) {
 const c = candles[j];
 if (c.low <= gapHigh && c.high >= gapLow) {
 const intrusionHigh = Math.min(c.high, gapHigh);
 const intrusionLow = Math.max(c.low, gapLow);
 const intrusionSie = intrusionHigh - intrusionLow;
 const gapSie2 = gapHigh - gapLow;
 const thisFill = gapSie2 > 0 ? intrusionSie / gapSie2 : 0;
 fillPercent = Math.max(fillPercent, thisFill);
 fillHighPrice = Math.min(fillHighPrice, intrusionHigh);
 fillLowPrice = Math.max(fillLowPrice, intrusionLow);
 }
 // For bearish FVG, if price rises above gap, it's fully filled
 if (c.high >= gapHigh) {
 fillPercent = 1;
 break;
 }
 }

 let confluenceWithOB = false;
 let obLabel: string | undefined;
 for (const ob of orderBlocks) {
 if (gapHigh >= ob.lowPrice && gapLow <= ob.highPrice) {
 confluenceWithOB = true;
 obLabel = ob.labelAr;
 break;
 }
 }

 fvgs.push({
 type: 'bearish',
 highPrice: gapHigh,
 lowPrice: gapLow,
 startIndex: i - 2,
 startTime: prev.time,
 endIndex: i,
 endTime: curr.time,
 filled: fillPercent >= 0.8,
 fillPercent,
 fillHighPrice,
 fillLowPrice,
 confluenceWithOB,
 obLabel,
 });
 }
 }
 }

 // Return up to 8 FVGs (both filled and unfilled for context)
 return fvgs.slice(-8);
}
