// ═══════════════════════════════════════════════════════════════════════
// ROUA Advanced Elliott Wave Engine — Phase 2 Upgrade
//
// Professional Elliott Wave detection with:
// - 5-wave impulse with Fibonacci ratio verification
// - ABC correction patterns: Zigag, Flat, Triangle, Complex (WXY)
// - Dynamic confidence based on ratio accuracy
// - Extension rules (Wave 3 = 1.618 × W1, etc.)
// - Multiple alternate counts with probability ranking (top 5)
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData, AIPattern } from './types';
import type { SwingPoint } from './chart-detection';
import { computeZigZag } from './chart-detection';
import { calcATR } from './ATRAdapter';

// ── Exported Types ───────────────────────────────────────────────────

/**
 * A single Elliott Wave count (impulse or corrective).
 * Contains the wave points, Fibonacci ratios, confidence, and probability.
 */
export interface WaveCount {
 /** Pattern classification */
 type: 'impulse' | 'igag' | 'flat' | 'triangle' | 'complex';
 /** Overall direction of the wave pattern */
 direction: 'bullish' | 'bearish';
 /** Confidence 0–1 based on Fibonacci ratio accuracy and wave rules */
 confidence: number;
 /** Relative probability vs other alternate counts (0–1, sums to 1 across all counts) */
 probability: number;
 /** The swing points that define the wave structure */
 waves: SwingPoint[];
 /** Computed Fibonacci ratios for verification */
 ratios: {
 wave2Retrace: number;
 wave3Extend: number;
 wave4Retrace: number;
 wave5Extend: number;
 };
 /** Projected target price based on extension rules, or null if indeterminate */
 targetPrice: number | null;
 /** Human-readable label (e.g. "Impulse (Bullish)", "Zigag Correction") */
 label: string;
}

/**
 * Complete Elliott Wave analysis result containing all alternate counts.
 */
export interface ElliottResult {
 /** All valid wave counts sorted by probability (descending) */
 counts: WaveCount[];
 /** The highest-probability count */
 dominantCount: WaveCount | null;
 /** All wave patterns converted to AIPattern format for chart rendering */
 allPatterns: AIPattern[];
}

// ── Internal Constants ───────────────────────────────────────────────

/** Fibonacci ratio tolerances — how close a ratio must be to "ideal" */
const RATIO_TOLERANCE = 0.15;

/** Ideal Fibonacci ratios for impulse waves */
const IDEAL_WAVE2_RETRACE = 0.618; // Wave 2 retraces 61.8% of Wave 1
const IDEAL_WAVE3_EXTEND = 1.618; // Wave 3 extends 161.8% of Wave 1
const IDEAL_WAVE4_RETRACE = 0.382; // Wave 4 retraces 38.2% of Wave 3
const IDEAL_WAVE5_EXTEND = 1.000; // Wave 5 ≈ 100% of Wave 1

/** Minimum candles for reliable Elliott analysis */
const MIN_CANDLES = 30;

/** Maximum alternate counts to return */
const MAX_COUNTS = 5;

// ── Arabic Labels ────────────────────────────────────────────────────

const LABELS_AR: Record<string, string> = {
 'impulse-bullish': ' bullish',
 'impulse-bearish': ' ',
 'igag-bullish': 'correct igag bullish',
 'igag-bearish': 'correct igag bearish',
 'flat-bullish': 'correct flat bullish',
 'flat-bearish': 'correct flat bearish',
 'triangle-bullish': 'correct triangle bullish',
 'triangle-bearish': 'correct triangle bearish',
 'complex-bullish': 'correct bullish',
 'complex-bearish': 'correct bearish',
};

// ── Helper: Wrapper for ATR ──────────────────────────────────────────

/**
 * Get the latest ATR value for the given candles.
 * Wraps `calcATR` from ATRAdapter for convenience.
 */
function getLatestATR(candles: CandleData[], period: number = 14): number {
 return calcATR(candles, period);
}

// ── Helper: Ratio accuracy scoring ───────────────────────────────────

/**
 * Calculate how close an actual ratio is to the ideal ratio.
 * Returns a score from 0 (far) to 1 (perfect match).
 */
