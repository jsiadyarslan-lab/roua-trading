// ═══════════════════════════════════════════════════════════
// Confidence Heatmap — Stub
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

export interface HeatmapPoint {
  time: number;
  price: number;
  confidence: number;
  direction: 'bullish' | 'bearish' | 'neutral';
}

export interface HeatmapResult {
  points: HeatmapPoint[];
  dominantDirection: 'bullish' | 'bearish' | 'neutral';
  coverage: number;
  avgConfidence: number;
}

export function buildHeatmap(candles: CandleData[], signals: any[]): HeatmapResult {
  if (!candles || candles.length === 0) {
    return { points: [], dominantDirection: 'neutral', coverage: 0, avgConfidence: 0 };
  }
  // Generate simple heatmap points from recent candles
  const recent = candles.slice(-20);
  const points: HeatmapPoint[] = recent.map(c => ({
    time: c.time,
    price: c.close,
    confidence: 0.3,
    direction: c.close > c.open ? 'bullish' : c.close < c.open ? 'bearish' : 'neutral' as const,
  }));
  const bullishCount = points.filter(p => p.direction === 'bullish').length;
  const bearishCount = points.filter(p => p.direction === 'bearish').length;
  const dominantDirection = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : 'neutral' as const;
  const coverage = recent.length / Math.max(candles.length, 1);
  const avgConfidence = points.length > 0 ? points.reduce((s, p) => s + p.confidence, 0) / points.length : 0;
  return { points, dominantDirection, coverage, avgConfidence };
}
