// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Symbol Metadata & Lot/Margin Calculator
// V146: Adds contract size, leverage, lot conventions, and margin calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Asset class determines how quantity, margin, and lots are calculated.
 *
 * - FOREX: Quantity in units, 1 lot = 100,000 units. Margin = notional / leverage.
 * - CRYPTO: Quantity in base currency units (e.g., 0.5 BTC). Margin = notional (spot) or notional / leverage (futures).
 * - COMMODITY: Quantity in troy ounces (XAU/XAG) or barrels. Margin = notional / leverage.
 * - STOCK: Quantity in shares. Margin = notional / leverage.
 * - INDEX: Quantity in contracts. Contract size varies by index.
 */
export enum AssetClass {
  FOREX = 'FOREX',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY',
  STOCK = 'STOCK',
  INDEX = 'INDEX',
}

export interface SymbolMetadata {
  /** Asset class for this symbol */
  assetClass: AssetClass;
  /** Number of base-currency units per 1 standard lot */
  contractSize: number;
  /** Minimum lot step (e.g., 0.01 for micro lots, 0.001 for crypto) */
  lotStep: number;
  /** Minimum lot size (e.g., 0.01) */
  minLot: number;
  /** Maximum lot size */
  maxLot: number;
  /** Default leverage for margin calculation (1 = no leverage / spot) */
  defaultLeverage: number;
  /** Pip size for this symbol (0.0001 for 4-digit forex, 0.01 for JPY pairs, etc.) */
  pipSize: number;
  /** Number of decimal places for price display */
  priceDecimals: number;
}

// ═══════════════════════════════════════════════════════════
// Symbol Metadata Registry
// ═══════════════════════════════════════════════════════════

