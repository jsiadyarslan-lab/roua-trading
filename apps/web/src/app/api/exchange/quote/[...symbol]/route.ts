import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/exchange/quote/[symbol]
 *
 * Fetches real-time market quote for a given symbol.
 * Routes to the appropriate data provider:
 *   - Crypto pairs (BTC/USDT, ETH/USDT) → Binance public API → CoinGecko fallback
 *   - Stocks/forex/commodities → Twelve Data API → Mock fallback
 *
 * This replaces the need for the NestJS backend exchange service.
 * Includes in-memory caching to respect API rate limits.
 * Returns mock/demo data when API keys are not configured.
 */

// ── Simple in-memory cache ──
const cache = new Map<string, { data: any; expiresAt: number }>()

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

// ── No mock data — return null when real APIs are unavailable ──
// Previously had hardcoded stock prices (AAPL, MSFT, etc.) and random price
// generation for unknown symbols. Removed to avoid displaying fake data.
function getUnavailableQuote(symbol: string): null {
  return null
}

// ── Fetch from Twelve Data API ──
let twelveDataExhausted = false;
let twelveDataResetTimeout: NodeJS.Timeout | null = null;

async function fetchTwelveData(symbol: string) {
  if (twelveDataExhausted) {
    return null; // Skip if we know we're out of credits
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) {
    return null // No key → try free fallback
  }

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  const res = await fetch(url, { cache: 'no-store' })

  if (!res.ok) throw new Error(`Twelve Data API returned ${res.status}`)
  const data = await res.json()
  
  if (data.status === 'error') {
    if (data.message && data.message.includes('run out of API credits')) {
      twelveDataExhausted = true;
      console.warn(`[exchange/quote] TwelveData API limit exhausted. Circuit breaker activated for 1 hour.`);
      if (!twelveDataResetTimeout) {
        twelveDataResetTimeout = setTimeout(() => {
          twelveDataExhausted = false;
          twelveDataResetTimeout = null;
        }, 3600_000); // Reset after 1 hour
      }
    }
    throw new Error(data.message || 'Twelve Data API error')
  }

  return {
    symbol,
    name: data.name || symbol,
    exchange: data.exchange || 'FOREX',
    currency: data.currency || 'USD',
    price: toNum(data.close),
    change: toNum(data.change),
    changePercent: toNum(data.percent_change),
    open: toNum(data.open),
    high: toNum(data.high),
    low: toNum(data.low),
    close: toNum(data.close),
    volume: toNum(data.volume),
    marketCap: null,
    fiftyTwoWeekHigh: data.fifty_two_week?.high ? toNum(data.fifty_two_week.high) : null,
    fiftyTwoWeekLow:  data.fifty_two_week?.low  ? toNum(data.fifty_two_week.low)  : null,
    timestamp: new Date().toISOString(),
    source: 'TwelveData',
  }
}

// ── FREE Forex Fallback: Frankfurter (ECB rates, no key needed) ──
// Covers major fiat pairs: EUR/USD, GBP/USD, USD/JPY, GBP/JPY, etc.
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
    const url = `https://api.frankfurter.app/latest?from=${fromCur}&to=${toCur}`
    const res  = await fetch(url, { cache: 'no-store' })
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
  const res = await fetch(url, { next: { revalidate: 5 } })

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
  const res = await fetch(url, { next: { revalidate: 30 } })

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
      // Forex/Stocks → Twelve Data (if key set) → ECB Frankfurter (free)
      try {
        quote = await fetchTwelveData(symbol)
      } catch (tdErr: any) {
        console.warn(`[exchange/quote] TwelveData failed for ${symbol}: ${tdErr.message}`)
        quote = null
      }

      // If no Twelve Data key or failed → try free ECB rates for fiat pairs
      if (!quote) {
        quote = await fetchFrankfurter(symbol)
        if (quote) {
          console.info(`[exchange/quote] Using ECB/Frankfurter for ${symbol}`)
        }
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

    // If no real data available, return error instead of fake data
    if (!quote) {
      return NextResponse.json(
        { success: false, error: `لا تتوفر بيانات حقيقية لـ ${symbol} — تحقق من اتصال الإنترنت أو مفاتيح API` },
        { status: 503 }
      )
    }

    // Cache: 5s for crypto, 15s for stocks/forex
    const ttl = isCryptoPair ? 5000 : 15000
    setCache(cacheKey, quote, ttl)

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
