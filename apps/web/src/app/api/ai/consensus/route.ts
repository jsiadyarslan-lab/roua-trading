import { NextRequest, NextResponse } from 'next/server'

// ──────────────────────────────────────────────
// AI Council of Consensus — Next.js Route Handler
// Works WITHOUT external AI API keys by using
// real market data from the platform's own endpoints
// ──────────────────────────────────────────────

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
    avgGain = (avgGain * (period - 1) + (diff >= 0 ? diff : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period
  }
  if (avgLoss === 0) return 100
  return 100 - (100 / (1 + avgGain / avgLoss))
}

function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0
  const k = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k)
  }
  return ema
}

function detectPattern(closes: number[]): { name: string; direction: 'bullish' | 'bearish' | 'neutral'; strength: number } {
  if (closes.length < 5) return { name: 'لا يوجد نمط واضح', direction: 'neutral', strength: 0 }
  
  const last5 = closes.slice(-5)
  const last3 = closes.slice(-3)
  
  // Higher highs and higher lows = uptrend
  const isUptrend = last5[4] > last5[0] && last3[2] > last3[0]
  // Lower lows = downtrend
  const isDowntrend = last5[4] < last5[0] && last3[2] < last3[0]
  
  // Hammer pattern detection (reversal from bottom)
  const recentDrop = (last5[0] - Math.min(...last5)) / last5[0]
  const isHammer = recentDrop > 0.03 && last5[4] > last5[2]
  
  if (isHammer) return { name: 'نمط المطرقة — انعكاس صعودي', direction: 'bullish', strength: 80 }
  if (isUptrend) return { name: 'اتجاه صاعد متسلسل', direction: 'bullish', strength: 72 }
  if (isDowntrend) return { name: 'اتجاه هابط متسلسل', direction: 'bearish', strength: 68 }
  
  return { name: 'تذبذب جانبي — انتظار الاختراق', direction: 'neutral', strength: 40 }
}

function assessMacro(change24h: number, volume: number): { verdict: string; direction: 'bullish' | 'bearish' | 'neutral'; confidence: number } {
  const absChange = Math.abs(change24h)
  if (absChange > 5) {
    return {
      verdict: change24h > 0
        ? `حركة صعودية حادة (${change24h.toFixed(1)}%) تشير لضخ مؤسسي قوي`
        : `ضغط بيعي حاد (${Math.abs(change24h).toFixed(1)}%) — مستثمرون يجنون أرباحاً`,
      direction: change24h > 0 ? 'bullish' : 'bearish',
      confidence: 85
    }
  } else if (absChange > 2) {
    return {
      verdict: `تحرك معتدل (${change24h.toFixed(1)}%) — السوق يختبر مستويات جديدة`,
      direction: change24h > 0 ? 'bullish' : 'bearish',
      confidence: 70
    }
  } else {
    return {
      verdict: 'استقرار نسبي في السوق — الترقب سيد الموقف',
      direction: 'neutral',
      confidence: 55
    }
  }
}

function calculateRisk(rsi: number, change24h: number): { level: string; confidence: number; text: string } {
  const absChange = Math.abs(change24h)
  
  if (rsi > 80 || (rsi > 70 && absChange > 5)) {
    return { level: 'HIGH', confidence: 30, text: `RSI مرتفع جداً (${Math.round(rsi)}) — تشبع شرائي قوي، خطر انعكاس` }
  } else if (rsi < 20 || (rsi < 30 && absChange > 5)) {
    return { level: 'HIGH', confidence: 30, text: `RSI منخفض جداً (${Math.round(rsi)}) — تشبع بيعي قوي، فرصة انعكاس` }
  } else if (rsi > 65 || rsi < 35) {
    return { level: 'MEDIUM', confidence: 60, text: `RSI في منطقة تحذير (${Math.round(rsi)}) — توخ الحذر في حجم الصفقة` }
  } else {
    return { level: 'LOW', confidence: 82, text: `RSI في منطقة صحية (${Math.round(rsi)}) — ظروف تداول مثالية` }
  }
}

