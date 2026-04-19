'use client'

import { useEffect, useRef, useState } from 'react'

interface NewsItem {
  category: string
  categoryAr: string
  color: string
  bgColor: string
  text: string
  impact: 'high' | 'medium'
}

const defaultNewsItems: NewsItem[] = [
  { category: 'Fed', categoryAr: 'الاحتياطي', color: '#d4af37', bgColor: '#d4af3712', text: 'الاحتياطي الفيدرالي يشير إلى خفض محتمل للفائدة في الربع الثالث', impact: 'high' },
  { category: 'Forex', categoryAr: 'فوركس', color: '#0d9488', bgColor: '#0d948812', text: 'EUR/USD يكسر مقاومة رئيسية عند 1.0850', impact: 'medium' },
  { category: 'Crypto', categoryAr: 'كريبتو', color: '#f97316', bgColor: '#f9731612', text: 'بيتكوين يتجاوز 67 ألف دولار بفعل تدفقات صناديق ETF', impact: 'high' },
  { category: 'Metals', categoryAr: 'معادن', color: '#f59e0b', bgColor: '#f59e0b12', text: 'الذهاب يستقر فوق 2,340 دولار', impact: 'medium' },
  { category: 'Stocks', categoryAr: 'أسهم', color: '#3b82f6', bgColor: '#3b82f612', text: 'S&P 500 يصل إلى أعلى مستوى تاريخي جديد', impact: 'high' },
  { category: 'Oil', categoryAr: 'نفط', color: '#6b7280', bgColor: '#6b728012', text: 'النفط الخام ينخفض بفعل مخاوف الطلب', impact: 'medium' },
  { category: 'Economy', categoryAr: 'اقتصاد', color: '#8b5cf6', bgColor: '#8b5cf612', text: 'نمو الناتج المحلي الأمريكي يفوق التوقعات', impact: 'high' },
]

export default function NewsTicker() {
  const tickerRef = useRef<HTMLDivElement>(null)
  const [newsItems, setNewsItems] = useState<NewsItem[]>(defaultNewsItems)

  // Fetch from /api/news/feed (Finnhub) on mount
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/news/feed')
        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data) && data.length > 0) {
            // Map Finnhub data to our format
            const mapped: NewsItem[] = data.slice(0, 15).map((item: any) => ({
              category: item.category || 'General',
              categoryAr: item.categoryAr || item.category || 'عام',
              color: item.color || '#94a3b8',
              bgColor: item.bgColor || '#94a3b812',
              text: item.headline || item.text || item.title || '',
              impact: item.impact || (item.sentiment === 'positive' ? 'medium' : 'high'),
            }))
            setNewsItems(mapped.length > 0 ? mapped : defaultNewsItems)
          }
        }
      } catch {
        // Use default news on error
      }
    }
    fetchNews()
  }, [])

  useEffect(() => {
    if (tickerRef.current) {
      tickerRef.current.style.animation = 'none'
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tickerRef.current.offsetHeight
      tickerRef.current.style.animation = ''
    }
  }, [newsItems])

  const renderNewsItem = (item: NewsItem, index: number) => (
    <div key={index} className="inline-flex items-center gap-2 mx-6 whitespace-nowrap">
      <span className="text-[9px] font-bold px-1.5 py-0 rounded" style={{ color: item.color, background: item.bgColor }}>
        {item.categoryAr}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{item.text}</span>
      <span className="text-[10px]">
        {item.impact === 'high' ? (
          <span style={{ color: 'var(--loss)' }}>●</span>
        ) : (
          <span style={{ color: 'var(--warning)' }}>●</span>
        )}
      </span>
    </div>
  )

  return (
    <div style={{ gridArea: 'news' }} className="flex items-center overflow-hidden">
      {/* LIVE indicator */}
      <div
        className="flex items-center h-full px-3 gap-1.5 shrink-0 border-l"
        style={{ background: 'var(--bg-ticker)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
        <span className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>LIVE</span>
      </div>

      {/* Scrolling news */}
      <div className="flex-1 overflow-hidden h-full flex items-center" style={{ background: 'var(--bg-ticker)' }}>
        <div ref={tickerRef} className="flex items-center h-full" style={{ animation: 'ql-news 60s linear infinite' }}>
          {newsItems.map((item, i) => renderNewsItem(item, i))}
          {newsItems.map((item, i) => renderNewsItem(item, i + newsItems.length))}
        </div>
      </div>
    </div>
  )
}
