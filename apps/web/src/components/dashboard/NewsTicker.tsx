'use client'

import { useEffect, useRef, useState } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'

interface NewsItem {
  category: string
  categoryAr: string
  color: string
  bgColor: string
  text: string
  textAr: string
  impact: 'high' | 'medium'
}

const emptyNewsItems: NewsItem[] = []

export default function NewsTicker() {
  const tickerRef = useRef<HTMLDivElement>(null)
  const [newsItems, setNewsItems] = useState<NewsItem[]>(emptyNewsItems)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch from /api/news/feed on mount, then refresh every 5 minutes
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
            const errorPatterns = [
              '⚠️ جميع نماذج الذكاء الاصطناعي غير متاحة',
              'التحليل غير متاح حالياً',
              'يرجى التحقق من مفاتيح API',
              'يرجى المحاولة لاحقاً',
            ];
            const mapped: NewsItem[] = data.slice(0, 15)
              .filter((item: any) => {
                // Filter out articles with AI error messages
                const title = (item.translatedTitle || '') + (item.title || '');
                const content = (item.translatedContent || '') + (item.content || '');
                return !errorPatterns.some(p => title.includes(p) || content.includes(p));
              })
              .map((item: any) => ({
              category: item.category || 'General',
              categoryAr: item.categoryAr || item.category || 'عام',
              color: item.color || '#8B92A8',
              bgColor: item.bgColor || '#8B92A812',
              text: item.text || item.headline || item.title || '',
              textAr: item.textAr || item.translatedTitle || item.text || item.headline || item.title || '',
              impact: item.impact || (item.sentiment === 'positive' ? 'medium' : 'high'),
            }))
            if (mapped.length > 0) setNewsItems(mapped)
          }
        }
      } catch {
        // Silently handle fetch errors — component will show empty state
      } finally {
        setIsLoading(false)
      }
    }
    fetchNews()
    return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh news every 5 min — pauses when tab hidden
  useVisibleInterval(fetchNews, 5 * 60 * 1000)

  useEffect(() => {
    if (tickerRef.current) {
      tickerRef.current.style.animation = 'none'
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tickerRef.current.offsetHeight
      tickerRef.current.style.animation = ''
    }
  }, [newsItems])

  const renderNewsItem = (item: NewsItem, index: number) => (
    <div key={`${item.textAr?.slice(0, 30) || item.text?.slice(0, 30)}-${index}`} className="inline-flex items-center gap-2 mx-6 whitespace-nowrap">
      <span className="text-[9px] font-bold px-1.5 py-0 rounded" style={{ color: item.color, background: item.bgColor }}>
        {item.categoryAr}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{item.textAr || item.text}</span>
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

      {/* Scrolling news — or loading/empty state */}
      <div className="flex-1 overflow-hidden h-full flex items-center" style={{ background: 'var(--bg-ticker)' }}>
        {isLoading ? (
          <div className="flex items-center h-full px-4">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>جاري تحميل الأخبار...</span>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="flex items-center h-full px-4">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>لا توجد أخبار متاحة حالياً</span>
          </div>
        ) : (
          <div ref={tickerRef} className="flex items-center h-full" style={{ animation: 'ql-news 60s linear infinite' }}>
            {newsItems.map((item, i) => renderNewsItem(item, i))}
            {newsItems.map((item, i) => renderNewsItem(item, i + newsItems.length))}
          </div>
        )}
      </div>
    </div>
  )
}
