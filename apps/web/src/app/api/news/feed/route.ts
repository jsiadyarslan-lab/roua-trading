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
    
    // Simple regex-based XML parsing to avoid installing external xml parsers
    const items: any[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const itemContent = match[1]
      const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(itemContent) || /<title>(.*?)<\/title>/.exec(itemContent)
      const categoryMatch = /<category><!\[CDATA\[(.*?)\]\]><\/category>/.exec(itemContent) || /<category>(.*?)<\/category>/.exec(itemContent)
      
      if (titleMatch) {
        items.push({
          category: categoryMatch ? categoryMatch[1] : 'Crypto',
          categoryAr: categoryMatch ? 'كريبتو' : 'كريبتو',
          color: '#f97316',
          bgColor: '#f9731612',
          text: titleMatch[1].trim(),
          impact: 'high'
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
    { category: 'Fed', categoryAr: 'الاحتياطي', color: '#d4af37', bgColor: '#d4af3712', text: 'الاحتياطي الفيدرالي يشير إلى خفض محتمل للفائدة في الربع الثالث', impact: 'high' },
    { category: 'Forex', categoryAr: 'فوركس', color: '#0d9488', bgColor: '#0d948812', text: 'EUR/USD يكسر مقاومة رئيسية عند 1.0850', impact: 'medium' },
    { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'بيتكوين يتجاوز 67 ألف دولار بفعل تدفقات صناديق ETF', impact: 'high' },
    { category: 'Metals', categoryAr: 'معادن', color: '#f59e0b', bgColor: '#f59e0b12', text: 'الذهب يستقر فوق 2,340 دولار', impact: 'medium' },
    { category: 'Stocks', categoryAr: 'أسهم', color: '#3b82f6', bgColor: '#3b82f612', text: 'S&P 500 يصل إلى أعلى مستوى تاريخي جديد', impact: 'high' },
    { category: 'Oil', categoryAr: 'نفط', color: '#6b7280', bgColor: '#6b728012', text: 'النفط الخام ينخفض بفعل مخاوف الطلب', impact: 'medium' },
    { category: 'Economy', categoryAr: 'اقتصاد', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'نمو الناتج المحلي الأمريكي يفوق التوقعات', impact: 'high' },
  ]
}