function ratioScore(actual: number, ideal: number): number {
 if (ideal === 0) return actual === 0 ? 1 : 0;
 const deviation = Math.abs(actual - ideal) / ideal;
 return Math.max(0, 1 - deviation / RATIO_TOLERANCE);
}

// ── Impulse Wave Detection ───────────────────────────────────────────

/**
 * Attempt to detect a 5-wave impulse pattern from 6 alternating swing points.
 * Bullish impulse: LOW-HIGH-LOW-HIGH-LOW-HIGH (ascending)
 * Bearish impulse: HIGH-LOW-HIGH-LOW-HIGH-LOW (descending)
 *
 * Validates:
 * - Wave 2 retraces ~61.8% of Wave 1
 * - Wave 3 extends ~161.8% of Wave 1 (and is never the shortest)
 * - Wave 4 retraces ~38.2% of Wave 3
 * - Wave 2 and Wave 4 do not overlap (alternation rule)
 */
function detectImpulse(swings: SwingPoint[], direction: 'bullish' | 'bearish'): WaveCount[] {
 const counts: WaveCount[] = [];

 for (let i = 0; i <= swings.length - 6; i++) {
 const pts = swings.slice(i, i + 6);

 if (direction === 'bullish') {
 // Pattern: LOW-HIGH-LOW-HIGH-LOW-HIGH (0,1,2,3,4,5)
 if (pts[0].type !== 'LOW' || pts[1].type !== 'HIGH' ||
 pts[2].type !== 'LOW' || pts[3].type !== 'HIGH' ||
 pts[4].type !== 'LOW' || pts[5].type !== 'HIGH') continue;

 const w0 = pts[0].price; // Start of Wave 1
 const w1 = pts[1].price; // End of Wave 1
 const w2 = pts[2].price; // End of Wave 2
 const w3 = pts[3].price; // End of Wave 3
 const w4 = pts[4].price; // End of Wave 4
 const w5 = pts[5].price; // End of Wave 5

 const wave1 = w1 - w0;
 const wave2 = w1 - w2;
 const wave3 = w3 - w2;
 const wave4 = w3 - w4;
 const wave5 = w5 - w4;

 // Basic validation: all waves must be positive
 if (wave1 <= 0 || wave2 <= 0 || wave3 <= 0 || wave4 <= 0 || wave5 <= 0) continue;

 // Wave 3 must not be the shortest impulse wave
 if (wave3 < wave1 && wave3 < wave5) continue;

 // Wave 2 must not retrace more than 100% of Wave 1
 const wave2Retrace = wave2 / wave1;
 if (wave2Retrace > 1.0) continue;

 // Alternation: Wave 4 must not overlap Wave 2 territory
 if (w4 <= w2) continue;

 // Calculate Fibonacci ratios
 const wave3Extend = wave3 / wave1;
 const wave4Retrace = wave4 / wave3;
 const wave5Extend = wave5 / wave1;

 // Score each ratio
 const score2 = ratioScore(wave2Retrace, IDEAL_WAVE2_RETRACE);
 const score3 = ratioScore(wave3Extend, IDEAL_WAVE3_EXTEND);
 const score4 = ratioScore(wave4Retrace, IDEAL_WAVE4_RETRACE);
 const score5 = ratioScore(wave5Extend, IDEAL_WAVE5_EXTEND);

 // Weighted confidence: Wave 3 is most important
 const confidence = Math.min(0.95,
 score2 * 0.2 + score3 * 0.35 + score4 * 0.2 + score5 * 0.15 + 0.1
 );

 // Target: Fibonacci extension of Wave 5
 const targetPrice = w3 + wave1 * 1.618;

 counts.push({
 type: 'impulse',
 direction: 'bullish',
 confidence,
 probability: 0, // Will be set later
 waves: [...pts],
 ratios: {
 wave2Retrace: Math.round(wave2Retrace * 1000) / 1000,
 wave3Extend: Math.round(wave3Extend * 1000) / 1000,
 wave4Retrace: Math.round(wave4Retrace * 1000) / 1000,
 wave5Extend: Math.round(wave5Extend * 1000) / 1000,
 },
 targetPrice,
 label: `Impulse (Bullish)`,
 });
 } else {
 // Bearish impulse: HIGH-LOW-HIGH-LOW-HIGH-LOW
 if (pts[0].type !== 'HIGH' || pts[1].type !== 'LOW' ||
 pts[2].type !== 'HIGH' || pts[3].type !== 'LOW' ||
 pts[4].type !== 'HIGH' || pts[5].type !== 'LOW') continue;

 const w0 = pts[0].price;
 const w1 = pts[1].price;
 const w2 = pts[2].price;
 const w3 = pts[3].price;
 const w4 = pts[4].price;
 const w5 = pts[5].price;

 const wave1 = w0 - w1;
 const wave2 = w2 - w1;
 const wave3 = w2 - w3;
 const wave4 = w4 - w3;
 const wave5 = w4 - w5;

 if (wave1 <= 0 || wave2 <= 0 || wave3 <= 0 || wave4 <= 0 || wave5 <= 0) continue;
 if (wave3 < wave1 && wave3 < wave5) continue;

 const wave2Retrace = wave2 / wave1;
 if (wave2Retrace > 1.0) continue;

 // Alternation: Wave 4 must not overlap Wave 2
 if (w4 >= w2) continue;

 const wave3Extend = wave3 / wave1;
 const wave4Retrace = wave4 / wave3;
 const wave5Extend = wave5 / wave1;

 const score2 = ratioScore(wave2Retrace, IDEAL_WAVE2_RETRACE);
 const score3 = ratioScore(wave3Extend, IDEAL_WAVE3_EXTEND);
 const score4 = ratioScore(wave4Retrace, IDEAL_WAVE4_RETRACE);
 const score5 = ratioScore(wave5Extend, IDEAL_WAVE5_EXTEND);

 const confidence = Math.min(0.95,
 score2 * 0.2 + score3 * 0.35 + score4 * 0.2 + score5 * 0.15 + 0.1
 );

 const targetPrice = w3 - wave1 * 1.618;

 counts.push({
 type: 'impulse',
 direction: 'bearish',
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace: Math.round(wave2Retrace * 1000) / 1000,
 wave3Extend: Math.round(wave3Extend * 1000) / 1000,
 wave4Retrace: Math.round(wave4Retrace * 1000) / 1000,
 wave5Extend: Math.round(wave5Extend * 1000) / 1000,
 },
 targetPrice,
 label: `Impulse (Bearish)`,
 });
 }
 }

 return counts;
}

