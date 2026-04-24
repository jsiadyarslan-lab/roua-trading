export type ScannerDirection = 'buy' | 'sell' | 'neutral'
export type ScannerSignalClass = 'trend' | 'reversion' | 'breakout' | 'watch'

export interface MarketContext {
  symbol: string
  timeframe: string
  quote: any | null
  closes: number[]
  source: string
  freshness: 'fresh' | 'stale' | 'degraded'
}

export interface ScannerResult {
  pair: string
  dir: ScannerDirection
  strength: number
  signalClass: ScannerSignalClass
  entryBias: 'follow' | 'fade' | 'wait'
  price: number
  change: number
  timeframe: string
  reasons: string[]
  source: string
  freshness: 'fresh' | 'stale' | 'degraded'
  timestamp: string
  features: {
    rsi: number
    ema20: number
    ema50: number
    slope20: number
    rangeExpansion: number
  }
}

export interface UnifiedSignal {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  confidence: number
  entry: number
  tp: number
  sl: number
  timeframe: string
  reasons: string[]
  sourceEngine: 'scanner-engine'
  source: string
  freshness: 'fresh' | 'stale' | 'degraded'
  signalClass: ScannerSignalClass
  entryBias: 'follow' | 'fade' | 'wait'
  expiresAt: string
  invalidatesWhen: string
  createdAt: string
}

export const PRIMARY_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD',
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD',
  'AAPL', 'TSLA', 'NVDA',
]

export function normalizeSignalSymbol(symbol: string) {
  return symbol.replace('USDT', 'USD')
}

export function calculateRSI(closes: number[], period = 14) {
  if (closes.length <= period) return 50
  let gains = 0
  let losses = 0
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

export function calculateEMA(data: number[], period: number) {
  if (data.length < period) return data[data.length - 1] || 0
  const k = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k)
  }
  return ema
}

function safeNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export async function fetchMarketContext(origin: string, symbol: string, timeframe = '1h'): Promise<MarketContext> {
  const normalized = normalizeSignalSymbol(symbol)
  const [quoteRes, historyRes] = await Promise.allSettled([
    fetch(`${origin}/api/exchange/quote/${encodeURIComponent(normalized)}`, { cache: 'no-store' }),
    fetch(`${origin}/api/exchange/history/${encodeURIComponent(normalized)}?interval=${timeframe}`, { cache: 'no-store' }),
  ])

  let quote: any | null = null
  let closes: number[] = []

  if (quoteRes.status === 'fulfilled') {
    const quoteJson = await quoteRes.value.json()
    if (quoteJson.success) quote = quoteJson.data
  }

  if (historyRes.status === 'fulfilled') {
    const historyJson = await historyRes.value.json()
    if (historyJson.success && Array.isArray(historyJson.data)) {
      closes = historyJson.data.map((c: any) => safeNumber(c.close)).filter(Boolean)
    }
  }

  const ageMs = quote?.timestamp ? Date.now() - new Date(quote.timestamp).getTime() : Number.POSITIVE_INFINITY
  const freshness: MarketContext['freshness'] =
    !quote ? 'degraded' : ageMs > 120000 ? 'stale' : quote.source === 'Demo' ? 'degraded' : 'fresh'

  return {
    symbol: normalized,
    timeframe,
    quote,
    closes,
    source: quote?.source || 'Unknown',
    freshness,
  }
}

