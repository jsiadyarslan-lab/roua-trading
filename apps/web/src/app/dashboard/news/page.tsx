'use client'

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Clock, Newspaper, Calendar, TrendingUp, BarChart3, Globe2,
  Search, RefreshCw, ChevronDown, ChevronUp, AlertTriangle,
  FileText, Zap, Inbox, Bot, Send, Info,
} from 'lucide-react'
import { useContentAgentStore, ContentType, ContentCategory, ContentStatus } from '@/hooks/useContentAgentStore'
import type { ContentArticle } from '@/hooks/useContentAgentStore'
import type { LucideIcon } from 'lucide-react'

// ── Design Tokens (canonical from unified-tokens) ──
import { TExtended as T } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

// Local extensions not in canonical set
const TLocal = {
  orange: '#FF8C42',
} as const

const FONT_AR = 'var(--font-ar)'
const FONT_MONO = 'var(--font-mono)'

// ── Tab definitions ──
type TabKey = 'hourly' | 'daily' | 'weekly' | 'pair' | 'financial' | 'economic'

interface TabDef {
  key: TabKey
  label: string
  icon: LucideIcon
  accent: string
  desc: string
  contentTypes: ContentType[]
  categories: string[]
}

const TABS: TabDef[] = [
  { key: 'hourly', label: 'ساعي', icon: Clock, accent: T.amber, desc: 'تحديثات ساعية للأسواق', contentTypes: [ContentType.HOURLY_UPDATE], categories: [] },
  { key: 'daily', label: 'يومي', icon: Newspaper, accent: T.cyan, desc: 'ملخصات يومية شاملة', contentTypes: [ContentType.NEWS_DIGEST, ContentType.MARKET_REPORT], categories: [] },
  { key: 'weekly', label: 'أسبوعي', icon: Calendar, accent: T.purple, desc: 'مراجعات أسبوعية معمّقة', contentTypes: [ContentType.WEEKLY_REVIEW], categories: [] },
  { key: 'pair', label: 'حسب الزوج', icon: TrendingUp, accent: TLocal.orange, desc: 'تحليلات مفصّلة للأزواج', contentTypes: [ContentType.PAIR_ANALYSIS], categories: [] },
  { key: 'financial', label: 'مالية', icon: BarChart3, accent: T.green, desc: 'تقارير الأسواق المالية', contentTypes: [], categories: ['CRYPTO', 'FOREX', 'STOCKS', 'COMMODITIES', 'DEFI'] },
  { key: 'economic', label: 'اقتصادية', icon: Globe2, accent: T.red, desc: 'تحليلات اقتصادية وتنظيمية', contentTypes: [], categories: ['ECONOMY', 'REGULATION', 'GEOPOLITICS'] },
]

// ── Pair options ──
const PAIR_OPTIONS = [
  { label: 'BTC/USDT', value: 'BTC' },
  { label: 'ETH/USDT', value: 'ETH' },
  { label: 'SOL/USDT', value: 'SOL' },
  { label: 'EUR/USD', value: 'EUR' },
  { label: 'BNB/USDT', value: 'BNB' },
  { label: 'XRP/USDT', value: 'XRP' },
]

// ── Category labels ──
const CATEGORY_LABELS: Record<string, string> = {
  CRYPTO: 'كريبتو', FOREX: 'فوركس', STOCKS: 'أسهم', COMMODITIES: 'سلع',
  ECONOMY: 'اقتصاد', REGULATION: 'تشريعات', TECHNOLOGY: 'تقنية',
  EDUCATION: 'تعليم', GEOPOLITICS: 'جيوسياسة', DEFI: 'ديفاي', NFT: 'NFT',
}

const CATEGORY_COLORS: Record<string, string> = {
  CRYPTO: '#00D4FF', FOREX: '#00FFA3', STOCKS: '#FF8C42', COMMODITIES: '#FFB800',
  ECONOMY: '#B388FF', REGULATION: '#FF4757', TECHNOLOGY: '#00D4FF',
  EDUCATION: '#10B981', GEOPOLITICS: '#FF4757', DEFI: '#B388FF', NFT: '#FF8C42',
}

