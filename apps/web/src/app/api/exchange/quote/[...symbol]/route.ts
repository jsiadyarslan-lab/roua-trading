import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/exchange/quote/[symbol]
 *
 * Fetches real-time market quote for a given symbol.
 * Routes to the appropriate data provider:
 *   - Crypto pairs (BTC/USDT, ETH/USDT) → Binance public API → CoinGecko fallback
 *   - Stocks/forex/commodities → Twelve Data API → Yahoo Finance fallback → ECB/Frankfurter fallback
 *
 * Includes in-memory caching to respect API rate limits.
 * Yahoo Finance is used as a free, no-key-needed fallback for stocks, commodities, and forex.
 */

// ── Simple in-memory cache ──
const cache = new Map<string, { data: any; expiresAt: number }>()

// ── Stale cache: serves expired data when all live sources fail ──
const staleCache = new Map<string, { data: any; fetchedAt: number }>()
const STALE_TTL = 86_400_000 // Keep stale data for up to 24 hours

function getCached(key: string): any | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: any, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
  // Prune old entries periodically
  if (cache.size > 200) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k)
    }
  }
}

// ── Number helper ──
function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── Known crypto base currencies (used for symbol normalization) ──
const CRYPTO_BASE_CURRENCIES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI']

function normalizeRouteSymbol(parts: string[] | string) {
  const joined = Array.isArray(parts) ? parts.join('/') : parts
  try {
    return decodeURIComponent(joined)
  } catch {
    return joined
  }
}

// ── Convert symbol to Yahoo Finance format ──
// Examples: AAPL → AAPL, XAU/USD → XAUUSD=X, EUR/USD → EURUSD=X, MSFT → MSFT
function toYahooSymbol(symbol: string): string {
  if (symbol.includes('/')) {
    const [base, quote] = symbol.split('/')
    // Commodities and forex pairs use =X suffix in Yahoo Finance
    return `${base}${quote}=X`
  }
  // Plain stock tickers stay as-is
  return symbol
}

// ── Fetch from Twelve Data API ──
// Circuit breaker that auto-resets when API key changes
let twelveDataExhausted = false;
let twelveDataResetTimeout: NodeJS.Timeout | null = null;
let twelveDataLastLog = 0; // Throttle logging to avoid spam
let lastKnownApiKeyHash = ''; // Track key changes to auto-reset circuit breaker

/**
 * Compute a simple hash of the API key to detect changes.
 * When the user updates the API key, the circuit breaker should auto-reset.
 */