const SYMBOL_REGISTRY: Record<string, Partial<SymbolMetadata>> = {
  // ── Forex Majors (USD pairs) ──
  'EUR/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'GBP/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'USD/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
  'USD/CHF': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'AUD/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'NZD/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'USD/CAD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'EUR/GBP': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'EUR/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
  'GBP/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
  'EUR/CHF': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
  'AUD/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
  // V149: USDT-suffix forex pairs are now handled automatically by
  // getSymbolMetadata() which normalizes /USDT → /USD for lookup.
  // No need to duplicate entries here — EUR/USDT will match EUR/USD.

  // ── Commodities ──
  // BUG-066o: Added minLot/maxLot/lotStep to prevent sub-0.01 lot sizes
  // (the standard minimum on all real brokers). Previously these inherited
  // from DEFAULT_METADATA (minLot=0.00001) which allowed phantom positions
  // that cannot be executed on real accounts.
  'XAU/USD': { assetClass: AssetClass.COMMODITY, contractSize: 100, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 20, lotStep: 0.01, minLot: 0.01, maxLot: 100 },
  'XAG/USD': { assetClass: AssetClass.COMMODITY, contractSize: 5000, pipSize: 0.001, priceDecimals: 3, defaultLeverage: 20, lotStep: 0.01, minLot: 0.01, maxLot: 100 },

  // ── V353: Indices (OANDA) ──
  // Contract size = 1 (1 contract = 1 index point value in USD)
  // Leverage = 20 (conservative for indices)
  // BUG-066o: Added minLot/maxLot/lotStep (same reason as commodities above)
  'US30/USD':   { assetClass: AssetClass.INDEX, contractSize: 1, pipSize: 1,    priceDecimals: 1, defaultLeverage: 20, lotStep: 0.01, minLot: 0.01, maxLot: 100 },
  'NAS100/USD': { assetClass: AssetClass.INDEX, contractSize: 1, pipSize: 0.25, priceDecimals: 2, defaultLeverage: 20, lotStep: 0.01, minLot: 0.01, maxLot: 100 },
  'SPX500/USD': { assetClass: AssetClass.INDEX, contractSize: 1, pipSize: 0.25, priceDecimals: 2, defaultLeverage: 20, lotStep: 0.01, minLot: 0.01, maxLot: 100 },
  'GER30/USD':  { assetClass: AssetClass.INDEX, contractSize: 1, pipSize: 0.1,  priceDecimals: 1, defaultLeverage: 20, lotStep: 0.01, minLot: 0.01, maxLot: 100 },
  'UK100/USD':  { assetClass: AssetClass.INDEX, contractSize: 1, pipSize: 0.1,  priceDecimals: 1, defaultLeverage: 20, lotStep: 0.01, minLot: 0.01, maxLot: 100 },

  // ── V353: Energy (OANDA) ──
  // Contract size = 1000 (1 contract = 1000 barrels)
  // Leverage = 10 (conservative for energy)
  // BUG-066o: Added minLot/maxLot/lotStep (same reason as commodities above)
  'WTI/USD':   { assetClass: AssetClass.COMMODITY, contractSize: 1000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 10, lotStep: 0.01, minLot: 0.01, maxLot: 100 },
  'BRENT/USD': { assetClass: AssetClass.COMMODITY, contractSize: 1000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 10, lotStep: 0.01, minLot: 0.01, maxLot: 100 },

  // ── Crypto ──
  'BTC/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 1000, pipSize: 1, priceDecimals: 2, defaultLeverage: 1 },
  'BTC/USD':  { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 1000, pipSize: 1, priceDecimals: 2, defaultLeverage: 1 },
  'ETH/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 10000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
  'ETH/USD':  { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 10000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
  'SOL/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 50000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
  'BNB/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.001, minLot: 0.001, maxLot: 5000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
  'XRP/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 1, minLot: 1, maxLot: 500000, pipSize: 0.0001, priceDecimals: 4, defaultLeverage: 1 },
  'ADA/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 1, minLot: 1, maxLot: 500000, pipSize: 0.0001, priceDecimals: 4, defaultLeverage: 1 },
  // V432: Added the 5 missing crypto pairs (matches LAZIC_SUPPORTED_SYMBOLS)
  'DOT/USDT':  { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 50000, pipSize: 0.001, priceDecimals: 3, defaultLeverage: 1 },
  'MATIC/USDT':{ assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 1, minLot: 1, maxLot: 500000, pipSize: 0.0001, priceDecimals: 4, defaultLeverage: 1 },
  'AVAX/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 50000, pipSize: 0.001, priceDecimals: 3, defaultLeverage: 1 },
  'LINK/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 50000, pipSize: 0.001, priceDecimals: 3, defaultLeverage: 1 },
  'UNI/USDT':  { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 50000, pipSize: 0.001, priceDecimals: 3, defaultLeverage: 1 },
};

// Default metadata for unregistered symbols
const DEFAULT_METADATA: SymbolMetadata = {
  assetClass: AssetClass.CRYPTO,
  contractSize: 1,
  lotStep: 0.00001,
  minLot: 0.00001,
  maxLot: 1000000,
  defaultLeverage: 1,
  pipSize: 0.01,
  priceDecimals: 2,
};

// Default metadata for forex-like symbols (detected by pattern)
const FOREX_DEFAULT: SymbolMetadata = {
  assetClass: AssetClass.FOREX,
  contractSize: 100000,
  lotStep: 0.01,
  minLot: 0.01,
  maxLot: 100,
  defaultLeverage: 50,
  pipSize: 0.0001,
  priceDecimals: 5,
};

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

/**
 * Get metadata for a symbol. Falls back to heuristic detection
 * for unregistered symbols based on naming patterns.
 */
export function getSymbolMetadata(symbol: string): SymbolMetadata {
  const upper = symbol.toUpperCase();

  // 1. Exact match in registry
  if (SYMBOL_REGISTRY[upper]) {
    const partial = SYMBOL_REGISTRY[upper];
    return { ...DEFAULT_METADATA, ...partial };
  }

  // ── V149 FIX: Normalize USDT → USD for lookup ──
  // Binance-style exchanges use EUR/USDT, XAU/USDT etc.
  // These should be treated the same as EUR/USD, XAU/USD.
  // Without this, EUR/USDT fell through to CRYPTO default (1:1 leverage)
  // causing calculateMargin() to return the FULL NOTIONAL instead of
  // notional/50 — the root cause of "مستخدم" showing $20K instead of ~$400.
  if (upper.endsWith('/USDT')) {
    const usdEquivalent = upper.replace('/USDT', '/USD');
    if (SYMBOL_REGISTRY[usdEquivalent]) {
      const partial = SYMBOL_REGISTRY[usdEquivalent];
      return { ...DEFAULT_METADATA, ...partial };
    }
  }

  // ── V152 FIX: Handle NO-SLASH symbols (e.g., EURUSDT, GBPUSD, XAUUSDT) ──
  // Binance API and some exchanges store symbols WITHOUT slashes.
  // Previously, these fell through to CRYPTO default (1:1 leverage),
  // causing calculateMargin() to return FULL NOTIONAL instead of
  // notional/50 for forex pairs. This is the root cause of "مستخدم"
  // showing $12,302 instead of ~$246 for forex positions.
  //
  // Strategy: Try to reconstruct the slash format and look up in registry.
  // Known quote currencies: USD, USDT, BUSD, USDC, JPY, EUR, GBP, etc.
  const NO_SLASH_QUOTES = ['USDT', 'BUSD', 'USDC', 'USD', 'JPY', 'EUR', 'GBP', 'CHF', 'AUD', 'NZD', 'CAD', 'SGD', 'HKD'];
  for (const quote of NO_SLASH_QUOTES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      const base = upper.slice(0, upper.length - quote.length);
      if (base.length >= 3) {
        const withSlash = `${base}/${quote}`;
        // Try with slash in registry
        if (SYMBOL_REGISTRY[withSlash]) {
          const partial = SYMBOL_REGISTRY[withSlash];
          return { ...DEFAULT_METADATA, ...partial };
        }
        // Try normalizing USDT→USD (e.g., EURUSDT → EUR/USD)
        if (quote === 'USDT' || quote === 'BUSD' || quote === 'USDC') {
          const usdSlash = `${base}/USD`;
          if (SYMBOL_REGISTRY[usdSlash]) {
            const partial = SYMBOL_REGISTRY[usdSlash];
            return { ...DEFAULT_METADATA, ...partial };
          }
        }
      }
    }
  }

  // 2. Heuristic: JPY pairs → forex
  if (upper.includes('JPY')) {
    return { ...FOREX_DEFAULT, pipSize: 0.01, priceDecimals: 3 };
  }

  // 3. Heuristic: XXX/YYY or XXX/YYYY format → forex
  // V149: Extended from 7-char only to also match 8+ char pairs (e.g., EUR/USDT)
  // A pair has format BASE/QUOTE where BASE is 3 chars and QUOTE is 3+ chars
  // Known fiat base currencies → always forex regardless of quote
  const pairMatch = upper.match(/^([A-Z]{3})\/([A-Z]{3,})$/);
  if (pairMatch) {
    const base = pairMatch[1];
    const quote = pairMatch[2];
    // Known fiat currencies that appear as base in forex pairs
    const FIAT_CURRENCIES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY',
      'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR',
      'MXN', 'BRL', 'RUB', 'CNY', 'INR', 'KRW', 'THB'];
    // If base is fiat → forex pair (e.g., USD/SGD, EUR/USDT)
    if (FIAT_CURRENCIES.includes(base)) {
      return { ...FOREX_DEFAULT, pipSize: quote === 'JPY' ? 0.01 : 0.0001, priceDecimals: quote === 'JPY' ? 3 : 5 };
    }
    // If quote is fiat or stablecoin and base isn't known crypto → forex
    const CRYPTO_BASES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT',
      'AVAX', 'LINK', 'MATIC', 'UNI', 'ATOM', 'LTC', 'SHIB', 'APE', 'ARB', 'OP',
      'FIL', 'NEAR', 'FTM', 'ALGO', 'VET', 'SAND', 'MANA', 'AXS', 'CRV'];
    if (!CRYPTO_BASES.includes(base) && ['USD', 'USDT', 'BUSD', 'USDC', 'CHF', 'CAD'].includes(quote)) {
      return { ...FOREX_DEFAULT };
    }
  }

  // 4. Heuristic: Gold/Silver → commodity
  if (upper.includes('XAU') || upper.includes('XAG')) {
    return {
      ...DEFAULT_METADATA,
      assetClass: AssetClass.COMMODITY,
      contractSize: 100,
      pipSize: 0.01,
      priceDecimals: 2,
      defaultLeverage: 20,
    };
  }

  // 5. Default: crypto-like
  return { ...DEFAULT_METADATA };
}

