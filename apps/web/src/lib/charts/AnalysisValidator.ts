// ═══════════════════════════════════════════════════════════
// ROUA Analysis Validator — Phase 4
// Validates engine outputs before rendering to prevent
// impossible values from being shown to users.
// ═══════════════════════════════════════════════════════════

import type { CandleData, AIPattern } from './types';
import { safeMax, safeMin } from './chart-utils';

/** Validation result for a single check */
interface ValidationCheck {
  passed: boolean;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/** Full validation result */
export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
  filteredPatterns: AIPattern[];
  filteredSRLevels: Array<{ price: number; type: string; strength: number }>;
  errorCount: number;
  warningCount: number;
}

/**
 * Validate all analysis results before rendering.
 * Filters out impossible values and logs issues.
 */
export function validateAnalysis(
  candles: CandleData[],
  patterns: AIPattern[],
  srLevels: Array<{ price: number; type: string; strength: number }>,
): ValidationResult {
  const checks: ValidationCheck[] = [];

  if (!candles || candles.length < 10) {
    return {
      valid: false,
      checks: [{ passed: false, field: 'candles', message: 'Insufficient candle data', severity: 'error' }],
      filteredPatterns: [],
      filteredSRLevels: [],
      errorCount: 1,
      warningCount: 0,
    };
  }

  const priceMin = safeMin(candles.slice(-100).map(c => c.low));
  const priceMax = safeMax(candles.slice(-100).map(c => c.high));
  const priceRange = priceMax - priceMin;
  const lastPrice = candles[candles.length - 1].close;
  const timeMin = candles[0].time;
  const timeMax = candles[candles.length - 1].time;
  const MIN_CONFIDENCE = 0.15;

  // ── Validate Patterns ──
  const filteredPatterns = patterns.filter(p => {
    // Check 1: Price within range (with 20% buffer for projections)
    const buffer = priceRange * 0.2;
    if (p.price !== 0 && (p.price < priceMin - buffer || p.price > priceMax + buffer)) {
      checks.push({
        passed: false,
        field: `pattern.${p.type}.price`,
        message: `Pattern "${p.type}" price ${p.price} outside range [${priceMin - buffer}, ${priceMax + buffer}]`,
        severity: 'warning',
      });
      return false;
    }

    // Check 2: Shape points within range
    if (p.shapePoints && p.shapePoints.length > 0) {
      const outOfRange = p.shapePoints.some(sp =>
        sp.price < priceMin - buffer || sp.price > priceMax + buffer
      );
      if (outOfRange) {
        checks.push({
          passed: false,
          field: `pattern.${p.type}.shapePoints`,
          message: `Pattern "${p.type}" has shape points outside price range`,
          severity: 'warning',
        });
        return false;
      }

      // Check 3: Time within range
      const timeOutOfRange = p.shapePoints.some(sp =>
        sp.time !== 0 && (sp.time < timeMin - 3600 || sp.time > timeMax + 3600)
      );
      if (timeOutOfRange) {
        checks.push({
          passed: false,
          field: `pattern.${p.type}.time`,
          message: `Pattern "${p.type}" has points outside time range`,
          severity: 'warning',
        });
        return false;
      }
    }

    // Check 4: Confidence above minimum
    if (p.confidence < MIN_CONFIDENCE) {
      checks.push({
        passed: false,
        field: `pattern.${p.type}.confidence`,
        message: `Pattern "${p.type}" confidence ${p.confidence} below minimum ${MIN_CONFIDENCE}`,
        severity: 'warning',
      });
      return false;
    }

    // Check 5: Confidence not above 1.0
    if (p.confidence > 1.0) {
      checks.push({
        passed: false,
        field: `pattern.${p.type}.confidence`,
        message: `Pattern "${p.type}" confidence ${p.confidence} above 1.0`,
        severity: 'error',
      });
      return false;
    }

    // Check 6: Direction is valid
    if (p.direction !== 'bullish' && p.direction !== 'bearish' && p.direction !== 'neutral') {
      checks.push({
        passed: false,
        field: `pattern.${p.type}.direction`,
        message: `Pattern "${p.type}" has invalid direction: ${p.direction}`,
        severity: 'error',
      });
      return false;
    }

    checks.push({ passed: true, field: `pattern.${p.type}`, message: 'OK', severity: 'warning' });
    return true;
  });

  // ── Validate S/R Levels ──
  const filteredSRLevels = srLevels.filter(level => {
    // Support should be below current price
    if (level.type === 'support' && level.price > lastPrice * 1.05) {
      checks.push({
        passed: false,
        field: `sr.${level.type}`,
        message: `Support level ${level.price} is above current price ${lastPrice}`,
        severity: 'warning',
      });
      return false;
    }

    // Resistance should be above current price
    if (level.type === 'resistance' && level.price < lastPrice * 0.95) {
      checks.push({
        passed: false,
        field: `sr.${level.type}`,
        message: `Resistance level ${level.price} is below current price ${lastPrice}`,
        severity: 'warning',
      });
      return false;
    }

    // Price within overall range (with buffer)
    if (level.price < priceMin * 0.5 || level.price > priceMax * 1.5) {
      checks.push({
        passed: false,
        field: `sr.${level.type}`,
        message: `S/R level ${level.price} far outside price range`,
        severity: 'error',
      });
      return false;
    }

    // Strength between 0 and 1
    if (level.strength < 0 || level.strength > 1) {
      checks.push({
        passed: false,
        field: `sr.${level.type}.strength`,
        message: `S/R strength ${level.strength} outside [0,1]`,
        severity: 'error',
      });
      return false;
    }

    checks.push({ passed: true, field: `sr.${level.type}`, message: 'OK', severity: 'warning' });
    return true;
  });

  const errorCount = checks.filter(c => !c.passed && c.severity === 'error').length;
  const warningCount = checks.filter(c => !c.passed && c.severity === 'warning').length;

  return {
    valid: errorCount === 0,
    checks,
    filteredPatterns,
    filteredSRLevels,
    errorCount,
    warningCount,
  };
}

