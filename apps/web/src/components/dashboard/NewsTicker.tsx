'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useTranslations, useLocale } from 'next-intl'

interface NewsItem {
  category: string
  categoryAr: string
  categoryFr: string
  categoryTr?: string
  categoryEs?: string
  color: string
  bgColor: string
  text: string
  textAr: string
  textFr: string
  textTr?: string
  textEs?: string
  impact: 'high' | 'medium'
}

const emptyNewsItems: NewsItem[] = []

/**
 * Get the localized text for a news item based on the current locale.
 * Supports: ar, fr, tr, es, and falls back to English (text field) for all others.
 */
function getLocalizedText(item: NewsItem, locale: string): string {
  switch (locale) {
    case 'ar': {
      // Only return Arabic text if it actually contains Arabic characters
      if (item.textAr && /[\u0600-\u06FF]/.test(item.textAr)) return item.textAr
      // Don't fall back to English for Arabic users — return empty to hide item
      return ''
    }
    case 'fr': {
      // Only return French text if it's not Arabic
      if (item.textFr && !/[\u0600-\u06FF]/.test(item.textFr)) return item.textFr
      return item.text
    }
    case 'tr': {
      if (item.textTr && !/[\u0600-\u06FF]/.test(item.textTr)) return item.textTr
      return item.text
    }
    case 'es': {
      if (item.textEs && !/[\u0600-\u06FF]/.test(item.textEs)) return item.textEs
      return item.text
    }
    default: return item.text
  }
}

/**
 * Get the localized category for a news item based on the current locale.
 */
function getLocalizedCategory(item: NewsItem, locale: string): string {
  switch (locale) {
    case 'ar': {
      if (item.categoryAr && /[\u0600-\u06FF]/.test(item.categoryAr)) return item.categoryAr
      return item.category
    }
    case 'fr': return item.categoryFr || item.category
    case 'tr': return item.categoryTr || item.category
    case 'es': return item.categoryEs || item.category
    default: return item.category
  }
}

export default function NewsTicker() {
  const tn = useTranslations('dashboard.news')
  const locale = useLocale()
  const isAr = locale === 'ar'
  const tickerRef = useRef<HTMLDivElement>(null)
  const [newsItems, setNewsItems] = useState<NewsItem[]>(emptyNewsItems)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch from /api/news/feed — use cache: 'no-store' to prevent stale cached responses
  const fetchNews = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      const response = await fetch(`/api/news/feed?lang=${locale}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timeoutId)
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data) && data.length > 0) {
          const errorPatternsAr = [
            '⚠️ جميع نماذج الذكاء الاصطناعي غير متاحة',
            'التحليل غير متاح حالياً',
            'يرجى التحقق من مفاتيح API',
            'يرجى المحاولة لاحقاً',
          ];
          const errorPatternsEn = [
            'All AI models unavailable',
            'Analysis currently unavailable',
            'Please check API keys',
            'Please try again later',
          ];
          const errorPatterns = isAr ? errorPatternsAr : [...errorPatternsAr, ...errorPatternsEn];
          const mapped: NewsItem[] = data.slice(0, 15)
            .filter((item: any) => {
              // Filter out articles with AI error messages
              const title = (item.translatedTitle || '') + (item.title || '');
              const content = (item.translatedContent || '') + (item.content || '');
              return !errorPatterns.some(p => title.includes(p) || content.includes(p));
            })
            // Filter by locale: ensure displayed language matches user's locale
            .filter((item: any) => {
              if (isAr) {
                // Arabic users: only show articles that have actual Arabic text
                const arText = item.textAr || item.translatedTitle || '';
                return arText && /[\u0600-\u06FF]/.test(arText);
              }
              // For non-Arabic locales, filter out Arabic-only text from the main text field
              const mainText = item.text || item.headline || item.title || '';
              return mainText && !/[\u0600-\u06FF]/.test(mainText);
            })
            .map((item: any) => ({
            category: item.category || 'General',
            categoryAr: item.categoryAr || item.category || 'أسواق',
            categoryFr: item.categoryFr || item.category || 'Général',
            categoryTr: item.categoryTr || item.category || 'Genel',
            categoryEs: item.categoryEs || item.category || 'General',
            color: item.color || '#8B92A8',
            bgColor: item.bgColor || '#8B92A812',
            text: item.text || item.headline || item.title || '',
            textAr: (item.textAr && /[\u0600-\u06FF]/.test(item.textAr)) ? item.textAr : (item.translatedTitle && /[\u0600-\u06FF]/.test(item.translatedTitle)) ? item.translatedTitle : '',
            textFr: (item.textFr && !/[\u0600-\u06FF]/.test(item.textFr)) ? item.textFr : '',
            textTr: (item.textTr && !/[\u0600-\u06FF]/.test(item.textTr)) ? item.textTr : '',
            textEs: (item.textEs && !/[\u0600-\u06FF]/.test(item.textEs)) ? item.textEs : '',
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
  }, [locale, isAr])

  useEffect(() => { fetchNews() }, [fetchNews])

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

  const renderNewsItem = (item: NewsItem, index: number) => {
    const displayText = getLocalizedText(item, locale)
    // Skip items that have no text in the current locale
    if (!displayText) return null
    return (
      <div key={`${item.text?.slice(0, 30)}-${index}`} className="inline-flex items-center gap-2 mx-6 whitespace-nowrap">
        <span className="text-[9px] font-bold px-1.5 py-0 rounded" style={{ color: item.color, background: item.bgColor }}>
          {getLocalizedCategory(item, locale)}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{displayText}</span>
        <span className="text-[10px]">
          {item.impact === 'high' ? (
            <span style={{ color: 'var(--loss)' }}>●</span>
          ) : (
            <span style={{ color: 'var(--warning)' }}>●</span>
          )}
        </span>
      </div>
    )
  }

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
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tn('loading')}</span>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="flex items-center h-full px-4">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tn('unavailable')}</span>
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
