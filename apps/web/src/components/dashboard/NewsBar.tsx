'use client'

import { useEffect, useRef, useState } from 'react'

interface NewsItem {
  category: string
  color: string
  borderColor: string
  bgColor: string
  text: string
}

const defaultNewsItems: NewsItem[] = [
  { category: 'Fed', color: '#0A84FF', borderColor: '#0A84FF35', bgColor: '#0A84FF18', text: 'US Fed keeps interest rates unchanged amid market uncertainty' },
  { category: 'Forex', color: '#00FFC6', borderColor: '#00FFC635', bgColor: '#00FFC618', text: 'Euro rises against the Dollar following positive Eurozone data' },
  { category: 'Metals', color: '#FFB800', borderColor: '#FFB80035', bgColor: '#FFB80018', text: 'Gold breaks resistance level driven by strong central bank demand' },
  { category: 'Crypto', color: '#A259FF', borderColor: '#A259FF35', bgColor: '#A259FF18', text: 'Bitcoin recovers to key level after a sharp multi-day correction' },
  { category: 'Stocks', color: '#0A84FF', borderColor: '#0A84FF35', bgColor: '#0A84FF18', text: 'Nasdaq index rises 1.4% driven by major tech stocks' },
  { category: 'Oil', color: '#FF8C00', borderColor: '#FF8C0035', bgColor: '#FF8C0018', text: 'Crude oil drops after reports of US crude inventories rising' },
  { category: 'Economy', color: '#00FFC6', borderColor: '#00FFC635', bgColor: '#00FFC618', text: 'US jobs report shows strong growth — 250k jobs added' },
]

export default function NewsBar() {
  const tickerRef = useRef<HTMLDivElement>(null)
  const [newsItems, setNewsItems] = useState<NewsItem[]>(defaultNewsItems)

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        const response = await fetch('/api/news/feed', { signal: controller.signal })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data) && data.length > 0) {
            const mapped: NewsItem[] = data.slice(0, 15).map((item: any) => ({
              category: item.category || 'General',
              color: item.color || '#94a3b8',
              borderColor: item.borderColor || '#94a3b835',
              bgColor: item.bgColor || '#94a3b818',
              text: item.headline || item.text || item.title || '',
            }))
            if (mapped.length > 0) setNewsItems(mapped)
          }
        }
      } catch { /* use defaults */ }
    }
    fetchNews()
  }, [])

  useEffect(() => {
    if (tickerRef.current) {
      tickerRef.current.style.animation = 'none'
      void tickerRef.current.offsetHeight
      tickerRef.current.style.animation = ''
    }
  }, [newsItems])

  const renderItem = (item: NewsItem, idx: number) => (
    <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '0 24px', flexShrink: 0, borderInlineStart: '1px solid rgba(255,255,255,0.04)', direction: 'ltr' }}>
      <span style={{ fontFamily: 'var(--font-ar), Inter, sans-serif', fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: item.bgColor, border: `1px solid ${item.borderColor}`, color: item.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {item.category}
      </span>
      <span style={{ fontFamily: 'var(--font-ar), Inter, sans-serif', fontSize: '11px', fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(210,220,235,0.85)', whiteSpace: 'nowrap' }}>
        {item.text}
      </span>
    </div>
  )

  return (
    <div className="bar-news" style={{ gridArea: 'news' }}>
      <div id="news-bar" style={{ width: '100%', height: '26px', overflow: 'hidden', background: 'rgba(2,3,8,0.97)', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 10 }}>
        <div style={{ flex: '1 1 0%', overflow: 'hidden', position: 'relative', height: '100%' }}>
          <div ref={tickerRef} style={{ display: 'inline-flex', alignItems: 'center', height: '100%', animation: 'ql-news 95s linear infinite', willChange: 'transform', whiteSpace: 'nowrap' }}>
            {newsItems.map((item, i) => renderItem(item, i))}
            {newsItems.map((item, i) => renderItem(item, i + newsItems.length))}
          </div>
        </div>
      </div>
    </div>
  )
}
