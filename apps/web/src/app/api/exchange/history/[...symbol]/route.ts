import { NextRequest, NextResponse } from 'next/server'
import { CRYPTO_BASES, BINANCE_URLS, BINANCE_INTERVALS, BINANCE_US_REST, BINANCE_REST_ENDPOINTS } from '../../../../../lib/charts/config'

function normalizeRouteSymbol(parts: string[] | string) {
  const joined = Array.isArray(parts) ? parts.join('/') : parts
  try {
    return decodeURIComponent(joined)
  } catch {
    return joined
  }
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── Data Quality Check ──
// FIX: Only EXACTLY flat candles (O=H=L=C, range=0) indicate bad data.
// Real Binance 1m candles have small ranges ($0.01 on $73K BTC) which is
// valid micro-consolidation — NOT bad data. Previous threshold of 0.05%
// rejected 73.8% of good Binance 1m data, falling back to worse sources.
function flatCandleRatio(candles: any[]): number {
  if (candles.length === 0) return 1
  // A candle is "flat" ONLY if all OHLC values are identical (range = 0)
  const flat = candles.filter(c => {
    return c.open === c.high && c.high === c.low && c.low === c.close
  }).length
  return flat / candles.length
}

// FIX: Maximum acceptable ratio of exactly-flat candles. Only Binance.us
// and truly illiquid endpoints produce candles where O=H=L=C.
const MAX_FLAT_CANDLE_RATIO = 0.5

// ── In-memory cache for history ──
const historyCache = new Map<string, { data: any; expiresAt: number }>()

function getCachedHistory(key: string): any | null {
  const entry = historyCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    historyCache.delete(key)
    return null
  }
  return entry.data
}

function setCachedHistory(key: string, data: any, ttlMs: number) {
  historyCache.set(key, { data, expiresAt: Date.now() + ttlMs })
  // Prune old entries
  if (historyCache.size > 100) {
    const now = Date.now()
    for (const [k, v] of historyCache) {
      if (now > v.expiresAt) historyCache.delete(k)
    }
  }
}

// ── CoinGecko OHLCV chart data (free, no key needed) ──
// Returns up to 365 days of daily OHLCV data
async function fetchCoinGeckoHistory(symbol: string, interval: string): Promise<any[] | null> {
  const coinMap: Record<string, string> = {
    'BTC/USDT': 'bitcoin', 'BTC/USD': 'bitcoin',
    'ETH/USDT': 'ethereum', 'ETH/USD': 'ethereum',
    'SOL/USDT': 'solana', 'SOL/USD': 'solana',
    'BNB/USDT': 'binancecoin', 'BNB/USD': 'binancecoin',
    'XRP/USDT': 'ripple', 'XRP/USD': 'ripple',
    'ADA/USDT': 'cardano', 'ADA/USD': 'cardano',
    'DOGE/USDT': 'dogecoin', 'DOGE/USD': 'dogecoin',
    'AVAX/USDT': 'avalanche-2', 'AVAX/USD': 'avalanche-2',
    'DOT/USDT': 'polkadot', 'DOT/USD': 'polkadot',
    'LINK/USDT': 'chainlink', 'LINK/USD': 'chainlink',
  }
  const coinId = coinMap[symbol]
  if (!coinId) return null

  // CoinGecko OHLCV chart endpoint: /coins/{id}/ohlc
  // days: 1, 7, 14, 30, 90, 180, 365
  const daysMap: Record<string, string> = {
    '1s': '1', '5s': '1', '15s': '1', '30s': '1', // seconds → 1 day
    '1m': '1', '5m': '1', '15m': '1', '15min': '1',
    '30m': '1', '1h': '7', '2h': '14', '4h': '30',
    '1day': '90', '1d': '90', '1week': '180', '1w': '180',
    '1month': '365', '1M': '365', '3month': '365', '3M': '365',
  }
  const days = daysMap[interval] || '90'

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn(`[exchange/history] CoinGecko OHLC returned ${res.status} for ${coinId}`)
      return null
    }

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    // CoinGecko OHLCV format: [[timestamp, open, high, low, close], ...]
    return data.map((c: number[]) => ({
      symbol,
      timestamp: new Date(c[0]).toISOString(),
      datetime: new Date(c[0]).toISOString().split('T')[0],
      open: toNum(c[1]),
      high: toNum(c[2]),
      low: toNum(c[3]),
      close: toNum(c[4]),
      volume: 0, // CoinGecko OHLC doesn't include volume
      source: 'CoinGecko',
    }))
  } catch (error: any) {
    console.warn(`[exchange/history] CoinGecko OHLC failed for ${symbol}: ${error.message}`)
    return null
  }
}