function determineEntryTiming(rsi: number, ema20: number, currentPrice: number, change24h: number): { vote: 'BUY' | 'SELL' | 'HOLD'; reason: string; confidence: number } {
  const priceVsEma = ((currentPrice - ema20) / ema20) * 100
  
  if (rsi < 30 && priceVsEma < -2) {
    return { vote: 'BUY', reason: `السعر أسفل EMA20 بـ ${Math.abs(priceVsEma).toFixed(1)}% مع RSI منخفض — توقيت دخول ممتاز`, confidence: 88 }
  } else if (rsi > 70 && priceVsEma > 2) {
    return { vote: 'SELL', reason: `السعر فوق EMA20 بـ ${priceVsEma.toFixed(1)}% مع RSI مرتفع — توقيت خروج مناسب`, confidence: 85 }
  } else if (change24h > 1 && rsi < 65) {
    return { vote: 'BUY', reason: `زخم صعودي مدعوم بـ RSI متوازن (${Math.round(rsi)}) — فرصة دخول جيدة`, confidence: 72 }
  } else if (change24h < -1 && rsi > 35) {
    return { vote: 'SELL', reason: `زخم هبوطي مع RSI لم يصل للتشبع — ضغط بيعي مستمر`, confidence: 70 }
  } else {
    return { vote: 'HOLD', reason: `لا يوجد توقيت دخول واضح — انتظار تشكل نمط أوضح`, confidence: 50 }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const symbol: string = body.symbol || 'BTC/USDT'
    const origin = req.nextUrl.origin

    const start = Date.now()

    // ── Step 1: Fetch Real Market Data ──
    let quote: any = null
    let closes: number[] = []

    try {
      const [quoteRes, histRes] = await Promise.allSettled([
        fetch(`${origin}/api/exchange/quote/${encodeURIComponent(symbol)}`, { cache: 'no-store' }),
        fetch(`${origin}/api/exchange/history/${encodeURIComponent(symbol)}?interval=1h`, { cache: 'no-store' })
      ])

      if (quoteRes.status === 'fulfilled') {
        const qData = await quoteRes.value.json()
        if (qData.success) quote = qData.data
      }

      if (histRes.status === 'fulfilled') {
        const hData = await histRes.value.json()
        if (hData.success && hData.data) {
          closes = hData.data.map((c: any) => c.close).reverse()
        }
      }
    } catch { /* Proceed with available data */ }

    // ── Step 2: Calculate Technical Indicators ──
    const price       = quote?.price || 0
    const change24h   = quote?.changePercent || 0
    const volume      = quote?.volume || 0
    const rsi         = calculateRSI(closes)
    const ema20       = calculateEMA(closes, 20)
    const ema50       = calculateEMA(closes, 50)
    const pattern     = detectPattern(closes)
    const macro       = assessMacro(change24h, volume)
    const risk        = calculateRisk(rsi, change24h)
    const timing      = determineEntryTiming(rsi, ema20, price, change24h)

    // ── Step 3: Build Council Votes ──
    const technicalVote = pattern.direction === 'bullish' ? 'BUY' : pattern.direction === 'bearish' ? 'SELL' : 'HOLD'
    const sentimentVote = change24h > 0.5 ? 'BUY' : change24h < -0.5 ? 'SELL' : 'HOLD'
    const riskVote = risk.level === 'HIGH' ? 'HOLD' : timing.vote
    const macroVote = macro.direction === 'bullish' ? 'BUY' : macro.direction === 'bearish' ? 'SELL' : 'HOLD'
    const patternVote = technicalVote
    const execVote = timing.vote

    const analyses = [
      {
        role: 'المحلل الفني',
        model: 'Quantum/TechEngine v2',
        vote: technicalVote,
        confidence: pattern.strength || 65,
        reason: `${pattern.name}. EMA20: $${ema20.toFixed(2)} | EMA50: $${ema50.toFixed(2)} | ${ema20 > ema50 ? 'تقاطع ذهبي — صعودي' : 'تقاطع موت — هبوطي'}.`
      },
      {
        role: 'محلل المشاعر',
        model: 'Quantum/SentimentEngine v1',
        vote: sentimentVote,
        confidence: Math.min(90, 55 + Math.abs(change24h) * 10),
        reason: `التغيير خلال 24 ساعة: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%. ${Math.abs(change24h) > 3 ? 'حركة قوية تدل على مؤسسات' : 'حركة معتدلة'}.`
      },
      {
        role: 'خبير المخاطر',
        model: 'Quantum/RiskGuard v3',
        vote: riskVote,
        confidence: risk.confidence,
        reason: risk.text
      },
      {
        role: 'خبير الماكرو',
        model: 'Quantum/MacroAnalyst v1',
        vote: macroVote,
        confidence: macro.confidence,
        reason: macro.verdict
      },
      {
        role: 'خبير الأنماط',
        model: 'Quantum/PatternRecognizer v2',
        vote: patternVote,
        confidence: pattern.strength,
        reason: `${pattern.name} مكتشف على البيانات الساعية. الانحراف عن المتوسط: ${(((price - ema20) / ema20) * 100).toFixed(2)}%.`
      },
      {
        role: 'استراتيجي التنفيذ',
        model: 'Quantum/ExecutionEngine v1',
        vote: execVote,
        confidence: timing.confidence,
        reason: timing.reason
      },
    ]

    // ── Step 4: Calculate Consensus Score ──
    let buyCount = 0, sellCount = 0, holdCount = 0
    let totalConf = 0

    for (const a of analyses) {
      if (a.vote === 'BUY') { buyCount += a.confidence; }
      else if (a.vote === 'SELL') { sellCount += a.confidence; }
      else { holdCount += a.confidence; }
      totalConf += a.confidence
    }

    const buyPct = buyCount / totalConf
    const sellPct = sellCount / totalConf

    let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    let consensusScore = 0

    if (buyPct > 0.55) {
      recommendation = 'BUY'
      consensusScore = Math.round(buyPct * 100)
    } else if (sellPct > 0.55) {
      recommendation = 'SELL'
      consensusScore = Math.round(sellPct * 100)
    } else {
      recommendation = 'HOLD'
      consensusScore = Math.round(50 - Math.abs(buyPct - sellPct) * 30)
    }

    // ── Step 5: Generate Master Strategy ──
    const masterStrategy = (() => {
      const action = recommendation === 'BUY' ? 'الشراء' : recommendation === 'SELL' ? 'البيع' : 'الانتظار'
      const strength = consensusScore >= 75 ? 'بقوة عالية' : consensusScore >= 60 ? 'بثقة معتدلة' : 'بحذر'
      const rsiNote = rsi > 70 ? ' تحذير: RSI في منطقة التشبع الشرائي.' : rsi < 30 ? ' ملاحظة: RSI يشير لتشبع بيعي — فرصة انعكاس.' : ''
      const emaNote = ema20 > ema50 ? ' EMA20 فوق EMA50 — الاتجاه العام صاعد.' : ' EMA20 تحت EMA50 — الاتجاه العام هابط.'
      return `مجلس الذكاء الاصطناعي يوصي بـ${action} ${strength} على ${symbol} بنسبة إجماع ${consensusScore}%.${emaNote}${rsiNote} حجم الصفقة الموصى به: لا يتجاوز ${risk.level === 'HIGH' ? '1-2%' : risk.level === 'MEDIUM' ? '2-3%' : '3-5%'} من المحفظة. هذا التحليل لأغراض إرشادية فقط.`
    })()

    return NextResponse.json({
      success: true,
      data: {
        consensusScore,
        recommendation,
        analyses,
        masterStrategy,
        meta: {
          symbol,
          price,
          rsi: Math.round(rsi),
          processingTimeMs: Date.now() - start,
          timestamp: new Date().toISOString()
        }
      }
    })

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في إجماع المجلس' },
      { status: 500 }
    )
  }
}
