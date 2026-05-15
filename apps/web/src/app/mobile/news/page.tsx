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
  BarChart3,
  PenLine,
  Sparkles,
  Eye,
  ThumbsUp,
  Share2,
  Calendar,
  Search,
  Filter,
} from 'lucide-react'
import { safeStr } from '@/lib/utils'
import {
  useContentAgentStore,
  ContentStatus,
  ContentType,
  ContentCategory,
} from '@/hooks/useContentAgentStore'

/* ─── Color Constants ─── */
const C = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  gold: '#d4af37',
  purple: '#B388FF',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
} as const

const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Main Tabs ─── */
const MAIN_TABS = ['الأخبار', 'التقارير', 'وكيل المحتوى'] as const
type MainTab = (typeof MAIN_TABS)[number]

/* ─── News Category Tabs ─── */
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

function getCategoryLabel(c: ContentCategory): string {
  const map: Record<ContentCategory, string> = {
    [ContentCategory.CRYPTO]: 'كريبتو',
    [ContentCategory.FOREX]: 'فوركس',
    [ContentCategory.STOCKS]: 'أسهم',
    [ContentCategory.COMMODITIES]: 'سلع',
    [ContentCategory.ECONOMY]: 'اقتصاد',
    [ContentCategory.REGULATION]: 'تشريعات',
    [ContentCategory.TECHNOLOGY]: 'تقنية',
    [ContentCategory.EDUCATION]: 'تعليم',
    [ContentCategory.GEOPOLITICS]: 'جيوسياسة',
    [ContentCategory.DEFI]: 'ديفاي',
    [ContentCategory.NFT]: 'NFT',
  }
  return map[c] || c
}

function getCategoryColor(c: ContentCategory): string {
  const map: Record<ContentCategory, string> = {
    [ContentCategory.CRYPTO]: '#FFB800',
    [ContentCategory.FOREX]: '#00D4FF',
    [ContentCategory.STOCKS]: '#00FFA3',
    [ContentCategory.COMMODITIES]: '#FF8C42',
    [ContentCategory.ECONOMY]: '#B388FF',
    [ContentCategory.REGULATION]: '#FF4757',
    [ContentCategory.TECHNOLOGY]: '#00D4FF',
    [ContentCategory.EDUCATION]: '#10B981',
    [ContentCategory.GEOPOLITICS]: '#FF6B81',
    [ContentCategory.DEFI]: '#A78BFA',
    [ContentCategory.NFT]: '#F472B6',
  }
  return map[c] || C.text2
}