// ── ABC Zigag Correction Detection ──────────────────────────────────

/**
 * Detect ABC Zigag correction (5-3-5 structure).
 * Bullish igag: HIGH-LOW-HIGH (A down, B up, C down — but within a correction of a larger uptrend)
 * The igag is a sharp correction with:
 * - Wave A = 5-wave impulse
 * - Wave B = small retrace (~38.2% to 50% of A)
 * - Wave C = 5-wave impulse extending ~161.8% of A
 *
 * For simplicity we detect 3-swing igag patterns.
 */
function detectZigagCorrection(swings: SwingPoint[], direction: 'bullish' | 'bearish'): WaveCount[] {
 const counts: WaveCount[] = [];

 for (let i = 0; i <= swings.length - 3; i++) {
 const pts = swings.slice(i, i + 3);

 if (direction === 'bearish') {
 // Bearish igag: HIGH-LOW-HIGH (A=down, B=up, C=down)
 if (pts[0].type !== 'HIGH' || pts[1].type !== 'LOW' || pts[2].type !== 'HIGH') continue;

 const aPrice = pts[0].price;
 const bPrice = pts[1].price;
 const cPrice = pts[2].price;

 const waveA = aPrice - bPrice;
 const waveB = cPrice - bPrice;
 const waveC = cPrice - bPrice; // re-use for correction direction

 if (waveA <= 0) continue;

 const bRetrace = waveB / waveA;
 // Wave B typically retraces 38.2%–61.8% of Wave A
 if (bRetrace < 0.2 || bRetrace > 0.8) continue;

 // C point should be lower than A for a valid igag
 if (cPrice >= aPrice) continue;

 const cExtendA = (aPrice - cPrice) / waveA;

 const scoreB = ratioScore(bRetrace, 0.5);
 const scoreC = ratioScore(cExtendA, 0.618);
 const confidence = Math.min(0.85, scoreB * 0.3 + scoreC * 0.4 + 0.15);

 const wave2Retrace = Math.round(bRetrace * 1000) / 1000;
 const wave3Extend = Math.round(cExtendA * 1000) / 1000;

 counts.push({
 type: 'igag',
 direction: 'bearish',
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace,
 wave3Extend,
 wave4Retrace: 0,
 wave5Extend: 0,
 },
 targetPrice: bPrice - waveA * 1.618,
 label: 'Zigag Correction (Bearish)',
 });
 } else {
 // Bullish igag: LOW-HIGH-LOW
 if (pts[0].type !== 'LOW' || pts[1].type !== 'HIGH' || pts[2].type !== 'LOW') continue;

 const aPrice = pts[0].price;
 const bPrice = pts[1].price;
 const cPrice = pts[2].price;

 const waveA = bPrice - aPrice;
 const waveB = bPrice - cPrice;

 if (waveA <= 0) continue;

 const bRetrace = waveB / waveA;
 if (bRetrace < 0.2 || bRetrace > 0.8) continue;

 if (cPrice >= aPrice) continue;

 const cExtendA = (cPrice - aPrice) / waveA;

 const scoreB = ratioScore(bRetrace, 0.5);
 const scoreC = ratioScore(cExtendA, 0.618);
 const confidence = Math.min(0.85, scoreB * 0.3 + scoreC * 0.4 + 0.15);

 const wave2Retrace = Math.round(bRetrace * 1000) / 1000;
 const wave3Extend = Math.round(cExtendA * 1000) / 1000;

 counts.push({
 type: 'igag',
 direction: 'bullish',
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace,
 wave3Extend,
 wave4Retrace: 0,
 wave5Extend: 0,
 },
 targetPrice: aPrice + waveA * 1.618,
 label: 'Zigag Correction (Bullish)',
 });
 }
 }

 return counts;
}

