import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Unified symbol list with types
const SCANNER_SYMBOLS = [
  { sym: 'BTC/USD',  type: 'Crypto' },
  { sym: 'ETH/USD',  type: 'Crypto' },
  { sym: 'SOL/USD',  type: 'Crypto' },
  { sym: 'BNB/USD',  type: 'Crypto' },
  { sym: 'XRP/USD',  type: 'Crypto' },
  { sym: 'EUR/USD',  type: 'Forex'  },
  { sym: 'GBP/USD',  type: 'Forex'  },
  { sym: 'XAU/USD',  type: 'Forex'  },
  { sym: 'USD/JPY',  type: 'Forex'  },
  { sym: 'AAPL',     type: 'Stock'  },
  { sym: 'TSLA',     type: 'Stock'  },
  { sym: 'NVDA',     type: 'Stock'  },
]

// RSI calculation from historical closes
function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period
  }
  if (avgLoss === 0) return 100
  return 100 - (100 / (1 + avgGain / avgLoss))
}

// EMA calculation
function calculateEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] || 0
  const k = 2 / (period + 1)
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k)
  }
  return ema
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const filterType = searchParams.get('type') || 'All'
    const origin = new URL(req.url).origin

    const symbols = SCANNER_SYMBOLS.filter(s =>
      filterType === 'All' ? true : s.type === filterType
    )

    // Fetch real quotes + historical candles for each symbol
    const results = await Promise.allSettled(
      symbols.map(async ({ sym, type }) => {
        try {
          // Fetch real quote
          const quoteRes = await fetch(
            `${origin}/api/exchange/quote/${encodeURIComponent(sym)}`,
            { cache: 'no-store' }
          )
          const quoteJson = await quoteRes.json()
          if (!quoteJson.success || !quoteJson.data) return null
          const q = quoteJson.data

          // Fetch real candles for RSI/EMA
          let closes: number[] = []
          try {
            const histRes = await fetch(
              `${origin}/api/exchange/history/${encodeURIComponent(sym)}?interval=1h`,
              { cache: 'no-store' }
            )
            const histJson = await histRes.json()
            if (histJson.success && histJson.data) {
              closes = histJson.data.map((c: any) => c.close).reverse()
            }
          } catch { /* use empty closes, fallback to price-based signals */ }

          // Calculate real technical indicators
          const rsi = closes.length >= 15 ? Math.round(calculateRSI(closes)) : null
          const ema20 = closes.length >= 20 ? calculateEMA(closes, 20) : null
          const ema50 = closes.length >= 50 ? calculateEMA(closes, 50) : null
          const change = q.changePercent || 0
          const price = q.price || 0

          // Build sparkline from last 12 closes
          const sparkline = closes.length >= 12
            ? closes.slice(-12)
            : Array.from({ length: 12 }, (_, i) => price * (1 + (i - 6) * 0.002))

          // Determine AI score from real indicators
          let aiScore = 'Neutral'
          let aiColor = '#FFB800'
          let reasons: string[] = []
          let signalStrength = 50

          if (rsi !== null) {
            if (rsi < 30) {
              aiScore = 'Strong Buy'; aiColor = '#00FFC6'
              reasons.push(`Oversold (RSI: ${rsi})`)
              signalStrength += 25
            } else if (rsi < 45) {
              aiScore = 'Buy'; aiColor = '#00FFC6'
              reasons.push(`Low RSI (${rsi})`)
              signalStrength += 12
            } else if (rsi > 70) {
              aiScore = 'Strong Sell'; aiColor = '#FF4D4D'
              reasons.push(`Overbought (RSI: ${rsi})`)
              signalStrength += 25
            } else if (rsi > 58) {
              aiScore = 'Sell'; aiColor = '#FF4D4D'
              reasons.push(`High RSI (${rsi})`)
              signalStrength += 12
            }
          }

          if (ema20 !== null && ema50 !== null) {
            if (ema20 > ema50) {
              if (aiScore === 'Neutral') { aiScore = 'Buy'; aiColor = '#00FFC6' }
              reasons.push('EMA 20/50 Bullish Cross')
              signalStrength += 10
            } else {
              if (aiScore === 'Neutral') { aiScore = 'Sell'; aiColor = '#FF4D4D' }
              reasons.push('EMA 20/50 Bearish Cross')
              signalStrength += 10
            }
          }

          if (Math.abs(change) > 3) {
            reasons.push(`Strong Momentum (${change > 0 ? '+' : ''}${change.toFixed(1)}%)`)
            signalStrength += 10
          } else if (Math.abs(change) > 1) {
            reasons.push(`${change > 0 ? 'Bullish Trend' : 'Bearish Trend'} (${change.toFixed(1)}%)`)
            signalStrength += 5
          }

          return {
            symbol: sym,
            type,
            price,
            changePct: change,
            rsi: rsi ?? null,
            macd: ema20 && ema50 ? (ema20 - ema50).toFixed(4) : '0.00',
            aiScore,
            aiColor,
            volume: q.volume ? `${(q.volume / 1000000).toFixed(1)}M` : '—',
            sparkline,
            reasons: reasons.slice(0, 3),
            signalStrength: Math.min(95, signalStrength),
            source: q.source || 'Live',
          }
        } catch {
          return null
        }
      })
    )

    const data = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .sort((a, b) => b.signalStrength - a.signalStrength)

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
