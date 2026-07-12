// ═══════════════════════════════════════════════════════════════════════
// ROUA Predictive Pattern Completion — Revolutionary Feature #5
//
// When a pattern is PARTIALLY formed (e.g., 3 out of 5 points of a
// harmonic pattern are visible), this engine predicts where the
// remaining points will likely form. It draws the "ghost" of the
// incomplete pattern on the chart so traders can anticipate the
// completion BEFORE it happens.
//
// This is a game-changer because instead of waiting for patterns to
// complete and then entering late, traders can prepare in advance
// and enter at better prices.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── Types ───────────────────────────────────────────────────────────

export interface PatternPrediction {
 /** Pattern type (e.g., 'Gartley', 'DoubleTop') */
 patternType: string;
 /** Pattern name in Arabic */
 patternTypeAr: string;
 /** Current completion percentage (0-100) */
 completionPct: number;
 /** Direction if completed */
 predictedDirection: 'bullish' | 'bearish';
 /** Current points that are formed */
 formedPoints: Array<{
 label: string;
 price: number;
 index: number;
 }>;
 /** Predicted remaining points */
 predictedPoints: Array<{
 label: string;
 price: number;
 confidence: number;
 }>;
 /** Price one where the pattern is likely to complete */
 completionZone: {
 high: number;
 low: number;
 center: number;
 };
 /** Confidence in the prediction (0-1) */
 confidence: number;
 /** Description in Arabic */
 descriptionAr: string;
 /** Time estimate for completion (in candles) */
 estimatedCandlesToCompletion: number;
}

// ── Pattern Definitions ─────────────────────────────────────────────

interface PatternSpec {
 name: string;
 nameAr: string;
 direction: 'bullish' | 'bearish';
 points: number;
 /** Fibonacci ratios between points */
 ratios: number[];
}

const HARMONIC_PATTERNS: PatternSpec[] = [
 { name: 'Gartley', nameAr: '', direction: undefined as any, points: 5, ratios: [0.618, 0.786, 0.618] },
 { name: 'Bat', nameAr: '', direction: undefined as any, points: 5, ratios: [0.382, 0.886, 0.618] },
 { name: 'Butterfly', nameAr: '', direction: undefined as any, points: 5, ratios: [0.786, 1.27, 0.786] },
 { name: 'Crab', nameAr: '', direction: undefined as any, points: 5, ratios: [0.382, 1.618, 0.618] },
];

const CHART_PATTERNS: PatternSpec[] = [
 { name: 'DoubleTop', nameAr: 'high ', direction: 'bearish', points: 2, ratios: [] },
 { name: 'DoubleBottom', nameAr: 'low ', direction: 'bullish', points: 2, ratios: [] },
 { name: 'HeadAndShoulders', nameAr: ' in', direction: 'bearish', points: 3, ratios: [] },
 { name: 'InvHeadAndShoulders', nameAr: ' in with', direction: 'bullish', points: 3, ratios: [] },
 { name: 'AscendingTriangle', nameAr: 'triangle bullish', direction: 'bullish', points: 2, ratios: [] },
 { name: 'DescendingTriangle', nameAr: 'triangle bearish', direction: 'bearish', points: 2, ratios: [] },
];

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Detect partially-formed patterns and predict their completion.
 * Scans the candle data for swing points and checks if they match
 * the beginning of known patterns.
 */
export function predictPatternCompletion(opts: {
 candles: CandleData[];
 currentPrice: number;
 detectedPatterns?: Array<{
 type: string;
 direction: 'bullish' | 'bearish';
 confidence: number;
 points?: Array<{ label: string; price: number }>;
 }>;
}): PatternPrediction[] {
 const { candles, currentPrice } = opts;
 if (!candles || candles.length < 30) return [];

 const predictions: PatternPrediction[] = [];

 // Find swing points
 const swingHighs = findSwingHighs(candles);
 const swingLows = findSwingLows(candles);

 // Check for partial harmonic patterns
 const harmonicPredictions = detectPartialHarmonics(candles, currentPrice, swingHighs, swingLows);
 predictions.push(...harmonicPredictions);

 // Check for partial chart patterns
 const chartPredictions = detectPartialChartPatterns(candles, currentPrice, swingHighs, swingLows);
 predictions.push(...chartPredictions);

 // Sort by confidence
 predictions.sort((a, b) => b.confidence - a.confidence);

 return predictions.slice(0, 5); // Top 5 predictions
}

// ── Swing Point Detection ───────────────────────────────────────────

function findSwingHighs(candles: CandleData[], lookback = 5): Array<{ price: number; index: number }> {
 const highs: Array<{ price: number; index: number }> = [];
 for (let i = lookback; i < candles.length - lookback; i++) {
 let isSwingHigh = true;
 for (let j = 1; j <= lookback; j++) {
 if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
 isSwingHigh = false;
 break;
 }
 }
 if (isSwingHigh) {
 highs.push({ price: candles[i].high, index: i });
 }
 }
 return highs;
}