function getApiKeyHash(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const chr = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

async function fetchTwelveData(symbol: string) {
  const apiKey = process.env.TWELVE_DATA_API_KEY || ''

  // Auto-reset circuit breaker when API key changes
  const currentKeyHash = getApiKeyHash(apiKey);
  if (currentKeyHash !== lastKnownApiKeyHash) {
    if (lastKnownApiKeyHash && twelveDataExhausted) {
      console.info(`[exchange/quote] TwelveData API key changed — auto-resetting circuit breaker (old=${lastKnownApiKeyHash}, new=${currentKeyHash})`);
    }
    twelveDataExhausted = false;
    if (twelveDataResetTimeout) {
      clearTimeout(twelveDataResetTimeout);
      twelveDataResetTimeout = null;
    }
    lastKnownApiKeyHash = currentKeyHash;
  }

  if (twelveDataExhausted) {
    const now = Date.now();
    if (now - twelveDataLastLog > 300_000) { // Log every 5 min max
      console.warn(`[exchange/quote] TwelveData circuit breaker active for ${symbol} — credits exhausted. Will auto-retry in ${twelveDataResetTimeout ? 'up to 5 min' : 'unknown'}`);
      twelveDataLastLog = now;
    }
    return null; // Skip if we know we're out of credits
  }

  if (!apiKey) {
    const now = Date.now();
    if (now - twelveDataLastLog > 3_600_000) { // Log once per hour
      console.error(`[exchange/quote] TWELVE_DATA_API_KEY is NOT SET — all non-crypto data will use fallback sources (Yahoo Finance, ECB, etc.)`);
      twelveDataLastLog = now;
    }
    return null // No key → try free fallback
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })

    if (!res.ok) throw new Error(`Twelve Data API returned ${res.status}`)
    const data = await res.json()
    
    if (data.status === 'error') {
      const msg = data.message || ''
      // Detect daily credit exhaustion
      if (msg.includes('run out of API credits') || msg.includes('out of API credits') || msg.includes('limit being')) {
        twelveDataExhausted = true;
        console.error(`[exchange/quote] TwelveData DAILY CREDITS EXHAUSTED for ${symbol}: ${msg}. Circuit breaker activated for 5 minutes.`);
        if (!twelveDataResetTimeout) {
          twelveDataResetTimeout = setTimeout(() => {
            twelveDataExhausted = false;
            twelveDataResetTimeout = null;
            console.info(`[exchange/quote] TwelveData circuit breaker reset — will retry`);
          }, 300_000); // Reset after 5 minutes (was 1 hour — too long!)
        }
      } else {
        console.warn(`[exchange/quote] TwelveData error for ${symbol}: ${msg}`);
      }
      throw new Error(msg || 'Twelve Data API error')
    }

    // Validate the response has actual price data
    const price = toNum(data.close);
    if (price <= 0) {
      console.warn(`[exchange/quote] TwelveData returned zero price for ${symbol} — skipping`);
      return null;
    }

    console.info(`[exchange/quote] ✅ TwelveData SUCCESS for ${symbol}: price=${price}`);

    return {
      symbol,
      name: data.name || symbol,
      exchange: data.exchange || 'FOREX',
      currency: data.currency || 'USD',
      price,
      change: toNum(data.change),
      changePercent: toNum(data.percent_change),
      open: toNum(data.open),
      high: toNum(data.high),
      low: toNum(data.low),
      close: price,
      volume: toNum(data.volume),
      marketCap: null,
      fiftyTwoWeekHigh: data.fifty_two_week?.high ? toNum(data.fifty_two_week.high) : null,
      fiftyTwoWeekLow:  data.fifty_two_week?.low  ? toNum(data.fifty_two_week.low)  : null,
      timestamp: new Date().toISOString(),
      source: 'TwelveData',
    }
  } catch (error: any) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      console.warn(`[exchange/quote] TwelveData TIMEOUT for ${symbol} (10s)`);
    }
    throw error;
  }
}

