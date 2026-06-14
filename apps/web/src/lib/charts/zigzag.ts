// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ZigZag Detector — Compatibility Wrapper
// UNIFY (4.3): Delegates to computeZigZag() from chart-detection.ts
// Kept for backward compatibility with existing imports.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { CandleData } from './types';
import { computeZigZag, type SwingPoint as CDSwingPoint } from './chart-detection';

// Re-export SwingPoint from chart-detection (UPPERCASE 'HIGH' | 'LOW')
// FIX (4.8): Standardized to UPPERCASE matching chart-detection.ts
export type SwingPoint = CDSwingPoint;

export interface ZigZagConfig {
  depth: number;
  deviation: number;
  backstep: number;
  maxPivots: number;
}

const DEFAULT_CONFIG: ZigZagConfig = {
  depth: 5,
  deviation: 0.003,
  backstep: 3,
  maxPivots: 150,
};

/**
 * Detect ZigZag swing points.
 * UNIFY (4.3): Delegates to computeZigZag() from chart-detection.ts.
 * Maps ZigZagConfig parameters to ATR-based parameters.
 */
export function detectZigZag(
  candles: CandleData[],
  config: Partial<ZigZagConfig> = {}
): SwingPoint[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!candles || candles.length < cfg.depth * 2) return [];
  
  // Map percentage deviation to ATR multiplier (heuristic)
  const atrMultiplier = cfg.deviation > 0.01 ? 1.0 : cfg.deviation > 0.005 ? 1.5 : 2.0;
  
  const pivots = computeZigZag(candles, atrMultiplier, cfg.depth);
  return pivots.slice(-cfg.maxPivots);
}