// ── Flat Correction Detection ────────────────────────────────────────

/**
 * Detect ABC Flat correction (3-3-5 structure).
 * In a flat, Wave B retraces nearly all of Wave A (~100%),
 * and Wave C roughly equals Wave A.
 * Pattern: 3 swing points where the middle is a shallow retrace.
 */
function detectFlatCorrection(swings: SwingPoint[], direction: 'bullish' | 'bearish'): WaveCount[] {
 const counts: WaveCount[] = [];

 for (let i = 0; i <= swings.length - 3; i++) {
 const pts = swings.slice(i, i + 3);

 if (direction === 'bearish') {
 if (pts[0].type !== 'HIGH' || pts[1].type !== 'LOW' || pts[2].type !== 'HIGH') continue;

 const aPrice = pts[0].price;
 const bPrice = pts[1].price;
 const cPrice = pts[2].price;

 const waveA = aPrice - bPrice;
 if (waveA <= 0) continue;

 const bRetrace = (cPrice - bPrice) / waveA;
 // In a flat, B retraces ~80%–100% of A
 if (bRetrace < 0.7 || bRetrace > 1.1) continue;

 // C should end near or below A
 const cRatio = (aPrice - cPrice) / waveA;

 const scoreB = ratioScore(bRetrace, 0.9);
 const scoreC = ratioScore(Math.abs(cRatio), 1.0);
 const confidence = Math.min(0.75, scoreB * 0.3 + scoreC * 0.3 + 0.1);

 counts.push({
 type: 'flat',
 direction: 'bearish',
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace: Math.round(bRetrace * 1000) / 1000,
 wave3Extend: Math.round(cRatio * 1000) / 1000,
 wave4Retrace: 0,
 wave5Extend: 0,
 },
 targetPrice: cPrice - waveA,
 label: 'Flat Correction (Bearish)',
 });
 } else {
 if (pts[0].type !== 'LOW' || pts[1].type !== 'HIGH' || pts[2].type !== 'LOW') continue;

 const aPrice = pts[0].price;
 const bPrice = pts[1].price;
 const cPrice = pts[2].price;

 const waveA = bPrice - aPrice;
 if (waveA <= 0) continue;

 const bRetrace = (bPrice - cPrice) / waveA;
 if (bRetrace < 0.7 || bRetrace > 1.1) continue;

 const cRatio = (cPrice - aPrice) / waveA;

 const scoreB = ratioScore(bRetrace, 0.9);
 const scoreC = ratioScore(Math.abs(cRatio), 1.0);
 const confidence = Math.min(0.75, scoreB * 0.3 + scoreC * 0.3 + 0.1);

 counts.push({
 type: 'flat',
 direction: 'bullish',
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace: Math.round(bRetrace * 1000) / 1000,
 wave3Extend: Math.round(cRatio * 1000) / 1000,
 wave4Retrace: 0,
 wave5Extend: 0,
 },
 targetPrice: cPrice + waveA,
 label: 'Flat Correction (Bullish)',
 });
 }
 }

 return counts;
}

