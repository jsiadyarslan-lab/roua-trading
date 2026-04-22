import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady()
    
    // 1. Fetch Latest News
    const recentNews = await db.newsArticle.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 3
    })

    // 2. Fetch Scanner Results (Real Technical Data)
    let scannerResults: any[] = []
    try {
      const scanRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/market-scan`)
      const scanData = await scanRes.json()
      if (scanData.success) scannerResults = scanData.data
    } catch { /* ignore */ }

    // 3. Hybrid Analysis Logic
    const topScan = scannerResults[0] // Highest strength signal
    const newsSentiment = recentNews.reduce((acc, n) => acc + (n.sentiment || 0), 0) / (recentNews.length || 1)
    
    let narrative = ""
    let sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile' = "neutral"
    let confidence = 70
    let risk: 'Low' | 'Medium' | 'High' = "Medium"
    let keywords: any[] = []

    if (topScan) {
      const isBullishTech = topScan.dir === 'buy'
      const isBullishNews = newsSentiment > 0.1
      
      if (isBullishTech && isBullishNews) {
        sentiment = "bullish"
        confidence = 92
        risk = "Low"
        narrative = `توافق تام بين التحليل الفني والأساسي. ${topScan.pair} يظهر زخماً صاعداً قوياً بنسبة ثقة ${topScan.strength}% مدعوماً بـ: ${topScan.reasons.join('، ')}. مع أخبار إيجابية تدعم استمرار الصعود.`
        keywords = [{ word: "اختراق مؤكد", color: "success" }, { word: "زخم مؤسسي", color: "accent" }]
      } else if (!isBullishTech && !isBullishNews) {
        sentiment = "bearish"
        confidence = 88
        risk = "Medium"
        narrative = `ضغط بيعي متزايد على الأسواق. ${topScan.pair} يواجه صعوبة في الحفاظ على مستويات الدعم. التحليل الفني يشير لـ ${topScan.reasons[0]} بالتزامن مع تراجع في المعنويات العامة.`
        keywords = [{ word: "ضغط بيعي", color: "danger" }, { word: "هروب سيولة", color: "danger" }]
      } else {
        sentiment = "volatile"
        confidence = 65
        risk = "High"
        narrative = `السوق في حالة تضارب. التحليل الفني لـ ${topScan.pair} يعطي إشارة ${topScan.dir === 'buy' ? 'شراء' : 'بيع'}، لكن الأخبار تشير لـ ${newsSentiment > 0 ? 'تفاؤل' : 'حذر'}. يُنصح بالانتظار أو تقليل أحجام الصفقات.`
        keywords = [{ word: "تضارب إشارات", color: "amber" }, { word: "حذر شديد", color: "amber" }]
      }
    } else {
      narrative = "المحرك يراقب استقرار الأسواق حالياً. لا توجد انحرافات سعرية حادة تبرر دخول صفقات عالية المخاطرة."
      sentiment = "neutral"
      confidence = 50
    }

    return NextResponse.json({
      success: true,
      data: {
        narrative,
        sentiment,
        keywords,
        confidence,
        risk,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في توليد التحليل' },
      { status: 500 }
    )
  }
}
