import { NextRequest, NextResponse } from 'next/server'

// ── Known crypto base currencies (used for symbol normalization) ──
const CRYPTO_BASE_CURRENCIES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI']

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
    const symbol = symbolParts.symbol.join('/')
    const url = request.nextUrl
    const interval = url.searchParams.get('interval') || '1day'
    const source = url.searchParams.get('source')

    // Determine if this is a crypto pair or forex pair
    const quoteCurrency = symbol.includes('/') ? symbol.split('/')[1] : ''
    const CRYPTO_QUOTE_CURRENCIES = ['USDT', 'BUSD']
    const baseCurrency = symbol.includes('/') ? symbol.split('/')[0] : ''
    const isCryptoPair = CRYPTO_QUOTE_CURRENCIES.includes(quoteCurrency) || CRYPTO_BASE_CURRENCIES.includes(baseCurrency)

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
      const intervalMap: Record<string, string> = {
        '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m',
        '1h': '1h', '2h': '2h', '4h': '4h', '1day': '1d', '1week': '1w', '1month': '1M',
      }
      const binanceInterval = intervalMap[interval] || '1d'
      const limit = 30

      const bUrl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binanceSymbol)}&interval=${binanceInterval}&limit=${limit}`
      const res = await fetch(bUrl, { next: { revalidate: 60 } })

      if (!res.ok) {
        throw new Error(`Binance API returned ${res.status}`)
      }

      const data = await res.json()
      const candles = data.map((c: any[]) => ({
        symbol,
        timestamp: new Date(c[0]).toISOString(),
        open: toNum(c[1]),
        high: toNum(c[2]),
        low: toNum(c[3]),
        close: toNum(c[4]),
        volume: toNum(c[5]),
        source: 'Binance',
      }))

      return NextResponse.json({ success: true, data: candles })
    }

    // Stocks/forex → Twelve Data
    const apiKey = process.env.TWELVE_DATA_API_KEY
    if (!apiKey) {
      // Return empty data instead of 500 error when API key is missing
      return NextResponse.json({ success: true, data: [], source: 'Demo', note: 'TWELVE_DATA_API_KEY not configured' })
    }

    const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=30&apikey=${apiKey}`
    const res = await fetch(tdUrl, { next: { revalidate: 300 } })

    if (!res.ok) {
      throw new Error(`Twelve Data API returned ${res.status}`)
    }

    const data = await res.json()

    if (data.status === 'error') {
      throw new Error(data.message || 'Twelve Data API error')
    }

    const candles = (data.values || []).map((c: any) => ({
      symbol,
      timestamp: c.datetime,
      open: toNum(c.open),
      high: toNum(c.high),
      low: toNum(c.low),
      close: toNum(c.close),
      volume: toNum(c.volume),
      source: 'TwelveData',
    }))

    return NextResponse.json({ success: true, data: candles })
  } catch (error: any) {
    console.error('[exchange/history] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب البيانات التاريخية' },
      { status: 500 }
    )
  }
}
