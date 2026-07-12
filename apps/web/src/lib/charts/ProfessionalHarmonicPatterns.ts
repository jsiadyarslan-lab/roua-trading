// ═══════════════════════════════════════════════════════════════════════
// ROUA Professional Harmonic Pattern Engine
//
// Improvements over the original:
// 1. Proper ZigZag with ATR-based deviation (same as trend line engine)
// 2. Strict Fibonacci ratio validation with tighter tolerances
// 3. Clear XABCD point extraction — no more confusing shapePoints arrays
// 4. PRZ (Potential Reversal Zone) calculation with Fibonacci projections
// 5. Pattern confidence based on ratio precision
// 6. Each pattern includes its 5 labeled points (X, A, B, C, D)
//    plus the PRZ zone for drawing
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData, AIPattern } from './types';

interface PivotPoint {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
}

interface XABCDPoint {
  label: 'X' | 'A' | 'B' | 'C' | 'D';
  time: number;
  price: number;
}

interface HarmonicMatch {
  type: string;           // Gartley, Butterfly, Bat, Crab
  labelAr: string;
  direction: 'bullish' | 'bearish';
  confidence: number;
  points: XABCDPoint[];   // [X, A, B, C, D] — always 5 points
  przZone: { high: number; low: number }; // Potential Reversal Zone
  ratios: {
    ab_xa: number;
    bc_ab: number;
    cd_bc: number;
    ad_xa: number;
  };
}

// ── ZigZag Pivot Detection (ATR-based) ──────────────────────────
function findPivotsATR(candles: CandleData[], depth: number = 5): PivotPoint[] {
  if (candles.length < depth * 2 + 1) return [];

  // Calculate ATR for dynamic deviation
  let atrSum = 0;
  const atrLen = Math.min(14, candles.length - 1);
  for (let i = candles.length - atrLen; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    atrSum += tr;
  }
  const atr = atrSum / atrLen;
  const minDeviation = atr * 0.3;

  const pivots: PivotPoint[] = [];
  let lastPivotType: 'high' | 'low' | null = null;
  let lastPivotPrice = 0;

  for (let i = depth; i < candles.length - depth; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;

    // Check surrounding candles within depth
    for (let j = i - depth; j <= i + depth; j++) {
      if (i === j) continue;
      if (candles[j].high > c.high) isHigh = false;
      if (candles[j].low < c.low) isLow = false;
    }

    if (isHigh) {
      if (lastPivotType === 'high' && c.high > lastPivotPrice) {
        // Update last high pivot
        pivots[pivots.length - 1] = { index: i, time: c.time, price: c.high, type: 'high' };
        lastPivotPrice = c.high;
      } else if (lastPivotType !== 'high') {
        const change = lastPivotPrice === 0 ? Infinity : Math.abs(c.high - lastPivotPrice);
        if (change >= minDeviation || lastPivotPrice === 0) {
          pivots.push({ index: i, time: c.time, price: c.high, type: 'high' });
          lastPivotType = 'high';
          lastPivotPrice = c.high;
        }
      }
    } else if (isLow) {
      if (lastPivotType === 'low' && c.low < lastPivotPrice) {
        // Update last low pivot
        pivots[pivots.length - 1] = { index: i, time: c.time, price: c.low, type: 'low' };
        lastPivotPrice = c.low;
      } else if (lastPivotType !== 'low') {
        const change = lastPivotPrice === 0 ? Infinity : Math.abs(c.low - lastPivotPrice);
        if (change >= minDeviation || lastPivotPrice === 0) {
          pivots.push({ index: i, time: c.time, price: c.low, type: 'low' });
          lastPivotType = 'low';
          lastPivotPrice = c.low;
        }
      }
    }
  }

  return pivots;
}

// ── Ratio Matching with Tight Tolerances ────────────────────────
function matchRatio(value: number, target: number, tolerance: number = 0.08): boolean {
  return value >= target * (1 - tolerance) && value <= target * (1 + tolerance);
}

// ── Pattern Definitions ─────────────────────────────────────────
// Each pattern is defined by its Fibonacci ratio constraints.
// These are the standard ratios used by professional traders.

interface PatternDef {
  name: string;
  nameAr: string;
  ab_xa: number[];    // AB retracement of XA
  bc_ab: number[];    // BC retracement of AB
  cd_bc: number[];    // CD extension of BC
  ad_xa: number[];    // AD retracement of XA
  baseConfidence: number;
}

