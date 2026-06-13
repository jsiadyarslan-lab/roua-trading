// ═══════════════════════════════════════════════════════════
// ATR Adapter — Adaptive TP/SL — Real Wilder's ATR Implementation
// Uses Wilder's smoothing (EMA-based) for ATR calculation
// Supports dynamic volatility regime detection and adaptive
// TP/SL calculation based on ATR multiples and confidence
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

export interface AdaptiveTPSL {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  regime: 'low' | 'normal' | 'high' | 'extreme';
  atrValue: number;
}

export function calcAdaptiveTPSL(candles: CandleData[], side: 'long' | 'short', confidence: number, currentPrice?: number): AdaptiveTPSL {
  const close = currentPrice ?? candles[candles.length - 1]?.close ?? 0;
  
  // Real Wilder's ATR calculation
  const atr = calcATR(candles, 14);
  
  // Detect volatility regime from ATR percentile
  const regime = detectVolatilityRegime(candles, atr);
  
  // Adaptive multiplier: higher confidence → wider targets for better R:R
  // Low confidence → tighter targets to limit risk
  const baseMult = side === 'long' ? 1.5 : 1.5;
  const tpMult = side === 'long' ? 2.5 : 2.5;
  const confScale = 0.7 + confidence * 0.6; // 0.7 (low conf) to 1.3 (high conf)
  
  // Regime-based adjustment: tighter in extreme volatility, wider in calm
  const regimeScale = regime === 'extreme' ? 0.8 : regime === 'high' ? 0.9 : regime === 'low' ? 1.2 : 1.0;
  
  const slDistance = atr * baseMult * confScale * regimeScale;
  const tpDistance = atr * tpMult * confScale * regimeScale;
  
  const stopLoss = side === 'long' ? close - slDistance : close + slDistance;
  const takeProfit = side === 'long' ? close + tpDistance : close - tpDistance;
  const risk = Math.abs(close - stopLoss);
  const reward = Math.abs(takeProfit - close);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;
  return { entry: close, stopLoss, takeProfit, riskRewardRatio, regime, atrValue: atr };
}

/** Detect volatility regime by comparing current ATR to its historical range */
function detectVolatilityRegime(candles: CandleData[], currentATR: number): 'low' | 'normal' | 'high' | 'extreme' {
  if (candles.length < 50) return 'normal';
  const close = candles[candles.length - 1]?.close ?? 0;
  if (close === 0) return 'normal';
  
  // Calculate ATR over multiple windows to get a distribution
  const atrValues: number[] = [];
  for (let start = Math.max(0, candles.length - 100); start < candles.length - 14; start += 5) {
    const slice = candles.slice(start, start + 15);
    if (slice.length >= 3) {
      let trSum = 0;
      for (let i = 1; i < slice.length; i++) {
        trSum += Math.max(
          slice[i].high - slice[i].low,
          Math.abs(slice[i].high - slice[i - 1].close),
          Math.abs(slice[i].low - slice[i - 1].close)
        );
      }
      atrValues.push(trSum / (slice.length - 1));
    }
  }
  
  if (atrValues.length < 5) {
    // Fallback to simple ratio
    const atrPct = currentATR / close;
    return atrPct > 0.03 ? 'extreme' : atrPct > 0.02 ? 'high' : atrPct > 0.005 ? 'normal' : 'low';
  }
  
  // Percentile-based regime detection
  atrValues.sort((a, b) => a - b);
  const p25 = atrValues[Math.floor(atrValues.length * 0.25)];
  const p75 = atrValues[Math.floor(atrValues.length * 0.75)];
  const p95 = atrValues[Math.floor(atrValues.length * 0.95)];
  
  if (currentATR > p95) return 'extreme';
  if (currentATR > p75) return 'high';
  if (currentATR < p25) return 'low';
  return 'normal';
}

export function getDynamicThresholds(candles: CandleData[]) {
  const close = candles[candles.length - 1]?.close ?? 0;
  const atr = calcATR(candles, 14);
  const regime = detectVolatilityRegime(candles, atr);
  
  // Adaptive confidence thresholds based on volatility
  // In high volatility, we need stronger signals to be confident
  // V225 FIX: Guard against close=0 producing Infinity
  const volFactor = close > 0 ? atr / close : 0;
  const highConf = regime === 'extreme' ? 0.8 : regime === 'high' ? 0.75 : 0.7;
  const medConf = regime === 'extreme' ? 0.6 : regime === 'high' ? 0.55 : 0.5;
  
  return {
    highConfidence: highConf,
    mediumConfidence: medConf,
    atrMultiplier: regime === 'extreme' ? 1.5 : regime === 'high' ? 1.8 : 2,
    volatilityFactor: volFactor,
    volatilityRegime: regime,
  };
}

/**
 * Wilder's ATR (Average True Range) calculation
 * Uses exponential moving average as per Welles Wilder's original method:
 *   ATR = ((prevATR × (period-1)) + currentTR) / period
 * This produces smoother ATR values than simple averaging.
 */
export function calcATR(candles: CandleData[], period: number = 14): number {
  if (!candles || candles.length < 2) return 0;
  if (candles.length <= period + 1) {
    // Not enough data for Wilder's smoothing — use simple average
    let trSum = 0;
    for (let i = 1; i < candles.length; i++) {
      trSum += Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
    }
    return trSum / (candles.length - 1);
  }
  
  // Calculate initial ATR as simple average of first `period` true ranges
  let atr = 0;
  for (let i = 1; i <= period; i++) {
    atr += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }
  atr /= period;
  
  // Apply Wilder's smoothing for the remaining candles
  for (let i = period + 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atr = (atr * (period - 1) + tr) / period;
  }
  
  return atr;
}

/** Adjust pattern quality based on volatility regime */
export function adjustQualityForVolatility(quality: number, candles: CandleData[]): number {
  const atr = calcATR(candles, 14);
  const regime = detectVolatilityRegime(candles, atr);
  // In extreme volatility, reduce quality (patterns less reliable)
  // In low volatility, slightly boost (cleaner patterns)
  switch (regime) {
    case 'extreme': return quality * 0.75;
    case 'high': return quality * 0.85;
    case 'low': return Math.min(100, quality * 1.05);
    default: return quality;
  }
}
