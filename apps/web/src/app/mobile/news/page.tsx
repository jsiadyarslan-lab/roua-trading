'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight,
  RefreshCw,
  Newspaper,
  Clock,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Globe,
} from 'lucide-react'

/* ─── Color Constants ─── */
const C = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
} as const

const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Category Tabs ─── */
const CATEGORIES = ['الكل', 'كريبتو', 'فوركس', 'اقتصاد', 'سلع'] as const
type Category = (typeof CATEGORIES)[number]

/* ─── News Item Type ─── */
interface NewsItem {
  id: string
  source: string
  title: string
  translatedTitle?: string
  content?: string
  translatedContent?: string
  summary?: string
  url?: string | null
  sentiment: number
  sentimentLabel: 'positive' | 'negative' | 'neutral'
  impactLevel: 'high' | 'medium' | 'low'
  affectedAssets?: string[]
  category?: string
  categoryAr?: string
  publishedAt: string
}

/* ─── Helpers ─── */
function timeAgoAr(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `منذ ${hrs} ساعة`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `منذ ${days} يوم`
  const weeks = Math.floor(days / 7)
  return `منذ ${weeks} أسبوع`
}

function getSentimentConfig(label: string) {
  if (label === 'positive') return { color: C.success, dot: C.success, label: 'إيجابي', icon: TrendingUp }
  if (label === 'negative') return { color: C.danger, dot: C.danger, label: 'سلبي', icon: TrendingDown }
  return { color: C.accent, dot: C.accent, label: 'محايد', icon: Minus }
}

function getImpactConfig(level: string) {
  if (level === 'high') return { color: C.danger, bg: 'rgba(255,69,58,0.12)', label: 'مرتفع' }
  if (level === 'medium') return { color: C.amber, bg: 'rgba(255,184,0,0.12)', label: 'متوسط' }
  return { color: C.accent, bg: 'rgba(0,212,255,0.12)', label: 'منخفض' }
}

function getCategoryFilterValue(cat: Category): string {
  if (cat === 'الكل') return ''
  if (cat === 'كريبتو') return 'crypto'
  if (cat === 'فوركس') return 'forex'
  if (cat === 'اقتصاد') return 'economy'
  if (cat === 'سلع') return 'commodities'
  return ''
}

/* ─── Skeleton Component ─── */
function NewsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'rgba(28,28,30,0.5)',
            borderRadius: 28,
            padding: 20,
            border: '0.5px solid rgba(255,255,255,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ width: 60, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ marginInlineStart: 'auto', height: 18, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div style={{ width: '90%', height: 14, borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginBottom: 8 }} />
          <div style={{ width: '70%', height: 14, borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 50, height: 20, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ width: 60, height: 20, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Empty State ─── */
function EmptyState({ category }: { category: Category }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 28,
          background: 'rgba(255,255,255,0.03)',
          border: '1px dashed rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Newspaper size={32} color="rgba(255,255,255,0.15)" />
      </div>
      <p
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.3)',
          fontFamily: FONT_AR,
          marginBottom: 8,
        }}
      >
        لا توجد أخبار
      </p>
      <p
        style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.2)',
          fontFamily: FONT_AR,
          lineHeight: 1.6,
          maxWidth: 260,
        }}
      >
        {category === 'الكل'
          ? 'لم يتم العثور على أخبار حالياً. اسحب للأسفل للتحديث.'
          : `لا توجد أخبار في قسم "${category}" حالياً.`}
      </p>
    </motion.div>
  )
}

