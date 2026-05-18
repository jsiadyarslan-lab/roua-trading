/**
 * Client-Side Margin Calculator — Frontend equivalent of symbol-metadata.ts
 *
 * V151: This module provides leverage-aware margin calculation on the frontend.
 * Previously, the frontend had NO way to calculate margin from positions — it
 * relied entirely on the backend API, which caused flickering when:
 *   1. updatePositionPrice() (1s tick) overwrote margin with 0 or wrong value
 *   2. fetchAccount() (5-15s tick) set the correct value
 *   3. The 1s tick immediately overwrote it again
 *
 * Now: updatePositionPrice() can compute margin from positions using the same
 * leverage logic as the backend, ensuring consistency even between API calls.
 *
 * The leverage registry is intentionally simple — it only needs to know the
 * default leverage for common symbol types to calculate margin correctly.
 */

// ── Symbol Leverage Registry ──
// Maps symbol patterns to their default leverage.
// Must match the backend's SYMBOL_REGISTRY in symbol-metadata.ts.

const FOREX_LEVERAGE = 50
const GOLD_LEVERAGE = 20
const SILVER_LEVERAGE = 20
const CRYPTO_LEVERAGE = 1 // Spot trading

// Known forex base currencies (3-letter fiat codes)
const FOREX_BASES = new Set([
  'EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY',
  'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF',
  'TRY', 'ZAR', 'MXN', 'BRL', 'RUB', 'CNY', 'INR', 'KRW', 'THB',
])

// Known crypto base currencies
const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT',
  'AVAX', 'LINK', 'MATIC', 'UNI', 'ATOM', 'LTC', 'SHIB', 'APE',
  'ARB', 'OP', 'FIL', 'NEAR', 'FTM', 'ALGO', 'VET', 'SAND',
  'MANA', 'AXS', 'CRV', 'SUI', 'APT', 'SEI', 'TIA', 'JUP',
])

/**
 * Get the default leverage for a symbol.
 * Mirrors the backend's getSymbolMetadata().defaultLeverage logic.
 */
export function getSymbolLeverage(symbol: string): number {
  const upper = symbol.toUpperCase().replace(/\s+/g, '')

  // Normalize: remove slash for pattern matching
  const noSlash = upper.replace(/\//g, '')

  // Direct commodity detection
  if (noSlash.includes('XAU') || noSlash.includes('GOLD')) return GOLD_LEVERAGE
  if (noSlash.includes('XAG') || noSlash.includes('SILVER')) return SILVER_LEVERAGE

  // Direct crypto detection
  const baseCurrency = noSlash.replace(/USDT?$/, '').replace(/BUSD$/, '').replace(/USDC$/, '')
  if (CRYPTO_BASES.has(baseCurrency)) return CRYPTO_LEVERAGE

  // Normalize USDT → USD for forex lookup
  const usdSymbol = upper.replace(/\/USDT$/, '/USD').replace(/USDT$/, '/USD')
  const withSlash = usdSymbol.includes('/') ? usdSymbol : null

  // Check if base currency is a known fiat
  if (withSlash) {
    const parts = withSlash.split('/')
    const base = parts[0]
    if (FOREX_BASES.has(base)) return FOREX_LEVERAGE
  }

  // Without slash: try to extract 3-letter base
  if (FOREX_BASES.has(baseCurrency)) return FOREX_LEVERAGE

  // JPY pair detection
  if (noSlash.includes('JPY')) return FOREX_LEVERAGE

  // Default: crypto (1:1)
  return CRYPTO_LEVERAGE
}

/**
 * Calculate leverage-aware margin for a position.
 *
 * Margin = Notional Value / Leverage
 *
 * For spot crypto (leverage=1): margin = full notional value (collateral)
 * For forex (leverage=50): margin = notional / 50
 * For gold (leverage=20): margin = notional / 20
 *
 * This matches the backend's calculateMargin() in symbol-metadata.ts.
 */
export function calculateClientMargin(
  quantity: number,
  price: number,
  symbol: string,
): number {
  const leverage = getSymbolLeverage(symbol)
  const notional = Math.abs(quantity * price)
  if (leverage <= 0) return notional // safety
  return notional / leverage
}

/**
 * Calculate total used margin for all positions.
 * Returns { usedMargin, totalExposure } where:
 *   - usedMargin = sum of leverage-aware margin per position
 *   - totalExposure = sum of full notional values
 */
export function calculatePortfolioMargin(positions: Array<{
  qty: number
  currentPrice: number
  symbol: string
}>): { usedMargin: number; totalExposure: number } {
  let usedMargin = 0
  let totalExposure = 0

  for (const p of positions) {
    const qty = Number(p.qty) || 0
    const price = Number(p.currentPrice) || 0
    if (qty <= 0 || price <= 0) continue

    const notional = Math.abs(qty * price)
    totalExposure += notional
    usedMargin += calculateClientMargin(qty, price, p.symbol)
  }

  return { usedMargin, totalExposure }
}
