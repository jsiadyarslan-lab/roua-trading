// ═══════════════════════════════════════════════════════════
// ROUA Trading — Unified Price Formatting
// CRITICAL: All price display must use this module to ensure
// consistency across chart, positions panel, and dashboards.
// V148: Added full symbol-metadata registry for correct decimals
// per symbol (matching the backend symbol-metadata.ts).
// ═══════════════════════════════════════════════════════════

// ── Symbol Metadata Registry (mirrors backend symbol-metadata.ts) ──
// Maps symbol → priceDecimals. Must stay in sync with backend.
const SYMBOL_DECIMALS: Record<string, number> = {
  // Forex Majors (5 decimals = pipette precision)
  'EUR/USD': 5, 'GBP/USD': 5, 'USD/CHF': 5, 'AUD/USD': 5,
  'NZD/USD': 5, 'USD/CAD': 5, 'EUR/GBP': 5, 'EUR/CHF': 5,
  // JPY pairs (3 decimals)
  'USD/JPY': 3, 'EUR/JPY': 3, 'GBP/JPY': 3, 'AUD/JPY': 3,
  // Commodities
  'XAU/USD': 2, 'XAG/USD': 3,
  // Crypto (2 decimals for major, 4 for altcoins)
  'BTC/USDT': 2, 'BTC/USD': 2,
  'ETH/USDT': 2, 'ETH/USD': 2,
  'SOL/USDT': 2, 'BNB/USDT': 2,
  'XRP/USDT': 4, 'ADA/USDT': 4,
};

/**
 * Determine the correct number of decimal places for a price
 * based on the symbol and price value.
 *
 * V148: Now uses the full symbol-metadata registry for exact decimals
 * per symbol, matching the backend. Falls back to heuristics for
 * unregistered symbols.
 *
 * Rules (matching TradingView + backend conventions):
 *   - Registered symbols: exact decimals from registry
 *   - JPY pairs  (e.g. USD/JPY ~150): 3 decimals
 *   - BTC/XAU/XAG: 2 decimals
 *   - Price > 1000 (e.g. gold ~2350): 2 decimals
 *   - Price > 1    (e.g. EUR/USD ~1.08): 5 decimals  ← forex pipette precision
 *   - Price <= 1   (e.g. some crypto): 6 decimals
 */
export function priceDecimals(price: number, symbol?: string): number {
  if (!Number.isFinite(price) || price <= 0) return 2;

  // V148: Check symbol registry first (exact match)
  if (symbol) {
    const upper = symbol.toUpperCase();
    if (SYMBOL_DECIMALS[upper] !== undefined) {
      return SYMBOL_DECIMALS[upper];
    }

    // Heuristic: JPY pairs → 3 decimals
    if (upper.includes('JPY')) return 3;
    // Heuristic: BTC → 2 decimals
    if (upper.includes('BTC')) return 2;
    // Heuristic: Gold/Silver → 2 decimals
    if (upper.includes('XAU') || upper.includes('XAG')) return 2;
    // Heuristic: 7-char XXX/YYY format → forex (5 decimals)
    if (upper.length === 7 && upper[3] === '/') return 5;
  }

  // Price-based rules (fallback for unknown symbols)
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
