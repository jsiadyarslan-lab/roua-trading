import { NextRequest, NextResponse } from 'next/server'

// Simple tech indicator helpers
function calculateRSI(closes: number[], period = 14) {
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
    const gain = diff >= 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

const SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT',
  'EUR/USD', 'GBP/USD', 'USD/JPY',
  'AAPL', 'TSLA', 'NVDA', 'GOLD', 'OIL'
]

export async function GET(req: NextRequest) {
  try {
    const results: any[] = []
    const origin = req.nextUrl.origin
    
    // Fetch quotes for all symbols to get current price and 24h change
    const quotePromises = SYMBOLS.map(async (s) => {
      try {
        const res = await fetch(`${origin}/api/exchange/quote/${encodeURIComponent(s)}`, { cache: 'no-store' })
        const data = await res.json()
        
        // Let's also fetch historical candles for RSI
        let closes: number[] = []
        try {
           const histRes = await fetch(`${origin}/api/exchange/history/${encodeURIComponent(s)}?interval=1h`, { cache: 'no-store' })
           const histData = await histRes.json()
           if (histData.success && histData.data) {
             closes = histData.data.map((c: any) => c.close).reverse() // ensure chronological
           }
        } catch { }

        return { symbol: s, quote: data.success ? data.data : null, closes }
      } catch { return { symbol: s, quote: null, closes: [] } }
    })
    
    const fetchedData = await Promise.all(quotePromises)
    
    for (const item of fetchedData) {
      const q = item.quote
      if (!q) continue
      
      const symbol = item.symbol
      const change = q.changePercent || 0
      
      let score = 0
      const reasons: string[] = []
      
      // 1. Momentum from 24h change
      if (change > 2) { score += 1; reasons.push('زخم صعودي قوي (24س)') }
      else if (change > 0.5) { score += 0.5; reasons.push('ميل صعودي') }
      else if (change < -2) { score -= 1; reasons.push('زخم هبوطي قوي (24س)') }
      else if (change < -0.5) { score -= 0.5; reasons.push('ميل هبوطي') }
      
      // 2. RSI Factor
      if (item.closes.length >= 14) {
         const rsi = calculateRSI(item.closes)
         if (rsi < 30) { score += 2; reasons.push(`تشبع بيعي (RSI: ${Math.round(rsi)})`) }
         else if (rsi > 70) { score -= 2; reasons.push(`تشبع شرائي (RSI: ${Math.round(rsi)})`) }
      } else {
         // Fallback if no candles
         if (q.low && q.price < q.low * 1.01) { score += 1; reasons.push('قريب من أدنى مستوى يومي') }
         if (q.high && q.price > q.high * 0.99) { score -= 1; reasons.push('قريب من أعلى مستوى يومي') }
      }

      if (Math.abs(score) >= 1) {
        results.push({
          pair: symbol,
          dir: score > 0 ? 'buy' : 'sell',
          strength: Math.min(95, 50 + Math.abs(score) * 15),
          price: q.price,
          change,
          reasons: reasons.slice(0, 3)
        })
      }
    }

    return NextResponse.json({ success: true, data: results.sort((a,b) => b.strength - a.strength) })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
