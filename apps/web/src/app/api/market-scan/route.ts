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
    const { searchParams } = new URL(req.url)
    const targetPair = searchParams.get('pair')
    const timeframe = searchParams.get('tf') || '1h'
    
    const results: any[] = []
    const origin = req.nextUrl.origin
    
    // Symbols to scan: either the target pair or the default list
    const symbolsToScan = targetPair ? [targetPair] : SYMBOLS
    
    // Fetch quotes for selected symbols
    const quotePromises = symbolsToScan.map(async (s) => {
      try {
        const res = await fetch(`${origin}/api/exchange/quote/${encodeURIComponent(s)}`, { cache: 'no-store' })
        const data = await res.json()
        
        // Fetch historical candles for RSI based on timeframe
        let closes: number[] = []
        try {
           const histRes = await fetch(`${origin}/api/exchange/history/${encodeURIComponent(s)}?interval=${timeframe}`, { cache: 'no-store' })
           const histData = await histRes.json()
           if (histData.success && histData.data) {
             closes = histData.data.map((c: any) => c.close)
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
      
      // 1. Momentum factor
      if (change > 2) { score += 1; reasons.push('زخم صعودي قوي') }
      else if (change < -2) { score -= 1; reasons.push('زخم هبوطي قوي') }
      
      // 2. RSI Factor
      if (item.closes.length >= 14) {
         const rsi = calculateRSI(item.closes)
         if (rsi < 30) { score += 2.5; reasons.push(`تشبع بيعي (RSI: ${Math.round(rsi)})`) }
         else if (rsi > 70) { score -= 2.5; reasons.push(`تشبع شرائي (RSI: ${Math.round(rsi)})`) }
         else if (rsi < 45) { score += 0.5; reasons.push('ميل صعودي') }
         else if (rsi > 55) { score -= 0.5; reasons.push('ميل هبوطي') }
      }

      // Add to results
      results.push({
        pair: symbol,
        dir: score > 0 ? 'buy' : score < 0 ? 'sell' : 'neutral',
        strength: Math.min(98, 50 + Math.abs(score) * 15),
        price: q.price,
        change,
        reasons: reasons.slice(0, 3)
      })
    }

    return NextResponse.json({ success: true, data: targetPair ? results : results.filter(r => Math.abs(r.strength - 50) > 10).sort((a,b) => b.strength - a.strength) })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