// ── Yahoo Finance historical data for crypto (free, no key needed) ──
async function fetchYahooCryptoHistory(symbol: string, interval: string): Promise<any[] | null> {
  const yahooCryptoMap: Record<string, string> = {
    'BTC/USD': 'BTC-USD', 'BTC/USDT': 'BTC-USD',
    'ETH/USD': 'ETH-USD', 'ETH/USDT': 'ETH-USD',
    'SOL/USD': 'SOL-USD', 'SOL/USDT': 'SOL-USD',
    'BNB/USD': 'BNB-USD', 'BNB/USDT': 'BNB-USD',
    'XRP/USD': 'XRP-USD', 'XRP/USDT': 'XRP-USD',
    'ADA/USD': 'ADA-USD', 'ADA/USDT': 'ADA-USD',
    'DOGE/USD': 'DOGE-USD', 'DOGE/USDT': 'DOGE-USD',
    'AVAX/USD': 'AVAX-USD', 'AVAX/USDT': 'AVAX-USD',
    'DOT/USD': 'DOT-USD', 'DOT/USDT': 'DOT-USD',
    'LINK/USD': 'LINK-USD', 'LINK/USDT': 'LINK-USD',
  }

  const yahooSymbol = yahooCryptoMap[symbol]
  if (!yahooSymbol) return null

  const rangeMap: Record<string, string> = {
    '1s': '1d', '5s': '1d', '15s': '1d', '30s': '1d', // seconds → 1 day
    '1m': '1d', '5m': '5d', '15m': '10d', '15min': '10d', '30m': '1mo',
    '1h': '1mo', '2h': '3mo', '4h': '3mo', '1day': '6mo', '1d': '6mo',
    '1week': '1y', '1w': '1y', '1month': '2y', '1M': '2y', '3month': '2y', '3M': '2y',
  }
  const yahooRange = rangeMap[interval] || '6mo'

  const yIntervalMap: Record<string, string> = {
    '1s': '1m', '5s': '1m', '15s': '1m', '30s': '1m', // seconds → 1m
    '1m': '1m', '5m': '5m', '15m': '15m', '15min': '15m', '30m': '30m',
    '1h': '1h', '2h': '1h', '4h': '1d', '1day': '1d', '1d': '1d',
    '1week': '1wk', '1w': '1wk', '1month': '1mo', '1M': '1mo', '3month': '1mo', '3M': '1mo',
  }
  const yInterval = yIntervalMap[interval] || '1d'

  try {
    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${yahooRange}&interval=${yInterval}`
    const yRes = await fetch(yUrl, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!yRes.ok) return null

    const yData = await yRes.json()
    const result = yData?.chart?.result?.[0]
    if (!result) return null

    const timestamps = result.timestamp || []
    const quote = result.indicators?.quote?.[0] || {}
    const opens = quote.open || []
    const highs = quote.high || []
    const lows = quote.low || []
    const closes = quote.close || []
    const volumes = quote.volume || []

    const candles: any[] = []
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        candles.push({
          symbol,
          timestamp: new Date(timestamps[i] * 1000).toISOString(),
          datetime: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: toNum(opens[i]), high: toNum(highs[i]), low: toNum(lows[i]),
          close: toNum(closes[i]), volume: toNum(volumes[i]),
          source: 'Yahoo Finance',
        })
      }
    }
    return candles.length > 0 ? candles : null
  } catch (error: any) {
    console.warn(`[exchange/history] Yahoo Finance crypto failed for ${symbol}: ${error.message}`)
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string[] }> }
) {
  try {
    const symbolParts = await params
    const symbol = normalizeRouteSymbol(symbolParts.symbol)
    const url = request.nextUrl
    const interval = url.searchParams.get('interval') || '1day'
    const source = url.searchParams.get('source')

    // Check cache first
    const cacheKey = `history:${symbol}:${interval}`
    const cached = getCachedHistory(cacheKey)
    if (cached) {
      return NextResponse.json({ success: true, data: cached, cached: true })
    }

    // Determine if this is a crypto pair
    const quoteCurrency = symbol.includes('/') ? symbol.split('/')[1] : ''
    const CRYPTO_QUOTE_CURRENCIES = ['USDT', 'BUSD', 'USD'] // Crypto can use USD too
    const baseCurrency = symbol.includes('/') ? symbol.split('/')[0] : ''
    const isCryptoPair = (symbol.includes('/') && CRYPTO_QUOTE_CURRENCIES.includes(quoteCurrency) && CRYPTO_BASES.has(baseCurrency)) || (!symbol.includes('/') && CRYPTO_BASES.has(symbol))

    const intervalMap = BINANCE_INTERVALS

    if (isCryptoPair) {
      // ── Crypto History: NestJS ExchangeService → Binance → CoinGecko → Yahoo Finance ──
      let candles: any[] | null = null

      // Step 0: NestJS backend SKIPPED — it's not deployed and wastes 6 seconds
      // on every request with a timeout. Binance direct API is fast and reliable.
      // To re-enable, deploy NestJS ExchangeGateway and set NESTJS_API_URL.

      // Step 1: Try Binance directly (fastest, most detailed)
      // FIX: Use multiple Binance REST endpoints (api1-4, data-api.binance.vision)
      // because api.binance.com may be geo-blocked on cloud servers (Railway, AWS, etc).
      // Binance.us has extremely low liquidity (65%+ flat 1m candles) and is used
      // only as the very last resort with a quality check.
      try {
        let normalizedSymbol = symbol
        if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT') && !symbol.endsWith('/BUSD')) {
          const base = symbol.split('/')[0]
          if (CRYPTO_BASES.has(base)) {
            normalizedSymbol = `${base}/USDT`
          }
        }
        const binanceSymbol = normalizedSymbol.replace('/', '')
        const binanceInterval = intervalMap[interval] || '1d'
        const limit = 1000

        // FIX: Build endpoint list with all Binance alternatives + quality check.
        // Order: api.binance.com → api1-4 → data-api.binance.vision → binance.us (last resort)
        const binanceEndpoints = [
          ...BINANCE_REST_ENDPOINTS.map(base => `${base}/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`),
          `${BINANCE_US_REST}/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`,
        ]

        for (const bUrl of binanceEndpoints) {
          try {
            const res = await fetch(bUrl, {
              signal: AbortSignal.timeout(8000),
              headers: { 'Accept': 'application/json' },
            })
            if (res.ok) {
              const data = await res.json()
              if (Array.isArray(data) && data.length > 0) {
                const mapped = data.map((c: any[]) => ({
                  symbol,
                  timestamp: new Date(c[0]).toISOString(),
                  datetime: new Date(c[0]).toISOString(),
                  open: toNum(c[1]), high: toNum(c[2]), low: toNum(c[3]), close: toNum(c[4]), volume: toNum(c[5]),
                  source: 'Binance',
                }))
                // FIX: Quality check — reject data with too many flat candles.
                // Binance.us returns 65%+ flat candles on 1m/5m due to low liquidity.
                // This causes candles to render as dots on the chart.
                const flatRatio = flatCandleRatio(mapped)
                if (flatRatio > MAX_FLAT_CANDLE_RATIO) {
                  console.warn(`[exchange/history] Rejected ${bUrl.split('/api')[0]} — ${Math.round(flatRatio * 100)}% flat candles (> ${MAX_FLAT_CANDLE_RATIO * 100}% threshold)`)
                  continue // Try next endpoint
                }
                candles = mapped
                break // Got quality data, no need to try next endpoint
              }
            }
          } catch {
            // Try next endpoint
          }
        }
      } catch (e: any) {
        console.warn(`[exchange/history] Binance failed for ${symbol}: ${e.message}`)
      }

      // Step 2: Try CoinGecko OHLCV (free, no key needed)
      if (!candles || candles.length === 0) {
        const cgCandles = await fetchCoinGeckoHistory(symbol, interval)
        if (cgCandles && cgCandles.length > 0) {
          candles = cgCandles
          console.info(`[exchange/history] Using CoinGecko for ${symbol}`)
        }
      }

      // Step 3: Try Yahoo Finance for crypto (free, no key needed)
      if (!candles || candles.length === 0) {
        const yCandles = await fetchYahooCryptoHistory(symbol, interval)
        if (yCandles && yCandles.length > 0) {
          candles = yCandles
          console.info(`[exchange/history] Using Yahoo Finance for ${symbol}`)
        }
      }

      // Return whatever we have (even empty) — never throw 500
      if (candles && candles.length > 0) {
        // Cache: 60s for intraday, 5min for daily+
        const ttl = ['1day', '1d', '1week', '1w', '1month', '1M'].includes(interval) ? 300_000 : 60_000
        setCachedHistory(cacheKey, candles, ttl)
        return NextResponse.json({ success: true, data: candles })
      }

      return NextResponse.json({
        success: true,
        data: [],
        source: 'Demo',
        note: 'جميع مصادر البيانات التاريخية غير متاحة حالياً'
      })
    }

    // ── Non-crypto History: TwelveData → Yahoo Finance → Frankfurter ──
    const apiKey = process.env.TWELVE_DATA_API_KEY

    // Step 1: Try TwelveData (if API key available)
    if (apiKey) {
      try {
        const tdIntervalMap: Record<string, string> = {
          '1s': '1min', '5s': '1min', '15s': '1min', '30s': '1min', // seconds → 1min (min)
          '1m': '1min', '5m': '5min', '15m': '15min', '15min': '15min',
          '30min': '30min', '30m': '30min', '2h': '2h', '4h': '4h',
          '1h': '1h', '1d': '1day', '1day': '1day',
          '1week': '1week', '1w': '1week', '1month': '1month', '1M': '1month',
          '3month': '3month', '3M': '3month',
        }
        const tdInterval = tdIntervalMap[interval] || interval

        const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${tdInterval}&outputsize=1000&apikey=${apiKey}`
        const res = await fetch(tdUrl, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) })
        if (res.ok) {
          const data = await res.json()
          if (data.status !== 'error' && data.values && data.values.length > 0) {
            const candles = (data.values || []).map((c: any) => ({
              symbol,
              timestamp: c.datetime,
              datetime: c.datetime,
              open: toNum(c.open), high: toNum(c.high), low: toNum(c.low), close: toNum(c.close), volume: toNum(c.volume),
              source: 'TwelveData',
            }))
            setCachedHistory(cacheKey, candles, 300_000)
            return NextResponse.json({ success: true, data: candles })
          }
        }
      } catch (e: any) {
        console.warn(`[exchange/history] TwelveData failed for ${symbol}: ${e.message}`)
      }
    }

    // Step 2: Yahoo Finance (free, covers stocks, forex, commodities)
    try {
      // For commodities, use futures symbols (more reliable on cloud servers)
      const COMMODITY_FUTURES: Record<string, string> = {
        'XAU/USD': 'GC=F',   // Gold Futures
        'XAG/USD': 'SI=F',   // Silver Futures
        'XPT/USD': 'PL=F',   // Platinum Futures
      }
      const yahooSymbol = COMMODITY_FUTURES[symbol] || (symbol.includes('/')
        ? `${symbol.split('/')[0]}${symbol.split('/')[1]}=X`
        : symbol)

      const rangeMap: Record<string, string> = {
        '1s': '1d', '5s': '1d', '15s': '1d', '30s': '1d', // seconds → 1 day
        '1m': '1d', '5m': '5d', '15m': '10d', '15min': '10d', '30m': '1mo',
        '1h': '1mo', '2h': '3mo', '4h': '3mo', '1day': '6mo', '1d': '6mo',
        '1week': '1y', '1w': '1y', '1month': '2y', '1M': '2y', '3month': '2y', '3M': '2y',
      }
      const yahooRange = rangeMap[interval] || '6mo'

      const yIntervalMap: Record<string, string> = {
        '1s': '1m', '5s': '1m', '15s': '1m', '30s': '1m', // seconds → 1m
        '1m': '1m', '5m': '5m', '15m': '15m', '15min': '15m', '30m': '30m',
        '1h': '1h', '2h': '1h', '4h': '1d', '1day': '1d', '1d': '1d',
        '1week': '1wk', '1w': '1wk', '1month': '1mo', '1M': '1mo', '3month': '1mo', '3M': '1mo',
      }
      const yInterval = yIntervalMap[interval] || '1d'

      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${yahooRange}&interval=${yInterval}`
      const yRes = await fetch(yUrl, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })

      if (yRes.ok) {
        const yData = await yRes.json()
        const result = yData?.chart?.result?.[0]
        if (result) {
          const timestamps = result.timestamp || []
          const quote = result.indicators?.quote?.[0] || {}
          const opens = quote.open || []
          const highs = quote.high || []
          const lows = quote.low || []
          const closes = quote.close || []
          const volumes = quote.volume || []

          const candles: any[] = []
          for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] !== null && closes[i] !== undefined) {
              candles.push({
                symbol,
                timestamp: new Date(timestamps[i] * 1000).toISOString(),
                datetime: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
                open: toNum(opens[i]), high: toNum(highs[i]), low: toNum(lows[i]),
                close: toNum(closes[i]), volume: toNum(volumes[i]),
                source: 'Yahoo Finance',
              })
            }
          }
          if (candles.length > 0) {
            setCachedHistory(cacheKey, candles, 300_000)
            return NextResponse.json({ success: true, data: candles })
          }
        }
      }
    } catch (e: any) {
      console.warn(`[exchange/history] Yahoo Finance failed for ${symbol}: ${e.message}`)
    }

    // Step 3: Frankfurter for forex (ECB official rates, free, no key)
    try {
      const [base, quote] = symbol.includes('/') ? symbol.split('/') : [symbol, 'USD']
      const fiatCurrencies = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK', 'DKK'])
      if (fiatCurrencies.has(base) && fiatCurrencies.has(quote)) {
        const endDate = new Date()
        const startDate = new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000)
        const fUrl = `https://api.frankfurter.dev/v1/${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}?from=${base}&to=${quote}`
        const fRes = await fetch(fUrl, { signal: AbortSignal.timeout(10000) })

        if (fRes.ok) {
          const fData = await fRes.json()
          if (fData.rates) {
            const candles: any[] = []
            for (const [dateStr, rates] of Object.entries(fData.rates)) {
              const price = parseFloat((rates as any)[quote] || '0')
              if (price > 0) {
                candles.push({
                  symbol,
                  timestamp: dateStr,
                  datetime: dateStr,
                  open: price, high: price, low: price, close: price, volume: 0,
                  source: 'ECB/Frankfurter',
                })
              }
            }
            if (candles.length > 0) {
              setCachedHistory(cacheKey, candles, 3_600_000)
              return NextResponse.json({ success: true, data: candles })
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[exchange/history] Frankfurter failed for ${symbol}: ${e.message}`)
    }

    // Step 4: ExchangeRate-API for forex (free, no key, works on cloud servers)
    try {
      const [base, quote] = symbol.includes('/') ? symbol.split('/') : [symbol, 'USD']
      const fiatCurrencies = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK', 'DKK', 'ZAR', 'HKD', 'SGD', 'MXN', 'PLN', 'CZK', 'HUF', 'TRY', 'KRW', 'BRL', 'CNY', 'INR', 'RUB', 'SEK', 'NOK'])
      if (fiatCurrencies.has(base) && fiatCurrencies.has(quote)) {
        const erUrl = `https://open.er-api.com/v6/latest/${base}`
        const erRes = await fetch(erUrl, { signal: AbortSignal.timeout(10000) })
        if (erRes.ok) {
          const erData = await erRes.json()
          if (erData.result === 'success' && erData.rates && erData.rates[quote]) {
            const rate = erData.rates[quote]
            if (rate > 0) {
              // ExchangeRate-API only provides current rate, not historical
              // Create a single-candle response with the current rate
              const candles: any[] = [{
                symbol,
                timestamp: new Date(erData.time_last_update_unix * 1000).toISOString(),
                datetime: new Date(erData.time_last_update_unix * 1000).toISOString().split('T')[0],
                open: rate, high: rate, low: rate, close: rate, volume: 0,
                source: 'ExchangeRate-API',
              }]
              setCachedHistory(cacheKey, candles, 3_600_000)
              console.info(`[exchange/history] Using ExchangeRate-API for ${symbol} (current rate only)`)  
              return NextResponse.json({ success: true, data: candles })
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[exchange/history] ExchangeRate-API failed for ${symbol}: ${e.message}`)
    }

    // All sources failed — return empty array instead of 500 error
    return NextResponse.json({
      success: true,
      data: [],
      source: 'Demo',
      note: 'جميع مصادر البيانات التاريخية غير متاحة حالياً'
    })
  } catch (error: any) {
    console.error('[exchange/history] Error:', error.message)
    // Return empty data instead of 500 error to prevent dashboard crash
    return NextResponse.json({
      success: true,
      data: [],
      source: 'Demo',
      note: 'حدث خطأ أثناء جلب البيانات التاريخية'
    })
  }
}
