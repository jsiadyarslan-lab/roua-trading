'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header, Card, SkelCard } from '@/components/mobile/FluxComponents'
import { Newspaper, TrendingUp, TrendingDown, Minus, ExternalLink, Clock, RefreshCw, Filter } from 'lucide-react'

/* ═══ Types ═══ */
interface NewsItem {
  id: string
  source: string
  title: string
  translatedTitle?: string
  content?: string
  translatedContent?: string
  summary?: string
  url?: string
  sentiment: number
  sentimentLabel: string
  impactLevel: string
  affectedAssets?: string[]
  category?: string
  categoryAr?: string
  publishedAt: string
  imageUrl?: string
  keyTakeaways?: string[]
  newsType?: string
  slug?: string
}

const SENTIMENT_FILTERS = [
  { value: '', label: 'الكل' },
  { value: 'positive', label: 'إيجابي' },
  { value: 'negative', label: 'سلبي' },
  { value: 'neutral', label: 'محايد' },
]

/* ═══ Time Formatter ═══ */
function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = Date.now()
    const diffMs = now - date.getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'الآن'
    if (mins < 60) return `منذ ${mins} دقيقة`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `منذ ${hours} ساعة`
    const days = Math.floor(hours / 24)
    return `منذ ${days} يوم`
  } catch {
    return ''
  }
}

/* ═══ Sentiment Badge ═══ */
function SentimentBadge({ sentiment, label }: { sentiment: number; label: string }) {
  const color = label === 'positive' ? '#00FFA3' : label === 'negative' ? '#FF4757' : '#FFB800'
  const icon = label === 'positive' ? TrendingUp : label === 'negative' ? TrendingDown : Minus
  const Icon = icon
  const text = label === 'positive' ? 'إيجابي' : label === 'negative' ? 'سلبي' : 'محايد'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 5, background: `${color}10`, border: `0.5px solid ${color}20` }}>
      <Icon size={9} color={color} />
      <span style={{ fontSize: 8, fontWeight: 800, color, fontFamily: 'var(--f-cairo)' }}>{text}</span>
    </div>
  )
}

/* ═══ News Card ═══ */
function NewsCard({ item, onReadMore }: { item: NewsItem; onReadMore: (item: NewsItem) => void }) {
  const displayTitle = item.translatedTitle || item.title
  const displaySummary = item.summary || item.content || ''
  const truncatedSummary = displaySummary.length > 120 ? displaySummary.slice(0, 120) + '...' : displaySummary

  return (
    <Card onClick={() => onReadMore(item)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.categoryAr && (
            <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: 'rgba(0,212,255,0.08)', color: '#00D4FF', border: '0.5px solid rgba(0,212,255,0.15)', fontFamily: 'var(--f-cairo)' }}>
              {item.categoryAr}
            </span>
          )}
          <SentimentBadge sentiment={item.sentiment} label={item.sentimentLabel} />
          {item.impactLevel === 'high' && (
            <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: 'rgba(255,71,87,0.08)', color: '#FF4757', border: '0.5px solid rgba(255,71,87,0.15)', fontFamily: 'var(--f-cairo)' }}>
              تأثير عالي
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)', lineHeight: 1.5, marginBottom: 6 }}>
        {displayTitle}
      </div>

      {/* Summary */}
      {truncatedSummary && (
        <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)', lineHeight: 1.6, marginBottom: 8 }}>
          {truncatedSummary}
        </div>
      )}

      {/* Assets */}
      {item.affectedAssets && item.affectedAssets.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {item.affectedAssets.slice(0, 4).map(asset => (
            <span key={asset} style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'rgba(179,136,255,0.08)', color: '#B388FF', border: '0.5px solid rgba(179,136,255,0.15)', fontFamily: 'var(--f-mono)' }}>
              {asset}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{item.source}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>·</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={8} color="rgba(255,255,255,0.3)" />
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{formatTimeAgo(item.publishedAt)}</span>
          </div>
        </div>
        <ExternalLink size={12} color="rgba(255,255,255,0.2)" />
      </div>
    </Card>
  )
}

