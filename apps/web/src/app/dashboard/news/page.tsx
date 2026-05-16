'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Newspaper,
  Globe,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Brain,
  Search,
  Zap,
  Clock,
  AlertTriangle,
  PenLine,
  Sparkles,
  BarChart2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Bookmark,
  Share2,
} from 'lucide-react'
import { safeStr } from '@/lib/utils'
import { TExtended as T } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

const FONT_AR = 'var(--font-ar)'
const FONT_MONO = 'var(--font-mono)'

const ContentAgentPage = dynamic(
  () => import('@/app/dashboard/content-agent/page'),
  { ssr: false, loading: () => <div style={{ padding: 40, textAlign: 'center', color: T.text2, fontFamily: FONT_AR }}>جارٍ تحميل وكيل المحتوى...</div> }
)

type NewsItem = {
  id: string
  source: string
  title: string
  translatedTitle?: string
  content: string
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
  aiAnalysis?: string
  publishedAt?: string
  newsType?: string
  slug?: string
}

type ReportItem = {
  id: string
  titleAr?: string
  slug?: string
  category?: string
  analysisType?: string
  timeFrame?: string
  riskLevel?: string
  sentiment?: string
  confidenceScore?: number
  publishedAt?: string
  type?: string
  scope?: string
  sectors?: string[]
  countries?: string[]
  marketImpact?: string
  imageUrl?: string | null
  siteUrl?: string | null
  keyIndicators?: {
    topic?: string
    region?: string
    sectors?: string[]
    scenarios?: string[]
  }
  priceTarget?: {
    current?: number
    target?: number | null
    stopLoss?: number | null
    symbol?: string | null
    analysisDate?: string
  }
  indicators?: string[]
}

/* ─── Category Config ─── */
const CATEGORIES = [
  { id: 'all', label: 'الكل', icon: '📋', color: T.cyan },
  { id: 'أسهم', label: 'أسهم', icon: '📈', color: T.green },
  { id: 'أرباح شركات', label: 'أرباح', icon: '💰', color: T.amber },
  { id: 'كريبتو', label: 'كريبتو', icon: '₿', color: '#F7931A' },
  { id: 'اقتصاد كلي', label: 'اقتصاد', icon: '🏛️', color: T.purple },
  { id: 'طاقة', label: 'طاقة', icon: '⛽', color: T.red },
  { id: 'بنوك مركزية', label: 'بنوك', icon: '🏦', color: '#64B5F6' },
  { id: 'عملات', label: 'فوركس', icon: '💱', color: T.cyan },
  { id: 'القطاع التكنولوجي', label: 'تكنولوجيا', icon: '💻', color: '#B388FF' },
  { id: 'القطاع الصحي', label: 'صحة', icon: '🏥', color: T.green },
  { id: 'قطاع التكنولوجيا', label: 'تقنية', icon: '🔌', color: '#B388FF' },
] as const