/* ─── News Card ─── */
function NewsCard({
  item,
  index,
  expanded,
  onToggle,
}: {
  item: NewsItem
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const sentiment = getSentimentConfig(item.sentimentLabel)
  const impact = getImpactConfig(item.impactLevel)
  const SentimentIcon = sentiment.icon
  const displayTitle = item.translatedTitle || item.title

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      style={{
        background: 'rgba(28,28,30,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 28,
        border: '0.5px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      {/* Main Card Body */}
      <motion.button
        whileTap={{ scale: 0.985 }}
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 20,
          textAlign: 'right',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {/* Row 1: Sentiment dot + Category + Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, direction: 'rtl' }}>
          {/* Sentiment Dot */}
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: sentiment.dot,
              boxShadow: `0 0 8px ${sentiment.dot}60`,
              flexShrink: 0,
            }}
          />

          {/* Category Badge */}
          {item.categoryAr && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.accent,
                fontFamily: FONT_AR,
                background: 'rgba(0,212,255,0.1)',
                padding: '3px 10px',
                borderRadius: 8,
                border: '0.5px solid rgba(0,212,255,0.15)',
              }}
            >
              {item.categoryAr}
            </span>
          )}

          {/* Impact Badge */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: impact.color,
              fontFamily: FONT_AR,
              background: impact.bg,
              padding: '3px 10px',
              borderRadius: 8,
            }}
          >
            {impact.label}
          </span>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Time Ago */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color="rgba(255,255,255,0.25)" />
            <span
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.3)',
                fontFamily: FONT_AR,
              }}
            >
              {timeAgoAr(item.publishedAt)}
            </span>
          </div>
        </div>

        {/* Row 2: Title */}
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: C.text,
            fontFamily: FONT_AR,
            lineHeight: 1.65,
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: 'vertical',
            overflow: expanded ? 'visible' : 'hidden',
          }}
        >
          {displayTitle}
        </h3>

        {/* Row 3: Source + Expand indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'rtl' }}>
          <Globe size={12} color="rgba(255,255,255,0.2)" />
          <span
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
              fontFamily: FONT_AR,
            }}
          >
            {item.source}
          </span>

          {/* Affected Assets */}
          {item.affectedAssets && item.affectedAssets.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginInlineStart: 8 }}>
              {item.affectedAssets.slice(0, 3).map((asset) => (
                <span
                  key={asset}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.amber,
                    fontFamily: FONT_MONO,
                    background: 'rgba(255,184,0,0.08)',
                    padding: '2px 6px',
                    borderRadius: 6,
                  }}
                >
                  {asset}
                </span>
              ))}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Expand/Collapse */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
          >
            <ChevronDown size={16} color="rgba(255,255,255,0.2)" />
          </motion.div>
        </div>
      </motion.button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding: '0 20px 20px',
                borderTop: '0.5px solid rgba(255,255,255,0.06)',
                marginTop: 0,
                paddingTop: 16,
              }}
            >
              {/* Sentiment Summary */}
              {item.summary && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    background: `${sentiment.color}08`,
                    borderRadius: 16,
                    padding: 14,
                    border: `0.5px solid ${sentiment.color}15`,
                    marginBottom: 14,
                  }}
                >
                  <SentimentIcon size={16} color={sentiment.color} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.6)',
                      fontFamily: FONT_AR,
                      lineHeight: 1.7,
                      margin: 0,
                    }}
                  >
                    {item.summary}
                  </p>
                </div>
              )}

              {/* Content */}
              {(item.translatedContent || item.content) && (
                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.5)',
                    fontFamily: FONT_AR,
                    lineHeight: 1.8,
                    marginBottom: 14,
                  }}
                >
                  {item.translatedContent || item.content}
                </p>
              )}

              {/* Sentiment Score Bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR }}>
                    تحليل المشاعر
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: sentiment.color, fontFamily: FONT_MONO }}>
                    {(item.sentiment * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                    direction: 'ltr',
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.abs(item.sentiment) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    style={{
                      height: '100%',
                      borderRadius: 2,
                      background: `linear-gradient(90deg, ${sentiment.color}80, ${sentiment.color})`,
                    }}
                  />
                </div>
              </div>

              {/* External Link */}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.accent,
                    fontFamily: FONT_AR,
                    textDecoration: 'none',
                    padding: '8px 16px',
                    borderRadius: 12,
                    background: 'rgba(0,212,255,0.08)',
                    border: '0.5px solid rgba(0,212,255,0.15)',
                  }}
                >
                  قراءة المقال الأصلي
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Pull-Down Refresh Indicator ─── */
function PullRefreshIndicator({ pulling, refreshing }: { pulling: boolean; refreshing: boolean }) {
  return (
    <AnimatePresence>
      {(pulling || refreshing) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: refreshing ? 56 : 40, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <motion.div
            animate={refreshing || pulling ? { rotate: 360 } : { rotate: 0 }}
            transition={refreshing ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }}
          >
            <RefreshCw size={20} color={C.accent} />
          </motion.div>
          <span
            style={{
              fontSize: 12,
              color: C.accent,
              fontFamily: FONT_AR,
              fontWeight: 600,
              marginInlineStart: 8,
            }}
          >
            {refreshing ? 'جاري التحديث...' : 'اسحب للتحديث'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ═══════════════════════════════════════════
   ─── Main Page Component ───
   ═══════════════════════════════════════════ */
export default function MobileNewsPage() {
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category>('الكل')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Pull-to-refresh touch tracking
  const touchStartY = useRef(0)
  const pullDistance = useRef(0)

  /* ─── Fetch News ─── */
  const fetchNews = useCallback(
    async (category: Category = activeCategory, showLoading = false) => {
      if (showLoading) setLoading(true)
      setError('')

      try {
        const catFilter = getCategoryFilterValue(category)
        const params = new URLSearchParams({ limit: '20' })
        if (catFilter) params.set('category', catFilter)

        const res = await fetch(`/api/news/latest?${params.toString()}`)
        if (!res.ok) throw new Error('فشل الاتصال بالخادم')

        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setNews(data.data)
        } else {
          setNews([])
        }
      } catch (err: any) {
        setError(err.message || 'حدث خطأ أثناء تحميل الأخبار')
        setNews([])
      } finally {
        setLoading(false)
        setRefreshing(false)
        setPulling(false)
      }
    },
    [activeCategory],
  )

  /* ─── Initial Load ─── */
  useEffect(() => {
    fetchNews('الكل', true)
  }, [])

  /* ─── Category Change ─── */
  useEffect(() => {
    if (!loading) {
      fetchNews(activeCategory, true)
    }
  }, [activeCategory])

  /* ─── Pull-to-Refresh Handlers ─── */
  const handleTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const el = scrollRef.current
    if (!el || el.scrollTop > 0) return

    const diff = e.touches[0].clientY - touchStartY.current
    if (diff > 0 && diff < 120) {
      pullDistance.current = diff
      if (diff > 60) setPulling(true)
    }
  }

  const handleTouchEnd = () => {
    if (pullDistance.current > 60 && !refreshing) {
      setRefreshing(true)
      setPulling(false)
      fetchNews(activeCategory).finally(() => setRefreshing(false))
    } else {
      setPulling(false)
    }
    pullDistance.current = 0
  }

  /* ─── Toggle Expand ─── */
  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  /* ─── Filter news by active category (client-side) ─── */
  const filteredNews =
    activeCategory === 'الكل'
      ? news
      : news.filter((n) => {
          const catAr = n.categoryAr || ''
          const catEn = (n.category || '').toLowerCase()
          if (activeCategory === 'كريبتو') return catAr === 'كريبتو' || catEn.includes('crypto')
          if (activeCategory === 'فوركس') return catAr === 'فوركس' || catEn.includes('forex')
          if (activeCategory === 'اقتصاد') return catAr === 'اقتصاد' || catEn.includes('economy') || catEn.includes('macro')
          if (activeCategory === 'سلع') return catAr === 'سلع' || catEn.includes('commodit')
          return true
        })

  return (
    <div
      ref={scrollRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        minHeight: '100%',
        background: '#000000',
        direction: 'rtl',
        fontFamily: FONT_AR,
        overflowY: 'auto',
        overflowX: 'hidden',
        width: '100%',
        maxWidth: '100vw',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 20,
      }}
    >
      {/* ── Sticky Header ── */}
      <div
        style={{
          padding: '20px 16px 14px',
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          paddingTop: 'calc(env(safe-area-inset-top, 20px) + 12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Back Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => router.back()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.07)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>

          {/* Title */}
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: '#FFFFFF',
                fontFamily: FONT_AR,
                margin: 0,
              }}
            >
              الأخبار
            </h1>
            <p
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.35)',
                fontFamily: FONT_AR,
                margin: 0,
              }}
            >
              آخر المستجدات والتحليلات
            </p>
          </div>

          {/* Refresh Button */}
          <motion.button
            whileTap={{ scale: 0.9, rotate: 180 }}
            onClick={() => {
              setRefreshing(true)
              fetchNews(activeCategory).finally(() => setRefreshing(false))
            }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'rgba(0,212,255,0.08)',
              border: '0.5px solid rgba(0,212,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <RefreshCw
              size={16}
              color={C.accent}
              className={refreshing ? 'animate-spin' : ''}
            />
          </motion.button>
        </div>

        {/* ── Category Tabs ── */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            overflowX: 'auto',
            paddingBottom: 2,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat
            return (
              <motion.button
                key={cat}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 14,
                  border: 'none',
                  background: isActive ? C.accent : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#000000' : 'rgba(255,255,255,0.4)',
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 600,
                  fontFamily: FONT_AR,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s, color 0.2s',
                  boxShadow: isActive ? `0 0 12px ${C.accent}30` : 'none',
                }}
              >
                {cat}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* ── Pull-to-Refresh Indicator ── */}
      <PullRefreshIndicator pulling={pulling} refreshing={refreshing} />

      {/* ── Main Content ── */}
      <div style={{ padding: '16px 0' }}>
        {/* Loading Skeleton */}
        {loading && <NewsSkeleton />}

        {/* Error State */}
        {!loading && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              margin: '0 16px',
              padding: 20,
              borderRadius: 24,
              background: 'rgba(255,69,58,0.06)',
              border: '0.5px solid rgba(255,69,58,0.15)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <AlertTriangle size={20} color={C.danger} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.danger,
                  fontFamily: FONT_AR,
                  marginBottom: 4,
                }}
              >
                حدث خطأ
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: FONT_AR,
                  lineHeight: 1.6,
                }}
              >
                {error}
              </p>
              <button
                onClick={() => fetchNews(activeCategory, true)}
                style={{
                  marginTop: 10,
                  padding: '6px 16px',
                  borderRadius: 10,
                  background: C.danger,
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: FONT_AR,
                  cursor: 'pointer',
                }}
              >
                إعادة المحاولة
              </button>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredNews.length === 0 && (
          <EmptyState category={activeCategory} />
        )}

        {/* News Cards List */}
        {!loading && !error && filteredNews.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
            {/* News count indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
                padding: '0 4px',
              }}
            >
              <Zap size={12} color={C.accent} />
              <span
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.3)',
                  fontFamily: FONT_AR,
                }}
              >
                {filteredNews.length} خبر
                {activeCategory !== 'الكل' ? ` في ${activeCategory}` : ''}
              </span>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredNews.map((item, i) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  index={i}
                  expanded={expandedId === item.id}
                  onToggle={() => handleToggleExpand(item.id)}
                />
              ))}
            </AnimatePresence>

            {/* Disclaimer */}
            <div
              style={{
                padding: 16,
                borderRadius: 20,
                background: 'rgba(255,184,0,0.04)',
                border: '0.5px solid rgba(255,184,0,0.08)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                marginTop: 4,
              }}
            >
              <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
              <p
                style={{
                  fontSize: 10,
                  color: 'rgba(255,184,0,0.5)',
                  fontFamily: FONT_AR,
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                الأخبار والتحليلات مقدمة لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
