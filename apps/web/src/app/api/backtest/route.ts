import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ──────────────────────────────────────────
// BACKTESTING ENGINE — Server-side
// Fetches real historical data and simulates strategy execution
// ──────────────────────────────────────────

function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    return slice.reduce((a, b) => a + b, 0) / period
  })
}

function calcEMA(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const result: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period) return result

  // Seed with SMA
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  result[period - 1] = ema

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k)
    result[i] = ema
  }
  return result
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length <= period) return result

  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) avgGain += diff
    else avgLoss -= diff
  }
  avgGain /= period
  avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

// Simulate a strategy on OHLCV candles
function runBacktest(
  candles: { open: number; high: number; low: number; close: number; datetime: string }[],
  strategy: string,
  params: { fastPeriod?: number; slowPeriod?: number; rsiPeriod?: number; rsiOB?: number; rsiOS?: number; initialCapital?: number; riskPct?: number }
) {
  const capital = params.initialCapital ?? 10000
  const riskPct = (params.riskPct ?? 2) / 100
  const closes  = candles.map(c => c.close)

  let signals: { index: number; type: 'BUY' | 'SELL'; price: number; date: string }[] = []

  if (strategy === 'EMA_CROSSOVER') {
    const fast = calcEMA(closes, params.fastPeriod ?? 9)
    const slow = calcEMA(closes, params.slowPeriod ?? 21)

    for (let i = 1; i < closes.length; i++) {
      if (!fast[i] || !slow[i] || !fast[i-1] || !slow[i-1]) continue
      if (fast[i-1]! <= slow[i-1]! && fast[i]! > slow[i]!) {
        signals.push({ index: i, type: 'BUY',  price: candles[i].open, date: candles[i].datetime })
      } else if (fast[i-1]! >= slow[i-1]! && fast[i]! < slow[i]!) {
        signals.push({ index: i, type: 'SELL', price: candles[i].open, date: candles[i].datetime })
      }
    }
  } else if (strategy === 'RSI') {
    const rsi = calcRSI(closes, params.rsiPeriod ?? 14)
    const ob = params.rsiOB ?? 70
    const os = params.rsiOS ?? 30

    let inTrade = false
    for (let i = 1; i < closes.length; i++) {
      if (!rsi[i] || !rsi[i-1]) continue
      if (!inTrade && rsi[i-1]! >= os && rsi[i]! < os) {
        signals.push({ index: i, type: 'BUY',  price: candles[i].open, date: candles[i].datetime })
        inTrade = true
      } else if (inTrade && rsi[i-1]! <= ob && rsi[i]! > ob) {
        signals.push({ index: i, type: 'SELL', price: candles[i].open, date: candles[i].datetime })
        inTrade = false
      }
    }
  } else if (strategy === 'SMA_CROSSOVER') {
    const fast = calcSMA(closes, params.fastPeriod ?? 10)
    const slow = calcSMA(closes, params.slowPeriod ?? 30)

    for (let i = 1; i < closes.length; i++) {
      if (!fast[i] || !slow[i] || !fast[i-1] || !slow[i-1]) continue
      if (fast[i-1]! <= slow[i-1]! && fast[i]! > slow[i]!) {
        signals.push({ index: i, type: 'BUY',  price: candles[i].open, date: candles[i].datetime })
      } else if (fast[i-1]! >= slow[i-1]! && fast[i]! < slow[i]!) {
        signals.push({ index: i, type: 'SELL', price: candles[i].open, date: candles[i].datetime })
      }
    }
  }

  // Simulate trades
  let equity = capital
  let position: { price: number; qty: number; entryIdx: number } | null = null
  const trades: any[] = []
  const equityCurve: { date: string; equity: number }[] = [{ date: candles[0]?.datetime ?? '', equity }]

  for (const sig of signals) {
    if (sig.type === 'BUY' && !position) {
      const qty = (equity * riskPct) / sig.price
      position = { price: sig.price, qty, entryIdx: sig.index }
    } else if (sig.type === 'SELL' && position) {
      const pnl = (sig.price - position.price) * position.qty
      equity += pnl
      trades.push({
        entry: position.price, exit: sig.price, qty: position.qty,
        pnl, pnlPct: ((sig.price - position.price) / position.price) * 100,
        entryDate: candles[position.entryIdx]?.datetime,
        exitDate: sig.date, isWin: pnl > 0,
      })
      equityCurve.push({ date: sig.date, equity })
      position = null
    }
  }

  // Close any open position at last candle
  if (position) {
    const lastPrice = closes[closes.length - 1]
    const pnl = (lastPrice - position.price) * position.qty
    equity += pnl
    trades.push({
      entry: position.price, exit: lastPrice, qty: position.qty,
      pnl, pnlPct: ((lastPrice - position.price) / position.price) * 100,
      entryDate: candles[position.entryIdx]?.datetime,
      exitDate: candles[candles.length - 1]?.datetime, isWin: pnl > 0,
      isOpen: true,
    })
    equityCurve.push({ date: candles[candles.length - 1]?.datetime ?? '', equity })
  }

  // Metrics
  const wins  = trades.filter(t => t.isWin)
  const losses = trades.filter(t => !t.isWin)
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0)
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0
  const avgWin  = wins.length  ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0
  const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0

  // Max drawdown
  let peak = capital, maxDrawdown = 0
  for (const { equity: eq } of equityCurve) {
    if (eq > peak) peak = eq
    const dd = (peak - eq) / peak
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  // Sharpe ratio (simplified, annualized assuming daily returns)
  const returns = equityCurve.slice(1).map((e, i) => (e.equity - equityCurve[i].equity) / equityCurve[i].equity)
  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1)
  const stdReturn = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / (returns.length || 1))
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0

  return {
    summary: {
      totalTrades: trades.length, winRate, totalPnl,
      finalEquity: equity, return: ((equity - capital) / capital) * 100,
      maxDrawdown: maxDrawdown * 100, profitFactor, sharpe,
      avgWin, avgLoss,
    },
    trades: trades.slice(-30), // last 30 trades for display
    equityCurve: equityCurve.slice(-50), // last 50 points
    signals: signals.slice(-20),
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { symbol, strategy, params, interval = '1h' } = body

    if (!symbol || !strategy) {
      return NextResponse.json({ success: false, error: 'symbol and strategy are required' }, { status: 400 })
    }

    // Fetch historical data
    const origin = new URL(req.url).origin
    const histRes = await fetch(`${origin}/api/exchange/history/${encodeURIComponent(symbol)}?interval=${interval}`)
    const histData = await histRes.json()

    if (!histData.success || !histData.data?.length) {
      return NextResponse.json({ success: false, error: `No historical data for ${symbol}` }, { status: 400 })
    }

    const candles = histData.data.map((c: any) => ({
      open: c.open, high: c.high, low: c.low,
      close: c.close, datetime: c.datetime,
    }))

    const result = runBacktest(candles, strategy, params ?? {})

    return NextResponse.json({
      success: true,
      symbol, strategy, interval,
      candleCount: candles.length,
      ...result,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
