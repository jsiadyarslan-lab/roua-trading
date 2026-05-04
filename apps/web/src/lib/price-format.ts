// ═══════════════════════════════════════════════════════════
// ROUA Trading — Unified Price Formatting
// CRITICAL: All price display must use this module to ensure
// consistency across chart, positions panel, and dashboards.
// ═══════════════════════════════════════════════════════════

/**
 * Determine the correct number of decimal places for a price
 * based on the symbol and price value.
 *
 * Rules (matching TradingView conventions):
 *   - JPY pairs  (e.g. USD/JPY ~150): 3 decimals
 *   - BTC        (e.g. BTC/USD ~94k): 2 decimals
 *   - Price > 1000 (e.g. gold ~2350): 2 decimals
 *   - Price > 1    (e.g. EUR/USD ~1.08): 5 decimals  ← forex pipette precision
 *   - Price <= 1   (e.g. some crypto): 6 decimals
 */
export function priceDecimals(price: number, symbol?: string): number {
  if (!Number.isFinite(price) || price <= 0) return 2;

  // Symbol-specific rules
  if (symbol) {
    const s = symbol.toUpperCase();
    if (s.includes('JPY')) return 3;
    if (s.includes('BTC')) return 2;
  }

  // Price-based rules
  if (price > 1000) return 2;
  if (price > 1) return 5;   // forex — 5 decimals (pipette)
  return 6;                   // micro-cap crypto
}

/**
 * Format a price with the correct number of decimals.
 * Uses `toFixed()` to avoid locale-dependent separators (commas).
 * For display with thousand separators, use `fmtPriceLocale`.
 */
export function fmtPrice(price: number, symbol?: string): string {
  if (!Number.isFinite(price)) return '—';
  const d = priceDecimals(price, symbol);
  return price.toFixed(d);
}

/**
 * Format a price with locale-aware thousand separators.
 * e.g. 94500 → "94,500.00"
 */
export function fmtPriceLocale(price: number, symbol?: string): string {
  if (!Number.isFinite(price)) return '—';
  const d = priceDecimals(price, symbol);
  return price.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/**
 * Format a P&L value with sign and dollar symbol.
 * e.g. +12.34$ or -8.50$
 */
export function fmtPnl(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}$`;
}