// ── Triangle Correction Detection ────────────────────────────────────

/**
 * Detect contracting triangle corrections (A-B-C-D-E with 5 legs).
 * Triangles have converging boundary lines.
 * Requires at least 6 swing points forming a contracting shape.
 */
function detectTriangleCorrection(swings: SwingPoint[], direction: 'bullish' | 'bearish'): WaveCount[] {
 const counts: WaveCount[] = [];

 // Need at least 6 points for a triangle: H-L-H-L-H-L or L-H-L-H-L-H
 if (swings.length < 6) return counts;

 for (let i = 0; i <= swings.length - 6; i++) {
 const pts = swings.slice(i, i + 6);

 // Check alternating pattern
 const isBullishPattern = pts.every((p, idx) => idx % 2 === 0 ? p.type === 'LOW' : p.type === 'HIGH');
 const isBearishPattern = pts.every((p, idx) => idx % 2 === 0 ? p.type === 'HIGH' : p.type === 'LOW');

 if (!isBullishPattern && !isBearishPattern) continue;

 // Extract highs and lows for convergence check
 const highs = pts.filter((_, idx) => idx % 2 === 1).map(p => p.price);
 const lows = pts.filter((_, idx) => idx % 2 === 0).map(p => p.price);

 // Check convergence: highs should be descending or flat, lows ascending or flat
 const highsConverging = highs.length >= 2 && highs[highs.length - 1] <= highs[0] * 1.01;
 const lowsConverging = lows.length >= 2 && lows[lows.length - 1] >= lows[0] * 0.99;

 if (!highsConverging && !lowsConverging) continue;

 // Measure the convergence quality
 const highSlope = highs.length >= 2 ? (highs[highs.length - 1] - highs[0]) / highs[0] : 0;
 const lowSlope = lows.length >= 2 ? (lows[lows.length - 1] - lows[0]) / lows[0] : 0;

 // Contracting: high slope negative, low slope positive
 const isContracting = highSlope <= 0.01 && lowSlope >= -0.01;
 if (!isContracting) continue;

 const convergence = Math.abs(highSlope) + Math.abs(lowSlope);
 const confidence = Math.min(0.8, 0.3 + convergence * 5);

 const waveDir: 'bullish' | 'bearish' = isBullishPattern ? 'bullish' : 'bearish';
 // Only return if direction matches what we're looking for
 if (waveDir !== direction) continue;

 // Target: breakout in direction of the larger trend
 const range = Math.abs(highs[0] - lows[0]);
 const lastPoint = pts[pts.length - 1];
 const targetPrice = direction === 'bullish'
 ? lastPoint.price + range
 : lastPoint.price - range;

 counts.push({
 type: 'triangle',
 direction,
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace: Math.round(Math.abs(highSlope) * 1000) / 1000,
 wave3Extend: Math.round(Math.abs(lowSlope) * 1000) / 1000,
 wave4Retrace: 0,
 wave5Extend: 0,
 },
 targetPrice,
 label: `Triangle Correction (${direction === 'bullish' ? 'Bullish' : 'Bearish'})`,
 });
 }

 return counts;
}

// ── Complex (WXY) Correction Detection ──────────────────────────────

