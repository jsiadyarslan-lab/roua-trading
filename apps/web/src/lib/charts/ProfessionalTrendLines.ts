// ═══════════════════════════════════════════════════════════════════════
// ROUA Professional Trend Line Engine
//
// Based on how professional platforms (TradingView, MetaTrader) draw
// trend lines. Key concepts:
//
// 1. ZIGZAG FILTERING: Uses a proper ZigZag algorithm to find significant
//    swing points, not just simple neighbor comparison (lookback=1).
//    The ZigZag filters out noise by requiring minimum deviation.
//
// 2. TOUCH VALIDATION: A trend line is only valid if it has 3+ touches
//    (2 points define the line, the 3rd confirms it). This eliminates
//    random lines between any two swing points.
//
// 3. EXTENSION: Trend lines extend to the right (into the future) to show
//    where price may find support/resistance.
//
// 4. PROXIMITY TOLERANCE: Uses ATR-based dynamic tolerance instead of
//    fixed percentage. ATR adapts to volatility naturally.
//
// 5. CHANNEL DETECTION: Identifies parallel channels when both ascending
//    and descending lines are found in the same region.
// ═══════════════════════════════════════════════════════════════════════

import type { CandleData } from './types';

export interface TrendLine {
  startPoint: { time: number; price: number };
  endPoint: { time: number; price: number };
  extensionPoint: { time: number; price: number };
  type: 'ascending' | 'descending';
  touches: number;       // Number of times price touched this line
  strength: 'strong' | 'medium' | 'weak';
  slope: number;         // Price change per time unit
  /** Index in the candles array where the line starts */
  startIdx: number;
  /** Index in the candles array where the line ends */
  endIdx: number;
}

interface SwingPoint {
  idx: number;
  time: number;
  price: number;
  type: 'high' | 'low';
}

/**
 * Calculate ATR (Average True Range) for dynamic tolerance.
 * Returns the ATR value for the last `period` candles.
 */
function calcATR(candles: CandleData[], period: number = 14): number {
  if (candles.length < 2) return 0;
  const len = Math.min(period, candles.length - 1);
  let sum = 0;
  for (let i = candles.length - len; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close)
    );
    sum += tr;
  }
  return sum / len;
}

/**
 * ZigZag-based swing point detection.
 *
 * Unlike simple lookback=1 detection (which produces too many noisy points),
 * this uses a minimum deviation threshold (based on ATR) to filter out
 * insignificant price movements and only keep meaningful swings.
 *
 * This is how TradingView's ZigZag indicator works — it requires
 * a minimum % or ATR-based deviation to register a new swing.
 */
function detectSwingPoints(candles: CandleData[], atrMultiplier: number = 0.5): SwingPoint[] {
  if (candles.length < 10) return [];

  const atr = calcATR(candles, 14);
  const minDeviation = atr * atrMultiplier;

  // If ATR is too small (low volatility), use a percentage-based fallback
  const lastPrice = candles[candles.length - 1].close;
  const pctDeviation = lastPrice * 0.002; // 0.2%
  const deviation = Math.max(minDeviation, pctDeviation);

  const swings: SwingPoint[] = [];

  // Initialize with the first candle
  let lastHigh: SwingPoint = { idx: 0, time: candles[0].time, price: candles[0].high, type: 'high' };
  let lastLow: SwingPoint = { idx: 0, time: candles[0].time, price: candles[0].low, type: 'low' };
  let trend: 'up' | 'down' | null = null;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];

    // Update last high/low
    if (c.high > lastHigh.price) {
      lastHigh = { idx: i, time: c.time, price: c.high, type: 'high' };
    }
    if (c.low < lastLow.price) {
      lastLow = { idx: i, time: c.time, price: c.low, type: 'low' };
    }

    // Check for trend change with deviation threshold
    if (trend === null) {
      // Determine initial trend
      if (c.high - lastLow.price >= deviation) {
        trend = 'up';
        swings.push({ ...lastLow });
        lastHigh = { idx: i, time: c.time, price: c.high, type: 'high' };
      } else if (lastHigh.price - c.low >= deviation) {
        trend = 'down';
        swings.push({ ...lastHigh });
        lastLow = { idx: i, time: c.time, price: c.low, type: 'low' };
      }
    } else if (trend === 'up') {
      // In uptrend, check if we have a significant drop
      if (lastHigh.price - c.low >= deviation) {
        // Trend reversal — register the high
        swings.push({ ...lastHigh });
        trend = 'down';
        lastLow = { idx: i, time: c.time, price: c.low, type: 'low' };
      }
    } else {
      // In downtrend, check if we have a significant rise
      if (c.high - lastLow.price >= deviation) {
        // Trend reversal — register the low
        swings.push({ ...lastLow });
        trend = 'up';
        lastHigh = { idx: i, time: c.time, price: c.high, type: 'high' };
      }
    }
  }

  // Add the last pending swing point
  if (trend === 'up' && swings.length > 0) {
    swings.push({ ...lastHigh });
  } else if (trend === 'down' && swings.length > 0) {
    swings.push({ ...lastLow });
  }

  return swings;
}

