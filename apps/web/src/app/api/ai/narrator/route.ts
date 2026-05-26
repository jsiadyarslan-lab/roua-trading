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

// ── Bilingual text templates ──
const T = {
  ar: {
    summaryBuy: (symbol: string, tf: string) => `${symbol} في حالة زخم صاعد على ${tf}.`,
    summarySell: (symbol: string, tf: string) => `${symbol} في حالة ضغط بيعي على ${tf}.`,
    summaryNeutral: (symbol: string, tf: string) => `${symbol} في حالة ترقب على ${tf}.`,
    summaryNoData: (symbol: string) => `لا توجد قراءة مكتملة لـ ${symbol} الآن.`,
    bullCaseSupported: (reasons: string) => `السيناريو الإيجابي مدعوم عبر ${reasons}.`,
    bullCaseNeedsRecovery: 'السيناريو الإيجابي يحتاج عودة السعر فوق مناطق التراجع الحالية وتأكيد من الإطار الأعلى.',
    bearCaseSupported: (reasons: string) => `السيناريو السلبي مدعوم عبر ${reasons}.`,
    bearCaseMomentumLoss: 'السيناريو السلبي يظهر إذا فشل السعر في الحفاظ على الزخم الحالي أو تدهورت جودة البيانات.',
    riskDegraded: 'المخاطرة الأساسية هنا هي العمل على بيانات جزئية أو متأخرة.',
    riskStaleFeed: 'جودة التغذية ليست مثالية، وقد تتأخر الإشارة عن السوق الحقيقي.',
    riskHighVolatility: 'التذبذب مرتفع، لذلك أي دخول يحتاج حجمًا محافظًا.',
    riskMedium: 'الخطر الحالي متوسط ويعتمد على ثبات الزخم.',
    triggerBuy: (price: string) => `المحفز التالي هو استمرار السعر فوق ${price} مع بقاء الثقة فوق 60.`,
    triggerSell: (price: string) => `المحفز التالي هو استمرار الضغط دون ${price} مع ضعف محاولات الارتداد.`,
    triggerNeutral: 'المحفز التالي هو ظهور انحياز أوضح من السكانر أو خبر مؤثر يغير النظام.',
    narrativeReason: (reason: string) => `السبب الأقوى الآن: ${reason}.`,
    narrativeNewsConsidered: 'الأخبار الأخيرة أُخذت في الحسبان ضمن السرد.',
    narrativeNoNews: 'لا توجد أخبار حديثة كافية، لذا يركّز السرد على السعر والبنية الفنية.',
    keywordPartialData: 'بيانات جزئية',
    keywordLiveContext: 'سياق مباشر',
  },
  en: {
    summaryBuy: (symbol: string, tf: string) => `${symbol} is in bullish momentum on ${tf}.`,
    summarySell: (symbol: string, tf: string) => `${symbol} is under selling pressure on ${tf}.`,
    summaryNeutral: (symbol: string, tf: string) => `${symbol} is in a wait-and-see mode on ${tf}.`,
    summaryNoData: (symbol: string) => `No complete reading available for ${symbol} at the moment.`,
    bullCaseSupported: (reasons: string) => `The bull case is supported by ${reasons}.`,
    bullCaseNeedsRecovery: 'The bull case requires price recovery above current pullback zones with confirmation from the higher timeframe.',
    bearCaseSupported: (reasons: string) => `The bear case is supported by ${reasons}.`,
    bearCaseMomentumLoss: 'The bear case emerges if price fails to maintain current momentum or data quality deteriorates.',
    riskDegraded: 'The key risk here is acting on partial or delayed data.',
    riskStaleFeed: 'Feed quality is not optimal, and signals may lag behind the live market.',
    riskHighVolatility: 'Volatility is high, so any entry requires a conservative position size.',
    riskMedium: 'Current risk is moderate and depends on sustained momentum.',
    triggerBuy: (price: string) => `The next trigger is price holding above ${price} with confidence staying above 60.`,
    triggerSell: (price: string) => `The next trigger is continued pressure below ${price} with weak rebound attempts.`,
    triggerNeutral: 'The next trigger is a clearer directional bias from the scanner or a catalyst that shifts the regime.',
    narrativeReason: (reason: string) => `The strongest reason now: ${reason}.`,
    narrativeNewsConsidered: 'Recent news has been factored into the narrative.',
    narrativeNoNews: 'Insufficient recent news, so the narrative focuses on price and technical structure.',
    keywordPartialData: 'Partial Data',
    keywordLiveContext: 'Live Context',
  },
}

function buildNarrativeFromContext(
  symbol: string,
  scan: any,
  recentNews: any[] = [],
  degraded = false,
  lang: 'ar' | 'en' = 'ar',
): NarratorPayload {
  const l = T[lang] || T.ar
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
    ? scan?.dir === 'buy'
      ? l.summaryBuy(symbol, scan?.timeframe || '1h')
      : scan?.dir === 'sell'
        ? l.summarySell(symbol, scan?.timeframe || '1h')
        : l.summaryNeutral(symbol, scan?.timeframe || '1h')
    : l.summaryNoData(symbol)

  const reasonsJoined = scan?.reasons?.slice(0, 2).join(lang === 'ar' ? '، ' : ', ')

  const bullCase = scan?.dir === 'buy'
    ? l.bullCaseSupported(reasonsJoined)
    : l.bullCaseNeedsRecovery

  const bearCase = scan?.dir === 'sell'
    ? l.bearCaseSupported(reasonsJoined)
    : l.bearCaseMomentumLoss

  const keyRisk = degraded
    ? l.riskDegraded
    : scan?.freshness !== 'fresh'
      ? l.riskStaleFeed
      : Math.abs(scan?.change || 0) > 2.5
        ? l.riskHighVolatility
        : l.riskMedium

  const priceStr = Number(scan?.price || 0).toFixed(2)
  const nextTrigger = scan?.dir === 'buy'
    ? l.triggerBuy(priceStr)
    : scan?.dir === 'sell'
      ? l.triggerSell(priceStr)
      : l.triggerNeutral

  const narrative = `${summary} ${scan?.reasons?.[0] ? l.narrativeReason(scan.reasons[0]) : ''} ${recentNews.length > 0 ? l.narrativeNewsConsidered : l.narrativeNoNews} ${keyRisk}`

  const keywords: Array<{ word: string; color: KeywordColor }> = [
    { word: scan?.signalClass || 'watch', color: 'accent' },
    { word: scan?.entryBias || 'wait', color: sentiment === 'bullish' ? 'success' : sentiment === 'bearish' ? 'danger' : 'amber' },
    { word: degraded ? l.keywordPartialData : l.keywordLiveContext, color: degraded ? 'amber' : 'success' },
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
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'ar'
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
      data: buildNarrativeFromContext(symbol, scan, recentNews, !dbReady || context.freshness !== 'fresh', lang),
    })
  } catch (error: any) {
    console.error('[ai/narrator] Error:', error?.message || error)
    return NextResponse.json({
      success: true,
      data: buildNarrativeFromContext(symbol, null, [], true, lang),
    })
  }
}
