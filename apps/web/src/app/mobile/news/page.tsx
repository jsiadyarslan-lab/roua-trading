'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Newspaper, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink, Clock, Tag, ChevronDown, ChevronUp } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface NewsArticle {
  id: string
  source: string
  title: string
  translatedTitle: string
  content: string
  translatedContent: string
  summary: string
  fullContent?: string
  keyTakeaways?: string[]
  imageUrl?: string
  url?: string
  sentiment: number
  sentimentLabel: string
  impactLevel: string
  affectedAssets: string[]
  category: string
  categoryAr?: string
  publishedAt: string
  newsType?: string
}

const CATEGORIES = [
  { key: '', label: 'الكل' },
  { key: 'كريبتو', label: 'كريبتو' },
  { key: 'اقتصاد', label: 'اقتصاد' },
  { key: 'تنظيم', label: 'تنظيم' },
  { key: 'أسواق', label: 'أسواق' },
]

export default function MobileNewsPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      params.set('limit', '20')
      const res = await fetch(`/api/news/latest?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setArticles(data.data)
        }
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [category])

  useEffect(() => { fetchNews() }, [fetchNews])

  const sentimentColor = (s: number) => s > 0.2 ? C.success : s < -0.2 ? C.danger : C.amber
  const sentimentLabelAr = (s: string) => s === 'positive' ? 'إيجابي' : s === 'negative' ? 'سلبي' : 'محايد'
  const sentimentIcon = (s: number) => s > 0.2 ? <TrendingUp size={10} /> : s < -0.2 ? <TrendingDown size={10} /> : <Minus size={10} />

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return dateStr }
  }

  return (
    <div className="m-page">
      <MobilePageHeader
        title="الأخبار"
        subtitle="أخبار مالية بتحليل AI"
        onBack={() => router.back()}
        right={
          <button onClick={fetchNews} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* Category Filter */}
      <div style={{ padding: '0 16px', marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="m-no-scroll">
        <div style={{ display: 'flex', gap: 4, minWidth: 'max-content' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => setCategory(cat.key)} style={{ padding: '5px 14px', borderRadius: 8, background: category === cat.key ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)', border: `0.5px solid ${category === cat.key ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.04)'}`, color: category === cat.key ? C.accent : C.text2, fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" color={C.accent} />
          <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>جارٍ تحميل الأخبار...</span>
        </div>
      ) : articles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
          <Newspaper size={32} color={C.text2} style={{ margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد أخبار حالياً</div>
        </div>
      ) : (
        articles.map((article) => {
          const sc = sentimentColor(article.sentiment)
          const isExpanded = expandedId === article.id
          const displayTitle = article.translatedTitle || article.title
          const displayContent = article.translatedContent || article.content || article.summary
          const displayCategory = article.categoryAr || article.category

          return (
            <IOSCard key={article.id} onClick={() => setExpandedId(isExpanded ? null : article.id)}>
              {/* Category + Sentiment */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag size={9} color={C.text2} />
                  <span style={{ fontSize: 8, fontWeight: 700, color: C.text2, background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 3, fontFamily: "'Cairo', sans-serif" }}>{displayCategory}</span>
                  {article.impactLevel === 'high' && (
                    <span style={{ fontSize: 7, fontWeight: 700, color: C.danger, background: `${C.danger}08`, padding: '1px 4px', borderRadius: 3, fontFamily: "'Cairo', sans-serif" }}>تأثير عالي</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: sc }}>
                  {sentimentIcon(article.sentiment)}
                  <span style={{ fontSize: 8, fontWeight: 800, fontFamily: "'Cairo', sans-serif" }}>{sentimentLabelAr(article.sentimentLabel)}</span>
                </div>
              </div>

              {/* Title */}
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, marginBottom: 4 }}>
                {displayTitle}
              </div>

              {/* Summary / Content */}
              <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: isExpanded ? undefined : 2, WebkitBoxOrient: 'vertical', overflow: isExpanded ? undefined : 'hidden' }}>
                {isExpanded ? (article.fullContent || displayContent) : (article.summary || displayContent)}
              </p>

              {/* Key Takeaways (when expanded) */}
              {isExpanded && article.keyTakeaways && article.keyTakeaways.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>النقاط الرئيسية:</div>
                  {article.keyTakeaways.map((kt, ki) => (
                    <div key={ki} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                      <div style={{ width: 4, height: 4, borderRadius: 2, background: C.accent, marginTop: 6, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>{kt}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Affected Assets */}
              {article.affectedAssets && article.affectedAssets.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                  {article.affectedAssets.map((asset, ai) => (
                    <span key={ai} style={{ fontSize: 8, fontWeight: 700, color: C.accent, background: `${C.accent}08`, padding: '1px 5px', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>{asset}</span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={8} color={C.text2} />
                  <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{formatDate(article.publishedAt)}</span>
                  <span style={{ fontSize: 8, color: C.text2 }}>· {article.source}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {article.url && (
                    <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                      <ExternalLink size={10} color={C.text2} />
                    </a>
                  )}
                  {isExpanded ? <ChevronUp size={12} color={C.text2} /> : <ChevronDown size={12} color={C.text2} />}
                </div>
              </div>
            </IOSCard>
          )
        })
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
