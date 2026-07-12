'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
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
import T from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

const FONT_AR = 'var(--font-ar)'
const FONT_MONO = 'var(--font-mono)'

type Lang = 'ar' | 'en' | 'fr' | 'tr'

function localizedCategory(item: { category?: string; categoryAr?: string; categoryFr?: string; categoryTr?: string }, locale: Lang): string | undefined {
  if (locale === 'ar') return item.categoryAr || item.category
  if (locale === 'fr') return item.categoryFr || item.category
  if (locale === 'tr') return item.categoryTr || item.category
  return item.category
}

function t(en: string, ar: string, fr: string, tr: string, lang: Lang): string {
  return lang === 'ar' ? ar : lang === 'fr' ? fr : lang === 'tr' ? tr : en
}

/**
 * Extracts clean content from a string that might be raw JSON like {"title": "...", "content": "..."}.
 */
function extractCleanContent(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.content) return String(parsed.content).trim()
      if (parsed.text) return String(parsed.text).trim()
      const values = Object.values(parsed).filter(v => typeof v === 'string' && v.length > 20)
      if (values.length > 0) return String(values.sort((a, b) => (b as string).length - (a as string).length)[0]).trim()
    } catch {
      const contentMatch = trimmed.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (contentMatch?.[1]) {
        try { return JSON.parse(`"${contentMatch[1]}"`) } catch { return contentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') }
      }
    }
  }
  return trimmed
}

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
  categoryFr?: string
  categoryTr?: string
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
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const locale = useLocale()
  const defaultLang = locale === 'fr' ? 'fr' : locale === 'tr' ? 'tr' : locale === 'en' ? 'en' : 'ar'
  const lang = (searchParams.get('lang') || defaultLang) as Lang

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
        const res = await fetch(`/api/news/latest?limit=50&lang=${lang}`, { cache: 'no-store' })
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          const found = data.data.find((a: NewsItem) => a.slug === slug || a.id === slug)
          if (found) {
            setArticle(found)
          } else {
            setError(t('Article not found', 'لم يتم العثور على الخبر', 'Article non trouvé', 'Makale bulunamadı', lang))
          }
        } else {
          setError(t('Article not found', 'لم يتم العثور على الخبر', 'Article non trouvé', 'Makale bulunamadı', lang))
        }
      } catch {
        setError(t('Failed to load article', 'تعذر تحميل الخبر', 'Impossible de charger l\'article', 'Makale yüklenemedi', lang))
      } finally {
        setLoading(false)
      }
    }
    if (slug) fetchArticle()
  }, [slug, lang])

  if (loading) {
    return (
      <div style={{ direction: 'inherit', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: `3px solid ${T.border}`, borderTopColor: T.cyan, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: T.text2, fontSize: 'var(--text-base)' }}>{t('Loading article...', 'جارٍ تحميل الخبر...', 'Chargement de l\'article...', 'Makale yükleniyor...', lang)}</p>
        </div>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div style={{ direction: 'inherit', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
          <AlertTriangle size={40} color={T.red} style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, marginBottom: 8 }}>{error || (t('Article not found', 'خبر غير موجود', 'Article non trouvé', 'Makale bulunamadı', lang))}</h2>
          <button onClick={() => router.back()} style={{ padding: '10px 24px', borderRadius: 'var(--radius-lg)', background: T.cyan, color: '#000', border: 'none', fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer' }}>{t('Back', 'العودة', 'Retour', 'Geri', lang)}</button>
        </div>
      </div>
    )
  }

  const displayTitle = article.translatedTitle || article.title
  const sentiment = getSentimentConfig(article.sentimentLabel, lang)
  const SentimentIcon = sentiment.icon
  const hasImage = article.imageUrl && !imageError

  return (
    <div style={{ direction: 'inherit', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text }}>

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
              padding: '10px 18px', borderRadius: 'var(--radius-lg)',
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              color: '#FFF', cursor: 'pointer', fontSize: 'var(--text-sm)',
              fontFamily: FONT_AR, fontWeight: 700,
            }}
          >
            <ArrowRight size={15} />
            {t('Back', 'العودة', 'Retour', 'Geri', lang)}
          </button>

          {/* Category badge on image */}
          <div style={{ position: 'absolute', bottom: 20, right: 24, display: 'flex', gap: 8, alignItems: 'center' }}>
            {(localizedCategory(article, lang)) && (
              <span style={{ fontSize: 'var(--text-xs)', padding: '5px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(0,229,255,0.2)', backdropFilter: 'blur(8px)', color: T.info, fontWeight: 800, border: '0.5px solid rgba(0,229,255,0.3)' }}>
                {localizedCategory(article, lang)}
              </span>
            )}
            {article.newsType === 'live' && (
              <span style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', borderRadius: 'var(--radius-md)', background: 'rgba(255,69,58,0.25)', color: '#FF453A', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF453A', animation: 'pulse-glow 2s infinite' }} />
                {t('LIVE', 'مباشر', 'EN DIRECT', 'CANLI', lang)}
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
              padding: '8px 16px', borderRadius: 'var(--radius-lg)',
              background: T.card, border: `1px solid ${T.border}`,
              color: T.text2, cursor: 'pointer', fontSize: 'var(--text-sm)',
              fontFamily: FONT_AR, fontWeight: 700, marginBottom: 20,
            }}
          >
            <ArrowRight size={14} />
            {t('Back to News', 'العودة للأخبار', 'Retour aux actualités', 'Haberlere Dön', lang)}
          </button>
        )}

        {/* ─── Article Header ─── */}
        <div style={{ animation: 'fade-in 0.4s ease-out', marginBottom: 28 }}>
          {/* Badges row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {!hasImage && (localizedCategory(article, lang)) && (
              <span style={{ fontSize: 'var(--text-xs)', padding: '5px 14px', borderRadius: 'var(--radius-lg)', background: `${T.cyan}12`, color: T.cyan, fontWeight: 800, border: `0.5px solid ${T.cyan}22` }}>
                {localizedCategory(article, lang)}
              </span>
            )}
            <span style={{ fontSize: 'var(--text-xs)', padding: '5px 14px', borderRadius: 'var(--radius-lg)', background: sentiment.bg, color: sentiment.color, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
              <SentimentIcon size={13} />
              {sentiment.text}
            </span>
            {article.impactLevel && (
              <span style={{ fontSize: 'var(--text-xs)', padding: '5px 14px', borderRadius: 'var(--radius-lg)', background: `${T.amber}12`, color: T.amber, fontWeight: 800 }}>
                {t('Impact', 'تأثير', 'Impact', 'Etki', lang)} {article.impactLevel === 'high' ? t('High', 'عالي', 'Élevé', 'Yüksek', lang) : article.impactLevel === 'low' ? t('Low', 'منخفض', 'Faible', 'Düşük', lang) : t('Medium', 'متوسط', 'Moyen', 'Orta', lang)}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, lineHeight: 1.65, marginBottom: 12, color: T.text, letterSpacing: '-0.01em' }}>
            {displayTitle}
          </h1>

          {/* English subtitle */}
          {article.translatedTitle && article.translatedTitle !== article.title && (
            <p style={{ fontSize: 'var(--text-sm)', color: T.text3, direction: 'ltr', textAlign: 'left', fontFamily: FONT_MONO, marginBottom: 16, lineHeight: 1.6, opacity: 0.6 }}>
              {article.title}
            </p>
          )}

          {/* Meta row: Source + Time + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg, #00E5FF20, #00B0FF20)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid #00E5FF22' }}>
                <Globe size={18} color={T.info} />
              </div>
              <div>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: T.text, display: 'block' }}>{article.source || (t("Ru'aa News", 'رؤى للأخبار', "Actualités Ru'aa", "Ru'aa Haberler", lang))}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={10} />
                  {formatTime(article.publishedAt, lang)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ width: 38, height: 38, borderRadius: 'var(--radius-lg)', background: T.card, border: `1px solid ${T.border}`, color: T.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                <Bookmark size={16} />
              </button>
              <button style={{ width: 38, height: 38, borderRadius: 'var(--radius-lg)', background: T.card, border: `1px solid ${T.border}`, color: T.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                <Share2 size={16} />
              </button>
              {article.url && (
                <a href={article.url} target="_blank" rel="noreferrer" style={{ width: 38, height: 38, borderRadius: 'var(--radius-lg)', background: `${T.cyan}12`, border: `1px solid ${T.cyan}22`, color: T.cyan, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', transition: 'all 0.2s' }}>
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
            margin: '0 0 28px', borderRadius: 'var(--radius-xl)', overflow: 'hidden',
            border: `1px solid ${T.green}20`,
            background: `linear-gradient(135deg, ${T.green}06, ${T.green}02)`,
          }}>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.green}12` }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-lg)', background: `${T.green}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} color={T.green} />
              </div>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 900, color: T.green }}>{t('Key Takeaways', 'النقاط الرئيسية', 'Points clés', 'Önemli Noktalar', lang)}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: `${T.green}80`, fontFamily: FONT_MONO, marginRight: 4 }}>({article.keyTakeaways.length})</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {article.keyTakeaways.map((point, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i < article.keyTakeaways!.length - 1 ? 12 : 0, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-md)', background: `${T.green}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: T.green, fontWeight: 900 }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 'var(--text-base)', color: T.text2, lineHeight: 1.75 }}>{point}</span>
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
            borderRadius: 'var(--radius-xl)',
            borderRight: `4px solid ${sentiment.color}`,
            border: `1px solid ${sentiment.color}15`,
            borderRightWidth: 4, borderRightColor: sentiment.color,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <SentimentIcon size={16} color={sentiment.color} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: sentiment.color }}>{t('Analysis Summary', 'ملخص التحليل', 'Résumé analytique', 'Analiz Özeti', lang)}</span>
            </div>
            <p style={{ fontSize: 'var(--text-base)', color: T.text2, lineHeight: 1.9, margin: 0 }}>{article.summary}</p>
          </div>
        )}

        {/* ─── Full Content Sections (like rouatradingnews) ─── */}
        {article.fullContent && article.fullContent.length > 10 && (
          <ArticleFullContent content={article.fullContent} />
        )}

        {/* ─── Content fallback (no fullContent, use translatedContent) ─── */}
        {!article.fullContent && article.translatedContent && (
          <PlainArticleContent content={article.translatedContent} />
        )}

        {/* ─── Affected Assets Panel ─── */}
        {Array.isArray(article.affectedAssets) && article.affectedAssets.length > 0 && (
          <div style={{
            animation: 'slide-up 0.5s ease-out 0.3s both',
            margin: '0 0 28px', padding: '18px 20px',
            background: T.card, borderRadius: 'var(--radius-xl)',
            border: `1px solid ${T.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-lg)', background: `${T.amber}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={16} color={T.amber} />
              </div>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: T.amber }}>{t('Affected Assets', 'الأصول المتأثرة', 'Actifs concernés', 'Etkilenen Varlıklar', lang)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {article.affectedAssets.map((asset, i) => (
                <span key={i} style={{
                  fontSize: 'var(--text-sm)', padding: '6px 16px', borderRadius: 'var(--radius-lg)',
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
          background: T.card, borderRadius: 'var(--radius-xl)',
          border: `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: T.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={14} color={T.text3} />
              {t('Sentiment Analysis', 'تحليل المشاعر', 'Analyse de sentiment', 'Duygu Analizi', lang)}
            </span>
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: sentiment.color, display: 'flex', alignItems: 'center', gap: 5 }}>
              <SentimentIcon size={14} />
              {sentiment.text}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 'var(--radius-xs)', background: T.bg2, overflow: 'hidden', direction: 'ltr' }}>
            <div style={{
              height: '100%', borderRadius: 'var(--radius-xs)', width: `${Math.max(Math.abs(article.sentiment || 0) * 100, 8)}%`,
              background: `linear-gradient(90deg, ${sentiment.color}60, ${sentiment.color})`,
              transition: 'width 0.8s ease-out',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: T.text3 }}>{t('Negative', 'سلبي', 'Négatif', 'Olumsuz', lang)}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: T.text3 }}>{t('Neutral', 'محايد', 'Neutre', 'Nötr', lang)}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: T.text3 }}>{t('Positive', 'إيجابي', 'Positif', 'Olumlu', lang)}</span>
          </div>
        </div>

        {/* ─── Disclaimer ─── */}
        <div style={{ padding: '16px 18px', borderRadius: 'var(--radius-xl)', background: `${T.amber}04`, border: `1px solid ${T.amber}10`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 'var(--text-xs)', color: `${T.amber}88`, lineHeight: 1.7, margin: 0 }}>
            {t('News and analysis are provided for educational purposes only and are not investment advice. Trade responsibly.', 'الأخبار والتحليلات مقدمة لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.', 'Les actualités et analyses sont fournies à des fins éducatives uniquement et ne constituent pas des conseils en investissement. Tradez de manière responsable.', 'Haberler ve analizler yalnızca eğitim amaçlıdır ve yatırım tavsiyesi değildir. Sorumlu bir şekilde işlem yapın.', lang)}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─── Helpers ─── */
function getSentimentConfig(label?: string, lang?: Lang) {
  switch (label) {
    case 'positive': return { bg: `${T.green}14`, color: T.green, text: t('Positive', 'إيجابي', 'Positif', 'Olumlu', lang || 'en'), icon: TrendingUp }
    case 'negative': return { bg: `${T.red}14`, color: T.red, text: t('Negative', 'سلبي', 'Négatif', 'Olumsuz', lang || 'en'), icon: TrendingDown }
    default: return { bg: `${T.text3}14`, color: T.text3, text: t('Neutral', 'محايد', 'Neutre', 'Nötr', lang || 'en'), icon: Minus }
  }
}

function formatTime(value?: string | null, lang?: Lang) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(lang === 'ar' ? 'ar-SA' : lang === 'fr' ? 'fr-FR' : lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Renders full content with [N] Section Title format — styled like rouatradingnews
 * Also handles plain text content without section markers by auto-detecting section titles
 */
function ArticleFullContent({ content }: { content: string }) {
  // First, extract clean content from potential JSON wrapper
  const cleanContent = extractCleanContent(content)
  
  const sectionRegex = /\[(\d+)\]\s*([^\[]+)/g
  const sections: { num: string; title: string; body: string }[] = []
  let match

  while ((match = sectionRegex.exec(cleanContent)) !== null) {
    const sectionEnd = cleanContent.indexOf('[', match.index + match[0].length)
    const bodyText = sectionEnd > -1
      ? cleanContent.slice(match.index + match[0].length, sectionEnd).trim()
      : cleanContent.slice(match.index + match[0].length).trim()
    sections.push({ num: match[1], title: match[2].trim(), body: bodyText })
  }

  // If no [N] sections found, parse plain text content into structured sections
  if (sections.length === 0) {
    return <PlainArticleContent content={cleanContent} />
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
              borderRadius: 'var(--radius-xl)', overflow: 'hidden',
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
                width: 36, height: 36, borderRadius: 'var(--radius-lg)',
                background: config.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${config.borderColor}`,
              }}>
                <SectionIcon size={17} color={config.borderColor.replace('40', '')} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: config.iconBg, color: config.borderColor.replace('40', ''), fontWeight: 900, fontFamily: FONT_MONO }}>
                    {section.num}
                  </span>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 900, color: config.borderColor.replace('40', '') }}>
                    {section.title}
                  </span>
                </div>
              </div>
            </div>

            {/* Section Body */}
            <div style={{ padding: '18px 20px' }}>
              <p style={{ fontSize: 'var(--text-base)', color: T.text2, lineHeight: 1.9, margin: 0, whiteSpace: 'pre-wrap' }}>
                {section.body}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Renders plain text content by auto-detecting section titles and formatting them properly.
 * Used when content doesn't have [N] section markers.
 */
function PlainArticleContent({ content }: { content: string }) {
  // Extract clean content from potential JSON wrapper
  const cleanContent = extractCleanContent(content)
  
  // Section title patterns for financial content
  const isSectionTitle = (text: string): boolean => {
    if (text.length > 80) return false
    if (/\d+[.%]$/.test(text)) return false
    if (/^[\d,.$€£¥]+$/.test(text.replace(/\s/g, ''))) return false
    if (/[.!?;:]$/.test(text)) return false
    // Known financial section patterns
    if (/^(Market |Stock |Company |Economic |Industry |Sector |Global |Technical |Price |Trading |Investment |Crypto |Forex |Commodity |Energy |Bond |Financial |Portfolio |Risk |AI |Digital |Weekly |Daily |Monthly |Quarterly |Annual )?(Overview|Summary|Analysis|Update|Outlook|Report|Review|Trend|Forecast|Perspective|Introduction|Key Points|Highlights|Insights|Takeaways|Performance|Breakdown|Deep Dive|Snapshot|Assessment|Evaluation|Observation|Conclusion|Bottom Line|Data|Statistics|Indicators|Metrics|Fundamentals|Technicals|Sentiment|News|Events|Movers|Volume|Momentum|Breakout|Reversal|Pattern|Chart|Setup|Strategy|Recommendation|مقدمة|ملخص|تحليل|نظرة عامة|بيانات السوق|المؤشرات|النقاط الرئيسية|الخلاصة|توصيات|تحديث ساعي)(s)?(\s+(Overview|Summary|Analysis|Update|Outlook|Report|Review|Trend|Forecast|Perspective|Introduction|Key Points|Highlights|Insights|Takeaways|Performance|Breakdown|Deep Dive|Snapshot|Assessment|Conclusion|Recommendation))?$/i.test(text)) return true
    // Title Case heuristic
    const words = text.split(/\s+/).filter(w => w.length > 0)
    if (words.length >= 2 && words.length <= 8) {
      const titleCaseCount = words.filter(w => /^[A-Z؀-ۿ]/.test(w)).length
      if (titleCaseCount / words.length >= 0.6) return true
    }
    // Stock symbol pattern like "AAPL Stock Analysis"
    if (/^[A-Z]{2,5}\s/.test(text) && /Analysis|Overview|Update|Report|Review|Stock|Outlook/i.test(text)) return true
    return false
  }

  // Risk/disclaimer detection
  const isDisclaimer = (text: string): boolean => {
    return /تنبيه المخاطر|تحذير المخاطر|لأغراض تعليمية|إخلاء مسؤولية|risk warning|disclaimer|educational purposes|not financial advice|does not constitute investment advice|not financial advice/i.test(text)
  }

  // Parse into blocks
  const blocks: Array<{ type: 'heading' | 'paragraph' | 'bullet' | 'disclaimer'; text: string }> = []
  const lines = cleanContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Strip any leftover markdown headers
    const cleaned = trimmed.replace(/^#{1,6}\s*/, '')

    if (isDisclaimer(cleaned)) {
      blocks.push({ type: 'disclaimer', text: cleaned })
    } else if (/^[-*]\s/.test(cleaned)) {
      blocks.push({ type: 'bullet', text: cleaned.replace(/^[-*]\s*/, '') })
    } else if (isSectionTitle(cleaned)) {
      blocks.push({ type: 'heading', text: cleaned })
    } else {
      blocks.push({ type: 'paragraph', text: cleaned })
    }
  }

  // Color cycle for sections
  const sectionColors = [
    { border: '#00E5FF40', bg: '#00E5FF08', iconBg: '#00E5FF18', color: T.info },
    { border: '#FFB80040', bg: '#FFB80008', iconBg: '#FFB80018', color: T.warning },
    { border: '#32D74B40', bg: '#32D74B08', iconBg: '#32D74B18', color: '#32D74B' },
    { border: '#B388FF40', bg: '#B388FF08', iconBg: '#B388FF18', color: T.council },
    { border: '#FF453A40', bg: '#FF453A08', iconBg: '#FF453A18', color: '#FF453A' },
  ]

  // Group consecutive paragraphs after headings into sections
  const groupedSections: Array<{ type: 'section' | 'disclaimer'; title?: string; body: string; colorIdx: number }> = []
  let currentTitle: string | null = null
  let currentParagraphs: string[] = []
  let sectionIdx = 0

  const flushSection = () => {
    if (currentTitle || currentParagraphs.length > 0) {
      groupedSections.push({
        type: 'section',
        title: currentTitle || undefined,
        body: currentParagraphs.join('\n\n'),
        colorIdx: sectionIdx % sectionColors.length,
      })
      currentTitle = null
      currentParagraphs = []
      sectionIdx++
    }
  }

  for (const block of blocks) {
    if (block.type === 'disclaimer') {
      flushSection()
      groupedSections.push({ type: 'disclaimer', body: block.text, colorIdx: sectionIdx % sectionColors.length })
    } else if (block.type === 'heading') {
      flushSection()
      currentTitle = block.text
    } else if (block.type === 'bullet') {
      currentParagraphs.push('• ' + block.text)
    } else {
      currentParagraphs.push(block.text)
    }
  }
  flushSection()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
      {groupedSections.map((section, index) => {
        if (section.type === 'disclaimer') {
          return (
            <div
              key={index}
              style={{
                animation: `slide-up 0.5s ease-out ${0.2 + index * 0.06}s both`,
                padding: '16px 20px',
                borderRadius: 'var(--radius-xl)',
                background: 'linear-gradient(135deg, rgba(255,184,0,0.08), rgba(255,107,53,0.04))',
                border: '1px solid rgba(255,184,0,0.2)',
                borderRight: '3.5px solid rgba(255,184,0,0.6)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 'var(--text-sm)', color: `${T.amber}cc`, lineHeight: 1.7, margin: 0 }}>
                {section.body}
              </p>
            </div>
          )
        }

        const colors = sectionColors[section.colorIdx]
        const hasTitle = !!section.title

        return (
          <div
            key={index}
            className="section-card"
            style={{
              animation: `slide-up 0.5s ease-out ${0.2 + index * 0.06}s both`,
              borderRadius: 'var(--radius-xl)', overflow: 'hidden',
              border: `1px solid ${colors.border}`,
              background: colors.bg,
            }}
          >
            {/* Section Header */}
            {hasTitle && (
              <div style={{
                padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: `1px solid ${colors.border}`,
                background: `${colors.border}08`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-lg)',
                  background: colors.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${colors.border}`,
                }}>
                  <Newspaper size={17} color={colors.color} />
                </div>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 900, color: colors.color }}>
                  {section.title}
                </span>
              </div>
            )}

            {/* Section Body */}
            <div style={{ padding: '18px 20px' }}>
              {section.body.split('\n\n').map((paragraph, pIdx) => (
                <p key={pIdx} style={{
                  fontSize: 'var(--text-base)', color: T.text2, lineHeight: 1.9, margin: pIdx > 0 ? '12px 0 0' : 0,
                  whiteSpace: 'pre-wrap',
                }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