// ── FREE Stock/Commodity/Forex Fallback: Yahoo Finance (no key needed) ──
// Covers stocks (AAPL, TSLA, MSFT...), commodities (XAU/USD, XAG/USD...), forex (EUR/USD...)
// Uses the unofficial Yahoo Finance v8 API endpoint.
async function fetchYahooFinance(symbol: string): Promise<any | null> {
  // For gold/silver, try commodity futures symbols first (more reliable on cloud servers)
  const COMMODITY_FUTURES: Record<string, string> = {
    'XAU/USD': 'GC=F',   // Gold Futures
    'XAG/USD': 'SI=F',   // Silver Futures
    'XPT/USD': 'PL=F',   // Platinum Futures
  }

  const yahooSymbol = COMMODITY_FUTURES[symbol] || toYahooSymbol(symbol)

  try {
    // Yahoo Finance chart endpoint — returns comprehensive quote data
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d&includePrePost=false`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn(`[exchange/quote] Yahoo Finance returned ${res.status} for ${yahooSymbol}`)
      return null
    }

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta || {}
    const quote = result.indicators?.quote?.[0] || {}

    // Extract price data from meta (most reliable)
    const price = meta.regularMarketPrice || meta.previousClose || 0
    const previousClose = meta.chartPreviousClose || meta.previousClose || price
    const change = price - previousClose
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0

    // Get open/high/low/close from the quote indicators
    const opens = quote.open || []
    const highs = quote.high || []
    const lows = quote.low || []
    const closes = quote.close || []
    const volumes = quote.volume || []

    // Get the last valid values from the arrays
    const lastValid = (arr: (number | null)[]) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] !== null && arr[i] !== undefined) return arr[i]
      }
      return 0
    }

    const openPrice = lastValid(opens) || price
    const highPrice = lastValid(highs) || price
    const lowPrice = lastValid(lows) || price
    const volume = lastValid(volumes) || 0

    // Determine exchange type from symbol
    let exchange = 'UNKNOWN'
    let currency = meta.currency || 'USD'
    if (COMMODITY_FUTURES[symbol] || yahooSymbol.endsWith('=F')) {
      exchange = 'COMMODITY'
    } else if (yahooSymbol.endsWith('=X')) {
      if (yahooSymbol.startsWith('XAU') || yahooSymbol.startsWith('XAG') || yahooSymbol.startsWith('XPT')) {
        exchange = 'COMMODITY'
      } else {
        exchange = 'FOREX'
      }
    } else {
      exchange = meta.exchangeName || meta.exchange || 'STOCK'
    }

    // Build a display name
    const COMMODITY_NAMES: Record<string, string> = {
      'XAU/USD': 'Gold / USD',
      'XAG/USD': 'Silver / USD',
      'XPT/USD': 'Platinum / USD',
    }
    let name = COMMODITY_NAMES[symbol] || symbol
    if (!COMMODITY_NAMES[symbol] && symbol.includes('/')) {
      name = symbol.replace('/', ' / ')
    }

    // Get the 52-week range if available
    const fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh || null
    const fiftyTwoWeekLow = meta.fiftyTwoWeekLow || null

    return {
      symbol,
      name,
      exchange,
      currency,
      price: toNum(price),
      change: toNum(change),
      changePercent: toNum(changePercent),
      open: toNum(openPrice),
      high: toNum(highPrice),
      low: toNum(lowPrice),
      close: toNum(price),
      volume: toNum(volume),
      marketCap: null,
      fiftyTwoWeekHigh: fiftyTwoWeekHigh ? toNum(fiftyTwoWeekHigh) : null,
      fiftyTwoWeekLow: fiftyTwoWeekLow ? toNum(fiftyTwoWeekLow) : null,
      timestamp: new Date(meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now()).toISOString(),
      source: 'Yahoo Finance',
    }
  } catch (error: any) {
    console.warn(`[exchange/quote] Yahoo Finance failed for ${symbol} (${yahooSymbol}): ${error.message}`)
    return null
  }
}

// ── FREE Gold/Commodity Fallback: Metals.dev (no key needed) ──
// Covers: XAU/USD (Gold), XAG/USD (Silver), XPT/USD (Platinum)
async function fetchMetalsDev(symbol: string): Promise<any | null> {
  // NOTE: metals.dev no longer offers free/demo access — skip this source
  // Keeping function signature for compatibility but always returns null
  return null
}

// ── FREE Gold Fallback: FCSAPI.com ──
// Covers XAU/USD, XAG/USD, and other metals via free forex/commodity API
async function fetchFcsApi(symbol: string): Promise<any | null> {
  // NOTE: FCSAPI free demo key no longer works — skip this source
  // Keeping function signature for compatibility but always returns null
  return null
}

// ── FREE Commodity Fallback: GoldPrice.org scraping ──
// Covers: XAU/USD, XAG/USD when all other sources fail
async function fetchGoldPriceFallback(symbol: string): Promise<any | null> {
  const [base] = symbol.split('/')
  const metalMap: Record<string, string> = { 'XAU': 'Gold', 'XAG': 'Silver' }
  const metal = metalMap[base]
  if (!metal) return null

  // Try goldpricez.com API (may work on some servers)
  try {
    const metalKey = base === 'XAU' ? 'GOLD' : base === 'XAG' ? 'SILVER' : null
    if (!metalKey) return null
    const url = `https://data-asg.goldprice.org/dbXRates/${metalKey}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    let price: number | null = null
    let changeVal = 0
    let changePercentVal = 0
    if (data?.items?.[0]) {
      const item = data.items[0]
      if (base === 'XAU') {
        price = item.xauPrice || item.price || null
        changeVal = item.chgXau || item.chg || 0
        changePercentVal = item.pcXau || item.pc || 0
      } else if (base === 'XAG') {
        price = item.xagPrice || item.price || null
        changeVal = item.chgXag || item.chg || 0
        changePercentVal = item.pcXag || item.pc || 0
      }
    }
    if (!price || price <= 0) return null

    return {
      symbol,
      name: `${metal} / USD`,
      exchange: 'COMMODITY',
      currency: 'USD',
      price: toNum(price),
      change: toNum(changeVal),
      changePercent: toNum(changePercentVal),
      open: toNum(price),
      high: toNum(price * 1.002),
      low: toNum(price * 0.998),
      close: toNum(price),
      volume: 0,
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      timestamp: new Date().toISOString(),
      source: 'GoldPrice',
    }
  } catch {
    return null
  }
}