function findSwingLows(candles: CandleData[], lookback = 5): Array<{ price: number; index: number }> {
 const lows: Array<{ price: number; index: number }> = [];
 for (let i = lookback; i < candles.length - lookback; i++) {
 let isSwingLow = true;
 for (let j = 1; j <= lookback; j++) {
 if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
 isSwingLow = false;
 break;
 }
 }
 if (isSwingLow) {
 lows.push({ price: candles[i].low, index: i });
 }
 }
 return lows;
}

// ── Partial Harmonic Detection ──────────────────────────────────────

function detectPartialHarmonics(
 candles: CandleData[],
 currentPrice: number,
 swingHighs: Array<{ price: number; index: number }>,
 swingLows: Array<{ price: number; index: number }>,
): PatternPrediction[] {
 const predictions: PatternPrediction[] = [];

 // We need at least 2 swing points to start predicting a harmonic
 const allSwings = [
 ...swingHighs.map(s => ({ ...s, type: 'high' as const })),
 ...swingLows.map(s => ({ ...s, type: 'low' as const })),
 ].sort((a, b) => a.index - b.index);

 if (allSwings.length < 3) return predictions;

 // Try to match the last 3-4 swing points to a harmonic beginning
 for (const pattern of HARMONIC_PATTERNS) {
 // Bullish harmonic: starts with a swing high (X), then low (A), then high (B)
 // then low (C), then high (D) — D is the PRZ completion
 const recentSwings = allSwings.slice(-4);
 if (recentSwings.length < 3) continue;

 // Check if recent swings could be the start of a Gartley
 // X (high) -> A (low) -> B (high, retrace 61.8% of XA)
 const X = recentSwings[0];
 const A = recentSwings[1];
 const B = recentSwings[2];

 // Validate X-A-B structure
 if (X.type === 'high' && A.type === 'low' && B.type === 'high') {
 // Bullish harmonic pattern
 const xMove = X.price - A.price; // X to A move
 const abRetrace = (B.price - A.price) / xMove;

 // Check if AB retrace matches any harmonic ratio
 for (const ratio of pattern.ratios.slice(0, 1)) { // Only check first ratio (AB of XA)
 if (Math.abs(abRetrace - ratio) < 0.1) { // 10% tolerance
 // Predict C and D
 const cTarget = B.price - xMove * 0.618; // C retrace
 const dTarget = A.price + (B.price - cTarget) * 0.786; // D completion

 const completionPct = Math.round((3 / pattern.points) * 100);

 predictions.push({
 patternType: `Partial ${pattern.name}`,
 patternTypeAr: `${pattern.nameAr} incomplete`,
 completionPct,
 predictedDirection: 'bullish',
 formedPoints: [
 { label: 'X', price: X.price, index: X.index },
 { label: 'A', price: A.price, index: A.index },
 { label: 'B', price: B.price, index: B.index },
 ],
 predictedPoints: [
 { label: 'C', price: Math.round(cTarget * 100) / 100, confidence: 0.5 },
 { label: 'D', price: Math.round(dTarget * 100) / 100, confidence: 0.4 },
 ],
 completionZone: {
 high: Math.round(dTarget * 1.005 * 100) / 100,
 low: Math.round(dTarget * 0.995 * 100) / 100,
 center: Math.round(dTarget * 100) / 100,
 },
 confidence: Math.min(0.7, 0.3 + (1 - Math.abs(abRetrace - ratio)) * 3),
 descriptionAr: `pattern ${pattern.nameAr} incomplete — points X, A, B shape. what style at ${Math.round(dTarget * 100) / 100}`,
 estimatedCandlesToCompletion: Math.round((candles.length - B.index) * 0.5),
 });
 }
 }
 }

 // Bearish harmonic: starts with a swing low (X), then high (A), then low (B)
 if (X.type === 'low' && A.type === 'high' && B.type === 'low') {
 const xMove = A.price - X.price;
 const abRetrace = (A.price - B.price) / xMove;

 for (const ratio of pattern.ratios.slice(0, 1)) {
 if (Math.abs(abRetrace - ratio) < 0.1) {
 const cTarget = B.price + xMove * 0.618;
 const dTarget = A.price - (cTarget - B.price) * 0.786;

 predictions.push({
 patternType: `Partial ${pattern.name}`,
 patternTypeAr: `${pattern.nameAr} incomplete`,
 completionPct: Math.round((3 / pattern.points) * 100),
 predictedDirection: 'bearish',
 formedPoints: [
 { label: 'X', price: X.price, index: X.index },
 { label: 'A', price: A.price, index: A.index },
 { label: 'B', price: B.price, index: B.index },
 ],
 predictedPoints: [
 { label: 'C', price: Math.round(cTarget * 100) / 100, confidence: 0.5 },
 { label: 'D', price: Math.round(dTarget * 100) / 100, confidence: 0.4 },
 ],
 completionZone: {
 high: Math.round(dTarget * 1.005 * 100) / 100,
 low: Math.round(dTarget * 0.995 * 100) / 100,
 center: Math.round(dTarget * 100) / 100,
 },
 confidence: Math.min(0.7, 0.3 + (1 - Math.abs(abRetrace - ratio)) * 3),
 descriptionAr: `pattern ${pattern.nameAr} bearish incomplete — whathas at ${Math.round(dTarget * 100) / 100}`,
 estimatedCandlesToCompletion: Math.round((candles.length - B.index) * 0.5),
 });
 }
 }
 }
 }

 return predictions;
}

