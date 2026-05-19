/**
 * Client-Side Margin Calculator — Frontend equivalent of symbol-metadata.ts
 *
 * V153: Leverage is now USER-CONFIGURABLE for paper trading.
 * The platform only CONNECTS accounts — leverage is set by the broker/exchange.
 * For paper trading, we read the user's preferred leverage from AgentSettings.
 * For real exchanges, the exchange API provides the actual margin directly.
 *
 * Default leverage values are used as fallbacks when user settings aren't loaded.
 */

// ── Symbol Leverage Defaults (fallbacks when user settings not loaded) ──
const DEFAULT_FOREX_LEVERAGE = 50
const DEFAULT_GOLD_LEVERAGE = 20
const DEFAULT_SILVER_LEVERAGE = 20
const DEFAULT_CRYPTO_LEVERAGE = 1 // Spot trading

// V153: User-configurable leverage (loaded from AgentSettings)
let _forexLeverage = DEFAULT_FOREX_LEVERAGE
let _goldLeverage = DEFAULT_GOLD_LEVERAGE
let _cryptoLeverage = DEFAULT_CRYPTO_LEVERAGE

/**
 * V153: Set user-configured leverage from AgentSettings.
 * Called when settings are fetched from the API.
 */
export function setUserLeverage(settings: {
  paperForexLeverage?: number
  paperGoldLeverage?: number
  paperCryptoLeverage?: number
}) {
  if (settings.paperForexLeverage && settings.paperForexLeverage > 0) {
    _forexLeverage = settings.paperForexLeverage
  }
  if (settings.paperGoldLeverage && settings.paperGoldLeverage > 0) {
    _goldLeverage = settings.paperGoldLeverage
  }
  if (settings.paperCryptoLeverage && settings.paperCryptoLeverage > 0) {
    _cryptoLeverage = settings.paperCryptoLeverage
  }
}

/**
 * V153: Get current user-configured leverage values.
 */
export function getUserLeverage() {
  return {
    forex: _forexLeverage,
    gold: _goldLeverage,
    crypto: _cryptoLeverage,
  }
}

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
 * Detect the asset class of a symbol (forex, gold/silver, or crypto).
 * Returns the asset class string for leverage lookup.
 */
export function getAssetClass(symbol: string): 'forex' | 'gold' | 'crypto' {
  const upper = symbol.toUpperCase().replace(/\s+/g, '')
  const noSlash = upper.replace(/\//g, '')

  // Direct commodity detection
  if (noSlash.includes('XAU') || noSlash.includes('GOLD')) return 'gold'
  if (noSlash.includes('XAG') || noSlash.includes('SILVER')) return 'gold'

  // Direct crypto detection
  const baseCurrency = noSlash.replace(/USDT?$/, '').replace(/BUSD$/, '').replace(/USDC$/, '')
  if (CRYPTO_BASES.has(baseCurrency)) return 'crypto'

  // Normalize USDT → USD for forex lookup
  const usdSymbol = upper.replace(/\/USDT$/, '/USD').replace(/USDT$/, '/USD')
  const withSlash = usdSymbol.includes('/') ? usdSymbol : null

  // Check if base currency is a known fiat
  if (withSlash) {
    const parts = withSlash.split('/')
    const base = parts[0]
    if (FOREX_BASES.has(base)) return 'forex'
  }

  // Without slash: try to extract 3-letter base
  if (FOREX_BASES.has(baseCurrency)) return 'forex'

  // JPY pair detection
  if (noSlash.includes('JPY')) return 'forex'

  // Default: crypto (1:1)
  return 'crypto'
}

/**
 * Get the leverage for a symbol.
 * V153: Returns USER-CONFIGURED leverage for paper trading.
 * For real exchanges, this is only used as a fallback — the exchange
 * API provides the actual margin based on the user's account leverage.
 */
export function getSymbolLeverage(symbol: string): number {
  const assetClass = getAssetClass(symbol)
  switch (assetClass) {
    case 'forex': return _forexLeverage
    case 'gold': return _goldLeverage
    case 'crypto': return _cryptoLeverage
    default: return 1
  }
}

/**
 * Calculate leverage-aware margin for a position.
 *
 * Margin = Notional Value / Leverage
 *
 * V153: Uses user-configured leverage for paper trading.
 * For real exchanges, the exchange API margin takes priority.
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
 *
 * V153: Used for PAPER TRADING margin calculation.
 * For REAL exchanges, the exchange API provides actual margin.
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

/**
 * V153: Inline margin calculation for components that can't import this module.
 * Uses the same user-configured leverage as the main calculator.
 * This is used by dashboard/page.tsx, PortfolioMini.tsx, wallet/page.tsx.
 */
export function getInlineMarginCalculator() {
  return (positions: Array<{ qty: number; currentPrice: number; symbol: string }>) => {
    let margin = 0
    for (const p of positions) {
      const qty = Number(p.qty) || 0
      const price = Number(p.currentPrice) || 0
      if (qty <= 0 || price <= 0) continue
      margin += calculateClientMargin(qty, price, p.symbol)
    }
    return margin
  }
}