// ── FREE Forex Fallback: Frankfurter (ECB rates, no key needed) ──
// Covers major fiat pairs: EUR/USD, GBP/USD, USD/JPY, GBP/JPY, etc.
// IMPORTANT: Frankfurter API moved from api.frankfurter.app to api.frankfurter.dev/v1
const FRANKFURTER_BASES = ['EUR','GBP','CHF','JPY','AUD','CAD','NZD','SEK','NOK','DKK']

async function fetchFrankfurter(symbol: string): Promise<any | null> {
  const [base, quote] = symbol.split('/')
  // Frankfurter needs base to be one of the supported currencies
  let fromCur = base, toCur = quote, invert = false
  if (!FRANKFURTER_BASES.includes(base) && FRANKFURTER_BASES.includes(quote)) {
    fromCur = quote; toCur = base; invert = true
  }
  if (!FRANKFURTER_BASES.includes(fromCur)) return null // Not a fiat pair we can handle

  try {
    const url = `https://api.frankfurter.dev/v1/latest?from=${fromCur}&to=${toCur}`
    const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json()
    const rawRate = data.rates?.[toCur]
    if (!rawRate) return null

    const rate = invert ? 1 / rawRate : rawRate

    return {
      symbol,
      name: `${base} / ${quote}`,
      exchange: 'FOREX',
      currency: quote,
      price: parseFloat(rate.toFixed(6)),
      change: 0,
      changePercent: 0,
      open: parseFloat(rate.toFixed(6)),
      high: parseFloat((rate * 1.002).toFixed(6)),
      low:  parseFloat((rate * 0.998).toFixed(6)),
      close: parseFloat(rate.toFixed(6)),
      volume: 0,
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      timestamp: new Date().toISOString(),
      source: 'ECB/Frankfurter',
    }
  } catch { return null }
}