// ── Partial Chart Pattern Detection ─────────────────────────────────

function detectPartialChartPatterns(
 candles: CandleData[],
 currentPrice: number,
 swingHighs: Array<{ price: number; index: number }>,
 swingLows: Array<{ price: number; index: number }>,
): PatternPrediction[] {
 const predictions: PatternPrediction[] = [];

 // Check for potential Double Top (2 swing highs near same price)
 if (swingHighs.length >= 2) {
 const recent2 = swingHighs.slice(-2);
 const priceDiff = Math.abs(recent2[0].price - recent2[1].price) / recent2[0].price;
 if (priceDiff < 0.01) { // Within 1%
 // This might be a forming double top
 const neckline = swingLows.length > 0 ? swingLows[swingLows.length - 1].price : currentPrice * 0.98;
 predictions.push({
 patternType: 'DoubleTop',
 patternTypeAr: 'high probable',
 completionPct: 60,
 predictedDirection: 'bearish',
 formedPoints: [
 { label: 'Peak1', price: recent2[0].price, index: recent2[0].index },
 { label: 'Peak2', price: recent2[1].price, index: recent2[1].index },
 ],
 predictedPoints: [
 { label: 'Break', price: Math.round(neckline * 100) / 100, confidence: 0.5 },
 ],
 completionZone: {
 high: Math.round(neckline * 1.003 * 100) / 100,
 low: Math.round(neckline * 0.997 * 100) / 100,
 center: Math.round(neckline * 100) / 100,
 },
 confidence: 0.55,
 descriptionAr: ' at level confluence — if price font about style bearish',
 estimatedCandlesToCompletion: 10,
 });
 }
 }

 // Check for potential Double Bottom
 if (swingLows.length >= 2) {
 const recent2 = swingLows.slice(-2);
 const priceDiff = Math.abs(recent2[0].price - recent2[1].price) / recent2[0].price;
 if (priceDiff < 0.01) {
 const neckline = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1].price : currentPrice * 1.02;
 predictions.push({
 patternType: 'DoubleBottom',
 patternTypeAr: 'low probable',
 completionPct: 60,
 predictedDirection: 'bullish',
 formedPoints: [
 { label: 'Bottom1', price: recent2[0].price, index: recent2[0].index },
 { label: 'Bottom2', price: recent2[1].price, index: recent2[1].index },
 ],
 predictedPoints: [
 { label: 'Break', price: Math.round(neckline * 100) / 100, confidence: 0.5 },
 ],
 completionZone: {
 high: Math.round(neckline * 1.003 * 100) / 100,
 low: Math.round(neckline * 0.997 * 100) / 100,
 center: Math.round(neckline * 100) / 100,
 },
 confidence: 0.55,
 descriptionAr: 'low at level confluence — if price font about style bullish',
 estimatedCandlesToCompletion: 10,
 });
 }
 }

 // Check for potential Head and Shoulders (3 swing highs with middle being highest)
 if (swingHighs.length >= 3) {
 const recent3 = swingHighs.slice(-3);
 const [left, head, right] = recent3;
 if (head.price > left.price && head.price > right.price) {
 const shoulderDiff = Math.abs(left.price - right.price) / left.price;
 if (shoulderDiff < 0.02) { // Shoulders within 2%
 const neckline = swingLows.length > 0 ? swingLows[swingLows.length - 1].price : currentPrice * 0.98;
 predictions.push({
 patternType: 'HeadAndShoulders',
 patternTypeAr: ' in probable',
 completionPct: 80,
 predictedDirection: 'bearish',
 formedPoints: [
 { label: 'LS', price: left.price, index: left.index },
 { label: 'Head', price: head.price, index: head.index },
 { label: 'RS', price: right.price, index: right.index },
 ],
 predictedPoints: [
 { label: 'Break', price: Math.round(neckline * 100) / 100, confidence: 0.6 },
 ],
 completionZone: {
 high: Math.round(neckline * 1.003 * 100) / 100,
 low: Math.round(neckline * 0.997 * 100) / 100,
 center: Math.round(neckline * 100) / 100,
 },
 confidence: 0.65,
 descriptionAr: 'pattern in complete — confluence higher. font about confirms style',
 estimatedCandlesToCompletion: 5,
 });
 }
 }
 }

 return predictions;
}
