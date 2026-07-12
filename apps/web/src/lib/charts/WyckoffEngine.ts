// ═══════════════════════════════════════════════════════════════════════
// ROUA Advanced Wyckoff Analysis Engine — Phase 2 Upgrade
//
// Full A-E phase detection for both Accumulation and Distribution schemes:
//
// ACCUMULATION:
//   Phase A: Selling Climax (SC), Automatic Rally (AR), Secondary Test (ST)
//   Phase B: Absorption with volume dry-ups
//   Phase C: Spring (S), Last Point of Support (LPS)
//   Phase D: Sign of Strength (SOS), Backup (BU), LPS2
//   Phase E: Departure from range
//
// DISTRIBUTION:
//   Phase A: Buying Climax (BC), Automatic Reaction (AR), Secondary Test (ST)
//   Phase B: CM distributes
//   Phase C: UTAD (Upthrust After Distribution), Last Point of Supply (LPSY)
//   Phase D: Sign of Weakness (SOW), Backup to LPSY
//   Phase E: Departure downward
//
// Uses volume analysis, money flow, and structural price action
// to identify Wyckoff events at actual chart points.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData, AIPattern } from './types';
import { calcATR } from './ATRAdapter';
import { safeMax, safeMin } from './chart-utils';

// ── Exported Types ───────────────────────────────────────────────────

/** Wyckoff event types */
export type WyckoffEventType =
  | 'SC'    // Selling Climax
  | 'AR'    // Automatic Rally
  | 'ST'    // Secondary Test
  | 'S'     // Spring
  | 'SOS'   // Sign of Strength
  | 'LPS'   // Last Point of Support
  | 'BU'    // Backup
  | 'BC'    // Buying Climax
  | 'UTAD'  // Upthrust After Distribution
  | 'SOW'   // Sign of Weakness
  | 'LPSY'  // Last Point of Supply
  | 'DEP';  // Departure

/** Wyckoff scheme classification */
export type WyckoffScheme = 'accumulation' | 'distribution' | 'none';

/** A single Wyckoff event placed at a structural chart point */
export interface WyckoffEvent {
  /** Event type identifier */
  type: WyckoffEventType;
  /** Which phase (A–E) this event belongs to */
  phase: 'A' | 'B' | 'C' | 'D' | 'E';
  /** Price at which the event occurred */
  price: number;
  /** Time (Unix seconds) when the event occurred */
  time: number;
  /** Volume at the event bar */
  volume: number;
  /** Human-readable description of the event */
  description: string;
}

/** Complete Wyckoff analysis result */
export interface WyckoffResult {
  /** Identified scheme (accumulation, distribution, or none) */
  scheme: WyckoffScheme;
  /** Current phase within the scheme */
  currentPhase: 'A' | 'B' | 'C' | 'D' | 'E' | 'none';
  /** All detected Wyckoff events in chronological order */
  events: WyckoffEvent[];
  /** Trading range boundaries */
  range: {
    high: number;
    low: number;
    mid: number;
    atrBand: number;
  };
  /** Support level within the range */
  support: number;
  /** Resistance level within the range */
  resistance: number;
  /** Overall confidence in the Wyckoff analysis (0–1) */
  confidence: number;
  /** Directional bias derived from the scheme */
  direction: 'bullish' | 'bearish' | 'neutral';
}

// ── Arabic Labels ────────────────────────────────────────────────────

const SCHEME_LABELS_AR: Record<WyckoffScheme, string> = {
  accumulation: 'تراكم وايكوف',
  distribution: 'توزيع وايكوف',
  none: 'غير محدد',
};

const EVENT_LABELS_AR: Record<WyckoffEventType, string> = {
  SC:   'ذروة البيع',
  AR:   'ارتداد تلقائي',
  ST:   'اختبار ثانوي',
  S:    'سبرينج',
  SOS:  'علامة قوة',
  LPS:  'آخر نقطة دعم',
  BU:   'ارتداد خلفي',
  BC:   'ذروة الشراء',
  UTAD: 'اختراق وهمي للتوزيع',
  SOW:  'علامة ضعف',
  LPSY: 'آخر نقطة عرض',
  DEP:  'مغادرة النطاق',
};

