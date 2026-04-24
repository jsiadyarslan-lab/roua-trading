import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { buildScannerResult, fetchMarketContext } from '@/lib/trading-intelligence'

type KeywordColor = 'success' | 'accent' | 'danger' | 'amber'

type NarratorPayload = {
  narrative: string
  summary: string
  bullCase: string
  bearCase: string
  keyRisk: string
  nextTrigger: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  keywords: Array<{ word: string; color: KeywordColor }>
  confidence: number
  risk: 'Low' | 'Medium' | 'High'
  symbol: string
  source: string
  timestamp: string
  degraded?: boolean
}

function buildNarrativeFromContext(symbol: string, scan: any, recentNews: any[] = [], degraded = false): NarratorPayload {
  const newsSentiment =
    recentNews.reduce((acc, item) => acc + (typeof item?.sentiment === 'number' ? item.sentiment : 0), 0) /
    (recentNews.length || 1)

  const sentiment =
    scan?.dir === 'buy' && newsSentiment >= -0.1 ? 'bullish'
      : scan?.dir === 'sell' && newsSentiment <= 0.1 ? 'bearish'
        : Math.abs(scan?.change || 0) > 2.5 ? 'volatile'
          : 'neutral'

  const confidence = Math.min(95, Math.max(55, Number(scan?.strength || 62) + (degraded ? -10 : 0)))
  const risk = degraded || scan?.freshness !== 'fresh'
    ? 'High'
    : Math.abs(scan?.change || 0) > 2
      ? 'Medium'
      : 'Low'

  const summary = scan
    ? `${symbol} في حالة ${scan?.dir === 'buy' ? 'زخم صاعد' : scan?.dir === 'sell' ? 'ضغط بيعي' : 'ترقب'} على ${scan?.timeframe}.`
    : `لا توجد قراءة مكتملة لـ ${symbol} الآن.`

  const bullCase = scan?.dir === 'buy'
    ? `السيناريو الإيجابي مدعوم عبر ${scan.reasons?.slice(0, 2).join('، ')}.`
    : `السيناريو الإيجابي يحتاج عودة السعر فوق مناطق التراجع الحالية وتأكيد من الإطار الأعلى.`

  const bearCase = scan?.dir === 'sell'
    ? `السيناريو السلبي مدعوم عبر ${scan.reasons?.slice(0, 2).join('، ')}.`
    : `السيناريو السلبي يظهر إذا فشل السعر في الحفاظ على الزخم الحالي أو تدهورت جودة البيانات.`

  const keyRisk = degraded
    ? 'المخاطرة الأساسية هنا هي العمل على بيانات جزئية أو متأخرة.'
    : scan?.freshness !== 'fresh'
      ? 'جودة التغذية ليست مثالية، وقد تتأخر الإشارة عن السوق الحقيقي.'
      : Math.abs(scan?.change || 0) > 2.5
        ? 'التذبذب مرتفع، لذلك أي دخول يحتاج حجمًا محافظًا.'
        : 'الخطر الحالي متوسط ويعتمد على ثبات الزخم.'

  const nextTrigger = scan?.dir === 'buy'
    ? `المحفز التالي هو استمرار السعر فوق ${Number(scan?.price || 0).toFixed(2)} مع بقاء الثقة فوق 60.`
    : scan?.dir === 'sell'
      ? `المحفز التالي هو استمرار الضغط دون ${Number(scan?.price || 0).toFixed(2)} مع ضعف محاولات الارتداد.`
      : 'المحفز التالي هو ظهور انحياز أوضح من السكانر أو خبر مؤثر يغير النظام.'

  const narrative = `${summary} ${scan?.reasons?.[0] ? `السبب الأقوى الآن: ${scan.reasons[0]}.` : ''} ${recentNews.length > 0 ? 'الأخبار الأخيرة أُخذت في الحسبان ضمن السرد.' : 'لا توجد أخبار حديثة كافية، لذا يركّز السرد على السعر والبنية الفنية.'} ${keyRisk}`

  const keywords: Array<{ word: string; color: KeywordColor }> = [
    { word: scan?.signalClass || 'watch', color: 'accent' },
    { word: scan?.entryBias || 'wait', color: sentiment === 'bullish' ? 'success' : sentiment === 'bearish' ? 'danger' : 'amber' },
    { word: degraded ? 'بيانات جزئية' : 'سياق مباشر', color: degraded ? 'amber' : 'success' },
  ]

  return {
    narrative,
    summary,
    bullCase,
    bearCase,
    keyRisk,
    nextTrigger,
    sentiment,
    keywords,
    confidence,
    risk,
    symbol,
    source: scan?.source || 'Unknown',
    timestamp: new Date().toISOString(),
    ...(degraded ? { degraded: true } : {}),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol') || 'BTC/USD'
  const origin = req.nextUrl.origin
  let dbReady = false
  let recentNews: any[] = []

  try {
    await ensureDbReady()
    dbReady = true
  } catch (dbError: any) {
    console.error('[ai/narrator] DB unavailable:', dbError?.message || dbError)
  }

  if (dbReady) {
    try {
      recentNews = await db.newsArticle.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 3,
      })
    } catch (newsError: any) {
      console.error('[ai/narrator] News query failed:', newsError?.message || newsError)
    }
  }

  try {
    const context = await fetchMarketContext(origin, symbol, '1h')
    const scan = buildScannerResult(context)

    return NextResponse.json({
      success: true,
      data: buildNarrativeFromContext(symbol, scan, recentNews, !dbReady || context.freshness !== 'fresh'),
    })
  } catch (error: any) {
    console.error('[ai/narrator] Error:', error?.message || error)
    return NextResponse.json({
      success: true,
      data: buildNarrativeFromContext(symbol, null, [], true),
    })
  }
}