const TYPE_BADGES: Record<string, { color: string; label: string }> = {
  HOURLY_UPDATE: { color: T.amber, label: 'ساعي' },
  NEWS_DIGEST: { color: T.cyan, label: 'يومي' },
  MARKET_REPORT: { color: T.green, label: 'تقرير سوق' },
  WEEKLY_REVIEW: { color: T.purple, label: 'أسبوعي' },
  PAIR_ANALYSIS: { color: TLocal.orange, label: 'تحليل زوج' },
  ANALYSIS: { color: T.cyan, label: 'تحليل' },
  ARTICLE: { color: T.text3, label: 'مقال' },
  BREAKING: { color: T.red, label: 'عاجل' },
  EDUCATIONAL: { color: '#10B981', label: 'تعليمي' },
  OPINION: { color: T.purple, label: 'رأي' },
}

// ── Sort options ──
type SortOption = 'newest' | 'oldest' | 'quality'

// ── Helpers ──
function timeAgo(value?: string | null): string {
  if (!value) return 'غير متاح'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'غير متاح'
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} د`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 7) return `منذ ${days} ي`
  return `منذ ${Math.floor(days / 7)} أ`
}

function getSentimentDisplay(score: number): { label: string; color: string } {
  if (score >= 0.3) return { label: 'إيجابي', color: T.green }
  if (score <= -0.3) return { label: 'سلبي', color: T.red }
  return { label: 'محايد', color: T.text2 }
}

// ── Main Page Component (wrapped in Suspense) ──
function ReportsPageContent() {
  useScopedStyle(`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes live-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .report-card { transition: background 0.2s, border-color 0.2s, box-shadow 0.2s; }
        .report-card:hover { background: ${T.cardHover} !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 10px; }
        .tab-btn { transition: all 0.2s ease; }
        .tab-btn:hover { filter: brightness(1.15); }`)

  const searchParams = useSearchParams()
  const router = useRouter()

  const {
    articles,
    agentState,
    loading,
    fetchFeed,
    fetchStats,
    fetchState,
    setFeedFilters,
    startAutoRefresh,
    stopAutoRefresh,
  } = useContentAgentStore()

  const validTabs: TabKey[] = ['hourly', 'daily', 'weekly', 'pair', 'financial', 'economic']
  const urlTab = searchParams.get('tab')
  const derivedTab: TabKey = validTabs.includes(urlTab as TabKey) ? (urlTab as TabKey) : 'hourly'

  const [activeTab, setActiveTab] = useState<TabKey>(derivedTab)
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showScheduleInfo, setShowScheduleInfo] = useState(false)

  // Sync tab from URL on change
  useEffect(() => {
    if (validTabs.includes(urlTab as TabKey)) {
      setActiveTab(urlTab as TabKey)
    }
  }, [urlTab])

  // Fetch all reports on mount
  useEffect(() => {
    setFeedFilters({ type: undefined, category: undefined, symbol: undefined, status: ContentStatus.PUBLISHED, page: 1, limit: 100 })
    fetchFeed()
    fetchStats()
    fetchState()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [])

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchFeed(), fetchStats(), fetchState()])
    setRefreshing(false)
  }, [fetchFeed, fetchStats, fetchState])

  // Tab click handler
  const handleTabClick = useCallback((tab: TabKey) => {
    setActiveTab(tab)
    setExpandedId(null)
    if (tab !== 'pair') setSelectedPair(null)
    router.push(`/dashboard/news?tab=${tab}`, { scroll: false })
  }, [router])

  // Client-side filtering based on active tab
  const filteredReports = useMemo(() => {
    let filtered: ContentArticle[] = articles
    const tabDef = TABS.find(t => t.key === activeTab)
    if (!tabDef) return filtered

    // Filter by content type
    if (tabDef.contentTypes.length > 0) {
      filtered = filtered.filter(a => tabDef.contentTypes.includes(a.type))
    }

    // Filter by category
    if (tabDef.categories.length > 0) {
      filtered = filtered.filter(a => tabDef.categories.includes(a.category))
    }

    // Pair filter
    if (activeTab === 'pair' && selectedPair) {
      filtered = filtered.filter(a => Array.isArray(a.relatedSymbols) && a.relatedSymbols.some(s => s.includes(selectedPair)))
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        a => a.titleAr?.toLowerCase().includes(q) || a.titleEn?.toLowerCase().includes(q) || a.summaryAr?.toLowerCase().includes(q)
      )
    }

    // Sort
    switch (sortOption) {
      case 'newest':
        filtered = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'oldest':
        filtered = [...filtered].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case 'quality':
        filtered = [...filtered].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
        break
    }

    return filtered
  }, [articles, activeTab, selectedPair, searchQuery, sortOption])

  // Stats
  const computedStats = useMemo(() => {
    const total = articles.length
    const today = articles.filter(a => new Date(a.createdAt).toDateString() === new Date().toDateString()).length
    let lastUpdate = ''
    if (articles.length > 0) {
      const sorted = [...articles].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      lastUpdate = timeAgo(sorted[0].createdAt)
    }
    return { total, today, lastUpdate }
  }, [articles])

  const currentTab = TABS.find(t => t.key === activeTab) || TABS[0]

  return (
    <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text }}>
      {/* Scoped styles via useScopedStyle */}<div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px' }}>

        {/* ══════════════════════════════════════════
            HEADER
        ══════════════════════════════════════════ */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `linear-gradient(135deg, ${currentTab.accent}22, ${currentTab.accent}08)`,
                border: `1px solid ${currentTab.accent}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <currentTab.icon size={20} color={currentTab.accent} />
              </div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: T.text }}>
                التقارير
              </h1>
              {/* LIVE badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 20,
                background: 'rgba(255,71,87,0.06)',
                border: '0.5px solid rgba(255,71,87,0.15)',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, animation: 'live-pulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize: 9, color: T.red, fontFamily: FONT_MONO, fontWeight: 700 }}>LIVE</span>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: T.text3, lineHeight: 1.7 }}>
              تقارير آلية تولّد بالذكاء الاصطناعي وتُنشر عبر بوت تيليجرام
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowScheduleInfo(!showScheduleInfo)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 10,
                border: `1px solid ${T.border2}`, background: T.card,
                color: T.text2, cursor: 'pointer', fontSize: 11, fontFamily: FONT_AR,
                fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              <Info size={13} color={T.cyan} />
              جدولة التوليد
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 10,
                border: `1px solid ${T.border2}`, background: T.card,
                color: T.text2, cursor: refreshing ? 'not-allowed' : 'pointer',
                fontSize: 11, fontFamily: FONT_AR, fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              تحديث
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            SCHEDULE INFO PANEL
        ══════════════════════════════════════════ */}
        {showScheduleInfo && (
          <div style={{
            background: T.card, border: `1px solid ${T.border2}`,
            borderRadius: 14, padding: '16px 20px', marginBottom: 16,
            animation: 'fade-in 0.2s ease-out',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Bot size={16} color={T.cyan} />
              <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>كيف ومتى تُولَّد التقارير؟</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {[
                { icon: Clock, label: 'تقارير ساعية', schedule: 'كل ساعة', types: 'كريبتو، فوركس، أسهم', color: T.amber },
                { icon: Newspaper, label: 'ملخصات يومية', schedule: 'يومياً الساعة 8 صباحاً', types: 'كريبتو، فوركس، أسهم', color: T.cyan },
                { icon: Calendar, label: 'مراجعات أسبوعية', schedule: 'كل إثنين الساعة 8 صباحاً', types: '5 فئات', color: T.purple },
                { icon: TrendingUp, label: 'تحليلات الأزواج', schedule: 'كل 4 ساعات', types: 'BTC, ETH, EUR, SOL', color: TLocal.orange },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: `${item.color}08`, border: `1px solid ${item.color}15`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <item.icon size={13} color={item.color} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.6 }}>
                    <span style={{ color: T.text2, fontWeight: 600 }}>{item.schedule}</span> — {item.types}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(0,212,255,0.04)', borderRadius: 8 }}>
              <Send size={13} color={ T.green } />
              <span style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
                <strong style={{ color: T.green }}>مربوط مع بوت تيليجرام</strong> — كل تقرير يُنشر تلقائياً يُرسل كإشعار عبر البوت مع العنوان والتصنيف والأصول المتعلقة وجودة التقرير
              </span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            STATS ROW
        ══════════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 12, marginBottom: 16,
        }}>
          {[
            { label: 'إجمالي التقارير', value: computedStats.total, color: T.cyan },
            { label: 'اليوم', value: computedStats.today, color: T.green },
            { label: 'آخر تحديث', value: computedStats.lastUpdate || '—', color: T.amber, isText: true },
            { label: 'الحالة', value: agentState?.status === 'GENERATING' ? 'يولّد' : agentState?.status === 'IDLE' ? 'جاهز' : '—', color: agentState?.status === 'GENERATING' ? T.amber : T.green, isText: true },
          ].map((stat, i) => (
            <div key={i} style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              background: T.card, border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 10, color: T.text3, marginBottom: 2, fontWeight: 600 }}>{stat.label}</div>
              <div style={{ fontSize: stat.isText ? 12 : 18, fontWeight: 900, color: stat.color, fontFamily: stat.isText ? FONT_AR : FONT_MONO }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            TAB BAR
        ══════════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 16,
          background: T.card, borderRadius: 12, padding: 4,
          border: `1px solid ${T.border}`,
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                className="tab-btn"
                onClick={() => handleTabClick(tab.key)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  padding: '8px 6px', borderRadius: 8,
                  fontFamily: FONT_AR, fontSize: 11, fontWeight: isActive ? 800 : 500,
                  color: isActive ? tab.accent : T.text3,
                  background: isActive ? `${tab.accent}12` : 'transparent',
                  border: isActive ? `1px solid ${tab.accent}30` : '1px solid transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ══════════════════════════════════════════
            TAB DESCRIPTION + FILTERS
        ══════════════════════════════════════════ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
        }}>
          {/* Tab description */}
          <span style={{ fontSize: 12, color: T.text3, fontWeight: 600, flexShrink: 0 }}>
            {currentTab.desc}
          </span>

          <span style={{ width: 1, height: 14, background: T.border2, flexShrink: 0 }} />

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: T.card, borderRadius: 8,
            padding: '6px 10px', flex: '1 1 180px',
            border: `1px solid ${T.border}`,
          }}>
            <Search size={12} color={T.text3} />
            <input
              type="text"
              placeholder="بحث..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: T.text, fontSize: 11, width: '100%', fontFamily: FONT_AR,
              }}
            />
          </div>

          {/* Sort */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            style={{
              padding: '6px 10px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.card,
              color: T.text, fontSize: 11, fontFamily: FONT_AR,
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
            <option value="quality">أعلى جودة</option>
          </select>

          {/* Count */}
          <span style={{ fontSize: 11, color: T.text3, fontFamily: FONT_MONO, fontWeight: 700, flexShrink: 0 }}>
            {filteredReports.length}
          </span>
        </div>

        {/* ══════════════════════════════════════════
            PAIR SELECTOR — Only on "حسب الزوج"
        ══════════════════════════════════════════ */}
        {activeTab === 'pair' && (
          <div style={{
            display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap',
          }}>
            <button
              onClick={() => setSelectedPair(null)}
              style={{
                padding: '5px 14px', borderRadius: 8,
                border: `1px solid ${!selectedPair ? TLocal.orange : T.border}`,
                background: !selectedPair ? 'rgba(255,140,66,0.12)' : T.card,
                color: !selectedPair ? TLocal.orange : T.text3,
                cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO,
              }}
            >
              الكل
            </button>
            {PAIR_OPTIONS.map((pair) => {
              const isActive = selectedPair === pair.value
              return (
                <button
                  key={pair.value}
                  onClick={() => setSelectedPair(isActive ? null : pair.value)}
                  style={{
                    padding: '5px 14px', borderRadius: 8,
                    border: `1px solid ${isActive ? TLocal.orange : T.border}`,
                    background: isActive ? 'rgba(255,140,66,0.12)' : T.card,
                    color: isActive ? TLocal.orange : T.text3,
                    cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO,
                  }}
                >
                  {pair.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════
            LOADING STATE
        ══════════════════════════════════════════ */}
        {loading && articles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 12, padding: 16, animation: 'fade-in 0.3s ease-out',
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 48, height: 18, borderRadius: 99, background: 'rgba(255,255,255,0.04)' }} />
                  <div style={{ width: 56, height: 18, borderRadius: 99, background: 'rgba(255,255,255,0.04)' }} />
                </div>
                <div style={{ width: '75%', height: 16, borderRadius: 6, background: 'rgba(255,255,255,0.05)', marginBottom: 6 }} />
                <div style={{ width: '45%', height: 16, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
              </div>
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          /* ══════════════════════════════════════════
              EMPTY STATE
          ══════════════════════════════════════════ */
          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 14, padding: '56px 28px', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `${currentTab.accent}0D`,
              border: `1px solid ${currentTab.accent}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Inbox size={28} color={currentTab.accent} style={{ opacity: 0.5 }} />
            </div>
            <h2 style={{ color: T.text, fontSize: 16, fontWeight: 800, margin: '0 0 8px', fontFamily: FONT_AR }}>
              لا توجد تقارير في هذا القسم حالياً
            </h2>
            <p style={{ color: T.text3, fontSize: 12, margin: 0, lineHeight: 1.8, maxWidth: 340, marginInline: 'auto' }}>
              {searchQuery
                ? 'جرّب تعديل كلمات البحث'
                : 'التقارير تُولّد تلقائياً حسب جدولة محددة — ستظهر هنا عند توفرها'}
            </p>
          </div>
        ) : (
          /* ══════════════════════════════════════════
              REPORTS FEED
          ═══════════════════════════════════════════ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="custom-scrollbar">
            {filteredReports.map((article, idx) => (
              <ReportCard
                key={article.id}
                article={article}
                isExpanded={expandedId === article.id}
                onToggle={() => setExpandedId(expandedId === article.id ? null : article.id)}
                index={idx}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page wrapper with Suspense for useSearchParams ──
export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div style={{
        direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh',
        background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <RefreshCw size={24} color={T.cyan} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <ReportsPageContent />
    </Suspense>
  )
}

// ── Report Card Component ──
function ReportCard({
  article,
  isExpanded,
  onToggle,
  index,
}: {
  article: ContentArticle
  isExpanded: boolean
  onToggle: () => void
  index: number
}) {
  const typeBadge = TYPE_BADGES[article.type] || TYPE_BADGES.ARTICLE
  const catColor = CATEGORY_COLORS[article.category] || T.text2
  const catLabel = CATEGORY_LABELS[article.category] || article.category
  const sentiment = getSentimentDisplay(article.sentimentScore || 0)
  const impactDisplay: Record<string, { label: string; color: string }> = {
    HIGH: { label: 'عالي', color: T.red },
    MEDIUM: { label: 'متوسط', color: T.amber },
    LOW: { label: 'منخفض', color: T.text3 },
  }
  const impact = impactDisplay[article.impactLevel] || impactDisplay.LOW

  return (
    <article
      className="report-card"
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        animation: `fade-in 0.25s ease-out ${index * 30}ms both`,
        cursor: article.contentAr ? 'pointer' : 'default',
      }}
      onClick={article.contentAr ? onToggle : undefined}
    >
      <div style={{ padding: '14px 18px' }}>
        {/* ── Top Row: badges + time ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {/* Type badge */}
          <span style={{
            fontSize: 9, padding: '2px 10px', borderRadius: 6,
            background: `${typeBadge.color}12`, color: typeBadge.color, fontWeight: 800,
            border: `1px solid ${typeBadge.color}20`,
          }}>
            {typeBadge.label}
          </span>

          {/* Category badge */}
          <span style={{
            fontSize: 9, padding: '2px 10px', borderRadius: 6,
            background: `${catColor}08`, color: catColor, fontWeight: 700,
            border: `1px solid ${catColor}15`,
          }}>
            {catLabel}
          </span>

          {/* Related Symbols */}
          {Array.isArray(article.relatedSymbols) && article.relatedSymbols.slice(0, 3).map((sym) => (
            <span key={sym} style={{
              fontSize: 8, padding: '2px 8px', borderRadius: 5,
              background: 'rgba(0,212,255,0.04)', color: T.cyan,
              fontWeight: 800, fontFamily: FONT_MONO,
              border: '1px solid rgba(0,212,255,0.10)',
            }}>
              {sym}
            </span>
          ))}

          {/* Time ago */}
          <span style={{
            fontSize: 10, color: T.text3, marginInlineStart: 'auto',
            display: 'flex', alignItems: 'center', gap: 3, fontFamily: FONT_MONO,
          }}>
            <Clock size={9} />
            {timeAgo(article.publishedAt || article.createdAt)}
          </span>
        </div>

        {/* ── Title (Arabic) ── */}
        <h3 style={{
          color: T.text, fontSize: 15, fontWeight: 800,
          margin: '0 0 3px', lineHeight: 1.8,
        }}>
          {article.titleAr || 'بدون عنوان'}
        </h3>

        {/* ── English Title ── */}
        {article.titleEn && (
          <p style={{
            color: T.text3, fontSize: 10, margin: '0 0 8px',
            direction: 'ltr', textAlign: 'left', // English content — keep left alignment
            fontFamily: FONT_MONO, lineHeight: 1.4,
          }}>
            {article.titleEn}
          </p>
        )}

        {/* ── Summary ── */}
        {article.summaryAr && (
          <p style={{
            color: T.text2, fontSize: 12, lineHeight: 1.9,
            margin: '0 0 10px',
            display: '-webkit-box', WebkitLineClamp: isExpanded ? undefined : 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {article.summaryAr}
          </p>
        )}

        {/* ── Bottom Row ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: 'wrap', paddingTop: 8,
          borderTop: `1px solid ${T.border}`,
        }}>
          {/* Sentiment */}
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 6,
            background: `${sentiment.color}10`, color: sentiment.color, fontWeight: 700,
          }}>
            {sentiment.label}
          </span>

          {/* Impact */}
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 6,
            background: `${impact.color}10`, color: impact.color, fontWeight: 700,
          }}>
            تأثير {impact.label}
          </span>

          {/* Quality */}
          {(article.qualityScore > 0) && (
            <span style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 6,
              background: 'rgba(255,184,0,0.06)', color: T.amber, fontWeight: 700,
            }}>
              جودة {article.qualityScore}%
            </span>
          )}

          {/* Expand indicator */}
          {article.contentAr && (
            <span style={{
              fontSize: 10, color: T.cyan, fontWeight: 700,
              marginInlineStart: 'auto',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              {isExpanded ? 'إغلاق' : 'اقرأ المزيد'}
              {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </span>
          )}
        </div>
      </div>

      {/* ── Expanded Content ── */}
      {isExpanded && article.contentAr && (
        <div style={{
          padding: '14px 18px',
          borderTop: `1px solid ${T.border}`,
          background: 'rgba(0,212,255,0.015)',
        }}>
          <div
            style={{
              color: T.text2, fontSize: 13, lineHeight: 2.2,
              whiteSpace: 'pre-wrap', maxHeight: 400,
              overflowY: 'auto', padding: '0 2px',
            }}
            className="custom-scrollbar"
          >
            {article.contentAr}
          </div>

          {/* Risk Warning */}
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'rgba(255,184,0,0.04)',
            border: `0.5px solid rgba(255,184,0,0.12)`,
            borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertTriangle size={12} color={T.amber} />
            <span style={{ fontSize: 10, color: T.text3, lineHeight: 1.6 }}>
              هذا التقرير لأغراض إعلامية فقط ولا يُعدّ نصيحة استثمارية — تداول بمسؤولية
            </span>
          </div>
        </div>
      )}
    </article>
  )
}
