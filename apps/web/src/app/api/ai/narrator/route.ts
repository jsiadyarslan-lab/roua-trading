import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady()
    
    // Simulate slight delay for AI generation
    await new Promise(r => setTimeout(r, 600))

    // Pull latest news from DB to ground the narrative (if any)
    const recentNews = await db.newsArticle.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 5
    })

    // Create a dynamic narrative based on available DB data or fallback
    let narrative = "السوق هادئ بشكل عام، لا توجد تصريحات محركة مهمة."
    let sentiment = "neutral"
    let keywords = [
      { word: "هادئ", color: "text3" }
    ]

    if (recentNews.length > 0) {
      // Pick the most impactful news item conceptually
      const topNews = recentNews[0]
      const isPositive = (topNews.sentiment || 0) > 0.2
      const isNegative = (topNews.sentiment || 0) < -0.2
      
      sentiment = isPositive ? "bullish" : isNegative ? "bearish" : "neutral"
      
      narrative = `السوق يركز على [${topNews.source}]: ${topNews.summary || topNews.title}. `
      
      if (isPositive) {
        narrative += "الزخم التصاعدي يتزايد مع توقعات باختراق المقاومة قريباً."
        keywords = [
          { word: "يختبر مقاومة", color: "green" },
          { word: "الزخم التصاعدي", color: "green" },
          { word: topNews.source, color: "blue" }
        ]
      } else if (isNegative) {
        narrative += "تسود حالة الحذر وسط مخاوف من تراجع إضافي وكسر الدعم الحالي."
        keywords = [
          { word: "تراجع", color: "red" },
          { word: "كسر الدعم", color: "red" },
          { word: "الحذر", color: "amber" },
          { word: topNews.source, color: "blue" }
        ]
      } else {
        narrative += "التحركات العرضية تسيطر حتى تتضح معالم البيانات القادمة."
        keywords = [
          { word: "عناوين", color: "blue" },
          { word: "عرضية", color: "text2" }
        ]
      }
    } else {
      // Mock Data if DB has no news yet
      const hHour = new Date().getHours()
      if (hHour < 12) {
        narrative = "اليورو يختبر مقاومة 1.0870 بانتظار بيانات التصنيع. الزخم صاعد بدعم قرارات البنك المركزي الأخيرة."
        sentiment = "bullish"
        keywords = [
          { word: "يختبر مقاومة", color: "green" },
          { word: "صاعد", color: "green" }
        ]
      } else if (hHour < 18) {
        narrative = "ضغط بيعي على الذهب بعد ارتفاع الدولار؛ مخاوف التضخم تعيد المتداولين إلى الملاذات الأكثر سيولة."
        sentiment = "bearish"
        keywords = [
          { word: "ضغط بيعي", color: "red" },
          { word: "مخاوف", color: "amber" }
        ]
      } else {
        narrative = "بتكوين يستقر حول 67,000$ بعد تصفية مراكز مضاربة كبيرة. السوق يترقب افتتاح الجلسة الآسيوية."
        sentiment = "volatile"
        keywords = [
          { word: "تصفية مراكز", color: "purple" },
          { word: "يستقر", color: "text2" }
        ]
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        narrative,
        sentiment,
        keywords,
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
