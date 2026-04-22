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
        const res = await fetch(`${origin}/api/exchange/quote/${s}`, { cache: 'no-store' })
        const data = await res.json()
        return data.success ? data.data : null
      } catch { return null }
    })
    
    const quotes = await Promise.all(quotePromises)
    
    for (let i = 0; i < SYMBOLS.length; i++) {
      const q = quotes[i]
      if (!q) continue
      
      const symbol = SYMBOLS[i]
      const change = q.changePercent || 0
      
      // Heuristic score based on real data
      let score = 0
      const reasons: string[] = []
      
      // 1. Momentum from 24h change
      if (change > 2) { score += 2; reasons.push('زخم صعودي قوي (24س)') }
      else if (change > 0.5) { score += 1; reasons.push('ميل صعودي') }
      else if (change < -2) { score -= 2; reasons.push('زخم هبوطي قوي (24س)') }
      else if (change < -0.5) { score -= 1; reasons.push('ميل هبوطي') }
      
      // 2. Volatility factor
      if (Math.abs(change) > 5) reasons.push('تقلبات عالية')
      
      // 3. Simple price level check (heuristic)
      if (q.low && q.price < q.low * 1.01) { score += 1; reasons.push('قريب من أدنى مستوى يومي') }
      if (q.high && q.price > q.high * 0.99) { score -= 1; reasons.push('قريب من أعلى مستوى يومي') }

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