/**
 * Validate Fibonacci ratios are within expected tolerance.
 * Standard ratios: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618
 */
export function validateFibRatio(ratio: number, tolerance: number = 0.03): boolean {
  const standardRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.414, 1.618, 2.0, 2.618, 3.14, 4.236];
  return standardRatios.some(sr => Math.abs(ratio - sr) <= tolerance);
}

/**
 * Validate that an entry/SL/TP setup is logically consistent.
 */
export function validateTradeSetup(setup: {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  direction: 'long' | 'short' | 'bullish' | 'bearish';
}): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const isLong = setup.direction === 'long' || setup.direction === 'bullish';

  if (setup.entry <= 0) issues.push('Entry price must be positive');
  if (setup.stopLoss <= 0) issues.push('Stop loss must be positive');
  if (setup.takeProfit <= 0) issues.push('Take profit must be positive');

  if (isLong) {
    if (setup.stopLoss >= setup.entry) issues.push('Long SL must be below entry');
    if (setup.takeProfit <= setup.entry) issues.push('Long TP must be above entry');
  } else {
    if (setup.stopLoss <= setup.entry) issues.push('Short SL must be above entry');
    if (setup.takeProfit >= setup.entry) issues.push('Short TP must be below entry');
  }

  const risk = Math.abs(setup.entry - setup.stopLoss);
  const reward = Math.abs(setup.takeProfit - setup.entry);
  // V225 FIX: Operator precedence — (reward / risk).toFixed(2) not reward / risk.toFixed(2)
  // The old code computed: reward / "risk.toFixed(2)" = NaN (string coercion)
  // The correct code computes: (reward / risk).toFixed(2) = e.g. "1.50"
  if (risk > 0 && reward / risk < 1.0) {
    issues.push(`R:R ratio ${(reward / risk).toFixed(2)} is below 1:1`);
  }

  return { valid: issues.length === 0, issues };
}
