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
  Eye,
  Target,
  BarChart3,
  Newspaper,
  Lightbulb,
  ShieldAlert,
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

/* ─── Section Config ─── */
const SECTION_CONFIG: Record<string, { icon: any; gradient: string; borderColor: string; bgColor: string; iconBg: string }> = {
  '1': { icon: Newspaper, gradient: 'linear-gradient(135deg, #00E5FF, #00B0FF)', borderColor: '#00E5FF40', bgColor: '#00E5FF08', iconBg: '#00E5FF18' },
  '2': { icon: Lightbulb, gradient: 'linear-gradient(135deg, #FFB800, #FF8F00)', borderColor: '#FFB80040', bgColor: '#FFB80008', iconBg: '#FFB80018' },
  '3': { icon: BarChart3, gradient: 'linear-gradient(135deg, #32D74B, #00C853)', borderColor: '#32D74B40', bgColor: '#32D74B08', iconBg: '#32D74B18' },
  '4': { icon: Eye, gradient: 'linear-gradient(135deg, #B388FF, #7C4DFF)', borderColor: '#B388FF40', bgColor: '#B388FF08', iconBg: '#B388FF18' },
  '5': { icon: Target, gradient: 'linear-gradient(135deg, #FF453A, #FF1744)', borderColor: '#FF453A40', bgColor: '#FF453A08', iconBg: '#FF453A18' },
}

