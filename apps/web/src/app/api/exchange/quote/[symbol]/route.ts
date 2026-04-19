import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/exchange/quote/[symbol]
 *
 * Fetches real-time market quote for a given symbol.
 * Routes to the appropriate data provider:
 *   - Crypto pairs (BTC/USDT, ETH/USDT) → Binance public API
 *   - Everything else (stocks, forex, commodities) → Twelve Data API
 *
 * This replaces the need for the NestJS backend exchange service.
 * Includes in-memory caching to respect API rate limits.
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

// ── Fetch from Twelve Data API ──
async function fetchTwelveData(symbol: string) {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) {
    throw new Error('TWELVE_DATA_API_KEY is not configured')
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
    currency: symbol.split('/')[1] || 'USDT',
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
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params
    const source = request.nextUrl.searchParams.get('source')

    // Check cache first
    const cacheKey = `quote:${symbol}:${source || 'auto'}`
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true })
    }

    const isCrypto = symbol.includes('/')

    let quote

    if (source === 'Binance' || (isCrypto && (!source || source === 'auto'))) {
      // Crypto → try Binance first
      try {
        quote = await fetchBinance(symbol)
      } catch (binanceErr: any) {
        console.warn(`[exchange/quote] Binance failed for ${symbol}: ${binanceErr.message}, trying CoinGecko fallback`)
        try {
          quote = await fetchCoinGecko(symbol)
        } catch (cgErr: any) {
          throw new Error(`فشل في جلب بيانات ${symbol}: ${cgErr.message}`)
        }
      }
    } else if (source === 'TwelveData' || (!isCrypto && (!source || source === 'auto'))) {
      // Stocks/forex/commodities → Twelve Data
      quote = await fetchTwelveData(symbol)
    } else if (source === 'CoinGecko') {
      quote = await fetchCoinGecko(symbol)
    } else {
      return NextResponse.json(
        { success: false, error: `مصدر غير معروف: ${source}` },
        { status: 400 }
      )
    }

    // Cache: 5s for crypto, 15s for stocks
    const ttl = isCrypto ? 5000 : 15000
    setCache(cacheKey, quote, ttl)

    return NextResponse.json({ success: true, data: quote })
  } catch (error: any) {
    console.error(`[exchange/quote] Error:`, error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب بيانات السوق' },
      { status: 500 }
    )
  }
}
