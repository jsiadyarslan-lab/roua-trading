// ═══════════════════════════════════════════════════════════════════════
// ROUA Liquidity Zones Engine — Phase 3
//
// Detects liquidity pools (areas where stops cluster) and sweep events.
// Based on ICT/SMC methodology:
//
// - Equal Highs/Lows: Multiple swing points at similar price levels
//   → stops cluster there → liquidity pool
// - Previous High/Low: Obvious swing points attract stops
// - Sweep: Price briefly pierces a liquidity zone then reverses
//   → indicates stop hunt by institutions
// - Liquidity Voids: Large gaps with no overlap (like FVG but
//   measured by absence of trading activity)
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData, AIPattern } from './types';
import { computeZigZag } from './chart-detection';
import { calcATR } from './ATRAdapter';
import { safeMax, safeMin } from './chart-utils';

// ── Types ───────────────────────────────────────────────────────────

/** Type of liquidity zone */
export type LiquidityType = 'equal_highs' | 'equal_lows' | 'previous_high' | 'previous_low' | 'liquidity_void';

/** A detected liquidity zone */
export interface LiquidityZone {
  /** Zone type */
  type: LiquidityType;
  /** Price level of the liquidity pool */
  price: number;
  /** Upper boundary of the zone */
  high: number;
  /** Lower boundary of the zone */
  low: number;
  /** Start time of the zone */
  startTime: number;
  /** End time (or current if still active) */
  endTime: number;
  /** Strength: number of touches/cluster points (1-5) */
  strength: number;
  /** Direction of expected reversal after sweep */
  sweepDirection: 'bullish' | 'bearish';
  /** Has this zone been swept? */
  swept: boolean;
  /** If swept, when? */
  sweepTime?: number;
  /** Confidence (0-1) */
  confidence: number;
  /** Arabic label */
  labelAr: string;
}

/** Complete liquidity analysis result */
export interface LiquidityResult {
  /** All detected liquidity zones */
  zones: LiquidityZone[];
  /** Number of active (unswept) zones */
  activeZones: number;
  /** Number of swept zones */
  sweptZones: number;
  /** Dominant sweep direction (if recent sweep occurred) */
  dominantSweepDirection: 'bullish' | 'bearish' | 'neutral';
  /** Interpretation in Arabic */
  interpretationAr: string;
}

// ── Arabic Labels ───────────────────────────────────────────────────

const LABELS_AR: Record<LiquidityType, string> = {
  'equal_highs': 'سيولة قمم متساوية',
  'equal_lows': 'سيولة قيعان متساوية',
  'previous_high': 'سيولة قمة سابقة',
  'previous_low': 'سيولة قاع سابق',
  'liquidity_void': 'فراغ سيولي',
};

// ── Constants ───────────────────────────────────────────────────────

/** Minimum candles for analysis */
const MIN_CANDLES = 30;

/** Proximity threshold for "equal" highs/lows (% of price) */
const EQUAL_THRESHOLD = 0.003; // 0.3%

/** Lookback for swing point analysis */
const LOOKBACK = 100;

/** Maximum zones to return */
const MAX_ZONES = 20;

// ── Detection Functions ─────────────────────────────────────────────

/**
 * Detect equal highs/lows where multiple swing points cluster
 * at approximately the same price level → stop loss cluster → liquidity pool.
 */