export default function NewsArticlePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [article, setArticle] = useState<NewsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imageError, setImageError] = useState(false)

  useScopedStyle(`
    @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 8px rgba(0,229,255,0.2); } 50% { box-shadow: 0 0 20px rgba(0,229,255,0.4); } }
    .section-card { transition: transform 0.2s, box-shadow 0.2s; }
    .section-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
  `)

  useEffect(() => {
    async function fetchArticle() {
      setLoading(true)
      setError('')
      try {
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
          <div style={{ width: 44, height: 44, border: `3px solid ${T.border}`, borderTopColor: T.cyan, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
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
  const hasImage = article.imageUrl && !imageError

  return (
    <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text }}>

      {/* ─── Hero Section with Image ─── */}
      {hasImage && (
        <div style={{ width: '100%', height: 420, overflow: 'hidden', position: 'relative' }}>
          <img
            src={article.imageUrl!}
            alt={safeStr(displayTitle)}
            onError={() => setImageError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Multi-layer gradient overlay */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to bottom, rgba(11,14,20,0.6), transparent)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 240, background: 'linear-gradient(to top, #0B0E14 5%, rgba(11,14,20,0.92) 40%, transparent 100%)' }} />

          {/* Back button on image */}
          <button
            onClick={() => router.back()}
            style={{
              position: 'absolute', top: 20, right: 20,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 12,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              color: '#FFF', cursor: 'pointer', fontSize: 13,
              fontFamily: FONT_AR, fontWeight: 700,
            }}
          >
            <ArrowRight size={15} />
            العودة
          </button>

          {/* Category badge on image */}
          <div style={{ position: 'absolute', bottom: 20, right: 24, display: 'flex', gap: 8, alignItems: 'center' }}>
            {article.categoryAr && (
              <span style={{ fontSize: 11, padding: '5px 14px', borderRadius: 10, background: 'rgba(0,229,255,0.2)', backdropFilter: 'blur(8px)', color: '#00E5FF', fontWeight: 800, border: '0.5px solid rgba(0,229,255,0.3)' }}>
                {article.categoryAr}
              </span>
            )}
            {article.newsType === 'live' && (
              <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,69,58,0.25)', color: '#FF453A', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF453A', animation: 'pulse-glow 2s infinite' }} />
                مباشر
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─── Content Container ─── */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: hasImage ? '0 20px 40px' : '24px 20px 40px' }}>

        {/* Back button when no image */}
        {!hasImage && (
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
        )}

        {/* ─── Article Header ─── */}
        <div style={{ animation: 'fade-in 0.4s ease-out', marginBottom: 28 }}>
          {/* Badges row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {!hasImage && article.categoryAr && (
              <span style={{ fontSize: 11, padding: '5px 14px', borderRadius: 10, background: `${T.cyan}12`, color: T.cyan, fontWeight: 800, border: `0.5px solid ${T.cyan}22` }}>
                {article.categoryAr}
              </span>
            )}
            <span style={{ fontSize: 11, padding: '5px 14px', borderRadius: 10, background: sentiment.bg, color: sentiment.color, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
              <SentimentIcon size={13} />
              {sentiment.text}
            </span>
            {article.impactLevel && (
              <span style={{ fontSize: 11, padding: '5px 14px', borderRadius: 10, background: `${T.amber}12`, color: T.amber, fontWeight: 800 }}>
                تأثير {article.impactLevel === 'high' ? 'عالي' : article.impactLevel === 'low' ? 'منخفض' : 'متوسط'}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.65, marginBottom: 12, color: T.text, letterSpacing: '-0.01em' }}>
            {displayTitle}
          </h1>

          {/* English subtitle */}
          {article.translatedTitle && article.translatedTitle !== article.title && (
            <p style={{ fontSize: 13, color: T.text3, direction: 'ltr', textAlign: 'left', fontFamily: FONT_MONO, marginBottom: 16, lineHeight: 1.6, opacity: 0.6 }}>
              {article.title}
            </p>
          )}

          {/* Meta row: Source + Time + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #00E5FF20, #00B0FF20)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid #00E5FF22' }}>
                <Globe size={18} color="#00E5FF" />
              </div>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block' }}>{article.source || 'رؤى للأخبار'}</span>
                <span style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} />
                  {formatTime(article.publishedAt)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ width: 38, height: 38, borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, color: T.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                <Bookmark size={16} />
              </button>
              <button style={{ width: 38, height: 38, borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, color: T.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                <Share2 size={16} />
              </button>
              {article.url && (
                <a href={article.url} target="_blank" rel="noreferrer" style={{ width: 38, height: 38, borderRadius: 10, background: `${T.cyan}12`, border: `1px solid ${T.cyan}22`, color: T.cyan, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', transition: 'all 0.2s' }}>
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ─── Key Takeaways Panel ─── */}
        {Array.isArray(article.keyTakeaways) && article.keyTakeaways.length > 0 && (
          <div style={{
            animation: 'slide-up 0.5s ease-out 0.1s both',
            margin: '0 0 28px', borderRadius: 18, overflow: 'hidden',
            border: `1px solid ${T.green}20`,
            background: `linear-gradient(135deg, ${T.green}06, ${T.green}02)`,
          }}>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.green}12` }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `${T.green}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} color={T.green} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 900, color: T.green }}>النقاط الرئيسية</span>
              <span style={{ fontSize: 11, color: `${T.green}80`, fontFamily: FONT_MONO, marginRight: 4 }}>({article.keyTakeaways.length})</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {article.keyTakeaways.map((point, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i < article.keyTakeaways!.length - 1 ? 12 : 0, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: `${T.green}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 11, color: T.green, fontWeight: 900 }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 14, color: T.text2, lineHeight: 1.75 }}>{point}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Summary Box ─── */}
        {article.summary && (
          <div style={{
            animation: 'slide-up 0.5s ease-out 0.15s both',
            margin: '0 0 28px', padding: '20px 22px',
            background: `linear-gradient(135deg, ${sentiment.color}06, ${sentiment.color}02)`,
            borderRadius: 18,
            borderRight: `4px solid ${sentiment.color}`,
            border: `1px solid ${sentiment.color}15`,
            borderRightWidth: 4, borderRightColor: sentiment.color,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <SentimentIcon size={16} color={sentiment.color} />
              <span style={{ fontSize: 12, fontWeight: 800, color: sentiment.color }}>ملخص التحليل</span>
            </div>
            <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.9, margin: 0 }}>{article.summary}</p>
          </div>
        )}

        {/* ─── Full Content Sections (like rouatradingnews) ─── */}
        {article.fullContent && article.fullContent.length > 10 && (
          <ArticleFullContent content={article.fullContent} />
        )}

        {/* ─── Arabic Content fallback ─── */}
        {!article.fullContent && article.translatedContent && (
          <div style={{ fontSize: 15, color: T.text2, lineHeight: 1.9, marginBottom: 28, whiteSpace: 'pre-wrap' }}>
            {article.translatedContent}
          </div>
        )}

        {/* ─── Affected Assets Panel ─── */}
        {Array.isArray(article.affectedAssets) && article.affectedAssets.length > 0 && (
          <div style={{
            animation: 'slide-up 0.5s ease-out 0.3s both',
            margin: '0 0 28px', padding: '18px 20px',
            background: T.card, borderRadius: 18,
            border: `1px solid ${T.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `${T.amber}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={16} color={T.amber} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: T.amber }}>الأصول المتأثرة</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {article.affectedAssets.map((asset, i) => (
                <span key={i} style={{
                  fontSize: 13, padding: '6px 16px', borderRadius: 10,
                  background: `${T.amber}10`, color: T.amber, fontWeight: 800,
                  fontFamily: FONT_MONO, border: `1px solid ${T.amber}20`,
                }}>
                  {safeStr(asset)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Sentiment Bar ─── */}
        <div style={{
          animation: 'slide-up 0.5s ease-out 0.35s both',
          margin: '0 0 28px', padding: '18px 20px',
          background: T.card, borderRadius: 18,
          border: `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} color={T.text3} />
              تحليل المشاعر
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: sentiment.color, display: 'flex', alignItems: 'center', gap: 5 }}>
              <SentimentIcon size={14} />
              {sentiment.text}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: T.bg2, overflow: 'hidden', direction: 'ltr' }}>
            <div style={{
              height: '100%', borderRadius: 3, width: `${Math.max(Math.abs(article.sentiment || 0) * 100, 8)}%`,
              background: `linear-gradient(90deg, ${sentiment.color}60, ${sentiment.color})`,
              transition: 'width 0.8s ease-out',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: T.text3 }}>سلبي</span>
            <span style={{ fontSize: 10, color: T.text3 }}>محايد</span>
            <span style={{ fontSize: 10, color: T.text3 }}>إيجابي</span>
          </div>
        </div>

        {/* ─── Disclaimer ─── */}
        <div style={{ padding: '16px 18px', borderRadius: 14, background: `${T.amber}04`, border: `1px solid ${T.amber}10`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 11, color: `${T.amber}88`, lineHeight: 1.7, margin: 0 }}>
            الأخبار والتحليلات مقدمة لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─── Helpers ─── */
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
 * Renders full content with [N] Section Title format — styled like rouatradingnews
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
    return <div style={{ fontSize: 15, color: T.text2, lineHeight: 1.9, marginBottom: 28, whiteSpace: 'pre-wrap' }}>{content}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
      {sections.map((section, index) => {
        const config = SECTION_CONFIG[section.num] || SECTION_CONFIG['1']
        const SectionIcon = config.icon

        return (
          <div
            key={section.num}
            className="section-card"
            style={{
              animation: `slide-up 0.5s ease-out ${0.2 + index * 0.08}s both`,
              borderRadius: 18, overflow: 'hidden',
              border: `1px solid ${config.borderColor}`,
              background: config.bgColor,
            }}
          >
            {/* Section Header */}
            <div style={{
              padding: '14px 20px',
              display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: `1px solid ${config.borderColor}`,
              background: `${config.borderColor}08`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 11,
                background: config.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${config.borderColor}`,
              }}>
                <SectionIcon size={17} color={config.borderColor.replace('40', '')} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: config.iconBg, color: config.borderColor.replace('40', ''), fontWeight: 900, fontFamily: FONT_MONO }}>
                    {section.num}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: config.borderColor.replace('40', '') }}>
                    {section.title}
                  </span>
                </div>
              </div>
            </div>

            {/* Section Body */}
            <div style={{ padding: '18px 20px' }}>
              <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.9, margin: 0, whiteSpace: 'pre-wrap' }}>
                {section.body}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
