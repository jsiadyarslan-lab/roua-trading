import { NextResponse } from 'next/server'

export const revalidate = 300 // Cache for 5 minutes

export async function GET() {
  try {
    // Fetch CoinTelegraph RSS feed
    const res = await fetch('https://cointelegraph.com/rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      next: { revalidate: 300 }
    })

    if (!res.ok) throw new Error('Failed to fetch RSS')

    const xml = await res.text()

    // Simple regex-based XML parsing to avoid installing external xml parsers.
    const items: Array<{
      category: string
      categoryAr: string
      color: string
      bgColor: string
      text: string
      link: string | null
      publishedAt: string | null
      impact: 'high' | 'medium'
      source: string
    }> = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match

    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const itemContent = match[1]
      const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(itemContent) || /<title>(.*?)<\/title>/.exec(itemContent)
      const categoryMatch = /<category><!\[CDATA\[(.*?)\]\]><\/category>/.exec(itemContent) || /<category>(.*?)<\/category>/.exec(itemContent)
      const linkMatch = /<link>(.*?)<\/link>/.exec(itemContent)
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(itemContent)

      if (titleMatch) {
        const category = categoryMatch ? categoryMatch[1].trim() : 'Crypto'
        items.push({
          category,
          categoryAr: mapCategoryToArabic(category),
          color: mapCategoryColor(category),
          bgColor: `${mapCategoryColor(category)}12`,
          text: titleMatch[1].trim(),
          link: linkMatch ? linkMatch[1].trim() : null,
          publishedAt: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : null,
          impact: isHighImpact(category) ? 'high' : 'medium',
          source: 'CoinTelegraph',
        })
      }
    }

    if (items.length > 0) {
      return NextResponse.json(items)
    }

    return NextResponse.json(getFallbackNews())
  } catch (error) {
    return NextResponse.json(getFallbackNews())
  }
}

function getFallbackNews() {
  return [
    { category: 'Fed', categoryAr: 'الاحتياطي', color: '#d4af37', bgColor: '#d4af3712', text: 'الاحتياطي الفيدرالي يشير إلى خفض محتمل للفائدة في الربع الثالث', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Forex', categoryAr: 'فوركس', color: '#0d9488', bgColor: '#0d948812', text: 'EUR/USD يكسر مقاومة رئيسية عند 1.0850', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'بيتكوين يتجاوز 67 ألف دولار بفعل تدفقات صناديق ETF', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Metals', categoryAr: 'معادن', color: '#f59e0b', bgColor: '#f59e0b12', text: 'الذهب يستقر فوق 2,340 دولار', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Stocks', categoryAr: 'أسهم', color: '#3b82f6', bgColor: '#3b82f612', text: 'S&P 500 يصل إلى أعلى مستوى تاريخي جديد', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
    { category: 'Oil', categoryAr: 'نفط', color: '#6b7280', bgColor: '#6b728012', text: 'النفط الخام ينخفض بفعل مخاوف الطلب', link: null, publishedAt: null, impact: 'medium', source: 'Fallback' },
    { category: 'Economy', categoryAr: 'اقتصاد', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'نمو الناتج المحلي الأمريكي يفوق التوقعات', link: null, publishedAt: null, impact: 'high', source: 'Fallback' },
  ]
}

function mapCategoryToArabic(category: string) {
  const normalized = category.toLowerCase()
  if (normalized.includes('bitcoin') || normalized.includes('crypto')) return 'كريبتو'
  if (normalized.includes('market') || normalized.includes('stock')) return 'أسهم'
  if (normalized.includes('regulation') || normalized.includes('policy')) return 'تنظيم'
  if (normalized.includes('economy') || normalized.includes('macro')) return 'اقتصاد'
  if (normalized.includes('etf')) return 'صناديق'
  return 'أسواق'
}

function mapCategoryColor(category: string) {
  const normalized = category.toLowerCase()
  if (normalized.includes('bitcoin') || normalized.includes('crypto')) return '#f97316'
  if (normalized.includes('stock') || normalized.includes('market')) return '#3b82f6'
  if (normalized.includes('regulation') || normalized.includes('policy')) return '#8b5cf6'
  if (normalized.includes('economy') || normalized.includes('macro')) return '#14b8a6'
  if (normalized.includes('etf')) return '#eab308'
  return '#0ea5e9'
}

function isHighImpact(category: string) {
  const normalized = category.toLowerCase()
  return (
    normalized.includes('bitcoin') ||
    normalized.includes('policy') ||
    normalized.includes('regulation') ||
    normalized.includes('etf') ||
    normalized.includes('macro')
  )
}
