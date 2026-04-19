import { NextResponse } from 'next/server'

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || ''

interface FinnhubNews {
  category: string
  headline: string
  datetime: number
  source: string
  sentiment?: number
}

const categoryMap: Record<string, { categoryAr: string; color: string; bgColor: string }> = {
  forex: { categoryAr: 'فوركس', color: '#0d9488', bgColor: '#0d948812' },
  crypto: { categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612' },
  metal: { categoryAr: 'معادن', color: '#f59e0b', bgColor: '#f59e0b12' },
  stock: { categoryAr: 'أسهم', color: '#3b82f6', bgColor: '#3b82f612' },
  economy: { categoryAr: 'اقتصاد', color: '#8b5cf6', bgColor: '#8b5cf612' },
  oil: { categoryAr: 'نفط', color: '#6b7280', bgColor: '#6b728012' },
  general: { categoryAr: 'عام', color: '#94a3b8', bgColor: '#94a3b812' },
}

function getCategoryMeta(category: string) {
  const lower = (category || 'general').toLowerCase()
  for (const [key, meta] of Object.entries(categoryMap)) {
    if (lower.includes(key)) return meta
  }
  return categoryMap.general
}

export async function GET() {
  // If no Finnhub key, return curated Arabic market news
  if (!FINNHUB_API_KEY) {
    return NextResponse.json(getFallbackNews())
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 300 } } // Cache for 5 minutes
    )

    if (!res.ok) {
      return NextResponse.json(getFallbackNews())
    }

    const data: FinnhubNews[] = await res.json()

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(getFallbackNews())
    }

    const mapped = data.slice(0, 15).map((item) => {
      const meta = getCategoryMeta(item.category)
      return {
        category: item.category || 'general',
        categoryAr: meta.categoryAr,
        color: meta.color,
        bgColor: meta.bgColor,
        text: item.headline,
        impact: (item.sentiment && item.sentiment > 0.3) ? 'high' as const : 'medium' as const,
      }
    })

    return NextResponse.json(mapped)
  } catch {
    return NextResponse.json(getFallbackNews())
  }
}

function getFallbackNews() {
  return [
    { category: 'Fed', categoryAr: 'الاحتياطي', color: '#d4af37', bgColor: '#d4af3712', text: 'الاحتياطي الفيدرالي يشير إلى خفض محتمل للفائدة في الربع الثالث', impact: 'high' },
    { category: 'Forex', categoryAr: 'فوركس', color: '#0d9488', bgColor: '#0d948812', text: 'EUR/USD يكسر مقاومة رئيسية عند 1.0850', impact: 'medium' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'بيتكوين يتجاوز 67 ألف دولار بفعل تدفقات صناديق ETF', impact: 'high' },
    { category: 'Metals', categoryAr: 'معادن', color: '#f59e0b', bgColor: '#f59e0b12', text: 'الذهاب يستقر فوق 2,340 دولار', impact: 'medium' },
    { category: 'Stocks', categoryAr: 'أسهم', color: '#3b82f6', bgColor: '#3b82f612', text: 'S&P 500 يصل إلى أعلى مستوى تاريخي جديد', impact: 'high' },
    { category: 'Oil', categoryAr: 'نفط', color: '#6b7280', bgColor: '#6b728012', text: 'النفط الخام ينخفض بفعل مخاوف الطلب', impact: 'medium' },
    { category: 'Economy', categoryAr: 'اقتصاد', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'نمو الناتج المحلي الأمريكي يفوق التوقعات', impact: 'high' },
  ]
}