export default function NewsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = searchParams.get('tab') === 'reports' ? 'reports' : searchParams.get('tab') === 'agent' ? 'agent' : 'news'

  useScopedStyle(`
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes live-dot { 0%, 100% { transform: scale(1); opacity: 0.65; } 50% { transform: scale(1.35); opacity: 1; } }
    @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slide-in { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
    .news-card { transition: background 0.2s, border-color 0.2s, transform 0.15s; cursor: pointer; }
    .news-card:hover { transform: translateY(-2px); }
    .category-chip { transition: all 0.2s; cursor: pointer; }
    .category-chip:hover { transform: translateY(-1px); }
    .slider-dot { transition: all 0.3s; }
    ::-webkit-scrollbar { height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 4px; }
  `)

  const [items, setItems] = useState<NewsItem[]>([])
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'news' | 'reports' | 'agent'>(initialTab)

  // Slider state
  const [currentSlide, setCurrentSlide] = useState(0)
  const sliderInterval = useRef<NodeJS.Timeout | null>(null)

  const fetchNews = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch('/api/news/latest?limit=50', { cache: 'no-store' })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setItems(data.data)
      } else {
        setItems([])
        setFetchError('لم يتم العثور على أخبار')
      }
    } catch {
      setItems([])
      setFetchError('تعذر الاتصال بخادم الأخبار')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/news/reports?limit=20', { cache: 'no-store' })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setReports(data.data)
      }
    } catch {
      // Reports unavailable silently
    }
  }, [])

  useEffect(() => {
    fetchNews()
    fetchReports()
    const interval = setInterval(fetchNews, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchNews, fetchReports])

  // Auto-advance slider
  useEffect(() => {
    if (activeTab !== 'news' || heroItems.length === 0) return
    sliderInterval.current = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % heroItems.length)
    }, 5000)
    return () => { if (sliderInterval.current) clearInterval(sliderInterval.current) }
  }, [activeTab, items.length])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchNews()
    fetchReports()
  }

  // Hero items for slider (first 5 with images or top items)
  const heroItems = useMemo(() => {
    const withImages = items.filter(i => i.imageUrl)
    if (withImages.length >= 3) return withImages.slice(0, 5)
    return items.slice(0, 5)
  }, [items])

  // Filtered items by category and search
  const filteredItems = useMemo(() => {
    let filtered = items
    if (activeCategory !== 'all') {
      filtered = filtered.filter(i => i.categoryAr === activeCategory || i.category === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.translatedTitle?.toLowerCase().includes(q) ||
        i.content?.toLowerCase().includes(q) ||
        i.summary?.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [items, activeCategory, searchQuery])

  const stats = useMemo(() => {
    const positive = items.filter(i => i.sentimentLabel === 'positive').length
    const negative = items.filter(i => i.sentimentLabel === 'negative').length
    return { total: items.length, positive, negative }
  }, [items])

  return (
    <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg, #0A84FF, #00C8FF)',
              boxShadow: '0 4px 16px rgba(0,212,255,0.25)',
            }}>
              <Newspaper size={22} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: T.text }}>غرفة الأخبار</h1>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  background: `${T.red}14`, border: `0.5px solid ${T.red}33`,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, animation: 'live-dot 1.8s ease-in-out infinite' }} />
                  <span style={{ fontSize: 10, color: T.red, fontFamily: FONT_MONO, fontWeight: 800 }}>LIVE</span>
                </div>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: T.text3 }}>
                أخبار وتحليلات مالية من رؤى — {stats.total} خبر
              </p>
            </div>
            <button onClick={handleRefresh} disabled={refreshing} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10,
              border: `1px solid ${T.border}`, background: T.card,
              color: T.text2, cursor: 'pointer', fontSize: 12,
              fontFamily: FONT_AR, fontWeight: 700,
            }}>
              <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              تحديث
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: `0.5px solid ${T.border}`,
          marginBottom: 20,
        }}>
          {[
            { id: 'news' as const, label: 'الأخبار', icon: Newspaper, color: T.cyan },
            { id: 'reports' as const, label: 'التقارير', icon: BarChart2, color: T.amber },
            { id: 'agent' as const, label: 'وكيل المحتوى', icon: PenLine, color: '#B388FF' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '12px 22px',
                fontFamily: FONT_AR, fontSize: 13,
                fontWeight: activeTab === tab.id ? 800 : 500,
                color: activeTab === tab.id ? tab.color : T.text2,
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab.id ? `2.5px solid ${tab.color}` : '2.5px solid transparent',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.id === 'agent' && <Sparkles size={12} style={{ opacity: 0.6 }} />}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'agent' ? (
          <ContentAgentPage />
        ) : activeTab === 'reports' ? (
          <ReportsTab reports={reports} loading={loading} />
        ) : (
          <>
            {/* Hero Slider */}
            {!loading && heroItems.length > 0 && (
              <HeroSlider
                items={heroItems}
                currentSlide={currentSlide}
                setCurrentSlide={setCurrentSlide}
                onArticleClick={(slug, id) => router.push(`/dashboard/news/${slug || id}`)}
              />
            )}

            {/* Search Bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: '10px 16px', marginBottom: 16,
            }}>
              <Search size={16} color={T.text3} />
              <input
                type="text"
                placeholder="بحث في الأخبار..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: T.text, fontSize: 13, width: '100%', fontFamily: FONT_AR,
                }}
              />
            </div>

            {/* Category Chips */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 20,
              overflowX: 'auto', paddingBottom: 4,
              scrollbarWidth: 'none', msOverflowStyle: 'none',
            }}>
              {CATEGORIES.map(cat => {
                const isActive = activeCategory === cat.id
                const count = cat.id === 'all' ? items.length : items.filter(i => i.categoryAr === cat.id || i.category === cat.id).length
                return (
                  <button
                    key={cat.id}
                    className="category-chip"
                    onClick={() => setActiveCategory(cat.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 12,
                      border: `1px solid ${isActive ? cat.color : T.border}`,
                      background: isActive ? `${cat.color}14` : T.card,
                      color: isActive ? cat.color : T.text2,
                      fontSize: 12, fontWeight: isActive ? 800 : 600,
                      fontFamily: FONT_AR, whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <span>{cat.icon}</span>
                    {cat.label}
                    <span style={{ fontSize: 10, opacity: 0.7 }}>({count})</span>
                  </button>
                )
              })}
            </div>

            {/* Error */}
            {fetchError && (
              <div style={{
                background: `${T.red}08`, border: `1px solid ${T.red}22`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertTriangle size={14} style={{ color: T.red, flexShrink: 0 }} />
                <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.red, flex: 1 }}>{fetchError}</span>
              </div>
            )}

            {/* Loading */}
            {loading ? (
              <div style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 20, padding: '32px', textAlign: 'center', color: T.text2,
              }}>
                <RefreshCw size={28} color={T.cyan} style={{ marginBottom: 14, animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: 14, fontFamily: FONT_AR }}>جارٍ تحميل الأخبار من رؤى...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 20, padding: '40px 32px', textAlign: 'center',
              }}>
                <Newspaper size={34} color={T.cyan} style={{ marginBottom: 14 }} />
                <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>لا توجد أخبار مطابقة</h2>
                <p style={{ color: T.text2, fontSize: 13, margin: 0 }}>غيّر التصنيف أو البحث</p>
              </div>
            ) : (
              /* News Grid */
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 14,
              }}>
                {filteredItems.map((item, index) => (
                  <NewsCard
                    key={item.id || index}
                    item={item}
                    index={index}
                    onClick={() => router.push(`/dashboard/news/${item.slug || item.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   Hero Slider Component
   ═══════════════════════════════════════════ */
function HeroSlider({
  items,
  currentSlide,
  setCurrentSlide,
  onArticleClick,
}: {
  items: NewsItem[]
  currentSlide: number
  setCurrentSlide: (n: number) => void
  onArticleClick: (slug: string, id: string) => void
}) {
  const item = items[currentSlide]
  if (!item) return null

  const displayTitle = item.translatedTitle || item.title
  const sentiment = getSentimentBadge(item.sentimentLabel)

  return (
    <div style={{ marginBottom: 20, borderRadius: 20, overflow: 'hidden', position: 'relative', height: 280 }}>
      {/* Background Image */}
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
      ) : (
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, background: `linear-gradient(135deg, ${T.card}, ${T.bg2})` }} />
      )}
      {/* Gradient Overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to top, rgba(11,14,20,0.95) 40%, rgba(11,14,20,0.3) 100%)' }} />

      {/* Content */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '20px 24px', cursor: 'pointer',
      }} onClick={() => onArticleClick(item.slug || '', item.id)}>
        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          {item.categoryAr && (
            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 8, background: `${T.cyan}22`, color: T.cyan, fontWeight: 800, fontFamily: FONT_AR }}>
              {item.categoryAr}
            </span>
          )}
          <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 8, background: sentiment.bg, color: sentiment.color, fontWeight: 800, fontFamily: FONT_AR }}>
            {sentiment.text}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT_AR }}>
            <Clock size={10} /> {timeAgo(item.publishedAt)}
          </span>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 900, color: '#FFF', lineHeight: 1.5, margin: '0 0 8px', fontFamily: FONT_AR, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {displayTitle}
        </h2>

        {item.summary && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0, fontFamily: FONT_AR, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.summary}
          </p>
        )}
      </div>

      {/* Slider Dots */}
      {items.length > 1 && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className="slider-dot"
              style={{
                width: currentSlide === i ? 24 : 8, height: 8,
                borderRadius: 4, border: 'none',
                background: currentSlide === i ? T.cyan : 'rgba(255,255,255,0.3)',
                cursor: 'pointer', padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Navigation Arrows */}
      {items.length > 1 && (
        <>
          <button
            onClick={() => setCurrentSlide((currentSlide - 1 + items.length) % items.length)}
            style={{
              position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)',
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(0,0,0,0.5)', border: 'none',
              color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setCurrentSlide((currentSlide + 1) % items.length)}
            style={{
              position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)',
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(0,0,0,0.5)', border: 'none',
              color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={16} />
          </button>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   News Card Component
   ═══════════════════════════════════════════ */
function NewsCard({ item, index, onClick }: { item: NewsItem; index: number; onClick: () => void }) {
  const displayTitle = item.translatedTitle || item.title
  const sentiment = getSentimentBadge(item.sentimentLabel)
  const SentimentIcon = sentiment.icon

  return (
    <article
      className="news-card"
      onClick={onClick}
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRight: `3px solid ${sentiment.color}`,
        borderRadius: 16,
        overflow: 'hidden',
        animation: `fade-in 0.25s ease-out ${index * 20}ms both`,
      }}
    >
      {/* Image */}
      {item.imageUrl && (
        <div style={{ width: '100%', height: 160, overflow: 'hidden' }}>
          <img src={item.imageUrl} alt={safeStr(displayTitle)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
        </div>
      )}

      <div style={{ padding: '16px 18px' }}>
        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
          {item.categoryAr && (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, background: `${T.cyan}12`, color: T.cyan, fontWeight: 800, fontFamily: FONT_AR }}>
              {item.categoryAr}
            </span>
          )}
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, background: sentiment.bg, color: sentiment.color, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2, fontFamily: FONT_AR }}>
            <SentimentIcon size={9} /> {sentiment.text}
          </span>
          <span style={{ fontSize: 9, color: T.text3, marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontFamily: FONT_AR }}>
            <Clock size={9} /> {timeAgo(item.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <h3 style={{ color: T.text, fontSize: 15, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.6, fontFamily: FONT_AR, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {displayTitle}
        </h3>

        {/* Summary */}
        {item.summary && (
          <p style={{ color: T.text2, fontSize: 12, margin: '0 0 10px', lineHeight: 1.7, fontFamily: FONT_AR, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.summary}
          </p>
        )}

        {/* Key Takeaways mini */}
        {Array.isArray(item.keyTakeaways) && item.keyTakeaways.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            <Zap size={10} color={T.green} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 10, color: T.green, fontWeight: 700, fontFamily: FONT_AR }}>{item.keyTakeaways.length} نقاط رئيسية</span>
          </div>
        )}

        {/* Source */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe size={11} color={T.text3} />
          <span style={{ fontSize: 10, color: T.text3, fontFamily: FONT_AR }}>{item.source || 'رؤى للأخبار'}</span>
          {item.fullContent && item.fullContent.length > 10 && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${T.cyan}10`, color: T.cyan, fontWeight: 700, fontFamily: FONT_AR, marginInlineStart: 'auto' }}>تحليل كامل</span>
          )}
        </div>
      </div>
    </article>
  )
}