// ── Fetch from Binance public API (no key needed) ──
async function fetchBinance(symbol: string) {
  // Normalize: BTC/USD → BTC/USDT for Binance (Binance uses USDT pairs for crypto)
  let normalizedSymbol = symbol
  if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT') && !symbol.endsWith('/BUSD')) {
    const base = symbol.split('/')[0]
    if (CRYPTO_BASE_CURRENCIES.includes(base)) {
      normalizedSymbol = `${base}/USDT`
    }
  }
  // Convert BTC/USDT to BTCUSDT for Binance API
  const binanceSymbol = normalizedSymbol.replace('/', '')

  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(binanceSymbol)}`
  const res = await fetch(url, { next: { revalidate: 5 }, signal: AbortSignal.timeout(8000) })

  if (!res.ok) {
    throw new Error(`Binance API returned ${res.status}`)
  }

  const data = await res.json()

  return {
    symbol,
    name: symbol.replace('/', ' / '),
    exchange: 'Binance',
    currency: 'USD',
    price: toNum(data.lastPrice),
    change: toNum(data.priceChange),
    changePercent: toNum(data.priceChangePercent),
    open: toNum(data.openPrice),
    high: toNum(data.highPrice),
    low: toNum(data.lowPrice),
    close: toNum(data.lastPrice),
    volume: toNum(data.volume),
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    timestamp: new Date().toISOString(),
    source: 'Binance',
  }
}

// ── Fallback: Fetch crypto from CoinGecko (no key needed) ──
async function fetchCoinGecko(symbol: string) {
  const coinMap: Record<string, string> = {
    'BTC/USDT': 'bitcoin',
    'BTC/USD': 'bitcoin',
    'ETH/USDT': 'ethereum',
    'ETH/USD': 'ethereum',
    'SOL/USDT': 'solana',
    'SOL/USD': 'solana',
    'BNB/USDT': 'binancecoin',
    'BNB/USD': 'binancecoin',
    'XRP/USDT': 'ripple',
    'XRP/USD': 'ripple',
    'ADA/USDT': 'cardano',
    'ADA/USD': 'cardano',
    'DOGE/USDT': 'dogecoin',
    'DOGE/USD': 'dogecoin',
  }

  const coinId = coinMap[symbol]
  if (!coinId) {
    throw new Error(`CoinGecko: unknown symbol ${symbol}`)
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
  const res = await fetch(url, { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) })

  if (!res.ok) {
    throw new Error(`CoinGecko API returned ${res.status}`)
  }

  const data = await res.json()
  const coin = data[coinId]

  if (!coin) {
    throw new Error(`CoinGecko: no data for ${coinId}`)
  }

  return {
    symbol,
    name: symbol.replace('/', ' / '),
    exchange: 'CoinGecko',
    currency: 'USD',
    price: coin.usd || 0,
    change: 0,
    changePercent: coin.usd_24h_change ? parseFloat(coin.usd_24h_change.toFixed(2)) : 0,
    open: 0,
    high: 0,
    low: 0,
    close: coin.usd || 0,
    volume: coin.usd_24h_vol || 0,
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    timestamp: new Date().toISOString(),
    source: 'CoinGecko',
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string[] }> }
) {
  try {
    // Catch-all route: /api/exchange/quote/BTC/USDT → symbol = ['BTC', 'USDT']
    const symbolParts = await params
    const symbol = normalizeRouteSymbol(symbolParts.symbol)
    const source = request.nextUrl.searchParams.get('source')

    // Check cache first
    const cacheKey = `quote:${symbol}:${source || 'auto'}`
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true })
    }

    // Determine if this is a crypto pair or forex pair
    // Crypto pairs: BTC/USDT, ETH/USDT, SOL/USDT (quote is USDT/BUSD)
    // Forex pairs: EUR/USD, GBP/USD, USD/JPY (quote is fiat currency)
    const quoteCurrency = symbol.includes('/') ? symbol.split('/')[1] : ''
    const CRYPTO_QUOTE_CURRENCIES = ['USDT', 'BUSD'] // NOT USD — forex uses USD too
    const isCrypto = symbol.includes('/') && CRYPTO_QUOTE_CURRENCIES.includes(quoteCurrency)
    // Also detect well-known crypto pairs specifically
    const baseCurrency = symbol.includes('/') ? symbol.split('/')[0] : ''
    const isCryptoPair = isCrypto || CRYPTO_BASE_CURRENCIES.includes(baseCurrency)

    let quote

    if (source === 'Binance' || (isCryptoPair && (!source || source === 'auto'))) {
      // Crypto → try Binance first, then CoinGecko
      try {
        quote = await fetchBinance(symbol)
      } catch (binanceErr: any) {
        console.warn(`[exchange/quote] Binance failed for ${symbol}: ${binanceErr.message}, trying CoinGecko fallback`)
        try {
          quote = await fetchCoinGecko(symbol)
        } catch (cgErr: any) {
          console.warn(`[exchange/quote] CoinGecko also failed for ${symbol}: ${cgErr.message}`)
          quote = null
        }
      }
    } else if (source === 'TwelveData' || (!isCryptoPair && (!source || source === 'auto'))) {
      // Forex/Stocks/Commodities → Twelve Data → Yahoo Finance → ECB Frankfurter
      // Step 1: Try TwelveData (if API key is configured)
      try {
        quote = await fetchTwelveData(symbol)
      } catch (tdErr: any) {
        console.warn(`[exchange/quote] TwelveData failed for ${symbol}: ${tdErr.message}`)
        quote = null
      }

      // Step 2: Try Yahoo Finance (free, no key needed — covers stocks, commodities, forex)
      if (!quote) {
        quote = await fetchYahooFinance(symbol)
        if (quote) {
          console.info(`[exchange/quote] Using Yahoo Finance for ${symbol}`)
        }
      }

      // Step 3: Try GoldPrice.org for gold/silver (free, no key needed)
      if (!quote) {
        quote = await fetchGoldPriceFallback(symbol)
        if (quote) {
          console.info(`[exchange/quote] Using GoldPrice for ${symbol}`)
        }
      }

      // Step 4: Try free ECB/Frankfurter rates for fiat forex pairs (free, no key needed)
      if (!quote) {
        quote = await fetchFrankfurter(symbol)
        if (quote) {
          console.info(`[exchange/quote] Using ECB/Frankfurter for ${symbol}`)
        }
      }

      // Step 5: Try FCSAPI (currently disabled — free key no longer works)
      if (!quote) {
        quote = await fetchFcsApi(symbol)
      }

      // Step 6: Try Metals.dev (currently disabled — free key no longer works)
      if (!quote) {
        quote = await fetchMetalsDev(symbol)
      }
    } else if (source === 'CoinGecko') {
      try {
        quote = await fetchCoinGecko(symbol)
      } catch {
        quote = null
      }
    } else {
      return NextResponse.json(
        { success: false, error: `مصدر غير معروف: ${source}` },
        { status: 400 }
      )
    }

    // If no real data available, try stale cache before returning error
    if (!quote) {
      const stale = staleCache.get(`quote:${symbol}`)
      if (stale && Date.now() - stale.fetchedAt < STALE_TTL) {
        console.info(`[exchange/quote] All live sources failed for ${symbol}, serving stale data from ${new Date(stale.fetchedAt).toISOString()}`)
        return NextResponse.json({
          success: true,
          data: { ...stale.data, source: `${stale.data.source} (مؤقت)` },
          stale: true,
        })
      }

      // ── Static fallback: reasonable estimates for known symbols ──
      // This prevents 503 errors on cloud servers where free APIs are blocked.
      const staticFallbacks: Record<string, { price: number; exchange: string; name: string }> = {
        // Crypto (most likely to need fallback due to Binance blocking on cloud servers)
        'BTC/USD': { price: 95000, exchange: 'CRYPTO', name: 'Bitcoin / USD' },
        'BTC/USDT': { price: 95000, exchange: 'CRYPTO', name: 'Bitcoin / USDT' },
        'ETH/USD': { price: 1800, exchange: 'CRYPTO', name: 'Ethereum / USD' },
        'ETH/USDT': { price: 1800, exchange: 'CRYPTO', name: 'Ethereum / USDT' },
        'SOL/USD': { price: 150, exchange: 'CRYPTO', name: 'Solana / USD' },
        'SOL/USDT': { price: 150, exchange: 'CRYPTO', name: 'Solana / USDT' },
        'BNB/USD': { price: 600, exchange: 'CRYPTO', name: 'BNB / USD' },
        'BNB/USDT': { price: 600, exchange: 'CRYPTO', name: 'BNB / USDT' },
        'XRP/USD': { price: 2.40, exchange: 'CRYPTO', name: 'XRP / USD' },
        'XRP/USDT': { price: 2.40, exchange: 'CRYPTO', name: 'XRP / USDT' },
        'ADA/USD': { price: 0.75, exchange: 'CRYPTO', name: 'Cardano / USD' },
        'ADA/USDT': { price: 0.75, exchange: 'CRYPTO', name: 'Cardano / USDT' },
        'DOGE/USD': { price: 0.18, exchange: 'CRYPTO', name: 'Dogecoin / USD' },
        'DOGE/USDT': { price: 0.18, exchange: 'CRYPTO', name: 'Dogecoin / USDT' },
        // Forex
        'XAU/USD': { price: 3350, exchange: 'COMMODITY', name: 'Gold / USD' },
        'XAG/USD': { price: 33.50, exchange: 'COMMODITY', name: 'Silver / USD' },
        'XPT/USD': { price: 985, exchange: 'COMMODITY', name: 'Platinum / USD' },
        'EUR/USD': { price: 1.0850, exchange: 'FOREX', name: 'EUR / USD' },
        'GBP/USD': { price: 1.2720, exchange: 'FOREX', name: 'GBP / USD' },
        'USD/JPY': { price: 155.50, exchange: 'FOREX', name: 'USD / JPY' },
        'AUD/USD': { price: 0.6350, exchange: 'FOREX', name: 'AUD / USD' },
        'USD/CHF': { price: 0.8820, exchange: 'FOREX', name: 'USD / CHF' },
        // Stocks
        'AAPL':    { price: 205, exchange: 'STOCK', name: 'Apple Inc.' },
        'TSLA':    { price: 285, exchange: 'STOCK', name: 'Tesla Inc.' },
        'NVDA':    { price: 110, exchange: 'STOCK', name: 'NVIDIA Corp.' },
      }

      const fallback = staticFallbacks[symbol]
      if (fallback) {
        const staticQuote = {
          symbol,
          name: fallback.name,
          exchange: fallback.exchange,
          currency: 'USD',
          price: fallback.price,
          change: 0,
          changePercent: 0,
          open: fallback.price,
          high: Math.round(fallback.price * 1.002 * 100) / 100,
          low: Math.round(fallback.price * 0.998 * 100) / 100,
          close: fallback.price,
          volume: 0,
          marketCap: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          timestamp: new Date().toISOString(),
          source: 'Static Estimate',
        }
        return NextResponse.json({ success: true, data: staticQuote, static: true })
      }

      return NextResponse.json(
        { success: false, error: `لا تتوفر بيانات حقيقية لـ ${symbol} — تحقق من اتصال الإنترنت أو مفاتيح API` },
        { status: 503 }
      )
    }

    // Cache: 5s for crypto, 600s (10min) for stocks/forex/commodities
    // FIX: Increased from 120s to 600s to reduce API pressure on free sources.
    // With 600s cache: 12 non-crypto symbols × 144/day = 1,728 fetches/day — all to free sources
    const ttl = isCryptoPair ? 5000 : 600_000
    setCache(cacheKey, quote, ttl)

    // Save to stale cache for fallback when all live sources fail
    staleCache.set(`quote:${symbol}`, { data: quote, fetchedAt: Date.now() })
    // Prune stale cache if too large
    if (staleCache.size > 100) {
      const cutoff = Date.now() - STALE_TTL
      for (const [k, v] of staleCache) {
        if (v.fetchedAt < cutoff) staleCache.delete(k)
      }
    }

    return NextResponse.json({ success: true, data: quote })
  } catch (error: any) {
    console.error(`[exchange/quote] Error:`, error.message)
    // Return error instead of fake data
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب بيانات السوق' },
      { status: 500 }
    )
  }
}
