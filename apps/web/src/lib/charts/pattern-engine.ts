// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern Engine — Phase 1: Double Top/Bottom Detection
// Phase 2 will add: Triangle, Channel, Wedge, H&S
// Phase 3 will add: Harmonic XABCD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { CandleData } from './types';
import { computeZigZag, type SwingPoint } from './chart-detection'; // UNIFY (4.3)
import { createIncrementalState, initializeState, updateIncremental, needsFullRecalc, getQuickTrend, type IncrementalState } from './IncrementalCalc';
import { getDynamicThresholds, adjustQualityForVolatility } from './ATRAdapter';

// ── Incremental state for O(1) updates instead of O(n) full recalculation ──
let _incrementalState: IncrementalState | null = null;
let _lastCandleCount = 0;
let _lastCandleTime = 0;

// ── Pattern types ──────────────────────────────────────────
export type PatternDirection = 'bullish' | 'bearish';
export type PatternStatus = 'forming' | 'completed' | 'breakout';

export interface PatternPoint {
  time: number;
  price: number;
  label: string; // 'L', 'H', 'A', 'B', 'X' etc.
}

export interface QualityScore {
  clarity: number;      // 1–10: how clean the pattern is
  uniformity: number;   // 1–10: equal spacing between touches
  initialTrend: number; // 1–10: strength of preceding trend
  overall: number;      // weighted average
}

export interface ForecastZone {
  priceMin: number;     // lower bound of target
  priceMax: number;     // upper bound of target
  timeFrom: number;     // earliest time to reach target (unix)
  timeTo: number;       // latest time to reach target (unix)
  probability: number;  // 0–100 historical probability
}

export interface DetectedPattern {
  id: string;
  type: string;         // 'Double Top', 'Double Bottom', 'Triangle', etc.
  direction: PatternDirection;
  status: PatternStatus;
  points: PatternPoint[];        // key points (neckline, peaks/troughs)
  supportLine?: { p1: PatternPoint; p2: PatternPoint };
  resistanceLine?: { p1: PatternPoint; p2: PatternPoint };
  neckline?: { p1: PatternPoint; p2: PatternPoint };
  forecast?: ForecastZone;
  quality: QualityScore;
  patternHeight: number; // price distance from neckline to peak
  breakoutPrice: number; // the neckline price
  timeStart: number;
  timeEnd: number;
}

// ── Quality scorer ──────────────────────────────────────────
function scoreQuality(
  pivots: SwingPoint[],
  priceDeviation: number, // how symmetric the pattern is (0 = perfect)
  trendStrength: number,  // 0–1
): QualityScore {
  const clarity = Math.max(1, Math.min(10, Math.round((1 - priceDeviation) * 10)));
  const uniformity = Math.max(1, Math.min(10, pivots.length > 0 ? 5 : 0)); // UNIFY (4.3): SwingPoint no longer has strength, use default
  const initialTrend = Math.max(1, Math.min(10, Math.round(trendStrength * 10)));
  const overall = Math.round((clarity * 0.4 + uniformity * 0.3 + initialTrend * 0.3));
  return { clarity, uniformity, initialTrend, overall };
}

