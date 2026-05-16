'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowRight,
  Clock,
  Globe,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertTriangle,
  Share2,
  Bookmark,
} from 'lucide-react'
import { safeStr } from '@/lib/utils'
import { TExtended as T } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

const FONT_AR = 'var(--font-ar)'
const FONT_MONO = 'var(--font-mono)'

type NewsItem = {
  id: string
  source: string
  title: string
  translatedTitle?: string
  content?: string
  translatedContent?: string
  summary?: string
  fullContent?: string
  keyTakeaways?: string[]
  imageUrl?: string | null
  url?: string | null
  sentiment?: number
  sentimentLabel?: string
  impactLevel?: string
  affectedAssets?: string[]
  category?: string
  categoryAr?: string
  publishedAt?: string
  slug?: string
  newsType?: string
}

export default function NewsArticlePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [article, setArticle] = useState<NewsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useScopedStyle(`@keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`)

  useEffect(() => {
    async function fetchArticle() {
      setLoading(true)
      setError('')
      try {
        // Fetch all news and find by slug
        const res = await fetch('/api/news/latest?limit=50', { cache: 'no-store' })
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          const found = data.data.find((a: NewsItem) => a.slug === slug || a.id === slug)
          if (found) {
            setArticle(found)
          } else {
            setError('لم يتم العثور على الخبر')
          }
        } else {
          setError('لم يتم العثور على الخبر')
        }
      } catch {
        setError('تعذر تحميل الخبر')
      } finally {
        setLoading(false)
      }
    }
    if (slug) fetchArticle()
  }, [slug])

  if (loading) {
    return (
      <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.cyan, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: T.text2, fontSize: 14 }}>جارٍ تحميل الخبر...</p>
        </div>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
          <AlertTriangle size={40} color={T.red} style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{error || 'خبر غير موجود'}</h2>
          <button onClick={() => router.back()} style={{ padding: '10px 24px', borderRadius: 12, background: T.cyan, color: '#000', border: 'none', fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer' }}>العودة</button>
        </div>
      </div>
    )
  }

  const displayTitle = article.translatedTitle || article.title
  const sentiment = getSentimentConfig(article.sentimentLabel)
  const SentimentIcon = sentiment.icon

  return (
    <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text }}>
      {/* Hero Image */}
      {article.imageUrl && (
        <div style={{ width: '100%', maxHeight: 400, overflow: 'hidden', position: 'relative' }}>
          <img src={article.imageUrl} alt={safeStr(displayTitle)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(transparent, #0B0E14)' }} />
        </div>
      )}

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 10,
            background: T.card, border: `1px solid ${T.border}`,
            color: T.text2, cursor: 'pointer', fontSize: 12,
            fontFamily: FONT_AR, fontWeight: 700, marginBottom: 20,
          }}
        >
          <ArrowRight size={14} />
          العودة للأخبار
        </button>

        {/* Category + Sentiment Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {article.categoryAr && (
            <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, background: `${T.cyan}12`, color: T.cyan, fontWeight: 800, border: `0.5px solid ${T.cyan}22` }}>
              {article.categoryAr}
            </span>
          )}
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, background: sentiment.bg, color: sentiment.color, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
            <SentimentIcon size={12} />
            {sentiment.text}
          </span>
          {article.impactLevel && (
            <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, background: `${T.amber}12`, color: T.amber, fontWeight: 800 }}>
              تأثير {article.impactLevel === 'high' ? 'عالي' : article.impactLevel === 'low' ? 'منخفض' : 'متوسط'}
            </span>
          )}
          <span style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'center', gap: 4, marginInlineStart: 'auto' }}>
            <Clock size={12} />
            {formatTime(article.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.6, marginBottom: 12, color: T.text }}>
          {displayTitle}
        </h1>

        {/* English subtitle */}
        {article.translatedTitle && article.translatedTitle !== article.title && (
          <p style={{ fontSize: 14, color: T.text3, direction: 'ltr', textAlign: 'left', fontFamily: FONT_MONO, marginBottom: 16, lineHeight: 1.6 }}>
            {article.title}
          </p>
        )}

        {/* Source + Share row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${T.cyan}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={16} color={T.cyan} />
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, display: 'block' }}>{article.source || 'رؤى للأخبار'}</span>
              <span style={{ fontSize: 11, color: T.text3 }}>{formatTime(article.publishedAt)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ width: 36, height: 36, borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, color: T.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bookmark size={16} />
            </button>
            <button style={{ width: 36, height: 36, borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, color: T.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Share2 size={16} />
            </button>
            {article.url && (
              <a href={article.url} target="_blank" rel="noreferrer" style={{ width: 36, height: 36, borderRadius: 10, background: `${T.cyan}12`, border: `1px solid ${T.cyan}22`, color: T.cyan, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                <ExternalLink size={16} />
              </a>
            )}
          </div>
        </div>

        {/* Key Takeaways */}
        {Array.isArray(article.keyTakeaways) && article.keyTakeaways.length > 0 && (
          <div style={{ margin: '0 0 24px', padding: '16px 18px', background: `${T.green}06`, borderRadius: 14, border: `0.5px solid ${T.green}15` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Zap size={14} color={T.green} />
              <span style={{ fontSize: 13, fontWeight: 800, color: T.green }}>النقاط الرئيسية</span>
            </div>
            {article.keyTakeaways.map((point, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, color: T.green, marginTop: 4, flexShrink: 0 }}>●</span>
                <span style={{ fontSize: 13, color: T.text2, lineHeight: 1.7 }}>{point}</span>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {article.summary && (
          <div style={{ margin: '0 0 24px', padding: '16px 18px', background: `${T.cyan}06`, borderRadius: 14, borderRight: `3px solid ${sentiment.color}55` }}>
            <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.85, margin: 0 }}>{article.summary}</p>
          </div>
        )}

        {/* Full Content */}
        {article.fullContent && article.fullContent.length > 10 && (
          <ArticleFullContent content={article.fullContent} />
        )}

        {/* Arabic Content fallback */}
        {!article.fullContent && article.translatedContent && (
          <div style={{ fontSize: 15, color: T.text2, lineHeight: 1.9, marginBottom: 24, whiteSpace: 'pre-wrap' }}>
            {article.translatedContent}
          </div>
        )}

        {/* Affected Assets */}
        {Array.isArray(article.affectedAssets) && article.affectedAssets.length > 0 && (
          <div style={{ margin: '0 0 24px', padding: '16px 18px', background: T.card, borderRadius: 14, border: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.amber, display: 'block', marginBottom: 10 }}>الأصول المتأثرة</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {article.affectedAssets.map((asset, i) => (
                <span key={i} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, background: `${T.amber}12`, color: T.amber, fontWeight: 800, fontFamily: FONT_MONO, border: `0.5px solid ${T.amber}22` }}>
                  {safeStr(asset)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: `${T.amber}04`, border: `0.5px solid ${T.amber}10`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 10, color: `${T.amber}88`, lineHeight: 1.6, margin: 0 }}>
            الأخبار والتحليلات مقدمة لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.
          </p>
        </div>
      </div>
    </div>
  )
}

function getSentimentConfig(label?: string) {
  switch (label) {
    case 'positive': return { bg: `${T.green}14`, color: T.green, text: 'إيجابي', icon: TrendingUp }
    case 'negative': return { bg: `${T.red}14`, color: T.red, text: 'سلبي', icon: TrendingDown }
    default: return { bg: `${T.text3}14`, color: T.text3, text: 'محايد', icon: Minus }
  }
}

function formatTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Renders full content with [N] Section Title format
 */
function ArticleFullContent({ content }: { content: string }) {
  const sectionRegex = /\[(\d+)\]\s*([^\[]+)/g
  const sections: { num: string; title: string; body: string }[] = []
  let match

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionEnd = content.indexOf('[', match.index + match[0].length)
    const bodyText = sectionEnd > -1
      ? content.slice(match.index + match[0].length, sectionEnd).trim()
      : content.slice(match.index + match[0].length).trim()
    sections.push({ num: match[1], title: match[2].trim(), body: bodyText })
  }

  if (sections.length === 0) {
    return <div style={{ fontSize: 15, color: T.text2, lineHeight: 1.9, marginBottom: 24, whiteSpace: 'pre-wrap' }}>{content}</div>
  }

  const sectionColors: Record<string, string> = {
    '1': T.cyan,
    '2': T.amber,
    '3': T.green,
    '4': '#B388FF',
    '5': T.red,
  }

  const sectionIcons: Record<string, string> = {
    '1': '📰',
    '2': '💡',
    '3': '📊',
    '4': '👁',
    '5': '🎯',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
      {sections.map((section) => {
        const color = sectionColors[section.num] || T.cyan
        return (
          <div key={section.num} style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${color}18` }}>
            <div style={{ padding: '12px 16px', background: `${color}0A`, borderBottom: `1px solid ${color}12`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{sectionIcons[section.num] || '📌'}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color }}>{section.title}</span>
            </div>
            <div style={{ padding: '14px 16px', background: `${color}03` }}>
              <p style={{ fontSize: 14, color: T.text2, lineHeight: 1.85, margin: 0, whiteSpace: 'pre-wrap' }}>{section.body}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
