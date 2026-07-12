// ═══════════════════════════════════════════════════════════
// SL/TP Calculator — Structure-Based (BUG-028 FIX)
// ═══════════════════════════════════════════════════════════
//
// المشكلة: كل المنفّذين كانوا يحسبون SL كنسبة ثابتة من السعر (2%، 0.2%).
// هذا يجعل SL يُضرب من ضوضاء السعر قبل أن يتحقق التحليل.
//
// الحل: حساب SL من هيكل السوق (أقرب قمة/قاع حقيقي) مع هامش ATR.
//

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SLTPResult {
  sl: number;
  tp: number;
  slSource: 'swing_low' | 'swing_high' | 'atr_fallback' | 'min_distance';
  tpSource: 'swing_high' | 'swing_low' | 'rr_ratio' | 'atr_fallback';
  slDistance: number;
  tpDistance: number;
  rrRatio: number;
}

interface CalcOptions {
  minSLPercent?: number;
  maxSLPercent?: number;
  bufferATRMultiplier?: number;
  minRR?: number;
  swingLookback?: number;
}

export function findSwingLevels(
  candles: CandleData[],
  lookback: number = 2,
): { swingHighs: { price: number; index: number }[]; swingLows: { price: number; index: number }[] } {
  const swingHighs: { price: number; index: number }[] = [];
  const swingLows: { price: number; index: number }[] = [];
  if (candles.length < lookback * 2 + 1) return { swingHighs, swingLows };

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isSwingHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isSwingLow = false;
    }
    if (isSwingHigh) swingHighs.push({ price: candles[i].high, index: i });
    if (isSwingLow) swingLows.push({ price: candles[i].low, index: i });
  }
  return { swingHighs, swingLows };
}

export function calculateATR(candles: CandleData[], period: number = 14): number {
  if (candles.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trueRanges.push(tr);
  }
  const usePeriod = Math.min(period, trueRanges.length);
  if (usePeriod === 0) return 0;
  const sum = trueRanges.slice(-usePeriod).reduce((s, v) => s + v, 0);
  return sum / usePeriod;
}

/**
 * BUG-028 FIX: Calculate SL/TP based on market structure (swing highs/lows).
 *
 * BUY:  SL = nearest swing low below entry - buffer×ATR
 *       TP = nearest swing high above entry + buffer×ATR
 * SELL: SL = nearest swing high above entry + buffer×ATR
 *       TP = nearest swing low below entry - buffer×ATR
 */
export function calculateStructureBasedSLTP(
  candles: CandleData[],
  currentPrice: number,
  direction: 'BUY' | 'SELL',
  options?: CalcOptions,
): SLTPResult {
  // BUG-028 SAFETY: Guard against invalid price inputs
  // If price is 0, negative, or NaN → return safe defaults
  if (!currentPrice || currentPrice <= 0 || isNaN(currentPrice)) {
    // Return a safe fallback that won't crash callers
    // SL = 1, TP = 2 (arbitrary but valid numbers)
    // The caller (Smart Executor / LASIC) should reject the trade
    // because the price is invalid — this is just a safety net
    return {
      sl: 1,
      tp: 2,
      slSource: 'atr_fallback',
      tpSource: 'atr_fallback',
      slDistance: 1,
      tpDistance: 1,
      rrRatio: 1,
    };
  }

  const minSLPct = options?.minSLPercent ?? 0.005;
  const maxSLPct = options?.maxSLPercent ?? 0.08;
  const bufferMult = options?.bufferATRMultiplier ?? 0.3;
  const minRR = options?.minRR ?? 1.2; // BUG-066j: was 1.5 → 1.2 (closer TP for choppy market)
  const swingLookback = options?.swingLookback ?? 2;

  const atr = calculateATR(candles, 14);
  const { swingHighs, swingLows } = findSwingLevels(candles, swingLookback);

  let sl: number;
  let tp: number;
  let slSource: SLTPResult['slSource'];
  let tpSource: SLTPResult['tpSource'];

  if (direction === 'BUY') {
    const belowLows = swingLows.filter(s => s.price < currentPrice).sort((a, b) => b.price - a.price);
    if (belowLows.length > 0) {
      sl = belowLows[0].price - (atr * bufferMult);
      slSource = 'swing_low';
    } else {
      sl = currentPrice - (atr * 1.5 || currentPrice * 0.02);
      slSource = 'atr_fallback';
    }
    const aboveHighs = swingHighs.filter(s => s.price > currentPrice).sort((a, b) => a.price - b.price);
    if (aboveHighs.length > 0) {
      tp = aboveHighs[0].price + (atr * bufferMult);
      tpSource = 'swing_high';
    } else {
      const slDist = Math.abs(currentPrice - sl);
      tp = currentPrice + (slDist * 1.2); // BUG-066j: was 2 → 1.2 (closer TP)
      tpSource = 'rr_ratio';
    }
  } else {
    const aboveHighs = swingHighs.filter(s => s.price > currentPrice).sort((a, b) => a.price - b.price);
    if (aboveHighs.length > 0) {
      sl = aboveHighs[0].price + (atr * bufferMult);
      slSource = 'swing_high';
    } else {
      sl = currentPrice + (atr * 1.5 || currentPrice * 0.02);
      slSource = 'atr_fallback';
    }
    const belowLows = swingLows.filter(s => s.price < currentPrice).sort((a, b) => b.price - a.price);
    if (belowLows.length > 0) {
      tp = belowLows[0].price - (atr * bufferMult);
      tpSource = 'swing_low';
    } else {
      const slDist = Math.abs(sl - currentPrice);
      tp = currentPrice - (slDist * 1.2); // BUG-066j: was 2 → 1.2 (closer TP)
      tpSource = 'rr_ratio';
    }
  }

  // Validate: minimum SL distance
  const slDistance = Math.abs(currentPrice - sl);
  const minSLDistance = currentPrice * minSLPct;
  if (slDistance < minSLDistance) {
    sl = direction === 'BUY' ? currentPrice - minSLDistance : currentPrice + minSLDistance;
    slSource = 'min_distance';
  }

  // Validate: maximum SL distance
  const maxSLDistance = currentPrice * maxSLPct;
  if (slDistance > maxSLDistance) {
    sl = direction === 'BUY' ? currentPrice - maxSLDistance : currentPrice + maxSLDistance;
  }

  // Validate: minimum R:R
  const finalSLDistance = Math.abs(currentPrice - sl);
  let tpDistance = Math.abs(tp - currentPrice);
  const minTPDistance = finalSLDistance * minRR;
  if (tpDistance < minTPDistance) {
    tp = direction === 'BUY' ? currentPrice + minTPDistance : currentPrice - minTPDistance;
    tpSource = 'rr_ratio';
    tpDistance = minTPDistance;
  }

  return { sl, tp, slSource, tpSource, slDistance: finalSLDistance, tpDistance, rrRatio: finalSLDistance > 0 ? tpDistance / finalSLDistance : 0 };
}