function detectEqualLevels(candles: CandleData[], swings: Array<{ type: string; price: number; time: number }>): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const atr = calcATR(candles, 14);
  const tolerance = Math.max(atr * 0.3, candles[candles.length - 1].close * EQUAL_THRESHOLD);

  // Cluster swing highs
  const highs = swings.filter(s => s.type === 'HIGH');
  const lows = swings.filter(s => s.type === 'LOW');

  // Cluster equal highs
  for (let i = 0; i < highs.length; i++) {
    let cluster = [highs[i]];
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[j].price - highs[i].price) <= tolerance) {
        cluster.push(highs[j]);
      }
    }

    if (cluster.length >= 2) {
      const avgPrice = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      const startTime = safeMin(cluster.map(p => p.time));
      const endTime = safeMax(cluster.map(p => p.time));

      // Check if swept
      const swept = candles.some(c =>
        c.time > endTime && c.high > avgPrice + tolerance * 0.5 && c.close < avgPrice
      );
      const sweepCandle = swept ? candles.find(c =>
        c.time > endTime && c.high > avgPrice + tolerance * 0.5 && c.close < avgPrice
      ) : null;

      zones.push({
        type: 'equal_highs',
        price: avgPrice,
        high: avgPrice + tolerance * 0.5,
        low: avgPrice - tolerance * 0.5,
        startTime,
        endTime: sweepCandle?.time || endTime,
        strength: Math.min(5, cluster.length),
        sweepDirection: 'bearish', // Equal highs → sell stops below → sweep → bearish reversal
        swept,
        sweepTime: sweepCandle?.time,
        confidence: Math.min(0.9, 0.4 + cluster.length * 0.15),
        labelAr: LABELS_AR['equal_highs'],
      });
    }
  }

  // Cluster equal lows
  for (let i = 0; i < lows.length; i++) {
    let cluster = [lows[i]];
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[j].price - lows[i].price) <= tolerance) {
        cluster.push(lows[j]);
      }
    }

    if (cluster.length >= 2) {
      const avgPrice = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      const startTime = safeMin(cluster.map(p => p.time));
      const endTime = safeMax(cluster.map(p => p.time));

      // Check if swept
      const swept = candles.some(c =>
        c.time > endTime && c.low < avgPrice - tolerance * 0.5 && c.close > avgPrice
      );
      const sweepCandle = swept ? candles.find(c =>
        c.time > endTime && c.low < avgPrice - tolerance * 0.5 && c.close > avgPrice
      ) : null;

      zones.push({
        type: 'equal_lows',
        price: avgPrice,
        high: avgPrice + tolerance * 0.5,
        low: avgPrice - tolerance * 0.5,
        startTime,
        endTime: sweepCandle?.time || endTime,
        strength: Math.min(5, cluster.length),
        sweepDirection: 'bullish', // Equal lows → buy stops above → sweep → bullish reversal
        swept,
        sweepTime: sweepCandle?.time,
        confidence: Math.min(0.9, 0.4 + cluster.length * 0.15),
        labelAr: LABELS_AR['equal_lows'],
      });
    }
  }

  return zones;
}

/**
 * Detect previous swing highs/lows as liquidity pools.
 * Obvious structural points attract stop losses.
 */
function detectPreviousSwings(candles: CandleData[], swings: Array<{ type: string; price: number; time: number }>): LiquidityZone[] {
  const zones: LiquidityZone[] = [];

  // Take the most significant swing highs (top 3)
  const sortedHighs = swings
    .filter(s => s.type === 'HIGH')
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  for (const sh of sortedHighs) {
    // Check if it hasn't been taken (current price below it)
    const currentPrice = candles[candles.length - 1].close;
    if (currentPrice < sh.price) {
      zones.push({
        type: 'previous_high',
        price: sh.price,
        high: sh.price + candles[candles.length - 1].close * 0.001,
        low: sh.price - candles[candles.length - 1].close * 0.001,
        startTime: sh.time,
        endTime: candles[candles.length - 1].time,
        strength: 3,
        sweepDirection: 'bearish',
        swept: false,
        confidence: 0.6,
        labelAr: LABELS_AR['previous_high'],
      });
    }
  }

  // Take the most significant swing lows (bottom 3)
  const sortedLows = swings
    .filter(s => s.type === 'LOW')
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  for (const sl of sortedLows) {
    const currentPrice = candles[candles.length - 1].close;
    if (currentPrice > sl.price) {
      zones.push({
        type: 'previous_low',
        price: sl.price,
        high: sl.price + candles[candles.length - 1].close * 0.001,
        low: sl.price - candles[candles.length - 1].close * 0.001,
        startTime: sl.time,
        endTime: candles[candles.length - 1].time,
        strength: 3,
        sweepDirection: 'bullish',
        swept: false,
        confidence: 0.6,
        labelAr: LABELS_AR['previous_low'],
      });
    }
  }

  return zones;
}

/**
 * Detect liquidity voids — large gaps in price action where no trading
 * occurred. These are areas price tends to revisit quickly.
 */