/* ═══ News Detail Modal ═══ */
function NewsDetail({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const displayTitle = item.translatedTitle || item.title
  const displayContent = item.translatedContent || item.content || item.summary || ''

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', direction: 'rtl' }} onClick={e => e.stopPropagation()}>
        <Card noMargin highlight>
          {/* Close */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SentimentBadge sentiment={item.sentiment} label={item.sentimentLabel} />
              {item.impactLevel === 'high' && <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: 'rgba(255,71,87,0.08)', color: '#FF4757', fontFamily: 'var(--f-cairo)' }}>تأثير عالي</span>}
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: '#8B92A8', fontSize: 10, fontFamily: 'var(--f-cairo)' }}>
              إغلاق
            </button>
          </div>

          {/* Title */}
          <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-cairo)', lineHeight: 1.6, marginBottom: 10 }}>
            {displayTitle}
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>
            <span>{item.source}</span>
            <span>·</span>
            <span>{new Date(item.publishedAt).toLocaleDateString('ar-EG')}</span>
            {item.categoryAr && <><span>·</span><span style={{ color: '#00D4FF' }}>{item.categoryAr}</span></>}
          </div>

          {/* Content */}
          <div style={{ fontSize: 12, color: '#F0F2F5', fontFamily: 'var(--f-cairo)', lineHeight: 1.8, marginBottom: 14 }}>
            {displayContent}
          </div>

          {/* Key Takeaways */}
          {item.keyTakeaways && item.keyTakeaways.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--f-cairo)', marginBottom: 6 }}>النقاط الرئيسية</div>
              {item.keyTakeaways.map((kt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#00D4FF', fontFamily: 'var(--f-mono)', flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)', lineHeight: 1.6 }}>{kt}</span>
                </div>
              ))}
            </div>
          )}

          {/* Affected Assets */}
          {item.affectedAssets && item.affectedAssets.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#B388FF', fontFamily: 'var(--f-cairo)', marginBottom: 6 }}>الأصول المتأثرة</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {item.affectedAssets.map(asset => (
                  <span key={asset} style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: 'rgba(179,136,255,0.08)', color: '#B388FF', border: '0.5px solid rgba(179,136,255,0.15)', fontFamily: 'var(--f-mono)' }}>
                    {asset}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Open link */}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 0', borderRadius: 10,
                background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.15)',
                color: '#00D4FF', fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-cairo)',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={12} />
              قراءة المقال الأصلي
            </a>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ═══ Main Page ═══ */
export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sentimentFilter, setSentimentFilter] = useState('')
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null)
  const [source, setSource] = useState<string>('')

  const fetchNews = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '25')
      if (sentimentFilter) params.set('sentiment', sentimentFilter)
      const res = await fetch(`/api/news/latest?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setNews(data.data)
          setSource(data.source || '')
        }
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [sentimentFilter])

  useEffect(() => {
    setLoading(true)
    fetchNews()
    const interval = setInterval(() => fetchNews(), 300000) // 5 min
    return () => clearInterval(interval)
  }, [fetchNews])

  return (
    <div className="f-page">
      <Header
        title="الأخبار"
        subtitle={source ? `المصدر: ${source === 'roua-news' ? 'رؤى للأخبار' : source === 'local' ? 'محلي' : source}` : 'آخر الأخبار'}
        right={
          <button
            onClick={() => fetchNews(true)}
            disabled={refreshing}
            style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={14} color={refreshing ? '#00D4FF' : 'rgba(255,255,255,0.4)'} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        }
      />

      {/* Sentiment filter tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2, margin: '0 var(--s4) var(--s2)' }}>
        {SENTIMENT_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setSentimentFilter(f.value)}
            className={sentimentFilter === f.value ? 'f-tabs__item f-tabs__item--active' : 'f-tabs__item'}
            style={{ flex: 1 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* News list */}
      {loading ? (
        <>{[1, 2, 3, 4, 5].map(i => <SkelCard key={i} lines={3} />)}</>
      ) : (
        <div className="f-stagger">
          {news.map(item => (
            <NewsCard key={item.id} item={item} onReadMore={setSelectedItem} />
          ))}
        </div>
      )}

      {!loading && news.length === 0 && (
        <div className="f-empty">
          <Newspaper size={40} color="rgba(255,255,255,0.1)" />
          <div className="f-empty__title">لا توجد أخبار متاحة حالياً</div>
        </div>
      )}

      {/* News detail overlay */}
      {selectedItem && <NewsDetail item={selectedItem} onClose={() => setSelectedItem(null)} />}

      <div style={{ height: 80 }} />
    </div>
  )
}