const EVENT_DESCRIPTIONS: Record<WyckoffEventType, string> = {
  SC:   'Selling Climax — extreme volume selloff marking end of decline',
  AR:   'Automatic Rally — natural rebound after climax',
  ST:   'Secondary Test — retest of climax low on reduced volume',
  S:    'Spring — false breakdown below support to shake out weak hands',
  SOS:  'Sign of Strength — strong advance on widening spread',
  LPS:  'Last Point of Support — pullback to support before markup',
  BU:   'Backup — pullback after SOS, confirming support',
  BC:   'Buying Climax — extreme volume rally marking end of advance',
  UTAD: 'Upthrust After Distribution — false breakout above resistance',
  SOW:  'Sign of Weakness — sharp decline on widening spread',
  LPSY: 'Last Point of Supply — rally back to resistance before markdown',
  DEP:  'Departure — price exits the trading range',
};

// ── Internal Helpers ─────────────────────────────────────────────────

/** Minimum candles for Wyckoff analysis */
const MIN_CANDLES = 40;

/** Lookback window for analysis */
const LOOKBACK = 120;

/**
 * Find the candle index with the highest volume within a range.
 */
function findHighestVolumeIndex(candles: CandleData[], start: number, end: number): number {
  let maxVol = -1;
  let maxIdx = start;
  for (let i = start; i <= end && i < candles.length; i++) {
    if (candles[i].volume > maxVol) {
      maxVol = candles[i].volume;
      maxIdx = i;
    }
  }
  return maxIdx;
}

/**
 * Find the candle index with the lowest low within a range.
 */
function findLowestLowIndex(candles: CandleData[], start: number, end: number): number {
  let minLow = Infinity;
  let minIdx = start;
  for (let i = start; i <= end && i < candles.length; i++) {
    if (candles[i].low < minLow) {
      minLow = candles[i].low;
      minIdx = i;
    }
  }
  return minIdx;
}

/**
 * Find the candle index with the highest high within a range.
 */
function findHighestHighIndex(candles: CandleData[], start: number, end: number): number {
  let maxHigh = -Infinity;
  let maxIdx = start;
  for (let i = start; i <= end && i < candles.length; i++) {
    if (candles[i].high > maxHigh) {
      maxHigh = candles[i].high;
      maxIdx = i;
    }
  }
  return maxIdx;
}

/**
 * Calculate average volume over a range.
 */