/**
 * Detect complex corrections (WXY pattern): two corrective structures
 * connected by an X wave. Simplified detection using 5 swing points.
 * Pattern: A-B-X-C-D where A-B and C-D are both corrections.
 */
function detectComplexCorrection(swings: SwingPoint[], direction: 'bullish' | 'bearish'): WaveCount[] {
 const counts: WaveCount[] = [];

 // Need 5 points: W, X (connector), Y
 if (swings.length < 5) return counts;

 for (let i = 0; i <= swings.length - 5; i++) {
 const pts = swings.slice(i, i + 5);

 if (direction === 'bearish') {
 // Pattern: HIGH-LOW-HIGH-LOW-HIGH
 if (pts[0].type !== 'HIGH' || pts[1].type !== 'LOW' ||
 pts[2].type !== 'HIGH' || pts[3].type !== 'LOW' ||
 pts[4].type !== 'HIGH') continue;

 const w0 = pts[0].price;
 const w1 = pts[1].price;
 const x = pts[2].price;
 const y1 = pts[3].price;
 const y2 = pts[4].price;

 const waveW = w0 - w1;
 if (waveW <= 0) continue;

 const xRetrace = (x - w1) / waveW;
 // X wave typically retraces 50%–78.6% of W
 if (xRetrace < 0.3 || xRetrace > 0.9) continue;

 const waveY = x - y1;
 if (waveY <= 0) continue;

 // Y should be similar magnitude to W
 const yRatio = waveY / waveW;
 if (yRatio < 0.5 || yRatio > 1.8) continue;

 const scoreX = ratioScore(xRetrace, 0.618);
 const scoreY = ratioScore(yRatio, 1.0);
 const confidence = Math.min(0.7, scoreX * 0.25 + scoreY * 0.25 + 0.15);

 counts.push({
 type: 'complex',
 direction: 'bearish',
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace: Math.round(xRetrace * 1000) / 1000,
 wave3Extend: Math.round(yRatio * 1000) / 1000,
 wave4Retrace: 0,
 wave5Extend: 0,
 },
 targetPrice: y1 - waveW * 0.618,
 label: 'Complex WXY Correction (Bearish)',
 });
 } else {
 // Bullish: LOW-HIGH-LOW-HIGH-LOW
 if (pts[0].type !== 'LOW' || pts[1].type !== 'HIGH' ||
 pts[2].type !== 'LOW' || pts[3].type !== 'HIGH' ||
 pts[4].type !== 'LOW') continue;

 const w0 = pts[0].price;
 const w1 = pts[1].price;
 const x = pts[2].price;
 const y1 = pts[3].price;
 const y2 = pts[4].price;

 const waveW = w1 - w0;
 if (waveW <= 0) continue;

 const xRetrace = (w1 - x) / waveW;
 if (xRetrace < 0.3 || xRetrace > 0.9) continue;

 const waveY = y1 - x;
 if (waveY <= 0) continue;

 const yRatio = waveY / waveW;
 if (yRatio < 0.5 || yRatio > 1.8) continue;

 const scoreX = ratioScore(xRetrace, 0.618);
 const scoreY = ratioScore(yRatio, 1.0);
 const confidence = Math.min(0.7, scoreX * 0.25 + scoreY * 0.25 + 0.15);

 counts.push({
 type: 'complex',
 direction: 'bullish',
 confidence,
 probability: 0,
 waves: [...pts],
 ratios: {
 wave2Retrace: Math.round(xRetrace * 1000) / 1000,
 wave3Extend: Math.round(yRatio * 1000) / 1000,
 wave4Retrace: 0,
 wave5Extend: 0,
 },
 targetPrice: y1 + waveW * 0.618,
 label: 'Complex WXY Correction (Bullish)',
 });
 }
 }

 return counts;
}

// ── Probability Assignment ───────────────────────────────────────────

/**
 * Assign probabilities to wave counts based on their confidence scores.
 * Higher confidence → higher probability. Probabilities sum to 1.
 */
function assignProbabilities(counts: WaveCount[]): WaveCount[] {
 if (counts.length === 0) return counts;

 const totalConfidence = counts.reduce((sum, c) => sum + c.confidence, 0);
 if (totalConfidence === 0) {
 // Equal probability fallback
 const equal = 1 / counts.length;
 return counts.map(c => ({ ...c, probability: Math.round(equal * 1000) / 1000 }));
 }

 return counts.map(c => ({
 ...c,
 probability: Math.round((c.confidence / totalConfidence) * 1000) / 1000,
 }));
}

