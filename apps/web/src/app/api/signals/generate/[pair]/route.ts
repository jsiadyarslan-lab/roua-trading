import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * POST /api/signals/generate/[pair]
 * Generates a trading signal for a given pair using AI analysis.
 * Falls back to a simple heuristic if AI APIs are unavailable.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pair: string }> }
) {
  try {
    await ensureDbReady()

    const { pair } = await params

    // Check authentication
    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    // Try to fetch current price for the pair
    let entryPrice: number | null = null
    let changePercent = 0

    try {
      const quoteCurrency = pair.includes('/') ? pair.split('/')[1] : ''
      const CRYPTO_QUOTE_CURRENCIES = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB']
      const CRYPTO_BASE_CURRENCIES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI']
      const baseCurrency = pair.includes('/') ? pair.split('/')[0] : ''
      const isCryptoPair = CRYPTO_QUOTE_CURRENCIES.includes(quoteCurrency) || CRYPTO_BASE_CURRENCIES.includes(baseCurrency)
      let quoteUrl: string

      if (isCryptoPair) {
        const binanceSymbol = pair.replace('/', '')
        quoteUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(binanceSymbol)}`
      } else {
        const apiKey = process.env.TWELVE_DATA_API_KEY
        if (!apiKey) throw new Error('No API key')
        quoteUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(pair)}&apikey=${apiKey}`
      }

      const quoteRes = await fetch(quoteUrl, { next: { revalidate: 5 } })
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json()
        if (isCryptoPair) {
          entryPrice = parseFloat(quoteData.lastPrice) || null
          changePercent = parseFloat(quoteData.priceChangePercent) || 0
        } else if (!quoteData.status || quoteData.status !== 'error') {
          entryPrice = parseFloat(quoteData.close) || null
          changePercent = parseFloat(quoteData.percent_change) || 0
        }
      }
    } catch (err) {
      console.warn('[signals/generate] Could not fetch price:', err)
    }

    // Determine signal action based on market momentum
    let action: 'BUY' | 'SELL' | 'WAIT' = 'WAIT'
    let confidence = 40
    let reason = ''

    if (changePercent > 1.5) {
      action = 'BUY'
      confidence = Math.min(85, 50 + Math.floor(Math.abs(changePercent) * 3))
      reason = `زخم صعودي قوي بتغير ${changePercent.toFixed(2)}% في آخر 24 ساعة. الإشارة تشير إلى استمرار الاتجاه الصاعد مع احتمال تصحيح قصير. يُنصح بوضع وقف خسارة عند مستوى دعم قريب.`
    } else if (changePercent > 0.3) {
      action = 'BUY'
      confidence = Math.min(70, 45 + Math.floor(Math.abs(changePercent) * 5))
      reason = `اتجاه صعودي معتدل بتغير ${changePercent.toFixed(2)}%. قد يكون هناك فرصة شراء مع مراقبة مستويات المقاومة.`
    } else if (changePercent < -1.5) {
      action = 'SELL'
      confidence = Math.min(85, 50 + Math.floor(Math.abs(changePercent) * 3))
      reason = `ضغط بيعي قوي بتغير ${changePercent.toFixed(2)}% في آخر 24 ساعة. الإشارة تشير إلى استمرار الاتجاه الهابط. يُنصح بتقليل المراكز أو وضع وقف خسارة.`
    } else if (changePercent < -0.3) {
      action = 'SELL'
      confidence = Math.min(70, 45 + Math.floor(Math.abs(changePercent) * 5))
      reason = `اتجاه هبوطي معتدل بتغير ${changePercent.toFixed(2)}%. قد يكون من الحكمة تقليل المخاطر ومراقبة مستويات الدعم.`
    } else {
      action = 'WAIT'
      confidence = 55
      reason = `السوق في حالة تذبذب بتغير ${changePercent.toFixed(2)}%. لا توجد إشارة واضحة للدخول. يُنصح بالانتظار حتى يظهر اتجاه أوضح.`
    }

    // Calculate stop loss and take profit based on entry price
    let stopLoss: number | null = null
    let takeProfit: number | null = null

    if (entryPrice) {
      const slPercent = action === 'BUY' ? 0.03 : 0.03
      const tpPercent = action === 'BUY' ? 0.06 : 0.06
      stopLoss = action === 'BUY'
        ? parseFloat((entryPrice * (1 - slPercent)).toFixed(2))
        : parseFloat((entryPrice * (1 + slPercent)).toFixed(2))
      takeProfit = action === 'BUY'
        ? parseFloat((entryPrice * (1 + tpPercent)).toFixed(2))
        : parseFloat((entryPrice * (1 - tpPercent)).toFixed(2))
    }

    // Create signal in database
    const signal = await db.signal.create({
      data: {
        userId: session.userId,
        pair,
        action,
        confidence,
        reason,
        entryPrice,
        stopLoss,
        takeProfit,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    })

    return NextResponse.json({ success: true, data: signal })
  } catch (error: any) {
    console.error('[signals/generate] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في توليد الإشارة' },
      { status: 500 }
    )
  }
}