function detectLiquidityVoids(candles: CandleData[]): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const atr = calcATR(candles, 14);

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];

    // Bullish void: current low > previous high (gap up)
    if (curr.low > prev.high) {
      const gapSize = curr.low - prev.high;
      if (gapSize > atr * 0.5) { // Only significant gaps
        zones.push({
          type: 'liquidity_void',
          price: (prev.high + curr.low) / 2,
          high: curr.low,
          low: prev.high,
          startTime: prev.time,
          endTime: curr.time,
          strength: Math.min(5, Math.round(gapSize / atr)),
          sweepDirection: 'bearish', // Price tends to fill gaps
          swept: false,
          confidence: Math.min(0.8, 0.3 + (gapSize / atr) * 0.2),
          labelAr: LABELS_AR['liquidity_void'],
        });
      }
    }

    // Bearish void: current high < previous low (gap down)
    if (curr.high < prev.low) {
      const gapSize = prev.low - curr.high;
      if (gapSize > atr * 0.5) {
        zones.push({
          type: 'liquidity_void',
          price: (prev.low + curr.high) / 2,
          high: prev.low,
          low: curr.high,
          startTime: prev.time,
          endTime: curr.time,
          strength: Math.min(5, Math.round(gapSize / atr)),
          sweepDirection: 'bullish', // Price tends to fill gaps
          swept: false,
          confidence: Math.min(0.8, 0.3 + (gapSize / atr) * 0.2),
          labelAr: LABELS_AR['liquidity_void'],
        });
      }
    }
  }

  return zones.slice(-10); // Keep most recent 10
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Detect all liquidity zones from candle data.
 */
export function detectLiquidityZones(candles: CandleData[]): LiquidityResult {
  if (!candles || candles.length < MIN_CANDLES) {
    return { zones: [], activeZones: 0, sweptZones: 0, dominantSweepDirection: 'neutral', interpretationAr: 'بيانات غير كافية لتحليل السيولة' };
  }

  const recent = candles.slice(-LOOKBACK);
  const swings = computeZigZag(recent);

  // Collect all zones
  const allZones: LiquidityZone[] = [
    ...detectEqualLevels(recent, swings),
    ...detectPreviousSwings(recent, swings),
    ...detectLiquidityVoids(recent),
  ];

  // Sort by confidence
  allZones.sort((a, b) => b.confidence - a.confidence);

  // Keep top MAX_ZONES
  const zones = allZones.slice(0, MAX_ZONES);

  const activeZones = zones.filter(z => !z.swept).length;
  const sweptZones = zones.filter(z => z.swept).length;

  // Determine dominant sweep direction
  const recentSweeps = zones.filter(z => z.swept);
  const bullishSweeps = recentSweeps.filter(z => z.sweepDirection === 'bullish').length;
  const bearishSweeps = recentSweeps.filter(z => z.sweepDirection === 'bearish').length;

  const dominantSweepDirection: 'bullish' | 'bearish' | 'neutral' =
    bullishSweeps > bearishSweeps * 1.5 ? 'bullish'
    : bearishSweeps > bullishSweeps * 1.5 ? 'bearish'
    : 'neutral';

  // Arabic interpretation
  let interpretationAr: string;
  if (sweptZones > 0 && dominantSweepDirection !== 'neutral') {
    const dirAr = dominantSweepDirection === 'bullish' ? 'صاعد' : 'هابط';
    interpretationAr = `تم سحب سيولة ${dirAr} — ${sweptZones} مناطق تم سحبها، ${activeZones} مناطق نشطة`;
  } else if (activeZones > 3) {
    interpretationAr = `${activeZones} مناطق سيولة نشطة — احتمال سحب قريب`;
  } else {
    interpretationAr = `${activeZones} مناطق سيولة نشطة، ${sweptZones} مسحوبة`;
  }

  return {
    zones,
    activeZones,
    sweptZones,
    dominantSweepDirection,
    interpretationAr,
  };
}

/**
 * Convert liquidity zones to AIPattern format for chart rendering.
 */
export function liquidityToAIPatterns(result: LiquidityResult): AIPattern[] {
  return result.zones.map(zone => ({
    type: `liquidity-${zone.type}`,
    labelAr: zone.labelAr,
    time: zone.startTime,
    price: zone.price,
    confidence: zone.confidence,
    direction: zone.sweepDirection,
    shapeType: 'zone' as const,
    shapePoints: [
      { time: zone.startTime, price: zone.high },
      { time: zone.endTime, price: zone.high },
      { time: zone.endTime, price: zone.low },
      { time: zone.startTime, price: zone.low },
    ],
    shapeColor: zone.swept
      ? 'rgba(156, 163, 175, 0.08)'  // Grayed out if swept
      : zone.sweepDirection === 'bullish'
        ? 'rgba(0, 255, 163, 0.1)'    // Green for bullish sweep zones
        : 'rgba(255, 71, 87, 0.1)',    // Red for bearish sweep zones
  }));
}