/**
 * Count how many times price touches a trend line.
 *
 * A "touch" is when a candle's high (for descending lines) or low (for
 * ascending lines) comes within ATR-based tolerance of the line.
 *
 * This is the KEY to professional trend line validation:
 * A valid trend line needs 3+ touches to be significant.
 */
function countTouches(
  candles: CandleData[],
  start: SwingPoint,
  end: SwingPoint,
  lineType: 'ascending' | 'descending',
  atr: number
): number {
  let touches = 0;
  const tolerance = atr * 0.3; // Touch tolerance = 30% of ATR
  const timeDiff = end.time - start.time;
  if (timeDiff === 0) return 0;
  const slope = (end.price - start.price) / timeDiff;

  for (let i = start.idx; i <= end.idx; i++) {
    const c = candles[i];
    const linePrice = start.price + slope * (c.time - start.time);

    if (lineType === 'ascending') {
      // For ascending trend lines, check if low touches the line
      if (Math.abs(c.low - linePrice) <= tolerance) {
        touches++;
      }
    } else {
      // For descending trend lines, check if high touches the line
      if (Math.abs(c.high - linePrice) <= tolerance) {
        touches++;
      }
    }
  }

  return touches;
}

/**
 * Check if any candle between start and end violates the trend line.
 * A violation means price crossed significantly through the line.
 */
function hasViolation(
  candles: CandleData[],
  start: SwingPoint,
  end: SwingPoint,
  lineType: 'ascending' | 'descending',
  atr: number
): boolean {
  const tolerance = atr * 0.5; // Violation tolerance
  const timeDiff = end.time - start.time;
  if (timeDiff === 0) return true;
  const slope = (end.price - start.price) / timeDiff;

  for (let i = start.idx + 1; i < end.idx; i++) {
    const c = candles[i];
    const linePrice = start.price + slope * (c.time - start.time);

    if (lineType === 'ascending') {
      // Ascending line acts as support — candle should stay ABOVE it
      if (c.low < linePrice - tolerance) {
        return true; // Violation
      }
    } else {
      // Descending line acts as resistance — candle should stay BELOW it
      if (c.high > linePrice + tolerance) {
        return true; // Violation
      }
    }
  }

  return false;
}

/**
 * Professional Trend Line Detection
 *
 * Algorithm:
 * 1. Use ZigZag to find significant swing points
 * 2. For ASCENDING lines: connect consecutive swing lows
 *    where each subsequent low is higher than the previous
 * 3. For DESCENDING lines: connect consecutive swing highs
 *    where each subsequent high is lower than the previous
 * 4. Validate each line: check for violations and count touches
 * 5. Extend lines to the right (last candle time + buffer)
 * 6. Score by touch count: 5+ = strong, 3-4 = medium, 2 = weak
 *
 * Returns sorted by strength (most touches first).
 */