function getTypeLabel(t: ContentType): string {
  const map: Record<ContentType, string> = {
    [ContentType.ARTICLE]: 'مقال',
    [ContentType.ANALYSIS]: 'تحليل',
    [ContentType.NEWS_DIGEST]: 'ملخص أخبار',
    [ContentType.MARKET_REPORT]: 'تقرير سوق',
    [ContentType.EDUCATIONAL]: 'تعليمي',
    [ContentType.OPINION]: 'رأي',
    [ContentType.BREAKING]: 'عاجل',
    [ContentType.HOURLY_UPDATE]: 'تحديث ساعي',
    [ContentType.WEEKLY_REVIEW]: 'مراجعة أسبوعية',
    [ContentType.PAIR_ANALYSIS]: 'تحليل زوج',
  }
  return map[t] || t
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
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color="rgba(255,255,255,0.25)" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR }}>
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
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: FONT_AR }}>
            {item.source}
          </span>
          {item.affectedAssets && item.affectedAssets.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginInlineStart: 8 }}>
              {item.affectedAssets.slice(0, 3).map((asset, i) => (
                <span
                  key={i}
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
                  {safeStr(asset)}
                </span>
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
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
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: FONT_AR, lineHeight: 1.7, margin: 0 }}>
                    {item.summary}
                  </p>
                </div>
              )}

              {(item.translatedContent || item.content) && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: FONT_AR, lineHeight: 1.8, marginBottom: 14 }}>
                  {item.translatedContent || item.content}
                </p>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR }}>تحليل المشاعر</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: sentiment.color, fontFamily: FONT_MONO }}>
                    {(item.sentiment * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', direction: 'ltr' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.abs(item.sentiment) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${sentiment.color}80, ${sentiment.color})` }}
                  />
                </div>
              </div>

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
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('الأخبار')

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
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'حدث خطأ أثناء تحميل الأخبار')
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

          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', fontFamily: FONT_AR, margin: 0 }}>
              غرفة الأخبار
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: FONT_AR, margin: 0 }}>
              أخبار، تقارير، ووكيل محتوى ذكي
            </p>
          </div>

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
            <RefreshCw size={16} color={C.accent} className={refreshing ? 'animate-spin' : ''} />
          </motion.button>
        </div>

        {/* ── Main Tabs ── */}
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
          {MAIN_TABS.map((tab) => {
            const isActive = activeMainTab === tab
            const tabColor = tab === 'الأخبار' ? C.accent : tab === 'التقارير' ? C.gold : C.purple
            return (
              <motion.button
                key={tab}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveMainTab(tab)}
                style={{
                  padding: '8px 20px',
                  borderRadius: 14,
                  border: 'none',
                  background: isActive ? tabColor : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#000000' : 'rgba(255,255,255,0.4)',
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 600,
                  fontFamily: FONT_AR,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s, color 0.2s',
                  boxShadow: isActive ? `0 0 12px ${tabColor}30` : 'none',
                }}
              >
                {tab}
              </motion.button>
            )
          })}
        </div>

        {/* ── Category Tabs (only for news tab) ── */}
        {activeMainTab === 'الأخبار' && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 10,
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
                    padding: '6px 16px',
                    borderRadius: 12,
                    border: 'none',
                    background: isActive ? C.accent : 'rgba(255,255,255,0.04)',
                    color: isActive ? '#000000' : 'rgba(255,255,255,0.4)',
                    fontSize: 12,
                    fontWeight: isActive ? 800 : 600,
                    fontFamily: FONT_AR,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {cat}
                </motion.button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Pull-to-Refresh Indicator ── */}
      <PullRefreshIndicator pulling={pulling} refreshing={refreshing} />

      {/* ── Main Content ── */}
      <div style={{ padding: '16px 0' }}>
        {/* NEWS TAB */}
        {activeMainTab === 'الأخبار' && (
          <>
            {loading && <NewsSkeleton />}

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
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.danger, fontFamily: FONT_AR, marginBottom: 4 }}>حدث خطأ</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: FONT_AR, lineHeight: 1.6 }}>{error}</p>
                  <button
                    onClick={() => fetchNews(activeCategory, true)}
                    style={{
                      marginTop: 10, padding: '6px 16px', borderRadius: 10,
                      background: C.danger, color: '#FFFFFF', border: 'none',
                      fontSize: 12, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
                    }}
                  >
                    إعادة المحاولة
                  </button>
                </div>
              </motion.div>
            )}

            {!loading && !error && filteredNews.length === 0 && <EmptyState category={activeCategory} />}

            {!loading && !error && filteredNews.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, padding: '0 4px' }}>
                  <Zap size={12} color={C.accent} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR }}>
                    {filteredNews.length} خبر{activeCategory !== 'الكل' ? ` في ${activeCategory}` : ''}
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

                <div style={{ padding: 16, borderRadius: 20, background: 'rgba(255,184,0,0.04)', border: '0.5px solid rgba(255,184,0,0.08)', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 4 }}>
                  <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 10, color: 'rgba(255,184,0,0.5)', fontFamily: FONT_AR, lineHeight: 1.6, margin: 0 }}>
                    الأخبار والتحليلات مقدمة لأغراض تعليمية فقط وليست نصيحة استثمارية. تداول بمسؤولية.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* REPORTS TAB */}
        {activeMainTab === 'التقارير' && (
          <MobileReportsTab />
        )}

        {/* CONTENT AGENT TAB */}
        {activeMainTab === 'وكيل المحتوى' && (
          <MobileContentAgentTab />
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   ─── Mobile Reports Tab ───
   ═══════════════════════════════════════════ */
function MobileReportsTab() {
  const { articles, fetchFeed, loading } = useContentAgentStore()
  const [reportSearch, setReportSearch] = useState('')

  useEffect(() => {
    fetchFeed()
  }, [fetchFeed])

  const reports = articles.filter(a =>
    a.type === ContentType.MARKET_REPORT ||
    a.type === ContentType.ANALYSIS ||
    a.type === ContentType.WEEKLY_REVIEW ||
    a.type === ContentType.HOURLY_UPDATE ||
    a.type === ContentType.PAIR_ANALYSIS
  ).filter(a => {
    if (!reportSearch.trim()) return true
    const q = reportSearch.toLowerCase()
    return (
      (a.titleAr || '').toLowerCase().includes(q) ||
      (a.titleEn || '').toLowerCase().includes(q) ||
      (a.summaryAr || '').toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '10px 14px',
        border: '0.5px solid rgba(255,255,255,0.08)',
      }}>
        <Search size={14} color="rgba(255,255,255,0.3)" />
        <input
          type="text"
          placeholder="بحث في التقارير..."
          value={reportSearch}
          onChange={(e) => setReportSearch(e.target.value)}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: '#F0F2F5', fontSize: 13, width: '100%', fontFamily: FONT_AR,
          }}
        />
      </div>

      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR, padding: '0 4px' }}>
        {reports.length} تقرير
      </span>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
          <RefreshCw size={24} color={C.gold} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontFamily: FONT_AR, fontSize: 13 }}>جارٍ تحميل التقارير...</p>
        </div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <BarChart3 size={40} color="rgba(255,255,255,0.1)" style={{ marginBottom: 14 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR, marginBottom: 8 }}>لا توجد تقارير حالياً</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', fontFamily: FONT_AR }}>يمكنك توليد تقارير من تاب وكيل المحتوى</p>
        </div>
      ) : (
        reports.map((report, index) => {
          const catColor = getCategoryColor(report.category)
          return (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.35 }}
              style={{
                background: 'rgba(28,28,30,0.55)',
                backdropFilter: 'blur(20px)',
                borderRadius: 20,
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRight: `3px solid ${catColor}`,
                padding: 16,
              }}
            >
              {/* Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 8, background: `${catColor}15`, color: catColor, fontWeight: 700, fontFamily: FONT_AR }}>
                  {getCategoryLabel(report.category)}
                </span>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 8, background: 'rgba(212,175,55,0.1)', color: C.gold, fontWeight: 700, fontFamily: FONT_AR }}>
                  {getTypeLabel(report.type)}
                </span>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 8, background: report.status === ContentStatus.PUBLISHED ? 'rgba(50,215,75,0.1)' : 'rgba(255,255,255,0.04)', color: report.status === ContentStatus.PUBLISHED ? C.success : 'rgba(255,255,255,0.4)', fontWeight: 700, fontFamily: FONT_AR }}>
                  {report.status === ContentStatus.PUBLISHED ? 'منشور' : report.status === ContentStatus.DRAFT ? 'مسودة' : report.status}
                </span>
                {report.qualityScore > 0 && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: 'rgba(0,212,255,0.1)', color: C.accent, fontWeight: 700, fontFamily: FONT_MONO }}>
                    {report.qualityScore}%
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F0F2F5', fontFamily: FONT_AR, lineHeight: 1.65, margin: '0 0 6px' }}>
                {report.titleAr || report.titleEn}
              </h3>

              {/* Summary */}
              {report.summaryAr && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: FONT_AR, lineHeight: 1.7, margin: '0 0 10px' }}>
                  {report.summaryAr}
                </p>
              )}

              {/* Stats row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Eye size={10} /> {report.views}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><ThumbsUp size={10} /> {report.likes}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Share2 size={10} /> {report.shares}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={10} /> {report.readingTimeMinutes} دق</span>
              </div>
            </motion.div>
          )
        })
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   ─── Mobile Content Agent Tab (simplified) ───
   ═══════════════════════════════════════════ */
function MobileContentAgentTab() {
  const {
    agentState, stats, articles, loading, error,
    fetchState, fetchStats, fetchFeed, generateContent,
  } = useContentAgentStore()
  const [genTopic, setGenTopic] = useState('')
  const [genCategory, setGenCategory] = useState<ContentCategory>(ContentCategory.CRYPTO)
  const [genType, setGenType] = useState<ContentType>(ContentType.MARKET_REPORT)

  useEffect(() => {
    fetchState()
    fetchStats()
    fetchFeed()
  }, [fetchState, fetchStats, fetchFeed])

  const status = agentState?.status ?? null
  const statusLabel = status === 'IDLE' ? 'في الانتظار' : status === 'GENERATING' ? 'يولّد المحتوى' : status === 'PUBLISHING' ? 'ينشر المحتوى' : 'غير مُفعّل'
  const statusColor = status === 'GENERATING' ? C.accent : status === 'PUBLISHING' ? C.success : status === 'ERROR' ? C.danger : C.purple

  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Agent Status Card */}
      <div style={{
        background: 'rgba(28,28,30,0.55)', borderRadius: 20,
        border: '0.5px solid rgba(255,255,255,0.08)', padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.purple}, #6C3CE0)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PenLine size={18} color="#000" />
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#F0F2F5', fontFamily: FONT_AR, margin: 0 }}>وكيل المحتوى</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
              <span style={{ fontSize: 11, color: statusColor, fontFamily: FONT_AR, fontWeight: 700 }}>{statusLabel}</span>
              {agentState && (
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR }}>
                  • {agentState.totalGenerated} محتوى
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'مولّد', value: String(agentState?.totalGenerated ?? 0), color: C.accent },
            { label: 'منشور', value: String(agentState?.totalPublished ?? 0), color: C.success },
            { label: 'جودة', value: stats?.avgQualityScore ? `${stats.avgQualityScore.toFixed(0)}%` : '—', color: C.amber },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '6px 0', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: FONT_MONO }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: FONT_AR }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate Form */}
      <div style={{
        background: 'rgba(28,28,30,0.55)', borderRadius: 20,
        border: '0.5px solid rgba(255,255,255,0.08)', padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Sparkles size={16} color={C.purple} />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#F0F2F5', fontFamily: FONT_AR }}>توليد محتوى</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            placeholder="الموضوع..."
            value={genTopic}
            onChange={(e) => setGenTopic(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
              color: '#F0F2F5', fontFamily: FONT_AR, fontSize: 13, outline: 'none', direction: 'rtl',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={genType}
              onChange={(e) => setGenType(e.target.value as ContentType)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                color: '#F0F2F5', fontFamily: FONT_AR, fontSize: 11,
              }}
            >
              {Object.values(ContentType).map(t => <option key={t} value={t} style={{ background: '#1A1D29' }}>{getTypeLabel(t)}</option>)}
            </select>
            <select
              value={genCategory}
              onChange={(e) => setGenCategory(e.target.value as ContentCategory)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                color: '#F0F2F5', fontFamily: FONT_AR, fontSize: 11,
              }}
            >
              {Object.values(ContentCategory).map(c => <option key={c} value={c} style={{ background: '#1A1D29' }}>{getCategoryLabel(c)}</option>)}
            </select>
          </div>
          <button
            onClick={() => {
              if (!genTopic.trim()) return
              generateContent({ type: genType, category: genCategory, topic: genTopic })
              setGenTopic('')
            }}
            disabled={loading || !genTopic.trim()}
            style={{
              width: '100%', padding: '12px', borderRadius: 12,
              background: loading || !genTopic.trim() ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #B388FF, #6C3CE0)',
              color: loading || !genTopic.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
              border: 'none', fontSize: 13, fontWeight: 800,
              fontFamily: FONT_AR, cursor: loading || !genTopic.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'جارٍ التوليد...' : 'توليد'}
          </button>
        </div>
      </div>

      {/* Recent Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontFamily: FONT_AR, padding: '0 4px' }}>
          آخر المحتوى ({articles.length})
        </span>
        {articles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(255,255,255,0.2)', fontFamily: FONT_AR, fontSize: 12 }}>
            لا يوجد محتوى بعد
          </div>
        ) : (
          articles.slice(0, 10).map((article) => {
            const catColor = getCategoryColor(article.category)
            return (
              <div key={article.id} style={{
                background: 'rgba(28,28,30,0.4)', borderRadius: 14,
                border: '0.5px solid rgba(255,255,255,0.06)',
                borderRight: `2px solid ${catColor}`,
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: `${catColor}15`, color: catColor, fontWeight: 700, fontFamily: FONT_AR }}>
                    {getCategoryLabel(article.category)}
                  </span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: 'rgba(212,175,55,0.1)', color: C.gold, fontWeight: 700, fontFamily: FONT_AR }}>
                    {getTypeLabel(article.type)}
                  </span>
                </div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#F0F2F5', fontFamily: FONT_AR, margin: 0, lineHeight: 1.5 }}>
                  {article.titleAr || article.titleEn}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
