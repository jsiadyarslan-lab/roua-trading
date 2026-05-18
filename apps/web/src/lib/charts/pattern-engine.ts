// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern Engine — Phase 1: Double Top/Bottom Detection
// Phase 2 will add: Triangle, Channel, Wedge, H&S
// Phase 3 will add: Harmonic XABCD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { CandleData } from './types';
import { detectZigZag, type SwingPoint } from './zigzag';

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
  const uniformity = Math.max(1, Math.min(10, pivots.reduce((s, p) => s + p.strength, 0) / pivots.length));
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
  pivots?: SwingPoint[]
): DetectedPattern[] {
  const swings = pivots || detectZigZag(candles);
  const patterns: DetectedPattern[] = [];

  const highs = swings.filter(p => p.type === 'high');
  const lows = swings.filter(p => p.type === 'low');

  for (let i = 0; i < highs.length - 1; i++) {
    const h1 = highs[i];
    const h2 = highs[i + 1];

    // h2 must come after h1
    if (h2.index <= h1.index) continue;

    // Price similarity: peaks within 1.5%
    const priceDiff = Math.abs(h1.price - h2.price) / h1.price;
    if (priceDiff > 0.015) continue;

    // Find the trough between h1 and h2
    const troughBetween = lows.find(l =>
      l.index > h1.index && l.index < h2.index
    );
    if (!troughBetween) continue;

    // Pullback depth: trough must be at least 3% below the peaks
    const pullbackPct = (h1.price - troughBetween.price) / h1.price;
    if (pullbackPct < 0.03) continue;

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
  const swings = pivots || detectZigZag(candles);
  const patterns: DetectedPattern[] = [];

  const lows = swings.filter(p => p.type === 'low');
  const highs = swings.filter(p => p.type === 'high');

  for (let i = 0; i < lows.length - 1; i++) {
    const l1 = lows[i];
    const l2 = lows[i + 1];

    if (l2.index <= l1.index) continue;

    const priceDiff = Math.abs(l1.price - l2.price) / l1.price;
    if (priceDiff > 0.015) continue;

    const peakBetween = highs.find(h =>
      h.index > l1.index && h.index < l2.index
    );
    if (!peakBetween) continue;

    const bounceUpPct = (peakBetween.price - l1.price) / l1.price;
    if (bounceUpPct < 0.03) continue;

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
// MAIN ENGINE — runs all Phase 1 detectors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function runPatternEngine(
  candles: CandleData[],
  config?: { minQuality?: number }
): { patterns: DetectedPattern[]; pivots: SwingPoint[] } {
  if (!candles || candles.length < 30) return { patterns: [], pivots: [] };

  const pivots = detectZigZag(candles);
  const minQ = config?.minQuality ?? 4;

  const allPatterns: DetectedPattern[] = [
    ...detectDoubleTop(candles, pivots),
    ...detectDoubleBottom(candles, pivots),
  ].filter(p => p.quality.overall >= minQ)
   .sort((a, b) => b.quality.overall - a.quality.overall)
   .slice(0, 10); // max 10 patterns at once

  return { patterns: allPatterns, pivots };
}