// ── Trend strength helper ───────────────────────────────────
function trendStrength(candles: CandleData[], fromIndex: number, toIndex: number): number {
  if (toIndex <= fromIndex || toIndex >= candles.length) return 0.5;
  const priceChange = Math.abs(candles[toIndex].close - candles[fromIndex].close);
  const totalRange = candles.slice(fromIndex, toIndex + 1)
    .reduce((sum, c) => sum + (c.high - c.low), 0) / (toIndex - fromIndex + 1);
  return Math.min(1, priceChange / (totalRange * (toIndex - fromIndex) * 0.1 + 0.001));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOUBLE TOP DETECTION
// Structure: High → pullback (>5%) → High (~equal) → breakdown
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function detectDoubleTop(
  candles: CandleData[],
  pivots?: SwingPoint[]): DetectedPattern[] {
  const swings = pivots || computeZigZag(candles); // UNIFY (4.3)
  const patterns: DetectedPattern[] = [];

  // ── REVOLUTIONARY: ATR-based dynamic thresholds ──
  const thresholds = getDynamicThresholds(candles);

  const highs = swings.filter(p => p.type === 'HIGH');
  const lows = swings.filter(p => p.type === 'LOW');

  for (let i = 0; i < highs.length - 1; i++) {
    const h1 = highs[i];
    const h2 = highs[i + 1];

    // h2 must come after h1
    if (h2.index <= h1.index) continue;

    // Price similarity: peaks within dynamic threshold (was 1.5%)
    const priceDiff = Math.abs(h1.price - h2.price) / h1.price;
    if (priceDiff > thresholds.peakSimilarity) continue;

    // Find the trough between h1 and h2
    const troughBetween = lows.find(l =>
      l.index > h1.index && l.index < h2.index
    );
    if (!troughBetween) continue;

    // Pullback depth: trough must be at least dynamic pullback % (was 3%)
    const pullbackPct = (h1.price - troughBetween.price) / h1.price;
    if (pullbackPct < thresholds.pullback) continue;

    // Neckline = trough price (approximately)
    const necklinePrice = troughBetween.price;
    const patternHeight = h1.price - necklinePrice;

    // Forecast: measured move down from neckline = pattern height
    const barDuration = candles.length > 1
      ? (candles[candles.length - 1].time - candles[0].time) / candles.length
      : 3600;
    const patternBars = h2.index - h1.index;

    const forecast: ForecastZone = {
      priceMin: necklinePrice - patternHeight * 1.2,
      priceMax: necklinePrice - patternHeight * 0.7,
      timeFrom: h2.time + barDuration * Math.round(patternBars * 0.3),
      timeTo: h2.time + barDuration * patternBars,
      probability: Math.round(60 + (1 - priceDiff / 0.015) * 15),
    };

    const ts = trendStrength(candles,
      Math.max(0, h1.index - Math.floor(patternBars * 1.5)),
      h1.index
    );

    const quality = scoreQuality([h1, troughBetween, h2], priceDiff, ts);
    quality.overall = adjustQualityForVolatility(quality.overall, candles);
    if (quality.overall < 4) continue;

    // Check if pattern already broke down
    const lastCandle = candles[candles.length - 1];
    const status: PatternStatus =
      lastCandle.close < necklinePrice ? 'breakout' :
      h2.index === swings[swings.length - 1].index ? 'forming' : 'completed';

    patterns.push({
      id: `double-top-${h1.time}-${h2.time}`,
      type: 'Double Top',
      direction: 'bearish',
      status,
      points: [
        { time: h1.time, price: h1.price, label: 'H1' },
        { time: troughBetween.time, price: troughBetween.price, label: 'N' },
        { time: h2.time, price: h2.price, label: 'H2' },
      ],
      neckline: {
        p1: { time: h1.time, price: necklinePrice, label: 'NL' },
        p2: { time: h2.time + barDuration * patternBars, price: necklinePrice, label: 'NL' },
      },
      resistanceLine: {
        p1: { time: h1.time, price: h1.price, label: 'H1' },
        p2: { time: h2.time, price: h2.price, label: 'H2' },
      },
      forecast,
      quality,
      patternHeight,
      breakoutPrice: necklinePrice,
      timeStart: h1.time,
      timeEnd: h2.time,
    });
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOUBLE BOTTOM DETECTION
// Structure: Low → bounce (>5%) → Low (~equal) → breakout up
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function detectDoubleBottom(
  candles: CandleData[],
  pivots?: SwingPoint[]
): DetectedPattern[] {
  const swings = pivots || computeZigZag(candles); // UNIFY (4.3)
  const patterns: DetectedPattern[] = [];

  // ── REVOLUTIONARY: ATR-based dynamic thresholds ──
  const thresholds = getDynamicThresholds(candles);

  const lows = swings.filter(p => p.type === 'LOW');
  const highs = swings.filter(p => p.type === 'HIGH');

  for (let i = 0; i < lows.length - 1; i++) {
    const l1 = lows[i];
    const l2 = lows[i + 1];

    if (l2.index <= l1.index) continue;

    const priceDiff = Math.abs(l1.price - l2.price) / l1.price;
    if (priceDiff > thresholds.peakSimilarity) continue;

    const peakBetween = highs.find(h =>
      h.index > l1.index && h.index < l2.index
    );
    if (!peakBetween) continue;

    const bounceUpPct = (peakBetween.price - l1.price) / l1.price;
    if (bounceUpPct < thresholds.pullback) continue;

    const necklinePrice = peakBetween.price;
    const patternHeight = necklinePrice - l1.price;

    const barDuration = candles.length > 1
      ? (candles[candles.length - 1].time - candles[0].time) / candles.length
      : 3600;
    const patternBars = l2.index - l1.index;

    const forecast: ForecastZone = {
      priceMin: necklinePrice + patternHeight * 0.7,
      priceMax: necklinePrice + patternHeight * 1.2,
      timeFrom: l2.time + barDuration * Math.round(patternBars * 0.3),
      timeTo: l2.time + barDuration * patternBars,
      probability: Math.round(60 + (1 - priceDiff / 0.015) * 15),
    };

    const ts = trendStrength(candles,
      Math.max(0, l1.index - Math.floor(patternBars * 1.5)),
      l1.index
    );

    const quality = scoreQuality([l1, peakBetween, l2], priceDiff, 1 - ts);
    quality.overall = adjustQualityForVolatility(quality.overall, candles);
    if (quality.overall < 4) continue;

    const lastCandle = candles[candles.length - 1];
    const status: PatternStatus =
      lastCandle.close > necklinePrice ? 'breakout' :
      l2.index === swings[swings.length - 1].index ? 'forming' : 'completed';

    patterns.push({
      id: `double-bottom-${l1.time}-${l2.time}`,
      type: 'Double Bottom',
      direction: 'bullish',
      status,
      points: [
        { time: l1.time, price: l1.price, label: 'L1' },
        { time: peakBetween.time, price: peakBetween.price, label: 'N' },
        { time: l2.time, price: l2.price, label: 'L2' },
      ],
      neckline: {
        p1: { time: l1.time, price: necklinePrice, label: 'NL' },
        p2: { time: l2.time + barDuration * patternBars, price: necklinePrice, label: 'NL' },
      },
      supportLine: {
        p1: { time: l1.time, price: l1.price, label: 'L1' },
        p2: { time: l2.time, price: l2.price, label: 'L2' },
      },
      forecast,
      quality,
      patternHeight,
      breakoutPrice: necklinePrice,
      timeStart: l1.time,
      timeEnd: l2.time,
    });
  }

  return patterns;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 PATTERNS: Triangle, Channel, Wedge, Head & Shoulders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Linear regression on a set of prices ──
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRIANGLE DETECTION (Symmetric, Ascending, Descending)
// Needs: ≥3 highs + ≥3 lows converging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function detectTriangles(
  candles: CandleData[],
  pivots?: SwingPoint[]
): DetectedPattern[] {
  const swings = pivots || computeZigZag(candles); // UNIFY (4.3)
  const patterns: DetectedPattern[] = [];
  if (swings.length < 6) return patterns;

  const highs = swings.filter(p => p.type === 'HIGH').slice(-6);
  const lows  = swings.filter(p => p.type === 'LOW').slice(-6);
  if (highs.length < 3 || lows.length < 3) return patterns;

  const highReg = linearRegression(highs.map((p, i) => ({ x: i, y: p.price })));
  const lowReg  = linearRegression(lows.map((p, i) => ({ x: i, y: p.price })));

  // Convergence: slopes must go towards each other
  const convergence = highReg.slope < 0.001 && lowReg.slope > -0.001
    && highReg.slope - lowReg.slope > 0;
  if (!convergence) return patterns;

  // Classify triangle type
  let triangleType: string;
  let direction: PatternDirection;
  const FLAT = 0.0005;
  const highFlat = Math.abs(highReg.slope) < FLAT;
  const lowFlat  = Math.abs(lowReg.slope)  < FLAT;

  if (highFlat && !lowFlat && lowReg.slope > 0) {
    triangleType = 'Ascending Triangle';
    direction = 'bullish';
  } else if (lowFlat && !highFlat && highReg.slope < 0) {
    triangleType = 'Descending Triangle';
    direction = 'bearish';
  } else if (highReg.slope < 0 && lowReg.slope > 0) {
    triangleType = 'Symmetrical Triangle';
    direction = Math.abs(highReg.slope) > Math.abs(lowReg.slope) ? 'bearish' : 'bullish';
  } else {
    return patterns;
  }

  // Pattern quality: r² must be decent
  const r2Avg = (highReg.r2 + lowReg.r2) / 2;
  if (r2Avg < 0.5) return patterns;

  const firstH = highs[0]; const lastH = highs[highs.length - 1];
  const firstL = lows[0];  const lastL  = lows[lows.length - 1];

  const timeStart = Math.min(firstH.time, firstL.time);
  const timeEnd   = Math.max(lastH.time, lastL.time);
  const barDuration = candles.length > 1
    ? (candles[candles.length - 1].time - candles[0].time) / candles.length : 3600;
  const patternBars = Math.round((timeEnd - timeStart) / barDuration);
  const patternHeight = Math.abs(firstH.price - firstL.price);

  const forecast: ForecastZone = {
    priceMin: direction === 'bullish' ? lastH.price : lastL.price - patternHeight * 0.8,
    priceMax: direction === 'bullish' ? lastH.price + patternHeight * 0.8 : lastL.price,
    timeFrom: timeEnd + barDuration * Math.round(patternBars * 0.1),
    timeTo:   timeEnd + barDuration * Math.round(patternBars * 0.6),
    probability: Math.round(55 + r2Avg * 20),
  };

  const quality = scoreQuality(
    [...highs, ...lows],
    1 - r2Avg,
    0.6
  );
  if (quality.overall < 4) return patterns;

  patterns.push({
    id: `triangle-${triangleType.replace(/ /g, '-')}-${timeStart}`,
    type: triangleType,
    direction,
    status: 'completed',
    points: [
      { time: firstH.time, price: firstH.price, label: 'H1' },
      { time: lastH.time,  price: lastH.price,  label: 'H2' },
      { time: firstL.time, price: firstL.price, label: 'L1' },
      { time: lastL.time,  price: lastL.price,  label: 'L2' },
    ],
    resistanceLine: {
      p1: { time: firstH.time, price: firstH.price, label: 'R' },
      p2: { time: lastH.time + barDuration * patternBars * 0.5, price: lastH.price + highReg.slope * 3, label: 'R' },
    },
    supportLine: {
      p1: { time: firstL.time, price: firstL.price, label: 'S' },
      p2: { time: lastL.time + barDuration * patternBars * 0.5, price: lastL.price + lowReg.slope * 3, label: 'S' },
    },
    forecast,
    quality,
    patternHeight,
    breakoutPrice: direction === 'bullish' ? lastH.price : lastL.price,
    timeStart,
    timeEnd,
  });

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHANNEL DETECTION (Up / Down)
// Parallel support and resistance with same slope
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function detectChannels(
  candles: CandleData[],
  pivots?: SwingPoint[]
): DetectedPattern[] {
  const swings = pivots || computeZigZag(candles); // UNIFY (4.3)
  const patterns: DetectedPattern[] = [];
  if (swings.length < 6) return patterns;

  const highs = swings.filter(p => p.type === 'HIGH').slice(-5);
  const lows  = swings.filter(p => p.type === 'LOW').slice(-5);
  if (highs.length < 3 || lows.length < 3) return patterns;

  const highReg = linearRegression(highs.map((p, i) => ({ x: i, y: p.price })));
  const lowReg  = linearRegression(lows.map((p, i)  => ({ x: i, y: p.price })));

  // Channels: slopes must be roughly parallel (within 30% relative difference)
  const slopeRatioDiff = highReg.slope !== 0
    ? Math.abs((highReg.slope - lowReg.slope) / highReg.slope)
    : Math.abs(lowReg.slope);

  if (slopeRatioDiff > 0.4) return patterns;

  // Need decent r²
  if (highReg.r2 < 0.5 || lowReg.r2 < 0.5) return patterns;

  const avgSlope = (highReg.slope + lowReg.slope) / 2;
  const channelType = avgSlope > 0.001 ? 'Channel Up' : avgSlope < -0.001 ? 'Channel Down' : 'Rectangle';
  const direction: PatternDirection = channelType === 'Channel Up' ? 'bullish'
    : channelType === 'Channel Down' ? 'bearish' : 'neutral' as any;

  const firstH = highs[0]; const lastH = highs[highs.length - 1];
  const firstL = lows[0];  const lastL  = lows[lows.length - 1];
  const timeStart = Math.min(firstH.time, firstL.time);
  const timeEnd   = Math.max(lastH.time, lastL.time);
  const barDuration = candles.length > 1
    ? (candles[candles.length - 1].time - candles[0].time) / candles.length : 3600;
  const patternBars = Math.round((timeEnd - timeStart) / barDuration);
  const patternHeight = Math.abs(lastH.price - lastL.price);
  const r2Avg = (highReg.r2 + lowReg.r2) / 2;

  const forecast: ForecastZone = {
    priceMin: direction === 'bullish' ? lastH.price : lastL.price - patternHeight * 0.5,
    priceMax: direction === 'bullish' ? lastH.price + patternHeight * 0.5 : lastL.price,
    timeFrom: timeEnd + barDuration * 5,
    timeTo:   timeEnd + barDuration * Math.max(10, patternBars * 0.5),
    probability: Math.round(55 + r2Avg * 15),
  };

  const quality = scoreQuality([...highs, ...lows], 1 - r2Avg, 0.6);
  if (quality.overall < 4) return patterns;

  patterns.push({
    id: `${channelType.replace(/ /g, '-').toLowerCase()}-${timeStart}`,
    type: channelType,
    direction: direction as PatternDirection,
    status: 'completed',
    points: [
      { time: firstH.time, price: firstH.price, label: 'H1' },
      { time: lastH.time,  price: lastH.price,  label: 'H2' },
      { time: firstL.time, price: firstL.price, label: 'L1' },
      { time: lastL.time,  price: lastL.price,  label: 'L2' },
    ],
    resistanceLine: {
      p1: { time: firstH.time, price: firstH.price, label: 'R' },
      p2: { time: timeEnd + barDuration * patternBars * 0.3, price: lastH.price + highReg.slope * 2, label: 'R' },
    },
    supportLine: {
      p1: { time: firstL.time, price: firstL.price, label: 'S' },
      p2: { time: timeEnd + barDuration * patternBars * 0.3, price: lastL.price + lowReg.slope * 2, label: 'S' },
    },
    forecast,
    quality,
    patternHeight,
    breakoutPrice: direction === 'bullish' ? lastH.price : lastL.price,
    timeStart,
    timeEnd,
  });

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WEDGE DETECTION (Falling / Rising)
// Both lines slope same direction but converge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function detectWedges(
  candles: CandleData[],
  pivots?: SwingPoint[]
): DetectedPattern[] {
  const swings = pivots || computeZigZag(candles); // UNIFY (4.3)
  const patterns: DetectedPattern[] = [];
  if (swings.length < 6) return patterns;

  const highs = swings.filter(p => p.type === 'HIGH').slice(-5);
  const lows  = swings.filter(p => p.type === 'LOW').slice(-5);
  if (highs.length < 3 || lows.length < 3) return patterns;

  const highReg = linearRegression(highs.map((p, i) => ({ x: i, y: p.price })));
  const lowReg  = linearRegression(lows.map((p, i)  => ({ x: i, y: p.price })));

  // Wedge: both slopes same sign but converging (different steepness)
  const sameSign = (highReg.slope > 0 && lowReg.slope > 0)
    || (highReg.slope < 0 && lowReg.slope < 0);
  if (!sameSign) return patterns;

  // Convergence: one slope steeper than the other
  const highSteeper = Math.abs(highReg.slope) > Math.abs(lowReg.slope);
  const converging = highReg.slope > 0
    ? highSteeper // rising wedge: high slope > low slope → converge
    : !highSteeper; // falling wedge: low slope < high slope → converge

  if (!converging) return patterns;
  if (highReg.r2 < 0.5 || lowReg.r2 < 0.5) return patterns;

  const isFalling = highReg.slope < 0;
  const wedgeType = isFalling ? 'Falling Wedge' : 'Rising Wedge';
  const direction: PatternDirection = isFalling ? 'bullish' : 'bearish';

  const firstH = highs[0]; const lastH = highs[highs.length - 1];
  const firstL = lows[0];  const lastL  = lows[lows.length - 1];
  const timeStart = Math.min(firstH.time, firstL.time);
  const timeEnd   = Math.max(lastH.time, lastL.time);
  const barDuration = candles.length > 1
    ? (candles[candles.length - 1].time - candles[0].time) / candles.length : 3600;
  const patternBars = Math.round((timeEnd - timeStart) / barDuration);
  const patternHeight = Math.abs(firstH.price - firstL.price);
  const r2Avg = (highReg.r2 + lowReg.r2) / 2;

  const forecast: ForecastZone = {
    priceMin: direction === 'bullish' ? firstH.price - patternHeight * 0.2 : firstL.price - patternHeight,
    priceMax: direction === 'bullish' ? firstH.price + patternHeight * 0.3 : firstL.price,
    timeFrom: timeEnd + barDuration * 5,
    timeTo:   timeEnd + barDuration * Math.max(15, patternBars * 0.6),
    probability: Math.round(60 + r2Avg * 15),
  };

  const quality = scoreQuality([...highs, ...lows], 1 - r2Avg, 0.7);
  if (quality.overall < 4) return patterns;

  patterns.push({
    id: `${wedgeType.replace(/ /g, '-').toLowerCase()}-${timeStart}`,
    type: wedgeType,
    direction,
    status: 'completed',
    points: [
      { time: firstH.time, price: firstH.price, label: 'H1' },
      { time: lastH.time,  price: lastH.price,  label: 'H2' },
      { time: firstL.time, price: firstL.price, label: 'L1' },
      { time: lastL.time,  price: lastL.price,  label: 'L2' },
    ],
    resistanceLine: {
      p1: { time: firstH.time, price: firstH.price, label: 'R' },
      p2: { time: timeEnd, price: lastH.price, label: 'R' },
    },
    supportLine: {
      p1: { time: firstL.time, price: firstL.price, label: 'S' },
      p2: { time: timeEnd, price: lastL.price, label: 'S' },
    },
    forecast,
    quality,
    patternHeight,
    breakoutPrice: direction === 'bullish' ? lastH.price : lastL.price,
    timeStart,
    timeEnd,
  });

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEAD & SHOULDERS (+ Inverse)
// Structure (H&S): peak - low - higher peak - low - peak
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function detectHeadAndShoulders(
  candles: CandleData[],
  pivots?: SwingPoint[]
): DetectedPattern[] {
  const swings = pivots || computeZigZag(candles); // UNIFY (4.3)
  const patterns: DetectedPattern[] = [];

  // ── REVOLUTIONARY: ATR-based dynamic thresholds ──
  const thresholds = getDynamicThresholds(candles);

  const highs = swings.filter(p => p.type === 'HIGH');
  const lows  = swings.filter(p => p.type === 'LOW');

  // ── Head & Shoulders (bearish) ──
  for (let i = 0; i < highs.length - 2; i++) {
    const ls = highs[i];     // left shoulder
    const head = highs[i + 1];
    const rs = highs[i + 2]; // right shoulder

    // Head must be highest
    if (head.price <= ls.price || head.price <= rs.price) continue;

    // Shoulders roughly equal (within dynamic threshold, was 4%)
    const shoulderSymmetry = Math.abs(ls.price - rs.price) / ls.price;
    if (shoulderSymmetry > thresholds.shoulderTolerance) continue;

    // Find troughs between shoulders
    const t1 = lows.find(l => l.index > ls.index && l.index < head.index);
    const t2 = lows.find(l => l.index > head.index && l.index < rs.index);
    if (!t1 || !t2) continue;

    // Neckline from t1 to t2
    const necklineSlope = Math.abs((t2.price - t1.price) / t1.price);
    if (necklineSlope > 0.03) continue; // too steep

    const necklinePrice = (t1.price + t2.price) / 2;
    const patternHeight = head.price - necklinePrice;
    const barDuration = candles.length > 1
      ? (candles[candles.length - 1].time - candles[0].time) / candles.length : 3600;
    const patternBars = rs.index - ls.index;

    const forecast: ForecastZone = {
      priceMin: necklinePrice - patternHeight * 1.1,
      priceMax: necklinePrice - patternHeight * 0.6,
      timeFrom: rs.time + barDuration * 5,
      timeTo:   rs.time + barDuration * patternBars,
      probability: Math.round(68 + (1 - shoulderSymmetry / thresholds.shoulderTolerance) * 10),
    };

    const quality = scoreQuality([ls, t1, head, t2, rs], shoulderSymmetry, 0.7);
    quality.overall = adjustQualityForVolatility(quality.overall, candles);
    if (quality.overall < 5) continue;

    patterns.push({
      id: `head-and-shoulders-${ls.time}`,
      type: 'Head & Shoulders',
      direction: 'bearish',
      status: 'completed',
      points: [
        { time: ls.time, price: ls.price, label: 'LS' },
        { time: t1.time, price: t1.price, label: 'T1' },
        { time: head.time, price: head.price, label: 'H' },
        { time: t2.time, price: t2.price, label: 'T2' },
        { time: rs.time, price: rs.price, label: 'RS' },
      ],
      neckline: {
        p1: { time: t1.time, price: t1.price, label: 'NL' },
        p2: { time: rs.time + barDuration * patternBars * 0.5, price: t2.price, label: 'NL' },
      },
      resistanceLine: {
        p1: { time: ls.time, price: ls.price, label: 'LS' },
        p2: { time: rs.time, price: rs.price, label: 'RS' },
      },
      forecast,
      quality,
      patternHeight,
      breakoutPrice: necklinePrice,
      timeStart: ls.time,
      timeEnd: rs.time,
    });
  }

  // ── Inverse Head & Shoulders (bullish) ──
  for (let i = 0; i < lows.length - 2; i++) {
    const ls = lows[i];
    const head = lows[i + 1];
    const rs = lows[i + 2];

    if (head.price >= ls.price || head.price >= rs.price) continue;

    const shoulderSymmetry = Math.abs(ls.price - rs.price) / ls.price;
    if (shoulderSymmetry > thresholds.shoulderTolerance) continue;

    const t1 = highs.find(h => h.index > ls.index && h.index < head.index);
    const t2 = highs.find(h => h.index > head.index && h.index < rs.index);
    if (!t1 || !t2) continue;

    const necklineSlope = Math.abs((t2.price - t1.price) / t1.price);
    if (necklineSlope > thresholds.pullback) continue;

    const necklinePrice = (t1.price + t2.price) / 2;
    const patternHeight = necklinePrice - head.price;
    const barDuration = candles.length > 1
      ? (candles[candles.length - 1].time - candles[0].time) / candles.length : 3600;
    const patternBars = rs.index - ls.index;

    const forecast: ForecastZone = {
      priceMin: necklinePrice + patternHeight * 0.6,
      priceMax: necklinePrice + patternHeight * 1.1,
      timeFrom: rs.time + barDuration * 5,
      timeTo:   rs.time + barDuration * patternBars,
      probability: Math.round(68 + (1 - shoulderSymmetry / thresholds.shoulderTolerance) * 10),
    };

    const quality = scoreQuality([ls, t1, head, t2, rs], shoulderSymmetry, 0.3);
    quality.overall = adjustQualityForVolatility(quality.overall, candles);
    if (quality.overall < 5) continue;

    patterns.push({
      id: `inverse-hs-${ls.time}`,
      type: 'Inverse Head & Shoulders',
      direction: 'bullish',
      status: 'completed',
      points: [
        { time: ls.time, price: ls.price, label: 'LS' },
        { time: t1.time, price: t1.price, label: 'T1' },
        { time: head.time, price: head.price, label: 'H' },
        { time: t2.time, price: t2.price, label: 'T2' },
        { time: rs.time, price: rs.price, label: 'RS' },
      ],
      neckline: {
        p1: { time: t1.time, price: t1.price, label: 'NL' },
        p2: { time: rs.time + barDuration * patternBars * 0.5, price: t2.price, label: 'NL' },
      },
      supportLine: {
        p1: { time: ls.time, price: ls.price, label: 'LS' },
        p2: { time: rs.time, price: rs.price, label: 'RS' },
      },
      forecast,
      quality,
      patternHeight,
      breakoutPrice: necklinePrice,
      timeStart: ls.time,
      timeEnd: rs.time,
    });
  }

  return patterns;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3: Harmonic XABCD Patterns
// Gartley / Bat / Butterfly / Crab (Scott Carney ratios)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HarmonicRatios {
  XAB:  [number, number]; // AB/XA range
  ABC:  [number, number]; // BC/AB range
  BCD:  [number, number]; // CD/BC range
  XAD:  [number, number]; // AD/XA range (D point Fibonacci level)
  precision: number;      // tolerance ±
}

const HARMONIC_PATTERNS: Record<string, HarmonicRatios> = {
  // ── الأنماط الكلاسيكية ──────────────────────────────────
  'Gartley': {
    XAB:  [0.618, 0.618],
    ABC:  [0.382, 0.886],
    BCD:  [1.27, 1.618],
    XAD:  [0.786, 0.786],
    precision: 0.05,
  },
  'Bat': {
    XAB:  [0.382, 0.500],
    ABC:  [0.382, 0.886],
    BCD:  [1.618, 2.618],
    XAD:  [0.886, 0.886],
    precision: 0.05,
  },
  'Alternate Bat': {
    XAB:  [0.382, 0.382],
    ABC:  [0.382, 0.886],
    BCD:  [2.0,   3.618],
    XAD:  [1.13,  1.13],
    precision: 0.06,
  },
  'Butterfly': {
    XAB:  [0.786, 0.786],
    ABC:  [0.382, 0.886],
    BCD:  [1.618, 2.618],
    XAD:  [1.27,  1.41],
    precision: 0.05,
  },
  'Crab': {
    XAB:  [0.382, 0.618],
    ABC:  [0.382, 0.886],
    BCD:  [2.618, 3.618],
    XAD:  [1.618, 1.618],
    precision: 0.05,
  },
  'Deep Crab': {
    XAB:  [0.886, 0.886],
    ABC:  [0.382, 0.886],
    BCD:  [2.0,   3.618],
    XAD:  [1.618, 1.618],
    precision: 0.06,
  },
  // ── أنماط أحدث: Cypher, Shark, 5-0 ─────────────────────
  'Cypher': {
    XAB:  [0.382, 0.618],
    ABC:  [1.13,  1.41],
    BCD:  [1.272, 2.0],
    XAD:  [0.786, 0.786],  // D = 0.786 retracement of XC
    precision: 0.07,
  },
  'Shark': {
    XAB:  [0.446, 0.618],
    ABC:  [1.13,  1.618],
    BCD:  [1.618, 2.24],
    XAD:  [0.886, 1.13],
    precision: 0.07,
  },
  '5-0': {
    XAB:  [1.13,  1.618],
    ABC:  [1.618, 2.24],
    BCD:  [0.50,  0.50],   // 50% retracement of BC
    XAD:  [0.50,  0.50],
    precision: 0.06,
  },
};

function inRange(value: number, min: number, max: number, precision: number): boolean {
  const lo = Math.min(min, max) - precision;
  const hi = Math.max(min, max) + precision;
  return value >= lo && value <= hi;
}

export function detectHarmonics(
  candles: CandleData[],
  pivots?: SwingPoint[]
): DetectedPattern[] {
  const swings = pivots || computeZigZag(candles); // UNIFY (4.3)
  const patterns: DetectedPattern[] = [];
  if (swings.length < 5) return patterns;

  const barDuration = candles.length > 1
    ? (candles[candles.length - 1].time - candles[0].time) / candles.length : 3600;

  // Try all consecutive 5-point windows in swing points
  for (let i = 0; i <= swings.length - 5; i++) {
    const [X, A, B, C, D] = swings.slice(i, i + 5);

    // Must alternate high/low: X-A different, A-B different, etc.
    if (X.type === A.type || A.type === B.type || B.type === C.type || C.type === D.type) continue;

    const XA = Math.abs(A.price - X.price);
    const AB = Math.abs(B.price - A.price);
    const BC = Math.abs(C.price - B.price);
    const CD = Math.abs(D.price - C.price);
    const XD = Math.abs(D.price - X.price);

    if (XA < 0.0001 || AB < 0.0001 || BC < 0.0001 || CD < 0.0001) continue;

    const ratioXAB = AB / XA;
    const ratioABC = BC / AB;
    const ratioBCD = CD / BC;
    const ratioXAD = XD / XA;

    // Determine direction: bullish if X is lower than A
    const isBullish = X.price < A.price;

    for (const [patternName, ratios] of Object.entries(HARMONIC_PATTERNS)) {
      const p = ratios.precision;
      if (!inRange(ratioXAB, ratios.XAB[0], ratios.XAB[1], p)) continue;
      if (!inRange(ratioABC, ratios.ABC[0], ratios.ABC[1], p)) continue;
      if (!inRange(ratioBCD, ratios.BCD[0], ratios.BCD[1], p)) continue;
      if (!inRange(ratioXAD, ratios.XAD[0], ratios.XAD[1], p + 0.03)) continue;

      // Calculate PRZ (Potential Reversal Zone)
      const przPrice = D.price;
      const przRange = przPrice * 0.015; // ±1.5% around D

      const direction: PatternDirection = isBullish ? 'bullish' : 'bearish';

      const forecast: ForecastZone = {
        priceMin: isBullish ? przPrice + XA * 0.382 : przPrice - XA * 0.382,
        priceMax: isBullish ? przPrice + XA * 0.618 : przPrice - XA * 0.618,
        timeFrom: D.time + barDuration * 3,
        timeTo:   D.time + barDuration * Math.round((D.index - X.index) * 0.5),
        probability: Math.round(65 + (1 - Math.abs(ratioXAB - ratios.XAB[0])) * 10),
      };

      // Quality: how precisely the ratios match
      const xabDeviation = Math.abs(ratioXAB - (ratios.XAB[0] + ratios.XAB[1]) / 2) / ratios.XAB[0];
      const xadDeviation = Math.abs(ratioXAD - ratios.XAD[0]) / ratios.XAD[0];
      const overallDev = (xabDeviation + xadDeviation) / 2;

      const quality: QualityScore = {
        clarity: Math.max(1, Math.min(10, Math.round((1 - xabDeviation * 5) * 10))),
        uniformity: Math.max(1, Math.min(10, Math.round((1 - xadDeviation * 3) * 10))),
        initialTrend: 7,
        overall: Math.max(1, Math.min(10, Math.round((1 - overallDev * 2) * 10))),
      };

      if (quality.overall < 5) continue;

      patterns.push({
        id: `harmonic-${patternName.toLowerCase()}-${X.time}`,
        type: `${patternName} ${isBullish ? '(Bullish)' : '(Bearish)'}`,
        direction,
        status: 'completed',
        points: [
          { time: X.time, price: X.price, label: 'X' },
          { time: A.time, price: A.price, label: 'A' },
          { time: B.time, price: B.price, label: 'B' },
          { time: C.time, price: C.price, label: 'C' },
          { time: D.time, price: D.price, label: 'D (PRZ)' },
        ],
        resistanceLine: isBullish ? undefined : {
          p1: { time: X.time, price: X.price, label: 'X' },
          p2: { time: A.time, price: A.price, label: 'A' },
        },
        supportLine: isBullish ? {
          p1: { time: X.time, price: X.price, label: 'X' },
          p2: { time: A.time, price: A.price, label: 'A' },
        } : undefined,
        forecast,
        quality,
        patternHeight: XA,
        breakoutPrice: przPrice,
        timeStart: X.time,
        timeEnd: D.time,
      });

      // Only match one pattern per window
      break;
    }
  }

  // Deduplicate: keep highest quality per time window
  const unique = new Map<string, DetectedPattern>();
  for (const p of patterns) {
    const key = `${p.timeStart}-${p.timeEnd}`;
    const existing = unique.get(key);
    if (!existing || p.quality.overall > existing.quality.overall) {
      unique.set(key, p);
    }
  }

  return Array.from(unique.values());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN ENGINE — runs all Phase 1+2+3 detectors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function runPatternEngine(
  candles: CandleData[],
  config?: { minQuality?: number; forceFullRecalc?: boolean }
): { patterns: DetectedPattern[]; pivots: SwingPoint[] } {
  if (!candles || candles.length < 30) return { patterns: [], pivots: [] };

  // ── REVOLUTIONARY: Incremental calculation ──
  // Instead of recalculating everything from scratch on every new candle,
  // maintain state and only update incrementally. Full recalc every ~50 candles
  // to prevent drift, or when forced.
  const currentLen = candles.length;
  const lastCandle = candles[candles.length - 1];
  const shouldFullRecalc = config?.forceFullRecalc
    || !_incrementalState
    || _lastCandleCount === 0
    || (currentLen - _lastCandleCount > 50)
    || needsFullRecalc(_incrementalState, currentLen);

  if (!_incrementalState) {
    _incrementalState = createIncrementalState();
  }

  if (shouldFullRecalc) {
    _incrementalState = initializeState(_incrementalState, candles);
  } else {
    // Incremental update with just the new candle(s)
    const newCandlesCount = currentLen - _lastCandleCount;
    for (let i = 0; i < Math.min(newCandlesCount, 5); i++) {
      const idx = _lastCandleCount + i;
      if (idx < currentLen) {
        const prev = idx > 0 ? candles[idx - 1] : null;
        _incrementalState = updateIncremental(_incrementalState, candles[idx], prev);
      }
    }
  }
  _lastCandleCount = currentLen;
  _lastCandleTime = lastCandle.time;

  const pivots = computeZigZag(candles); // UNIFY (4.3)
  const minQ = config?.minQuality ?? 4;

  const allPatterns: DetectedPattern[] = [
    ...detectDoubleTop(candles, pivots),
    ...detectDoubleBottom(candles, pivots),
    ...detectTriangles(candles, pivots),
    ...detectChannels(candles, pivots),
    ...detectWedges(candles, pivots),
    ...detectHeadAndShoulders(candles, pivots),
    ...detectHarmonics(candles, pivots),
  ].filter(p => p.quality.overall >= minQ)
   .sort((a, b) => b.quality.overall - a.quality.overall)
   .slice(0, 10); // max 10 patterns at once

  return { patterns: allPatterns, pivots };
}

// ── Reset Singleton State ──────────────────────────────
// FIX: Module-level variables _incrementalState, _lastCandleCount,
// _lastCandleTime survive across React re-renders and symbol/timeframe
// changes. When the user switches from BTC to ETH, the old BTC state
// persists and produces incorrect patterns for ETH data.
// Call this function when symbol or timeframe changes.
export function resetPatternEngineState(): void {
  _incrementalState = null;
  _lastCandleCount = 0;
  _lastCandleTime = 0;
}