// ── Main Detection Function ──────────────────────────────────────────

/**
 * Advanced Elliott Wave detection engine.
 *
 * Detects impulse and corrective wave patterns using ZigZag swing points,
 * verifies Fibonacci ratios, and returns multiple alternate counts ranked
 * by probability.
 *
 * @param candles - Array of candle data (OHLCV)
 * @returns ElliottResult with all detected counts and patterns
 */
export function detectElliottAdvanced(candles: CandleData[]): ElliottResult {
 // Edge case: insufficient data
 if (!candles || candles.length < MIN_CANDLES) {
 return { counts: [], dominantCount: null, allPatterns: [] };
 }

 // Compute ZigZag swing points using the existing ATR-based detector
 const swings = computeZigZag(candles);
 if (swings.length < 3) {
 return { counts: [], dominantCount: null, allPatterns: [] };
 }

 // ATR for confidence adjustment
 const atr = getLatestATR(candles);
 const lastClose = candles[candles.length - 1].close;
 const atrPct = atr / (lastClose || 1);

 // Collect all candidate counts from different pattern types
 let allCounts: WaveCount[] = [
 // Impulse waves (both directions)
 ...detectImpulse(swings, 'bullish'),
 ...detectImpulse(swings, 'bearish'),

 // Corrective patterns
 ...detectZigagCorrection(swings, 'bullish'),
 ...detectZigagCorrection(swings, 'bearish'),
 ...detectFlatCorrection(swings, 'bullish'),
 ...detectFlatCorrection(swings, 'bearish'),
 ...detectTriangleCorrection(swings, 'bullish'),
 ...detectTriangleCorrection(swings, 'bearish'),
 ...detectComplexCorrection(swings, 'bullish'),
 ...detectComplexCorrection(swings, 'bearish'),
 ];

 // Adjust confidence based on volatility regime
 if (atrPct > 0.03) {
 // Extreme volatility — reduce confidence
 allCounts = allCounts.map(c => ({ ...c, confidence: c.confidence * 0.8 }));
 } else if (atrPct > 0.02) {
 allCounts = allCounts.map(c => ({ ...c, confidence: c.confidence * 0.9 }));
 }

 // Sort by confidence (descending) and keep top N
 allCounts.sort((a, b) => b.confidence - a.confidence);
 allCounts = allCounts.slice(0, MAX_COUNTS);

 // Assign probabilities
 allCounts = assignProbabilities(allCounts);

 // Determine dominant count
 const dominantCount = allCounts.length > 0 ? allCounts[0] : null;

 // Convert to AIPattern format
 const allPatterns = elliottToAIPatterns({ counts: allCounts, dominantCount, allPatterns: [] });

 return { counts: allCounts, dominantCount, allPatterns };
}

// ── AIPattern Conversion ─────────────────────────────────────────────

/**
 * Convert Elliott Wave results to AIPattern format for chart rendering.
 * Each wave count becomes a polygon shape with the wave points.
 */
export function elliottToAIPatterns(result: ElliottResult): AIPattern[] {
 const patterns: AIPattern[] = [];

 for (const count of result.counts) {
 const key = `${count.type}-${count.direction}`;
 const labelAr = LABELS_AR[key] || count.label;

 // Build shape points from waves
 const shapePoints = count.waves.map(w => ({ time: w.time, price: w.price }));

 // Color based on direction
 const shapeColor = count.direction === 'bullish'
 ? 'rgba(0,255,163,0.15)'
 : 'rgba(255,71,87,0.15)';

 // Use the last wave point as the pattern's primary time/price
 const lastWave = count.waves[count.waves.length - 1];

 patterns.push({
 type: `elliott-${count.type}`,
 labelAr,
 time: lastWave.time,
 price: lastWave.price,
 confidence: count.confidence,
 direction: count.direction,
 shapeType: 'polygon',
 shapePoints,
 shapeColor,
 });
 }

 return patterns;
}
