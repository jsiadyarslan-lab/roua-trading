import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MATRIX_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD',
  'EUR/USD', 'GBP/USD', 'XAU/USD', 'USD/JPY',
]

// Pearson correlation coefficient
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 5) return 0

  const xa = a.slice(-n), xb = b.slice(-n)
  const ma = xa.reduce((s, v) => s + v, 0) / n
  const mb = xb.reduce((s, v) => s + v, 0) / n
  const num = xa.reduce((s, v, i) => s + (v - ma) * (xb[i] - mb), 0)
  const da  = Math.sqrt(xa.reduce((s, v) => s + (v - ma) ** 2, 0))
  const db  = Math.sqrt(xb.reduce((s, v) => s + (v - mb) ** 2, 0))
  if (da === 0 || db === 0) return 0
  return num / (da * db)
}

// Compute daily log returns from close prices
function logReturns(closes: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i-1] > 0) {
      r.push(Math.log(closes[i] / closes[i-1]))
    }
  }
  return r
}

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin
    const customSymbols = new URL(req.url).searchParams.get('symbols')
    const symbols = customSymbols ? customSymbols.split(',').slice(0, 10) : MATRIX_SYMBOLS

    // Fetch historical data for all symbols
    const histData: Record<string, number[]> = {}

    await Promise.allSettled(
      symbols.map(sym =>
        fetch(`${origin}/api/exchange/history/${encodeURIComponent(sym)}?interval=1d`)
          .then(r => r.json())
          .then(data => {
            if (data.success && data.data?.length >= 10) {
              histData[sym] = logReturns(data.data.map((c: any) => c.close))
            }
          })
          .catch(() => {})
      )
    )

    const available = symbols.filter(s => histData[s]?.length >= 5)
    if (available.length < 2) {
      return NextResponse.json({ success: false, error: 'Insufficient data for correlation' }, { status: 400 })
    }

    // Build correlation matrix
    const matrix: Record<string, Record<string, number>> = {}
    for (const s1 of available) {
      matrix[s1] = {}
      for (const s2 of available) {
        matrix[s1][s2] = s1 === s2 ? 1 : parseFloat(pearson(histData[s1], histData[s2]).toFixed(3))
      }
    }

    // Find strongest correlations and anti-correlations
    const pairs: { s1: string; s2: string; corr: number }[] = []
    for (let i = 0; i < available.length; i++) {
      for (let j = i + 1; j < available.length; j++) {
        pairs.push({ s1: available[i], s2: available[j], corr: matrix[available[i]][available[j]] })
      }
    }
    pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))

    return NextResponse.json({
      success: true,
      symbols: available,
      matrix,
      topCorrelated:  pairs.filter(p => p.corr > 0.6).slice(0, 5),
      topAntiCorrelated: pairs.filter(p => p.corr < -0.4).slice(0, 5),
      dataPoints: Math.min(...available.map(s => histData[s].length)),
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
