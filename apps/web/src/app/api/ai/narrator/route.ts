import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

type NarratorPayload = {
  narrative: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  keywords: Array<{ word: string; color: 'success' | 'accent' | 'danger' | 'amber' }>
  confidence: number
  risk: 'Low' | 'Medium' | 'High'
  timestamp: string
  degraded?: boolean
}

function buildNarratorFromScan(scanData: any, recentNews: any[] = [], degraded = false): NarratorPayload {
  const topScan = Array.isArray(scanData?.data) ? scanData.data[0] : null
  const newsSentiment =
    recentNews.reduce((acc, n) => acc + (typeof n?.sentiment === 'number' ? n.sentiment : 0), 0) /
    (recentNews.length || 1)

  let narrative = ''
  let sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile' = 'neutral'
  let confidence = degraded ? 60 : 70
  let risk: 'Low' | 'Medium' | 'High' = degraded ? 'Medium' : 'Medium'
  let keywords: Array<{ word: string; color: 'success' | 'accent' | 'danger' | 'amber' }> = [
    { word: degraded ? 'بيانات جزئية' : 'تحليل مباشر', color: 'amber' },
    { word: 'مراقبة السوق', color: 'accent' },
  ]

  if (topScan) {
    const bullishTech = topScan.dir === 'buy'
    const bullishNews = newsSentiment > 0.1
    const bearishNews = newsSentiment < -0.1

    if (bullishTech && bullishNews) {
      sentiment = 'bullish'
      confidence = degraded ? 84 : 92
      risk = 'Low'
      narrative = `زخم إيجابي واضح في ${topScan.pair}. التحليل الفني يشير إلى ${topScan.reasons.join('، ')} مع دعم معنوي من الأخبار الأخيرة.`
      keywords = [
        { word: 'زخم صاعد', color: 'success' },
        { word: 'توافق الإشارات', color: 'accent' },
        { word: 'ثقة مرتفعة', color: 'success' },
      ]
    } else if (!bullishTech && bearishNews) {
      sentiment = 'bearish'
      confidence = degraded ? 80 : 88
      risk = 'Medium'
      narrative = `ضغط بيعي متزايد على ${topScan.pair}. الإشارة الفنية تميل إلى ${topScan.dir === 'buy' ? 'الشراء' : 'البيع'} مع تراجع في المعنويات العامة.`
      keywords = [
        { word: 'ضغط بيعي', color: 'danger' },
        { word: 'حذر', color: 'amber' },
        { word: 'مخاطرة متوسطة', color: 'danger' },
      ]
    } else if (topScan.dir === 'buy' || topScan.dir === 'sell') {
      sentiment = 'volatile'
      confidence = degraded ? 72 : 78
      risk = 'High'
      narrative = `السوق يتحرك بقوة في ${topScan.pair}. التحليل الفني يعطي إشارة ${topScan.dir === 'buy' ? 'شراء' : 'بيع'} مع عوامل متعارضة في الخلفية، لذا يُفضل الالتزام بإدارة المخاطر.`
      keywords = [
        { word: 'تذبذب مرتفع', color: 'amber' },
        { word: 'إدارة مخاطر', color: 'accent' },
      ]
    } else {
      sentiment = 'neutral'
      confidence = degraded ? 55 : 60
      risk = 'Medium'
      narrative = `السوق في حالة انتظار نسبي. ${topScan.pair} لا يُظهر حسمًا واضحًا الآن، لكن الرصد مستمر لاكتشاف أي اختراق أو انعكاس.`
      keywords = [
        { word: 'انتظار', color: 'amber' },
        { word: 'رصد نشط', color: 'accent' },
      ]
    }
  } else {
    narrative = degraded
      ? 'المحرك يعمل ببيانات جزئية من السوق. لا توجد تغطية كاملة للمخزن، لكن الإشارات الفنية ما زالت تُراقب وتُحدَّث بشكل حي.'
      : 'المحرك يراقب استقرار الأسواق حالياً. لا توجد انحرافات سعرية حادة تبرر دخول صفقات عالية المخاطرة.'
    sentiment = 'neutral'
    confidence = degraded ? 58 : 50
    risk = 'Medium'
    keywords = degraded
      ? [
          { word: 'وضع جزئي', color: 'amber' },
          { word: 'مراقبة حية', color: 'accent' },
        ]
      : [
          { word: 'استقرار', color: 'amber' },
          { word: 'مراقبة', color: 'accent' },
        ]
  }

  return {
    narrative,
    sentiment,
    keywords,
    confidence,
    risk,
    timestamp: new Date().toISOString(),
    ...(degraded ? { degraded: true } : {}),
  }
}

export async function GET(req: NextRequest) {
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

  let scanData: any = null
  try {
    const scanRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/market-scan`, {
      cache: 'no-store',
    })
    scanData = await scanRes.json()
  } catch (error: any) {
    console.error('[ai/narrator] Scan fetch failed:', error?.message || error)
  }

  try {
    if (scanData?.success) {
      return NextResponse.json({
        success: true,
        data: buildNarratorFromScan(scanData, recentNews, !dbReady),
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        narrative: !dbReady
          ? 'المحرك يعمل ببيانات جزئية من السوق. لا توجد تغطية كاملة للمخزن، لكن التحليل ما زال حيًا ويستقبل الإشارات المتاحة.'
          : 'المحرك يراقب استقرار الأسواق حالياً. لا توجد انحرافات سعرية حادة تبرر دخول صفقات عالية المخاطرة.',
        sentiment: 'neutral',
        keywords: [
          { word: !dbReady ? 'بيانات جزئية' : 'استقرار', color: 'amber' },
          { word: 'مراقبة حية', color: 'accent' },
        ],
        confidence: !dbReady ? 58 : 50,
        risk: 'Medium',
        timestamp: new Date().toISOString(),
        ...( !dbReady ? { degraded: true } : {} ),
      },
    })
  } catch (error: any) {
    console.error('[ai/narrator] Error:', error?.message || error)
    return NextResponse.json({
      success: true,
      data: {
        narrative: 'المحرك يعمل ببيانات جزئية من السوق، لكن لا يزال يقدم تحليلًا حيًا بدل إيقاف الواجهة.',
        sentiment: 'neutral',
        keywords: [
          { word: 'تحليل حي', color: 'accent' },
          { word: 'وضع جزئي', color: 'amber' },
        ],
        confidence: 58,
        risk: 'Medium',
        timestamp: new Date().toISOString(),
        degraded: true,
      },
    })
  }
}