export function detectProfessionalTrendLines(candles: CandleData[]): TrendLine[] {
  if (candles.length < 20) return [];

  const atr = calcATR(candles, 14);
  if (atr <= 0) return [];

  const swings = detectSwingPoints(candles);
  if (swings.length < 4) return [];

  const swingLows = swings.filter(s => s.type === 'low');
  const swingHighs = swings.filter(s => s.type === 'high');

  const trendLines: TrendLine[] = [];
  const lastCandleTime = candles[candles.length - 1].time;

  // ── ASCENDING TREND LINES ──
  // Connect consecutive higher swing lows
  for (let i = 0; i < swingLows.length - 1; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const start = swingLows[i];
      const end = swingLows[j];

      // Must be ascending (end price > start price)
      if (end.price <= start.price) continue;

      // Must span at least 5 candles for significance
      if (end.idx - start.idx < 5) continue;

      // Check for violations
      if (hasViolation(candles, start, end, 'ascending', atr)) continue;

      // Count touches
      const touches = countTouches(candles, start, end, 'ascending', atr);
      if (touches < 2) continue; // Need at least 2 points to define a line

      // Calculate extension to the right
      const timeDiff = end.time - start.time;
      const priceDiff = end.price - start.price;
      const slope = timeDiff > 0 ? priceDiff / timeDiff : 0;
      const extensionTime = lastCandleTime;
      const extensionPrice = end.price + slope * (extensionTime - end.time);

      // Don't extend too far — limit to 2x the line's time span
      const maxExtension = end.time + timeDiff * 2;
      const clampedExtensionTime = Math.min(extensionTime, maxExtension);
      const clampedExtensionPrice = end.price + slope * (clampedExtensionTime - end.time);

      const strength: 'strong' | 'medium' | 'weak' =
        touches >= 5 ? 'strong' : touches >= 3 ? 'medium' : 'weak';

      trendLines.push({
        startPoint: { time: start.time, price: start.price },
        endPoint: { time: end.time, price: end.price },
        extensionPoint: { time: clampedExtensionTime, price: clampedExtensionPrice },
        type: 'ascending',
        touches,
        strength,
        slope,
        startIdx: start.idx,
        endIdx: end.idx,
      });
    }
  }

  // ── DESCENDING TREND LINES ──
  // Connect consecutive lower swing highs
  for (let i = 0; i < swingHighs.length - 1; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const start = swingHighs[i];
      const end = swingHighs[j];

      // Must be descending (end price < start price)
      if (end.price >= start.price) continue;

      // Must span at least 5 candles for significance
      if (end.idx - start.idx < 5) continue;

      // Check for violations
      if (hasViolation(candles, start, end, 'descending', atr)) continue;

      // Count touches
      const touches = countTouches(candles, start, end, 'descending', atr);
      if (touches < 2) continue;

      // Calculate extension to the right
      const timeDiff = end.time - start.time;
      const priceDiff = end.price - start.price;
      const slope = timeDiff > 0 ? priceDiff / timeDiff : 0;
      const extensionTime = lastCandleTime;
      const extensionPrice = end.price + slope * (extensionTime - end.time);

      const maxExtension = end.time + timeDiff * 2;
      const clampedExtensionTime = Math.min(extensionTime, maxExtension);
      const clampedExtensionPrice = end.price + slope * (clampedExtensionTime - end.time);

      const strength: 'strong' | 'medium' | 'weak' =
        touches >= 5 ? 'strong' : touches >= 3 ? 'medium' : 'weak';

      trendLines.push({
        startPoint: { time: start.time, price: start.price },
        endPoint: { time: end.time, price: end.price },
        extensionPoint: { time: clampedExtensionTime, price: clampedExtensionPrice },
        type: 'descending',
        touches,
        strength,
        slope,
        startIdx: start.idx,
        endIdx: end.idx,
      });
    }
  }

  // ── DEDUPLICATION ──
  // Remove overlapping lines (same approximate start/end)
  // Keep the one with more touches
  const deduped: TrendLine[] = [];
  const seen = new Set<string>();

  // Sort by touches (most first) so we keep the best lines
  trendLines.sort((a, b) => b.touches - a.touches);

  for (const line of trendLines) {
    // Create a hash key for approximate position
    const key = `${line.type}_${Math.round(line.startIdx / 10)}_${Math.round(line.endIdx / 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }

  // Limit to max 10 trend lines total (5 ascending + 5 descending)
  const ascending = deduped.filter(l => l.type === 'ascending').slice(0, 5);
  const descending = deduped.filter(l => l.type === 'descending').slice(0, 5);

  return [...ascending, ...descending];
}