/**
 * Convert a lot size to raw units.
 *
 * Examples:
 *   EUR/USD: 0.01 lots → 1,000 units
 *   BTC/USDT: 0.001 lots → 0.001 BTC
 *   XAU/USD: 0.1 lots → 10 ounces
 */
export function lotsToUnits(lots: number, symbol: string): number {
  const meta = getSymbolMetadata(symbol);
  return lots * meta.contractSize;
}

/**
 * Convert raw units to lot size.
 *
 * Examples:
 *   EUR/USD: 1,000 units → 0.01 lots
 *   BTC/USDT: 0.001 BTC → 0.001 lots (crypto contractSize = 1)
 */
export function unitsToLots(units: number, symbol: string): number {
  const meta = getSymbolMetadata(symbol);
  if (meta.contractSize <= 0) return 0;
  return units / meta.contractSize;
}

/**
 * Round a lot size to the nearest valid step.
 * e.g., for forex (step=0.01): 0.037 → 0.03
 */
export function roundLotSize(lots: number, symbol: string): number {
  const meta = getSymbolMetadata(symbol);
  const step = meta.lotStep;
  const rounded = Math.floor(lots / step) * step;
  return parseFloat(rounded.toFixed(8));
}

/**
 * Calculate the notional value (quantity × price).
 *
 * @param quantity - Quantity in RAW UNITS (not lots)
 * @param price - Current price
 */
