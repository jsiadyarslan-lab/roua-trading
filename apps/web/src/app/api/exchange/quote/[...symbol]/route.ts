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

// ── Mock data for when API keys are not configured ──
const MOCK_QUOTES: Record<string, any> = {
  'AAPL': { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD', price: 189.84, change: 1.23, changePercent: 0.65, open: 188.50, high: 190.12, low: 188.10, close: 189.84, volume: 52347890, marketCap: 2950000000000, fiftyTwoWeekHigh: 199.62, fiftyTwoWeekLow: 164.08 },
  'MSFT': { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', currency: 'USD', price: 425.52, change: 3.45, changePercent: 0.82, open: 422.00, high: 427.15, low: 421.30, close: 425.52, volume: 21345670, marketCap: 3160000000000, fiftyTwoWeekHigh: 430.82, fiftyTwoWeekLow: 309.45 },
  'GOOGL': { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', currency: 'USD', price: 176.42, change: -0.87, changePercent: -0.49, open: 177.20, high: 178.10, low: 175.80, close: 176.42, volume: 18765430, marketCap: 2180000000000, fiftyTwoWeekHigh: 182.45, fiftyTwoWeekLow: 120.21 },
  'TSLA': { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', currency: 'USD', price: 248.42, change: 5.67, changePercent: 2.33, open: 243.00, high: 250.80, low: 242.50, close: 248.42, volume: 98765430, marketCap: 790000000000, fiftyTwoWeekHigh: 299.29, fiftyTwoWeekLow: 138.80 },
  'AMZN': { symbol: 'AMZN', name: 'Amazon.com, Inc.', exchange: 'NASDAQ', currency: 'USD', price: 186.13, change: 2.14, changePercent: 1.16, open: 184.00, high: 187.20, low: 183.50, close: 186.13, volume: 43215670, marketCap: 1940000000000, fiftyTwoWeekHigh: 191.70, fiftyTwoWeekLow: 118.35 },
  'EUR/USD': { symbol: 'EUR/USD', name: 'Euro / US Dollar', exchange: 'FOREX', currency: 'USD', price: 1.0862, change: 0.0012, changePercent: 0.11, open: 1.0850, high: 1.0878, low: 1.0842, close: 1.0862, volume: 0, marketCap: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null },
  'BTC/USDT': { symbol: 'BTC/USDT', name: 'Bitcoin / Tether', exchange: 'Binance', currency: 'USD', price: 67234.50, change: 1234.56, changePercent: 1.87, open: 66000.00, high: 67890.12, low: 65432.10, close: 67234.50, volume: 23456.78, marketCap: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null },
}

function getMockQuote(symbol: string) {
  // Direct match first
  if (MOCK_QUOTES[symbol]) {
    return {
      ...MOCK_QUOTES[symbol],
      timestamp: new Date().toISOString(),
      source: 'Demo',
    }
  }

  // Generate a generic mock for unknown symbols
  const isCryptoPair = symbol.includes('/') &&
    (['USDT', 'BUSD'].includes(symbol.split('/')[1]) ||
     ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE'].includes(symbol.split('/')[0]))
  const basePrice = isCryptoPair ? 100 + Math.random() * 500 : 50 + Math.random() * 200
  const change = (Math.random() - 0.5) * 10
  const changePercent = (change / basePrice) * 100

  return {
    symbol,
    name: symbol.replace('/', ' / '),
    exchange: isCryptoPair ? 'Crypto' : 'Market',
    currency: 'USD',
    price: parseFloat(basePrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    open: parseFloat((basePrice - change * 0.5).toFixed(2)),
    high: parseFloat((basePrice + Math.abs(change) * 0.3).toFixed(2)),
    low: parseFloat((basePrice - Math.abs(change) * 0.7).toFixed(2)),
    close: parseFloat(basePrice.toFixed(2)),
    volume: Math.floor(Math.random() * 50000000),
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    timestamp: new Date().toISOString(),
    source: 'Demo',
  }
}

// ── Fetch from Twelve Data API ──
async function fetchTwelveData(symbol: string) {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) {
    return null // Signal to use mock data
  }

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  const res = await fetch(url, { next: { revalidate: 10 } })

  if (!res.ok) {
    throw new Error(`Twelve Data API returned ${res.status}`)
  }

  const data = await res.json()

  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data API error')
  }

  return {
    symbol,
    name: data.name || symbol,
    exchange: data.exchange || '',
    currency: data.currency || 'USD',
    price: toNum(data.close),
    change: toNum(data.change),
    changePercent: toNum(data.percent_change),
    open: toNum(data.open),
    high: toNum(data.high),
    low: toNum(data.low),
    close: toNum(data.close),
    volume: toNum(data.volume),
    marketCap: data.market_cap ? toNum(data.market_cap) : null,
    fiftyTwoWeekHigh: data.fifty_two_week?.high ? toNum(data.fifty_two_week.high) : null,
    fiftyTwoWeekLow: data.fifty_two_week?.low ? toNum(data.fifty_two_week.low) : null,
    timestamp: new Date().toISOString(),
    source: 'TwelveData',
  }
}

// ── Fetch from Binance public API (no key needed) ──
async function fetchBinance(symbol: string) {
  // Convert BTC/USDT to BTCUSDT for Binance API
  const binanceSymbol = symbol.replace('/', '')

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
    'ETH/USDT': 'ethereum',
    'SOL/USDT': 'solana',
    'BNB/USDT': 'binancecoin',
    'XRP/USDT': 'ripple',
    'ADA/USDT': 'cardano',
    'DOGE/USDT': 'dogecoin',
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
    const symbol = symbolParts.symbol.join('/')
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
    const CRYPTO_BASE_CURRENCIES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI']
    const baseCurrency = symbol.includes('/') ? symbol.split('/')[0] : ''
    const isCryptoPair = isCrypto || CRYPTO_BASE_CURRENCIES.includes(baseCurrency)

    let quote

    if (source === 'Binance' || (isCryptoPair && (!source || source === 'auto'))) {
      // Crypto → try Binance first, then CoinGecko, then mock
      try {
        quote = await fetchBinance(symbol)
      } catch (binanceErr: any) {
        console.warn(`[exchange/quote] Binance failed for ${symbol}: ${binanceErr.message}, trying CoinGecko fallback`)
        try {
          quote = await fetchCoinGecko(symbol)
        } catch (cgErr: any) {
          console.warn(`[exchange/quote] CoinGecko also failed for ${symbol}: ${cgErr.message}, using mock data`)
          quote = getMockQuote(symbol)
        }
      }
    } else if (source === 'TwelveData' || (!isCryptoPair && (!source || source === 'auto'))) {
      // Stocks/forex/commodities → Twelve Data, then mock fallback
      try {
        quote = await fetchTwelveData(symbol)
      } catch (tdErr: any) {
        console.warn(`[exchange/quote] TwelveData failed for ${symbol}: ${tdErr.message}, using mock data`)
        quote = null
      }

      // If TwelveData returned null (no API key) or threw, use mock
      if (!quote) {
        quote = getMockQuote(symbol)
      }
    } else if (source === 'CoinGecko') {
      try {
        quote = await fetchCoinGecko(symbol)
      } catch {
        quote = getMockQuote(symbol)
      }
    } else {
      return NextResponse.json(
        { success: false, error: `مصدر غير معروف: ${source}` },
        { status: 400 }
      )
    }

    // Cache: 5s for crypto, 15s for stocks, 60s for mock data
    const ttl = quote.source === 'Demo' ? 60000 : (isCryptoPair ? 5000 : 15000)
    setCache(cacheKey, quote, ttl)

    return NextResponse.json({ success: true, data: quote })
  } catch (error: any) {
    console.error(`[exchange/quote] Error:`, error.message)
    // Even on unexpected errors, try to return mock data instead of 500
    try {
      const { symbol } = await params
      const mockQuote = getMockQuote(symbol)
      return NextResponse.json({ success: true, data: mockQuote, fallback: true })
    } catch {
      return NextResponse.json(
        { success: false, error: error.message || 'فشل في جلب بيانات السوق' },
        { status: 500 }
      )
    }
  }
}
