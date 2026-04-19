'use client'

import { useEffect, useRef } from 'react'

interface NewsItem {
  category: string
  categoryAr: string
  color: string
  bgColor: string
  text: string
  impact: 'high' | 'medium'
}

const newsItems: NewsItem[] = [
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

  useEffect(() => {
    // Force reflow for animation reset
    if (tickerRef.current) {
      tickerRef.current.style.animation = 'none'
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tickerRef.current.offsetHeight
      tickerRef.current.style.animation = ''
    }
  }, [])

  const renderNewsItem = (item: NewsItem, index: number) => (
    <div key={index} className="inline-flex items-center gap-2 mx-6 whitespace-nowrap">
      <span
        className="text-[9px] font-bold px-1.5 py-0 rounded"
        style={{ color: item.color, background: item.bgColor }}
      >
        {item.categoryAr}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {item.text}
      </span>
      <span className="text-[10px]">
        {item.impact === 'high' ? '🔴' : '🟡'}
      </span>
    </div>
  )

  return (
    <div
      style={{ gridArea: 'news' }}
      className="flex items-center overflow-hidden"
    >
      <div
        className="flex items-center h-full px-3 gap-1.5 shrink-0 border-l"
        style={{
          background: 'var(--bg-ticker)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
        <span className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>
          LIVE
        </span>
      </div>
      <div
        className="flex-1 overflow-hidden h-full flex items-center"
        style={{ background: 'var(--bg-ticker)' }}
      >
        <div
          ref={tickerRef}
          className="flex items-center h-full"
          style={{
            animation: 'ql-news 60s linear infinite',
          }}
        >
          {/* First set */}
          {newsItems.map((item, i) => renderNewsItem(item, i))}
          {/* Duplicate for seamless loop */}
          {newsItems.map((item, i) => renderNewsItem(item, i + newsItems.length))}
        </div>
      </div>
    </div>
  )
}