export function calculateNotionalValue(quantity: number, price: number): number {
  return Math.abs(quantity * price);
}

/**
 * Calculate the required margin for a position.
 *
 * Margin = Notional Value / Leverage
 *
 * For spot crypto (leverage=1), margin = notional value (full collateral).
 * For forex (leverage=50), margin = notional / 50.
 *
 * @param quantity - Quantity in RAW UNITS
 * @param price - Current price
 * @param symbol - Trading symbol (to look up leverage)
 * @param customLeverage - Override leverage (e.g., user-specified)
 */
export function calculateMargin(
  quantity: number,
  price: number,
  symbol: string,
  customLeverage?: number,
): number {
  const meta = getSymbolMetadata(symbol);
  const leverage = customLeverage || meta.defaultLeverage;
  const notional = calculateNotionalValue(quantity, price);
  if (leverage <= 0) return notional; // safety: no division by zero
  return notional / leverage;
}

/**
 * Calculate pip value for a given position size.
 *
 * Pip Value = Pip Size × Quantity (in units)
 *
 * For forex: 0.0001 × 100,000 = $10 per pip per standard lot
 *
 * @param quantity - Quantity in RAW UNITS
 * @param symbol - Trading symbol
 */
export function calculatePipValue(quantity: number, symbol: string): number {
  const meta = getSymbolMetadata(symbol);
  return meta.pipSize * quantity;
}

/**
 * Calculate the risk in dollars given entry, stop-loss, and quantity.
 *
 * Risk = |Entry - StopLoss| × Quantity (in units)
 */
export function calculateRisk(
  entryPrice: number,
  stopLoss: number,
  quantity: number,
): number {
  return Math.abs(entryPrice - stopLoss) * quantity;
}

/**
 * Calculate position size in UNITS based on risk budget.
 *
 * This is the core risk-based position sizing formula.
 * The result is in RAW UNITS — use unitsToLots() to convert to lot size.
 *
 * @param riskBudget - Maximum dollars willing to risk (e.g., 1% of $10,000 = $100)
 * @param entryPrice - Entry price
 * @param stopLoss - Stop-loss price
 * @param symbol - Trading symbol (for lot normalization)
 * @returns Position size in RAW UNITS, normalized to lot steps
 */
export function calculatePositionSizeFromRisk(
  riskBudget: number,
  entryPrice: number,
  stopLoss: number,
  symbol: string,
): { quantityUnits: number; quantityLots: number; margin: number; risk: number; notional: number } {
  const meta = getSymbolMetadata(symbol);
  const priceRisk = Math.abs(entryPrice - stopLoss);

  if (priceRisk <= 0 || entryPrice <= 0) {
    return { quantityUnits: 0, quantityLots: 0, margin: 0, risk: 0, notional: 0 };
  }

  // How many units can we hold given our risk budget?
  let quantityUnits = riskBudget / priceRisk;

  // Convert to lots and round down to nearest valid step
  let quantityLots = unitsToLots(quantityUnits, symbol);
  quantityLots = roundLotSize(quantityLots, symbol);

  // Ensure minimum lot size
  if (quantityLots < meta.minLot) {
    quantityLots = 0; // Too small to trade
  }

  // Ensure maximum lot size
  if (quantityLots > meta.maxLot) {
    quantityLots = meta.maxLot;
  }

  // Convert back to units for final calculations
  quantityUnits = lotsToUnits(quantityLots, symbol);

  const notional = calculateNotionalValue(quantityUnits, entryPrice);
  const margin = calculateMargin(quantityUnits, entryPrice, symbol);
  const risk = calculateRisk(entryPrice, stopLoss, quantityUnits);

  return { quantityUnits, quantityLots, margin, risk, notional };
}
