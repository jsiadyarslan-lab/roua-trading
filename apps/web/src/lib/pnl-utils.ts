/**
 * P/L Color Utility — Separated from unified-tokens.ts to avoid
 * circular dependency in SSR (server-side rendering).
 *
 * These functions use inlined hex values instead of T.* references
 * to prevent webpack module evaluation order issues.
 */

/** Returns color for P&L value: green for profit, red for loss, gray for zero */
export function getPnlColor(value: number): string {
  if (value > 0) return '#10b981';  // profit green
  if (value < 0) return '#ef4444';  // loss red
  return '#9CA3B5';  // neutral gray
}

/** Returns true ONLY when value is strictly positive (> 0) */
export function isPnlPositive(value: number): boolean {
  return value > 0;
}

/** Returns '+' for positive, '-' for negative, '' for zero */
export function getPnlSign(value: number): string {
  if (value > 0) return '+';
  if (value < 0) return '-';
  return '';
}
