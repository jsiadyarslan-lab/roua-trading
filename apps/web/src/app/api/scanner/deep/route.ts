import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SCANNER_API_BASE || 'http://127.0.0.1:3001'

export async function GET(req: NextRequest) {
  try {
    const symbol = req.nextUrl.searchParams.get('symbol')
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Missing symbol parameter' }, { status: 400 })
    }

    const res = await fetch(`${API_BASE}/api/scanner/analysis/${encodeURIComponent(symbol)}`, {
      next: { revalidate: 120 },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const backendData = await res.json()

    // Transform backend data to frontend shape
    const d = backendData
    const data = {
      symbol: d.symbol,
      name: d.name,
      category: d.category,
      price: d.quote?.price ?? 0,
      changePercent: d.quote?.changePercent ?? 0,
      direction: d.signal?.direction ?? 'NEUTRAL',
      signalClass: d.signal?.signalClass ?? 'WATCH',
      confidence: d.signal?.confidence ?? 0,
      marketOpen: d.marketOpen ?? true,
      smartScore: d.smartScore ?? null,
      indicators: d.technical ?? {},
      ichimoku: d.ichimoku ?? null,
      cci: d.cci ?? null,
      sar: d.sar ?? null,
      obv: d.obv ?? null,
      vwap: d.technical?.vwapPosition ? { value: 0, position: d.technical.vwapPosition } : null,
      fibonacci: d.fibonacci ?? [],
      support: (d.supportResistance ?? []).filter((l: any) => l.type === 'SUPPORT').map((l: any) => ({ price: l.price, strength: l.strength })),
      resistance: (d.supportResistance ?? []).filter((l: any) => l.type === 'RESISTANCE').map((l: any) => ({ price: l.price, strength: l.strength })),
      patterns: d.patterns ?? [],
      candlePatterns: d.candlePatterns ?? [],
      aiAnalysis: d.aiAnalysis ? {
        model: d.aiModel ?? 'AI',
        sentiment: d.aiSentiment ?? 'NEUTRAL',
        riskLevel: d.riskLevel ?? 'MEDIUM',
        analysisAr: d.aiAnalysis,
      } : null,
      signal: d.signal ? {
        direction: d.signal.direction,
        entry: d.signal.entryPrice ?? 0,
        tp: d.signal.takeProfit ?? 0,
        sl: d.signal.stopLoss ?? 0,
        reasons: d.signal.reasonsAr ?? d.signal.reasons ?? [],
        reasonsAr: d.signal.reasonsAr ?? [],
        timeframe: d.smartScore?.tradeTimeframe ?? 'DAY',
      } : null,
      volumeProfile: d.volumeProfile ?? null,
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[scanner/deep] Error:', error?.message)
    return NextResponse.json({ success: false, error: error?.message })
  }
}