function avgVolume(candles: CandleData[], start: number, end: number): number {
  if (end <= start) return 0;
  let sum = 0;
  const count = Math.min(end, candles.length) - start;
  for (let i = start; i < end && i < candles.length; i++) {
    sum += candles[i].volume;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Calculate simple linear regression slope of close prices.
 * Returns normalized slope (slope / mean price).
 */
function priceSlope(candles: CandleData[], start: number, end: number): number {
  const n = end - start;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = start; i < end && i < candles.length; i++) {
    const x = i - start;
    const y = candles[i].close;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return 0;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const meanY = sumY / n;
  return meanY !== 0 ? slope / meanY : 0;
}

/**
 * Check if volume is a "dry-up" (significantly below average).
 */
function isVolumeDryUp(candle: CandleData[], index: number, avgVol: number): boolean {
  if (index < 0 || index >= candle.length) return false;
  return candle[index].volume < avgVol * 0.5;
}

/**
 * Detect if price breaks below a support level (Spring candidate).
 */
function detectSpring(
  candles: CandleData[],
  supportPrice: number,
  startIndex: number,
  endIndex: number,
): { index: number; price: number; time: number } | null {
  for (let i = startIndex; i < endIndex && i < candles.length; i++) {
    // Price dips below support then closes above it
    if (candles[i].low < supportPrice && candles[i].close > supportPrice) {
      return { index: i, price: candles[i].low, time: candles[i].time };
    }
  }
  return null;
}

/**
 * Detect if price breaks above a resistance level (UTAD candidate).
 */
function detectUTAD(
  candles: CandleData[],
  resistancePrice: number,
  startIndex: number,
  endIndex: number,
): { index: number; price: number; time: number } | null {
  for (let i = startIndex; i < endIndex && i < candles.length; i++) {
    if (candles[i].high > resistancePrice && candles[i].close < resistancePrice) {
      return { index: i, price: candles[i].high, time: candles[i].time };
    }
  }
  return null;
}

// ── Accumulation Detection ───────────────────────────────────────────

/**
 * Detect a full Wyckoff Accumulation scheme (phases A–E).
 *
 * Structure:
 * - Prior downtrend → SC (high volume low) → AR (rally) → ST (retest low)
 * - Phase B: sideways with absorption, volume dry-ups
 * - Phase C: Spring below support
 * - Phase D: SOS (rally above AR high), BU (pullback), LPS
 * - Phase E: Departure above range
 */
function detectAccumulation(candles: CandleData[], atr: number): WyckoffResult | null {
  const n = candles.length;
  if (n < MIN_CANDLES) return null;

  // Analyze price position and slope
  const recentSlice = candles.slice(-Math.min(LOOKBACK, n));
  const prices = recentSlice.map(c => c.close);
  const volumes = recentSlice.map(c => c.volume);
  const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;

  const maxP = safeMax(recentSlice.map(c => c.high));
  const minP = safeMin(recentSlice.map(c => c.low));
  const range = maxP - minP;
  const current = prices[prices.length - 1];
  const posInRange = range > 0 ? (current - minP) / range : 0.5;

  // Accumulation typically occurs in the lower portion of the range
  // with a flat or slightly positive slope (sideways consolidation)
  const slope = priceSlope(candles, Math.max(0, n - LOOKBACK), n);

  // Relaxed conditions: accumulation can occur in lower 50% with flat slope
  if (posInRange > 0.6 || slope > 0.005) return null;

  const events: WyckoffEvent[] = [];
  let currentPhase: 'A' | 'B' | 'C' | 'D' | 'E' = 'A';

  // ── Phase A: SC, AR, ST ──
  // Selling Climax: lowest price with highest volume in early portion
  const earlyEnd = Math.floor(recentSlice.length * 0.4);
  const scIdx = findLowestLowIndex(recentSlice, 0, earlyEnd);
  const scCandle = recentSlice[scIdx];
  const scVol = scCandle.volume;

  // SC must have above-average volume
  if (scVol < avgVol * 1.2) return null;

  events.push({
    type: 'SC',
    phase: 'A',
    price: scCandle.low,
    time: scCandle.time,
    volume: scVol,
    description: EVENT_DESCRIPTIONS.SC,
  });

  // Automatic Rally: highest high after SC
  const arIdx = findHighestHighIndex(recentSlice, scIdx + 1, Math.min(scIdx + 15, recentSlice.length));
  const arCandle = recentSlice[arIdx];
  events.push({
    type: 'AR',
    phase: 'A',
    price: arCandle.high,
    time: arCandle.time,
    volume: arCandle.volume,
    description: EVENT_DESCRIPTIONS.AR,
  });

  // Support level = SC low
  const supportPrice = scCandle.low;
  // Resistance level = AR high
  const resistancePrice = arCandle.high;

  // Secondary Test: retest of SC low on reduced volume
  const stSearchEnd = Math.min(scIdx + 20, recentSlice.length);
  let stEvent: WyckoffEvent | null = null;
  for (let i = scIdx + 2; i < stSearchEnd; i++) {
    if (recentSlice[i].low <= supportPrice * 1.02 && recentSlice[i].volume < scVol * 0.8) {
      stEvent = {
        type: 'ST',
        phase: 'A',
        price: recentSlice[i].low,
        time: recentSlice[i].time,
        volume: recentSlice[i].volume,
        description: EVENT_DESCRIPTIONS.ST,
      };
      events.push(stEvent);
      break;
    }
  }

  // ── Phase B: Absorption ──
  // Look for volume dry-ups and price staying in range
  currentPhase = 'B';
  const phaseBStart = stEvent ? stEvent.time : arCandle.time;
  let hasAbsorption = false;
  for (let i = Math.floor(recentSlice.length * 0.3); i < recentSlice.length - 10; i++) {
    if (isVolumeDryUp(recentSlice, i, avgVol)) {
      hasAbsorption = true;
      break;
    }
  }

  // ── Phase C: Spring ──
  currentPhase = 'C';
  const springCandidate = detectSpring(recentSlice, supportPrice,
    Math.floor(recentSlice.length * 0.4), recentSlice.length - 5);

  if (springCandidate) {
    events.push({
      type: 'S',
      phase: 'C',
      price: springCandidate.price,
      time: springCandidate.time,
      volume: recentSlice[springCandidate.index].volume,
      description: EVENT_DESCRIPTIONS.S,
    });

    // LPS after spring
    const lpsSearchStart = springCandidate.index + 1;
    const lpsSearchEnd = Math.min(lpsSearchStart + 10, recentSlice.length);
    for (let i = lpsSearchStart; i < lpsSearchEnd; i++) {
      if (recentSlice[i].low <= supportPrice * 1.01 && recentSlice[i].close > supportPrice) {
        events.push({
          type: 'LPS',
          phase: 'C',
          price: recentSlice[i].low,
          time: recentSlice[i].time,
          volume: recentSlice[i].volume,
          description: EVENT_DESCRIPTIONS.LPS,
        });
        break;
      }
    }
  }

  // ── Phase D: SOS, BU ──
  currentPhase = 'D';

  // Sign of Strength: price rises above the AR high (or close to it)
  const sosIdx = findHighestHighIndex(recentSlice,
    Math.floor(recentSlice.length * 0.5), recentSlice.length);
  const sosCandle = recentSlice[sosIdx];

  if (sosCandle.high >= resistancePrice * 0.97) {
    events.push({
      type: 'SOS',
      phase: 'D',
      price: sosCandle.high,
      time: sosCandle.time,
      volume: sosCandle.volume,
      description: EVENT_DESCRIPTIONS.SOS,
    });

    // Backup after SOS
    if (sosIdx + 3 < recentSlice.length) {
      const buIdx = findLowestLowIndex(recentSlice, sosIdx + 1, Math.min(sosIdx + 8, recentSlice.length));
      events.push({
        type: 'BU',
        phase: 'D',
        price: recentSlice[buIdx].low,
        time: recentSlice[buIdx].time,
        volume: recentSlice[buIdx].volume,
        description: EVENT_DESCRIPTIONS.BU,
      });
    }
  }

  // ── Phase E: Departure ──
  const lastCandle = recentSlice[recentSlice.length - 1];
  if (lastCandle.close > resistancePrice) {
    currentPhase = 'E';
    events.push({
      type: 'DEP',
      phase: 'E',
      price: lastCandle.close,
      time: lastCandle.time,
      volume: lastCandle.volume,
      description: EVENT_DESCRIPTIONS.DEP,
    });
  }

  // Calculate confidence based on how many phases were detected
  const phasesDetected = new Set(events.map(e => e.phase));
  const hasPhaseA = events.some(e => e.type === 'SC') && events.some(e => e.type === 'AR');
  const hasPhaseC = events.some(e => e.type === 'S');
  const hasPhaseD = events.some(e => e.type === 'SOS');

  let confidence = 0.3; // Base confidence
  confidence += hasPhaseA ? 0.15 : 0;
  confidence += hasAbsorption ? 0.1 : 0;
  confidence += hasPhaseC ? 0.15 : 0;
  confidence += hasPhaseD ? 0.15 : 0;
  confidence += phasesDetected.size >= 4 ? 0.1 : 0;
  confidence = Math.min(0.92, confidence);

  // Direction: accumulation is bullish
  const direction: 'bullish' | 'bearish' | 'neutral' = currentPhase === 'E' ? 'bullish' : 'neutral';

  return {
    scheme: 'accumulation',
    currentPhase,
    events,
    range: {
      high: resistancePrice,
      low: supportPrice,
      mid: (resistancePrice + supportPrice) / 2,
      atrBand: atr,
    },
    support: supportPrice,
    resistance: resistancePrice,
    confidence,
    direction,
  };
}

// ── Distribution Detection ───────────────────────────────────────────

/**
 * Detect a full Wyckoff Distribution scheme (phases A–E).
 *
 * Structure:
 * - Prior uptrend → BC (high volume high) → AR (reaction) → ST (retest high)
 * - Phase B: sideways with distribution, volume dry-ups
 * - Phase C: UTAD above resistance
 * - Phase D: SOW (drop below AR low), backup to LPSY
 * - Phase E: Departure below range
 */
function detectDistribution(candles: CandleData[], atr: number): WyckoffResult | null {
  const n = candles.length;
  if (n < MIN_CANDLES) return null;

  const recentSlice = candles.slice(-Math.min(LOOKBACK, n));
  const prices = recentSlice.map(c => c.close);
  const volumes = recentSlice.map(c => c.volume);
  const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;

  const maxP = safeMax(recentSlice.map(c => c.high));
  const minP = safeMin(recentSlice.map(c => c.low));
  const range = maxP - minP;
  const current = prices[prices.length - 1];
  const posInRange = range > 0 ? (current - minP) / range : 0.5;

  // Distribution typically occurs in the upper portion of the range
  const slope = priceSlope(candles, Math.max(0, n - LOOKBACK), n);

  if (posInRange < 0.4 || slope < -0.005) return null;

  const events: WyckoffEvent[] = [];
  let currentPhase: 'A' | 'B' | 'C' | 'D' | 'E' = 'A';

  // ── Phase A: BC, AR, ST ──
  // Buying Climax: highest price with highest volume in early portion
  const earlyEnd = Math.floor(recentSlice.length * 0.4);
  const bcIdx = findHighestHighIndex(recentSlice, 0, earlyEnd);
  const bcCandle = recentSlice[bcIdx];
  const bcVol = bcCandle.volume;

  // BC must have above-average volume
  if (bcVol < avgVol * 1.2) return null;

  events.push({
    type: 'BC',
    phase: 'A',
    price: bcCandle.high,
    time: bcCandle.time,
    volume: bcVol,
    description: EVENT_DESCRIPTIONS.BC,
  });

  // Automatic Reaction: lowest low after BC
  const arIdx = findLowestLowIndex(recentSlice, bcIdx + 1, Math.min(bcIdx + 15, recentSlice.length));
  const arCandle = recentSlice[arIdx];
  events.push({
    type: 'AR',
    phase: 'A',
    price: arCandle.low,
    time: arCandle.time,
    volume: arCandle.volume,
    description: EVENT_DESCRIPTIONS.AR,
  });

  // Resistance level = BC high
  const resistancePrice = bcCandle.high;
  // Support level = AR low
  const supportPrice = arCandle.low;

  // Secondary Test: retest of BC high on reduced volume
  const stSearchEnd = Math.min(bcIdx + 20, recentSlice.length);
  for (let i = bcIdx + 2; i < stSearchEnd; i++) {
    if (recentSlice[i].high >= resistancePrice * 0.98 && recentSlice[i].volume < bcVol * 0.8) {
      events.push({
        type: 'ST',
        phase: 'A',
        price: recentSlice[i].high,
        time: recentSlice[i].time,
        volume: recentSlice[i].volume,
        description: EVENT_DESCRIPTIONS.ST,
      });
      break;
    }
  }

  // ── Phase B: Distribution with volume dry-ups ──
  currentPhase = 'B';
  let hasDistribution = false;
  for (let i = Math.floor(recentSlice.length * 0.3); i < recentSlice.length - 10; i++) {
    if (isVolumeDryUp(recentSlice, i, avgVol)) {
      hasDistribution = true;
      break;
    }
  }

  // ── Phase C: UTAD ──
  currentPhase = 'C';
  const utadCandidate = detectUTAD(recentSlice, resistancePrice,
    Math.floor(recentSlice.length * 0.4), recentSlice.length - 5);

  if (utadCandidate) {
    events.push({
      type: 'UTAD',
      phase: 'C',
      price: utadCandidate.price,
      time: utadCandidate.time,
      volume: recentSlice[utadCandidate.index].volume,
      description: EVENT_DESCRIPTIONS.UTAD,
    });

    // LPSY after UTAD
    const lpsySearchStart = utadCandidate.index + 1;
    const lpsySearchEnd = Math.min(lpsySearchStart + 10, recentSlice.length);
    for (let i = lpsySearchStart; i < lpsySearchEnd; i++) {
      if (recentSlice[i].high >= resistancePrice * 0.99 && recentSlice[i].close < resistancePrice) {
        events.push({
          type: 'LPSY',
          phase: 'C',
          price: recentSlice[i].high,
          time: recentSlice[i].time,
          volume: recentSlice[i].volume,
          description: EVENT_DESCRIPTIONS.LPSY,
        });
        break;
      }
    }
  }

  // ── Phase D: SOW, Backup to LPSY ──
  currentPhase = 'D';

  // Sign of Weakness: price drops below the AR low (or close to it)
  const sowIdx = findLowestLowIndex(recentSlice,
    Math.floor(recentSlice.length * 0.5), recentSlice.length);
  const sowCandle = recentSlice[sowIdx];

  if (sowCandle.low <= supportPrice * 1.03) {
    events.push({
      type: 'SOW',
      phase: 'D',
      price: sowCandle.low,
      time: sowCandle.time,
      volume: sowCandle.volume,
      description: EVENT_DESCRIPTIONS.SOW,
    });

    // Backup to LPSY
    if (sowIdx + 3 < recentSlice.length) {
      const buIdx = findHighestHighIndex(recentSlice, sowIdx + 1, Math.min(sowIdx + 8, recentSlice.length));
      events.push({
        type: 'LPSY',
        phase: 'D',
        price: recentSlice[buIdx].high,
        time: recentSlice[buIdx].time,
        volume: recentSlice[buIdx].volume,
        description: `${EVENT_DESCRIPTIONS.LPSY} (backup after SOW)`,
      });
    }
  }

  // ── Phase E: Departure ──
  const lastCandle = recentSlice[recentSlice.length - 1];
  if (lastCandle.close < supportPrice) {
    currentPhase = 'E';
    events.push({
      type: 'DEP',
      phase: 'E',
      price: lastCandle.close,
      time: lastCandle.time,
      volume: lastCandle.volume,
      description: EVENT_DESCRIPTIONS.DEP,
    });
  }

  // Calculate confidence
  const phasesDetected = new Set(events.map(e => e.phase));
  const hasPhaseA = events.some(e => e.type === 'BC');
  const hasPhaseC = events.some(e => e.type === 'UTAD');
  const hasPhaseD = events.some(e => e.type === 'SOW');

  let confidence = 0.3;
  confidence += hasPhaseA ? 0.15 : 0;
  confidence += hasDistribution ? 0.1 : 0;
  confidence += hasPhaseC ? 0.15 : 0;
  confidence += hasPhaseD ? 0.15 : 0;
  confidence += phasesDetected.size >= 4 ? 0.1 : 0;
  confidence = Math.min(0.92, confidence);

  const direction: 'bullish' | 'bearish' | 'neutral' = currentPhase === 'E' ? 'bearish' : 'neutral';

  return {
    scheme: 'distribution',
    currentPhase,
    events,
    range: {
      high: resistancePrice,
      low: supportPrice,
      mid: (resistancePrice + supportPrice) / 2,
      atrBand: atr,
    },
    support: supportPrice,
    resistance: resistancePrice,
    confidence,
    direction,
  };
}

// ── Money Flow Analysis ──────────────────────────────────────────────

/**
 * Analyze money flow using price × volume direction.
 * Returns net money flow: positive = buying pressure, negative = selling pressure.
 */
function analyzeMoneyFlow(candles: CandleData[], startIdx: number, endIdx: number): number {
  let moneyFlow = 0;
  for (let i = Math.max(1, startIdx); i < endIdx && i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const prevTypicalPrice = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
    const direction = typicalPrice > prevTypicalPrice ? 1 : -1;
    moneyFlow += direction * typicalPrice * candles[i].volume;
  }
  return moneyFlow;
}

// ── Main Detection Function ──────────────────────────────────────────

/**
 * Advanced Wyckoff Analysis Engine with full A-E phase detection.
 *
 * Analyzes price structure, volume patterns, and money flow to identify
 * Wyckoff accumulation or distribution schemes with specific event labeling.
 *
 * @param candles - Array of candle data (OHLCV)
 * @returns WyckoffResult with scheme, events, range, and confidence
 */
export function detectWyckoffAdvanced(candles: CandleData[]): WyckoffResult {
  // Edge case: insufficient data
  if (!candles || candles.length < MIN_CANDLES) {
    return {
      scheme: 'none',
      currentPhase: 'none',
      events: [],
      range: { high: 0, low: 0, mid: 0, atrBand: 0 },
      support: 0,
      resistance: 0,
      confidence: 0,
      direction: 'neutral',
    };
  }

  const atr = calcATR(candles, 14);

  // Try both accumulation and distribution detection
  const accumulation = detectAccumulation(candles, atr);
  const distribution = detectDistribution(candles, atr);

  // Pick the scheme with higher confidence
  // Also consider money flow as a tiebreaker
  const moneyFlow = analyzeMoneyFlow(candles,
    Math.max(0, candles.length - LOOKBACK), candles.length);

  let result: WyckoffResult;

  if (accumulation && distribution) {
    // Both detected — use confidence + money flow to decide
    const accScore = accumulation.confidence + (moneyFlow > 0 ? 0.1 : 0);
    const distScore = distribution.confidence + (moneyFlow < 0 ? 0.1 : 0);
    result = accScore >= distScore ? accumulation : distribution;
  } else if (accumulation) {
    result = accumulation;
  } else if (distribution) {
    result = distribution;
  } else {
    // Neither detected — fallback to basic analysis
    const recentSlice = candles.slice(-Math.min(LOOKBACK, candles.length));
    const maxP = safeMax(recentSlice.map(c => c.high));
    const minP = safeMin(recentSlice.map(c => c.low));
    const current = recentSlice[recentSlice.length - 1].close;
    const range = maxP - minP;
    const posInRange = range > 0 ? (current - minP) / range : 0.5;
    const slope = priceSlope(candles, Math.max(0, candles.length - 60), candles.length);

    let scheme: WyckoffScheme = 'none';
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let confidence = 0.2;
    const events: WyckoffEvent[] = [];

    if (posInRange < 0.35 && Math.abs(slope) < 0.002) {
      scheme = 'accumulation';
      direction = 'neutral';
      confidence = 0.35;

      // Add basic SC event at the lowest point
      const lowIdx = findLowestLowIndex(recentSlice, 0, recentSlice.length);
      events.push({
        type: 'SC',
        phase: 'A',
        price: recentSlice[lowIdx].low,
        time: recentSlice[lowIdx].time,
        volume: recentSlice[lowIdx].volume,
        description: EVENT_DESCRIPTIONS.SC,
      });
    } else if (posInRange > 0.65 && Math.abs(slope) < 0.002) {
      scheme = 'distribution';
      direction = 'neutral';
      confidence = 0.35;

      const highIdx = findHighestHighIndex(recentSlice, 0, recentSlice.length);
      events.push({
        type: 'BC',
        phase: 'A',
        price: recentSlice[highIdx].high,
        time: recentSlice[highIdx].time,
        volume: recentSlice[highIdx].volume,
        description: EVENT_DESCRIPTIONS.BC,
      });
    }

    result = {
      scheme,
      currentPhase: scheme !== 'none' ? 'A' : 'none',
      events,
      range: {
        high: maxP,
        low: minP,
        mid: (maxP + minP) / 2,
        atrBand: atr,
      },
      support: minP,
      resistance: maxP,
      confidence,
      direction,
    };
  }

  return result;
}

// ── AIPattern Conversion ─────────────────────────────────────────────

/**
 * Convert Wyckoff analysis results to AIPattern format for chart rendering.
 * Each Wyckoff event becomes a labeled pattern, and the overall scheme
 * becomes a zone pattern.
 */
export function wyckoffToAIPatterns(result: WyckoffResult): AIPattern[] {
  const patterns: AIPattern[] = [];

  // Scheme-level pattern (zone showing the trading range)
  if (result.scheme !== 'none') {
    const schemeLabelAr = SCHEME_LABELS_AR[result.scheme];

    patterns.push({
      type: `wyckoff-${result.scheme}`,
      labelAr: schemeLabelAr,
      time: result.events.length > 0 ? result.events[0].time : 0,
      price: result.range.mid,
      confidence: result.confidence,
      direction: result.direction,
      shapeType: 'zone',
      shapePoints: [
        { time: result.events[0]?.time ?? 0, price: result.range.high },
        { time: result.events[result.events.length - 1]?.time ?? 0, price: result.range.high },
        { time: result.events[result.events.length - 1]?.time ?? 0, price: result.range.low },
        { time: result.events[0]?.time ?? 0, price: result.range.low },
      ],
      shapeColor: result.scheme === 'accumulation'
        ? 'rgba(0,255,163,0.08)'
        : 'rgba(255,71,87,0.08)',
    });
  }

  // Individual event patterns
  for (const event of result.events) {
    const labelAr = EVENT_LABELS_AR[event.type];

    patterns.push({
      type: `wyckoff-${event.type.toLowerCase()}`,
      labelAr: `${SCHEME_LABELS_AR[result.scheme]} — ${labelAr}`,
      time: event.time,
      price: event.price,
      confidence: result.confidence * 0.9, // Slightly lower than scheme confidence
      direction: result.direction,
      shapeType: 'polygon',
      shapePoints: [
        { time: event.time, price: event.price },
      ],
      shapeColor: result.scheme === 'accumulation'
        ? 'rgba(0,255,163,0.3)'
        : 'rgba(255,71,87,0.3)',
    });
  }

  return patterns;
}