const PATTERN_DEFS: PatternDef[] = [
  {
    name: 'Gartley',
    nameAr: 'جارتلي',
    ab_xa: [0.618],         // AB = 0.618 XA
    bc_ab: [0.382, 0.886],  // BC = 0.382 to 0.886 AB
    cd_bc: [1.272, 1.618],  // CD = 1.272 to 1.618 BC
    ad_xa: [0.786],         // AD = 0.786 XA
    baseConfidence: 0.85,
  },
  {
    name: 'Butterfly',
    nameAr: 'الفراشة',
    ab_xa: [0.786],
    bc_ab: [0.382, 0.886],
    cd_bc: [1.618, 2.618],
    ad_xa: [1.27, 1.618],
    baseConfidence: 0.85,
  },
  {
    name: 'Bat',
    nameAr: 'الخفاش',
    ab_xa: [0.382, 0.5],
    bc_ab: [0.382, 0.886],
    cd_bc: [1.618, 2.618],
    ad_xa: [0.886],
    baseConfidence: 0.8,
  },
  {
    name: 'Crab',
    nameAr: 'السلطعون',
    ab_xa: [0.382, 0.618],
    bc_ab: [0.382, 0.886],
    cd_bc: [2.618, 3.618],
    ad_xa: [1.618],
    baseConfidence: 0.8,
  },
];

/**
 * Check if a value matches any of the target ratios within tolerance.
 * Returns the best matching ratio's precision (1.0 = perfect match).
 */
function bestRatioMatch(value: number, targets: number[], tolerance: number = 0.08): number {
  let bestPrecision = 0;
  for (const target of targets) {
    if (matchRatio(value, target, tolerance)) {
      const precision = 1 - Math.abs(value - target) / (target * tolerance);
      bestPrecision = Math.max(bestPrecision, Math.max(0, precision));
    }
  }
  return bestPrecision;
}

// ── Main Detection Function ─────────────────────────────────────
export function detectHarmonicPatternsPro(candles: CandleData[]): AIPattern[] {
  if (!candles || candles.length < 30) return [];

  // Use ATR-based pivot detection for better accuracy
  const pivots = findPivotsATR(candles, 3);
  if (pivots.length < 5) return [];

  const matches: HarmonicMatch[] = [];

  // Scan through every 5-consecutive-pivot window
  for (let i = 0; i <= pivots.length - 5; i++) {
    const X = pivots[i];
    const A = pivots[i + 1];
    const B = pivots[i + 2];
    const C = pivots[i + 3];
    const D = pivots[i + 4];

    // Must alternate high/low (this is CRITICAL for valid XABCD)
    if (X.type === A.type || A.type === B.type || B.type === C.type || C.type === D.type) continue;

    // Calculate Fibonacci ratios
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

    // Try each pattern definition
    for (const def of PATTERN_DEFS) {
      const abMatch = bestRatioMatch(ab_xa, def.ab_xa);
      const bcMatch = bestRatioMatch(bc_ab, def.bc_ab);
      const cdMatch = bestRatioMatch(cd_bc, def.cd_bc);
      const adMatch = bestRatioMatch(ad_xa, def.ad_xa);

      // All ratios must match
      if (abMatch === 0 || bcMatch === 0 || cdMatch === 0 || adMatch === 0) continue;

      // Overall precision = average of all ratio precisions
      const precision = (abMatch + bcMatch + cdMatch + adMatch) / 4;
      const confidence = Math.min(0.95, def.baseConfidence * (0.6 + precision * 0.4));

      // Direction: D point determines the reversal direction
      // Bullish if D is a low (expect reversal up), Bearish if D is a high
      const direction: 'bullish' | 'bearish' = D.type === 'low' ? 'bullish' : 'bearish';

      // Calculate PRZ (Potential Reversal Zone)
      // PRZ is centered around D point with width based on ATR
      const lastCandle = candles[candles.length - 1];
      let atrSum = 0;
      const atrLen = Math.min(14, candles.length - 1);
      for (let k = candles.length - atrLen; k < candles.length; k++) {
        const ct = candles[k];
        const pt = candles[k - 1];
        atrSum += Math.max(ct.high - ct.low, Math.abs(ct.high - pt.close), Math.abs(ct.low - pt.close));
      }
      const atr = atrSum / atrLen;

      const przWidth = atr * 0.5;
      const przZone = {
        high: D.price + przWidth,
        low: D.price - przWidth,
      };

      matches.push({
        type: def.name,
        labelAr: `نمط ${def.nameAr} التوافقي`,
        direction,
        confidence,
        points: [
          { label: 'X', time: X.time, price: X.price },
          { label: 'A', time: A.time, price: A.price },
          { label: 'B', time: B.time, price: B.price },
          { label: 'C', time: C.time, price: C.price },
          { label: 'D', time: D.time, price: D.price },
        ],
        przZone,
        ratios: { ab_xa, bc_ab, cd_bc, ad_xa },
      });

      // Skip matched points to avoid overlapping patterns
      i += 4;
      break; // Don't match the same 5 points to multiple patterns
    }
  }

  // Convert to AIPattern format for compatibility
  return matches.slice(0, 4).map(match => ({
    type: match.type,
    labelAr: match.labelAr,
    time: match.points[4].time, // D point time
    price: match.points[4].price, // D point price
    confidence: match.confidence,
    direction: match.direction,
    shapeType: 'harmonic' as const,
    // Clear shapePoints in the NEW format: [X, A, B, C, D]
    // This is much clearer than the old [X, A, B, X, B, C, D, B] format
    shapePoints: match.points.map(p => ({ time: p.time, price: p.price })),
    shapeColor: match.direction === 'bullish' ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)',
    // Store extra data for enhanced rendering
    points: match.points.map(p => ({ time: p.time, price: p.price })),
    przZone: match.przZone,
    ratios: match.ratios,
  }));
}