export function buildScannerResult(context: MarketContext): ScannerResult | null {
  const quote = context.quote
  if (!quote || !quote.price) return null

  const closes = context.closes
  const change = safeNumber(quote.changePercent)
  const price = safeNumber(quote.price)
  const rsi = calculateRSI(closes)
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)
  const previousEma20 = calculateEMA(closes.slice(0, -1), 20)
  const slope20 = ema20 && previousEma20 ? ((ema20 - previousEma20) / ema20) * 100 : 0
  const recent = closes.slice(-8)
  const high = recent.length ? Math.max(...recent) : price
  const low = recent.length ? Math.min(...recent) : price
  const rangeExpansion = low > 0 ? ((high - low) / low) * 100 : 0

  let score = 0
  let signalClass: ScannerSignalClass = 'watch'
  let entryBias: ScannerResult['entryBias'] = 'wait'
  const reasons: string[] = []

  if (change > 1.25) {
    score += 1.2
    signalClass = 'trend'
    entryBias = 'follow'
    reasons.push('زخم صعودي قوي')
  } else if (change < -1.25) {
    score -= 1.2
    signalClass = 'trend'
    entryBias = 'follow'
    reasons.push('زخم هبوطي قوي')
  } else if (Math.abs(change) > 0.45) {
    score += change > 0 ? 0.45 : -0.45
    reasons.push(change > 0 ? 'ميل صعودي قصير' : 'ميل هبوطي قصير')
  }

  if (closes.length >= 20) {
    if (rsi < 30) {
      score += 2.2
      signalClass = 'reversion'
      entryBias = 'fade'
      reasons.push(`تشبع بيعي (RSI ${Math.round(rsi)})`)
    } else if (rsi > 70) {
      score -= 2.2
      signalClass = 'reversion'
      entryBias = 'fade'
      reasons.push(`تشبع شرائي (RSI ${Math.round(rsi)})`)
    } else if (rsi < 45) {
      score += 0.65
      reasons.push('ميل صعودي')
    } else if (rsi > 55) {
      score -= 0.65
      reasons.push('ميل هبوطي')
    }

    if (ema20 > ema50) {
      score += 0.5
      reasons.push('EMA20 أعلى من EMA50')
    } else if (ema20 < ema50) {
      score -= 0.5
      reasons.push('EMA20 أسفل EMA50')
    }

    if (Math.abs(slope20) > 0.08) {
      score += slope20 > 0 ? 0.4 : -0.4
      reasons.push(slope20 > 0 ? 'المتوسط يتسارع صعودًا' : 'المتوسط يتسارع هبوطًا')
    }

    if (rangeExpansion > 2.2) {
      signalClass = signalClass === 'watch' ? 'breakout' : signalClass
      score += change > 0 ? 0.55 : change < 0 ? -0.55 : 0
      reasons.push('اتساع نطاق الحركة')
    }
  } else if (Math.abs(change) > 0.8) {
    score += change > 0 ? 0.75 : -0.75
    reasons.push('إشارة مبنية على الزخم السعري فقط')
  }

  if (context.freshness === 'degraded') reasons.push('بيانات جزئية')
  else reasons.push(`المصدر: ${context.source}`)

  const dir: ScannerDirection = score > 0.45 ? 'buy' : score < -0.45 ? 'sell' : 'neutral'
  const strength = Math.min(98, Math.max(50, Math.round(50 + Math.abs(score) * 15)))

  return {
    pair: context.symbol,
    dir,
    strength,
    signalClass,
    entryBias,
    price,
    change,
    timeframe: context.timeframe,
    reasons: reasons.slice(0, 4),
    source: context.source,
    freshness: context.freshness,
    timestamp: new Date().toISOString(),
    features: {
      rsi,
      ema20,
      ema50,
      slope20,
      rangeExpansion,
    },
  }
}

export function rankScannerResults(results: ScannerResult[]) {
  return results
    .filter(result => result.dir !== 'neutral' && result.strength >= 60)
    .sort((a, b) => b.strength - a.strength)
}

export function buildUnifiedSignal(result: ScannerResult): UnifiedSignal {
  const side = result.dir === 'buy' ? 'BUY' : 'SELL'
  const tp = side === 'BUY' ? result.price * 1.015 : result.price * 0.985
  const sl = side === 'BUY' ? result.price * 0.9925 : result.price * 1.0075
  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString()
  const invalidatesWhen =
    side === 'BUY'
      ? `إذا هبط السعر أسفل ${sl.toFixed(4)} أو انخفضت الثقة دون 60`
      : `إذا صعد السعر أعلى ${sl.toFixed(4)} أو انخفضت الثقة دون 60`

  return {
    id: `${result.pair}-${side}-${result.timeframe}-${createdAt}`,
    symbol: result.pair,
    side,
    confidence: result.strength,
    entry: result.price,
    tp,
    sl,
    timeframe: result.timeframe,
    reasons: result.reasons,
    sourceEngine: 'scanner-engine',
    source: result.source,
    freshness: result.freshness,
    signalClass: result.signalClass,
    entryBias: result.entryBias,
    expiresAt,
    invalidatesWhen,
    createdAt,
  }
}

export async function buildMultiTimeframeSnapshot(origin: string, symbol: string, timeframes = ['15m', '1h', '4h', '1d']) {
  const contexts = await Promise.all(timeframes.map(tf => fetchMarketContext(origin, symbol, tf)))
  const results = contexts.map(buildScannerResult).filter(Boolean) as ScannerResult[]
  const map = Object.fromEntries(results.map(result => [result.timeframe, result]))
  const daily = map['1d']
  const fourHour = map['4h']
  const oneHour = map['1h']
  const trigger = map['15m']

  const biasScore =
    (daily?.dir === 'buy' ? 2 : daily?.dir === 'sell' ? -2 : 0) +
    (fourHour?.dir === 'buy' ? 1.5 : fourHour?.dir === 'sell' ? -1.5 : 0) +
    (oneHour?.dir === 'buy' ? 1 : oneHour?.dir === 'sell' ? -1 : 0) +
    (trigger?.dir === 'buy' ? 0.5 : trigger?.dir === 'sell' ? -0.5 : 0)

  const alignment =
    Math.abs(biasScore) >= 4 ? 'strong'
      : Math.abs(biasScore) >= 2 ? 'mixed'
        : 'counter-trend'

  const executionHint =
    alignment === 'strong'
      ? (biasScore > 0 ? 'مسموح دخول مع الاتجاه' : 'مسموح دخول بيعي مع الاتجاه')
      : alignment === 'mixed'
        ? 'انتظار تأكيد من إطار أدنى'
        : 'ممنوع دخول ضد الإطار الأعلى'

  return {
    results,
    alignment,
    executionHint,
    regime: daily?.dir || 'neutral',
    bias: fourHour?.dir || 'neutral',
    setup: oneHour?.dir || 'neutral',
    trigger: trigger?.dir || 'neutral',
  }
}
