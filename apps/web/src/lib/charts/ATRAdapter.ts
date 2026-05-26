// ═══════════════════════════════════════════════════════════
// ATR Adapter — Dynamic ATR-based thresholds & Adaptive TP/SL
// Replaces hardcoded percentage thresholds with ATR multipliers
// Computes adaptive take-profit and stop-loss based on volatility
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

// ── ATR Calculation ──────────────────────────────────────
export function calcATR(candles: CandleData[], period = 14): number {
  if (candles.length < period + 1) return 0;
  let atr = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const prev = candles[i - 1];
    const c = candles[i];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    atr += tr;
  }
  return atr / period;
}

// ── ATR as percentage of price ───────────────────────────
export function atrPercent(candles: CandleData[], period = 14): number {
  const atr = calcATR(candles, period);
  const price = candles[candles.length - 1]?.close || 1;
  return atr / price;
}

// ── Dynamic Thresholds ───────────────────────────────────
// Replaces fixed percentages (1.5%, 3%, 8%) with ATR-based multipliers
// In high-vol regime (3x ATR): strict 1.5% becomes too loose → tighten
// In low-vol regime (0.5x ATR): strict 1.5% becomes too tight → relax
export interface DynamicThresholds {
  pullback: number;      // min pullback % for pattern validity (was 3%)
  peakSimilarity: number;// max peak price diff % (was 1.5%)
  shoulderTolerance: number; // shoulder symmetry tolerance (was 4%)
  breakoutConfirm: number;   // min move % for breakout confirmation (was 1%)
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  atrValue: number;
  atrMultiplier: number;
}

export function getDynamicThresholds(candles: CandleData[]): DynamicThresholds {
  const atr = calcATR(candles, 14);
  const price = candles[candles.length - 1]?.close || 1;
  const atrPct = atr / price;

  // Determine volatility regime
  let regime: DynamicThresholds['volatilityRegime'];
  let multiplier: number;

  if (atrPct < 0.005) {
    // < 0.5% daily ATR → very low volatility
    regime = 'low';
    multiplier = 0.6; // relax thresholds (patterns need smaller moves)
  } else if (atrPct < 0.015) {
    // 0.5-1.5% → normal
    regime = 'normal';
    multiplier = 1.0;
  } else if (atrPct < 0.04) {
    // 1.5-4% → high volatility
    regime = 'high';
    multiplier = 1.5; // tighten thresholds (need bigger moves to be valid)
  } else {
    // > 4% → extreme volatility
    regime = 'extreme';
    multiplier = 2.0; // very strict
  }

  // Base thresholds scaled by ATR multiplier
  return {
    pullback: 0.03 * multiplier,           // 3% base
    peakSimilarity: 0.015 * multiplier,    // 1.5% base
    shoulderTolerance: 0.04 * multiplier,  // 4% base
    breakoutConfirm: 0.01 * multiplier,     // 1% base
    volatilityRegime: regime,
    atrValue: atr,
    atrMultiplier: multiplier,
  };
}

// ── Adaptive TP/SL ──────────────────────────────────────
// Replaces fixed TP/SL (e.g., 0.8%/1.6%) with ATR-based levels
// SL = entry - (1.5 × ATR14)  for longs
// TP = entry + (ATR14 × consensus_confidence × 2) for longs
export interface AdaptiveTPSL {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  slDistance: number;     // absolute distance
  tpDistance: number;     // absolute distance
  slPercent: number;     // SL as % of entry
  tpPercent: number;     // TP as % of entry
  atrUsed: number;
  confidence: number;    // 0-1
  direction: 'long' | 'short';
  regime: DynamicThresholds['volatilityRegime'];
}

export function calcAdaptiveTPSL(
  candles: CandleData[],
  direction: 'long' | 'short',
  confidence: number,  // 0-1, from consensus or pattern detection
  entryPrice?: number,
  atrPeriod = 14,
): AdaptiveTPSL {
  const atr = calcATR(candles, atrPeriod);
  const price = entryPrice || candles[candles.length - 1]?.close || 0;
  const thresholds = getDynamicThresholds(candles);

  if (atr <= 0 || price <= 0) {
    // Fallback to fixed percentages
    const slDist = price * 0.008;
    const tpDist = price * 0.016;
    const entry = price;
    const sl = direction === 'long' ? entry - slDist : entry + slDist;
    const tp = direction === 'long' ? entry + tpDist : entry - tpDist;
    return {
      entry, stopLoss: sl, takeProfit: tp,
      riskRewardRatio: tpDist / (slDist || 1),
      slDistance: slDist, tpDistance: tpDist,
      slPercent: 0.8, tpPercent: 1.6,
      atrUsed: 0, confidence, direction, regime: thresholds.volatilityRegime,
    };
  }

  // SL = 1.5 × ATR (standard professional practice)
  const slDistance = 1.5 * atr;

  // TP = ATR × confidence × 2 (higher confidence → wider target)
  // Minimum TP = 1:1 R:R, scales up to ~3:1 at high confidence
  const tpDistance = Math.max(slDistance, atr * Math.max(1, confidence * 2));

  const entry = price;
  const sl = direction === 'long' ? entry - slDistance : entry + slDistance;
  const tp = direction === 'long' ? entry + tpDistance : entry - tpDistance;

  return {
    entry,
    stopLoss: sl,
    takeProfit: tp,
    riskRewardRatio: tpDistance / (slDistance || 1),
    slDistance,
    tpDistance,
    slPercent: (slDistance / price) * 100,
    tpPercent: (tpDistance / price) * 100,
    atrUsed: atr,
    confidence,
    direction,
    regime: thresholds.volatilityRegime,
  };
}

// ── ATR-based pattern quality adjustment ─────────────────
// Boost or reduce pattern quality score based on volatility regime
export function adjustQualityForVolatility(
  qualityScore: number,  // 1-10
  candles: CandleData[],
): number {
  const thresholds = getDynamicThresholds(candles);
  let adjusted = qualityScore;

  switch (thresholds.volatilityRegime) {
    case 'low':
      // Low vol → patterns are more reliable → boost slightly
      adjusted = Math.min(10, qualityScore + 0.5);
      break;
    case 'high':
      // High vol → more noise → reduce quality
      adjusted = Math.max(1, qualityScore - 1);
      break;
    case 'extreme':
      // Extreme vol → very noisy → significantly reduce
      adjusted = Math.max(1, qualityScore - 2);
      break;
    default:
      // Normal → keep as-is
      break;
  }

  return Math.round(adjusted * 10) / 10;
}