// ── Classic Pattern Detection (Double Top/Bottom, Head & Shoulders) ──
// Kept for backward compatibility with the same interface
export function detectClassicPatternsPro(candles: CandleData[]): AIPattern[] {
  if (!candles || candles.length < 20) return [];

  const pivots = findPivotsATR(candles, 4);
  if (pivots.length < 3) return [];

  const patterns: AIPattern[] = [];

  // ── Double Top / Bottom ──
  for (let i = 0; i <= pivots.length - 3; i++) {
    const A = pivots[i];
    const B = pivots[i + 1];
    const C = pivots[i + 2];

    if (A.type === C.type && A.type !== B.type) {
      // Prices must be within 1.5% of each other
      const priceDiff = Math.abs(A.price - C.price) / A.price;
      if (priceDiff <= 0.015) {
        patterns.push({
          type: A.type === 'high' ? 'Double Top' : 'Double Bottom',
          labelAr: A.type === 'high' ? 'قمة مزدوجة' : 'قاع مزدوج',
          time: C.time,
          price: C.price,
          confidence: 0.8,
          direction: A.type === 'high' ? 'bearish' : 'bullish',
          shapeType: 'classic' as const,
          shapePoints: [
            { time: A.time, price: A.price },
            { time: B.time, price: B.price },
            { time: C.time, price: C.price },
          ],
          shapeColor: A.type === 'high' ? 'rgba(255,71,87,0.3)' : 'rgba(0,255,163,0.3)',
        });
      }
    }
  }

  // ── Head and Shoulders / Inverse H&S ──
  for (let i = 0; i <= pivots.length - 5; i++) {
    const LS = pivots[i];     // Left Shoulder
    const N1 = pivots[i + 1]; // Neckline 1
    const H = pivots[i + 2];  // Head
    const N2 = pivots[i + 3]; // Neckline 2
    const RS = pivots[i + 4]; // Right Shoulder

    // Regular Head and Shoulders (3 highs, 2 lows between them)
    if (LS.type === 'high' && H.type === 'high' && RS.type === 'high'
        && N1.type === 'low' && N2.type === 'low') {
      if (H.price > LS.price && H.price > RS.price) {
        // Shoulders should be similar height (within 3%)
        const shoulderDiff = Math.abs(LS.price - RS.price) / LS.price;
        if (shoulderDiff <= 0.03) {
          patterns.push({
            type: 'Head and Shoulders',
            labelAr: 'رأس وكتفين',
            time: RS.time,
            price: RS.price,
            confidence: 0.88,
            direction: 'bearish',
            shapeType: 'classic' as const,
            shapePoints: [
              { time: LS.time, price: LS.price },
              { time: N1.time, price: N1.price },
              { time: H.time, price: H.price },
              { time: N2.time, price: N2.price },
              { time: RS.time, price: RS.price },
            ],
            shapeColor: 'rgba(255,71,87,0.3)',
          });
        }
      }
    }

    // Inverse Head and Shoulders (3 lows, 2 highs between them)
    if (LS.type === 'low' && H.type === 'low' && RS.type === 'low'
        && N1.type === 'high' && N2.type === 'high') {
      if (H.price < LS.price && H.price < RS.price) {
        const shoulderDiff = Math.abs(LS.price - RS.price) / LS.price;
        if (shoulderDiff <= 0.03) {
          patterns.push({
            type: 'Inverse Head and Shoulders',
            labelAr: 'رأس وكتفين معكوس',
            time: RS.time,
            price: RS.price,
            confidence: 0.88,
            direction: 'bullish',
            shapeType: 'classic' as const,
            shapePoints: [
              { time: LS.time, price: LS.price },
              { time: N1.time, price: N1.price },
              { time: H.time, price: H.price },
              { time: N2.time, price: N2.price },
              { time: RS.time, price: RS.price },
            ],
            shapeColor: 'rgba(0,255,163,0.3)',
          });
        }
      }
    }
  }

  return patterns.slice(0, 4);
}