/* ═══════════════════════════════════════════
   Reports Tab Component
   ═══════════════════════════════════════════ */
function ReportsTab({ reports, loading }: { reports: ReportItem[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (loading) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '32px', textAlign: 'center', color: T.text2 }}>
        <RefreshCw size={28} color={T.amber} style={{ marginBottom: 14, animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 14, fontFamily: FONT_AR }}>جارٍ تحميل التقارير...</p>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 32px', textAlign: 'center' }}>
        <BarChart2 size={34} color={T.amber} style={{ marginBottom: 14 }} />
        <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>لا توجد تقارير حالياً</h2>
        <p style={{ color: T.text2, fontSize: 13, margin: 0 }}>ستظهر التقارير المحللة هنا عند توفرها</p>
      </div>
    )
  }

  // Group by type
  const analysisReports = reports.filter(r => r.type === 'market_analysis')
  const economicReports = reports.filter(r => r.type === 'economic_report')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Economic Reports Section */}
      {economicReports.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `${T.amber}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={16} color={T.amber} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>تقارير اقتصادية استراتيجية</h2>
            <span style={{ fontSize: 11, color: T.text3, fontFamily: FONT_AR }}>({economicReports.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {economicReports.map((report, i) => (
              <ReportCard key={report.id || i} report={report} index={i} expanded={expandedId === report.id} onToggle={() => setExpandedId(prev => prev === report.id ? null : report.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Market Analysis Section */}
      {analysisReports.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `${T.cyan}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={16} color={T.cyan} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>تحليلات السوق</h2>
            <span style={{ fontSize: 11, color: T.text3, fontFamily: FONT_AR }}>({analysisReports.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {analysisReports.map((report, i) => (
              <ReportCard key={report.id || i} report={report} index={i} expanded={expandedId === report.id} onToggle={() => setExpandedId(prev => prev === report.id ? null : report.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReportCard({ report, index, expanded, onToggle }: { report: ReportItem; index: number; expanded: boolean; onToggle: () => void }) {
  const [imgError, setImgError] = useState(false)
  const categoryMap: Record<string, { label: string; color: string; icon: string }> = {
    'strategic': { label: 'استراتيجي', color: T.amber, icon: '🎯' },
    'daily': { label: 'يومي', color: T.cyan, icon: '📅' },
    'earnings': { label: 'أرباح', color: T.green, icon: '💰' },
    'technicalAnalysis': { label: 'تحليل فني', color: '#B388FF', icon: '📊' },
    'energy': { label: 'طاقة', color: T.red, icon: '⛽' },
    'bonds': { label: 'سندات', color: '#64B5F6', icon: '🏦' },
    'crypto': { label: 'كريبتو', color: '#F7931A', icon: '₿' },
    'forex': { label: 'فوركس', color: T.cyan, icon: '💱' },
    'commodities': { label: 'سلع', color: T.amber, icon: '🛢️' },
    'stocks': { label: 'أسهم', color: T.green, icon: '📈' },
  }
  const cat = categoryMap[report.category || ''] || { label: report.category || 'تقرير', color: T.cyan, icon: '📋' }
  const riskMap: Record<string, { label: string; color: string }> = {
    'high': { label: 'عالي المخاطر', color: T.red },
    'medium': { label: 'متوسط المخاطر', color: T.amber },
    'low': { label: 'منخفض المخاطر', color: T.green },
  }
  const risk = riskMap[report.riskLevel || ''] || riskMap['medium']
  const sentimentMap: Record<string, { label: string; color: string }> = {
    'bullish': { label: 'صعودي', color: T.green },
    'bearish': { label: 'هبوطي', color: T.red },
    'neutral': { label: 'محايد', color: T.text3 },
  }
  const sentimentConf = sentimentMap[report.sentiment || ''] || sentimentMap['neutral']

  return (
    <article
      className="news-card"
      onClick={onToggle}
      style={{
        background: T.card,
        border: `1px solid ${expanded ? cat.color + '40' : T.border}`,
        borderRight: `3px solid ${cat.color}`,
        borderRadius: 14,
        overflow: 'hidden',
        animation: `fade-in 0.25s ease-out ${index * 20}ms both`,
      }}
    >
      {/* Image */}
      {report.imageUrl && !imgError && (
        <div style={{ width: '100%', height: 140, overflow: 'hidden' }}>
          <img src={report.imageUrl} alt="" onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
        </div>
      )}

      <div style={{ padding: '16px 18px' }}>
        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: `${cat.color}14`, color: cat.color, fontWeight: 800, fontFamily: FONT_AR, display: 'flex', alignItems: 'center', gap: 3 }}>
            {cat.icon} {cat.label}
          </span>
          {report.confidenceScore != null && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${T.green}12`, color: T.green, fontWeight: 700, fontFamily: FONT_AR }}>
              ثقة {report.confidenceScore}%
            </span>
          )}
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${risk.color}10`, color: risk.color, fontWeight: 700, fontFamily: FONT_AR }}>
            {risk.label}
          </span>
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${sentimentConf.color}10`, color: sentimentConf.color, fontWeight: 700, fontFamily: FONT_AR }}>
            {sentimentConf.label}
          </span>
          <span style={{ fontSize: 9, color: T.text3, marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontFamily: FONT_AR }}>
            <Clock size={9} /> {timeAgo(report.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <h3 style={{ color: T.text, fontSize: 14, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.6, fontFamily: FONT_AR }}>
          {report.titleAr || 'تقرير'}
        </h3>

        {/* Sectors */}
        {Array.isArray(report.sectors) && report.sectors.length > 0 && !expanded && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {report.sectors.slice(0, 4).map((s, i) => (
              <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: T.bg2, color: T.text3, fontWeight: 600, fontFamily: FONT_AR }}>
                {safeStr(s)}
              </span>
            ))}
            {report.sectors.length > 4 && <span style={{ fontSize: 9, color: T.text3 }}>+{report.sectors.length - 4}</span>}
          </div>
        )}

        {/* Expand indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: T.text3, display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT_AR }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'إغلاق' : 'عرض التفاصيل'}
          </span>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          {/* Key Indicators */}
          {report.keyIndicators && (
            <div style={{ padding: 14, background: `${T.cyan}06`, borderRadius: 12, border: `0.5px solid ${T.cyan}15`, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Brain size={12} color={T.cyan} />
                <span style={{ fontSize: 11, fontWeight: 800, color: T.cyan, fontFamily: FONT_AR }}>المؤشرات الرئيسية</span>
              </div>
              {report.keyIndicators.topic && (
                <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.7, margin: '0 0 6px', fontFamily: FONT_AR }}>{report.keyIndicators.topic}</p>
              )}
              {report.keyIndicators.region && (
                <p style={{ fontSize: 11, color: T.text3, margin: '0 0 6px', fontFamily: FONT_AR }}>المنطقة: {report.keyIndicators.region}</p>
              )}
              {Array.isArray(report.keyIndicators.scenarios) && report.keyIndicators.scenarios.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {report.keyIndicators.scenarios.map((s, i) => (
                    <span key={i} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 6, background: `${T.amber}10`, color: T.amber, fontWeight: 600, fontFamily: FONT_AR }}>{safeStr(s)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Price Target */}
          {report.priceTarget && report.priceTarget.symbol && (
            <div style={{ padding: 14, background: `${T.green}06`, borderRadius: 12, border: `0.5px solid ${T.green}15`, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <TrendingUp size={12} color={T.green} />
                <span style={{ fontSize: 11, fontWeight: 800, color: T.green, fontFamily: FONT_AR }}>السعر المستهدف</span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {report.priceTarget.symbol && (
                  <span style={{ fontSize: 14, fontWeight: 900, color: T.text, fontFamily: FONT_MONO }}>{report.priceTarget.symbol}</span>
                )}
                {report.priceTarget.current > 0 && (
                  <span style={{ fontSize: 12, color: T.text2 }}>الحالي: <strong style={{ color: T.text }}>{report.priceTarget.current}</strong></span>
                )}
                {report.priceTarget.target != null && (
                  <span style={{ fontSize: 12, color: T.green }}>المستهدف: <strong>{report.priceTarget.target}</strong></span>
                )}
                {report.priceTarget.stopLoss != null && (
                  <span style={{ fontSize: 12, color: T.red }}>وقف الخسارة: <strong>{report.priceTarget.stopLoss}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Scope & Countries */}
          {(report.scope || (Array.isArray(report.countries) && report.countries.length > 0)) && (
            <div style={{ padding: 14, background: `${T.amber}06`, borderRadius: 12, border: `0.5px solid ${T.amber}15`, marginBottom: 12 }}>
              {report.scope && (
                <p style={{ fontSize: 12, color: T.text2, margin: '0 0 6px', fontFamily: FONT_AR }}>النطاق: <strong style={{ color: T.text }}>{report.scope === 'arabic' ? 'العالم العربي' : report.scope === 'regional' ? 'إقليمي' : report.scope === 'global' ? 'عالمي' : report.scope}</strong></p>
              )}
              {Array.isArray(report.countries) && report.countries.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {report.countries.map((c, i) => (
                    <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: T.bg2, color: T.text3, fontWeight: 600, fontFamily: FONT_AR }}>{safeStr(c)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sectors (full in expanded) */}
          {Array.isArray(report.sectors) && report.sectors.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
              {report.sectors.map((s, i) => (
                <span key={i} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: `${cat.color}10`, color: cat.color, fontWeight: 700, fontFamily: FONT_AR }}>{safeStr(s)}</span>
              ))}
            </div>
          )}

          {/* Confidence Score Bar */}
          {report.confidenceScore != null && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: T.text3, fontFamily: FONT_AR }}>مستوى الثقة</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: T.green, fontFamily: FONT_MONO }}>{report.confidenceScore}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: T.bg2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${report.confidenceScore}%`, borderRadius: 2, background: `linear-gradient(90deg, ${T.green}60, ${T.green})`, transition: 'width 0.5s' }} />
              </div>
            </div>
          )}

          {/* Market Impact */}
          {report.marketImpact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: T.text3, fontFamily: FONT_AR }}>تأثير السوق:</span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${sentimentConf.color}10`, color: sentimentConf.color, fontWeight: 700, fontFamily: FONT_AR }}>{report.marketImpact === 'neutral' ? 'محايد' : report.marketImpact === 'bullish' ? 'صعودي' : report.marketImpact === 'bearish' ? 'هبوطي' : report.marketImpact}</span>
            </div>
          )}

          {/* Link to news site */}
          {report.siteUrl && (
            <a href={report.siteUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: T.cyan, fontFamily: FONT_AR, textDecoration: 'none', padding: '8px 16px', borderRadius: 10, background: `${T.cyan}08`, border: `0.5px solid ${T.cyan}18` }}>
              قراءة التقرير الكامل <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </article>
  )
}

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */
function getSentimentBadge(label?: string) {
  switch (label) {
    case 'positive': return { bg: `${T.green}14`, color: T.green, text: 'إيجابي', icon: TrendingUp }
    case 'negative': return { bg: `${T.red}14`, color: T.red, text: 'سلبي', icon: TrendingDown }
    default: return { bg: `${T.text3}14`, color: T.text3, text: 'محايد', icon: Minus }
  }
}

function timeAgo(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  const days = Math.floor(hours / 24)
  return `منذ ${days} يوم`
}
