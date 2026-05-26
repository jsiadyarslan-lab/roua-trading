// ═══════════════════════════════════════════════════════════
// ATR Adapter — Adaptive TP/SL — Stub
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

export function calcAdaptiveTPSL(candles: CandleData[], side: 'long' | 'short', confidence: number): AdaptiveTPSL {
  const close = candles[candles.length - 1]?.close ?? 0;
  // Simple ATR-like calculation from recent candles
  const recent = candles.slice(-14);
  let atrSum = 0;
  for (let i = 1; i < recent.length; i++) {
    atrSum += Math.abs(recent[i].high - recent[i].low);
  }
  const atr = recent.length > 1 ? atrSum / (recent.length - 1) : close * 0.01;
  const mult = 1 + (confidence - 0.5); // scale by confidence
  const regime = atr / close > 0.03 ? 'extreme' : atr / close > 0.02 ? 'high' : atr / close > 0.01 ? 'normal' : 'low';
  const stopLoss = side === 'long' ? close - atr * mult * 1.5 : close + atr * mult * 1.5;
  const takeProfit = side === 'long' ? close + atr * mult * 3 : close - atr * mult * 3;
  const risk = Math.abs(close - stopLoss);
  const reward = Math.abs(takeProfit - close);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;
  return { entry: close, stopLoss, takeProfit, riskRewardRatio, regime, atrValue: atr };
}

export function getDynamicThresholds(candles: CandleData[]) {
  const close = candles[candles.length - 1]?.close ?? 0;
  const recent = candles.slice(-14);
  let atrSum = 0;
  for (let i = 1; i < recent.length; i++) {
    atrSum += Math.abs(recent[i].high - recent[i].low);
  }
  const atr = recent.length > 1 ? atrSum / (recent.length - 1) : close * 0.01;
  return {
    highConfidence: 0.7,
    mediumConfidence: 0.5,
    atrMultiplier: 2,
    volatilityFactor: atr / close,
  };
}

export function calcATR(candles: CandleData[], period: number = 14): number {
  if (!candles || candles.length < 2) return 0;
  const recent = candles.slice(-(period + 1));
  let atrSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const tr = Math.max(
      recent[i].high - recent[i].low,
      Math.abs(recent[i].high - recent[i - 1].close),
      Math.abs(recent[i].low - recent[i - 1].close)
    );
    atrSum += tr;
  }
  return recent.length > 1 ? atrSum / (recent.length - 1) : 0;
}

export function adjustQualityForVolatility(quality: number, candles: CandleData[]): number {
  const thresholds = getDynamicThresholds(candles);
  if (thresholds.volatilityFactor > 0.03) return quality * 0.8;
  if (thresholds.volatilityFactor > 0.02) return quality * 0.9;
  return quality;
}
