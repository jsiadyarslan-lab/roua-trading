import { NextRequest, NextResponse } from 'next/server'

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

/**
 * GET /api/exchange/history/[symbol]
 * Fetches historical OHLCV data for a symbol.
 */

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string[] }> }
) {
  try {
    // Catch-all route: /api/exchange/history/BTC/USDT → symbol = ['BTC', 'USDT']
    const symbolParts = await params
    const symbol = normalizeRouteSymbol(symbolParts.symbol)
    const url = request.nextUrl
    const interval = url.searchParams.get('interval') || '1day'
    const source = url.searchParams.get('source')

    // Determine if this is a crypto pair or forex pair
    const quoteCurrency = symbol.includes('/') ? symbol.split('/')[1] : ''
    const CRYPTO_QUOTE_CURRENCIES = ['USDT', 'BUSD']
    const baseCurrency = symbol.includes('/') ? symbol.split('/')[0] : ''
    const isCryptoPair = CRYPTO_QUOTE_CURRENCIES.includes(quoteCurrency) || CRYPTO_BASE_CURRENCIES.includes(baseCurrency)

    const intervalMap: Record<string, string> = {
      '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m',
      '1h': '1h', '2h': '2h', '4h': '4h', '1day': '1d', '1week': '1w', '1month': '1M',
      '15m': '15m', '1d': '1d'
    }

    if (isCryptoPair) {
      // Normalize: BTC/USD → BTC/USDT for Binance (Binance uses USDT pairs)
      let normalizedSymbol = symbol
      if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT') && !symbol.endsWith('/BUSD')) {
        const base = symbol.split('/')[0]
        if (CRYPTO_BASE_CURRENCIES.includes(base)) {
          normalizedSymbol = `${base}/USDT`
        }
      }
      // Fetch from Binance
      const binanceSymbol = normalizedSymbol.replace('/', '')
      const binanceInterval = intervalMap[interval] || '1d'
      const limit = 200

      const bUrl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binanceSymbol)}&interval=${binanceInterval}&limit=${limit}`
      const res = await fetch(bUrl, { next: { revalidate: 60 } })

      if (!res.ok) throw new Error(`Binance API returned ${res.status}`)
      const data = await res.json()
      const candles = data.map((c: any[]) => ({
        symbol,
        timestamp: new Date(c[0]).toISOString(),
        datetime: new Date(c[0]).toISOString(),
        open: toNum(c[1]), high: toNum(c[2]), low: toNum(c[3]), close: toNum(c[4]), volume: toNum(c[5]),
        source: 'Binance',
      }))
      return NextResponse.json({ success: true, data: candles })
    }

    // Stocks/forex → Twelve Data, then Yahoo Finance fallback
    const apiKey = process.env.TWELVE_DATA_API_KEY

    // Try TwelveData first (if API key available)
    if (apiKey) {
      try {
        const tdIntervalMap: Record<string, string> = {
          '1m': '1min', '5m': '5min', '15m': '15min', '15min': '15min',
          '1h': '1h', '4h': '4h', '1d': '1day', '1day': '1day'
        }
        const tdInterval = tdIntervalMap[interval] || interval

        const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${tdInterval}&outputsize=200&apikey=${apiKey}`
        const res = await fetch(tdUrl, { next: { revalidate: 300 } })
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
            return NextResponse.json({ success: true, data: candles })
          }
        }
      } catch (e: any) {
        console.warn(`[exchange/history] TwelveData failed for ${symbol}: ${e.message}`)
      }
    }

    // Fallback: Yahoo Finance historical data (free, no key needed)
    try {
      const yahooSymbol = symbol.includes('/')
        ? `${symbol.split('/')[0]}${symbol.split('/')[1]}=X`
        : symbol
      
      // Determine range based on interval
      const rangeMap: Record<string, string> = {
        '1m': '1d', '5m': '5d', '15m': '10d', '30m': '1mo',
        '1h': '1mo', '2h': '3mo', '4h': '3mo', '1day': '6mo', '1d': '6mo',
        '1week': '1y', '1w': '1y', '1month': '2y', '1M': '2y',
      }
      const yahooRange = rangeMap[interval] || '6mo'
      
      // Yahoo Finance interval mapping
      const yIntervalMap: Record<string, string> = {
        '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
        '1h': '1h', '2h': '1h', '4h': '1d', '1day': '1d', '1d': '1d',
        '1week': '1wk', '1w': '1wk', '1month': '1mo', '1M': '1mo',
      }
      const yInterval = yIntervalMap[interval] || '1d'

      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${yahooRange}&interval=${yInterval}`
      const yRes = await fetch(yUrl, {
        next: { revalidate: 300 },
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
            return NextResponse.json({ success: true, data: candles })
          }
        }
      }
    } catch (e: any) {
      console.warn(`[exchange/history] Yahoo Finance failed for ${symbol}: ${e.message}`)
    }

    // All sources failed
    return NextResponse.json({
      success: true,
      data: [],
      source: 'Demo',
      note: 'جميع مصادر البيانات التاريخية غير متاحة حالياً'
    })
  } catch (error: any) {
    console.error('[exchange/history] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب البيانات التاريخية' },
      { status: 500 }
    )
  }
}
