'use client'

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Clock,
  Newspaper,
  Calendar,
  TrendingUp,
  BarChart3,
  Globe2,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  BookOpen,
  Star,
  AlertTriangle,
  FileText,
  Zap,
  Inbox,
  SlidersHorizontal,
  ArrowUpDown,
  Circle,
} from 'lucide-react'
import { useContentAgentStore, ContentType, ContentCategory, ContentStatus } from '@/hooks/useContentAgentStore'
import type { ContentArticle } from '@/hooks/useContentAgentStore'
import type { LucideIcon } from 'lucide-react'

// ── Design Tokens ──
const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  card: 'rgba(26, 29, 41, 0.55)',
  accent: '#00D4FF',
  green: '#00FFA3',
  red: '#FF4757',
  amber: '#FFB800',
  purple: '#B388FF',
  orange: '#FF8C42',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#5A6178',
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.10)',
  glass: 'rgba(26, 29, 41, 0.55)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

// ── Type badge config ──
const TYPE_BADGES: Record<string, { bg: string; color: string; label: string; borderAccent: string }> = {
  HOURLY_UPDATE: { bg: 'rgba(255,184,0,0.10)', color: '#FFB800', label: 'ساعي', borderAccent: '#FFB800' },
  NEWS_DIGEST: { bg: 'rgba(0,212,255,0.10)', color: '#00D4FF', label: 'يومي', borderAccent: '#00D4FF' },
  MARKET_REPORT: { bg: 'rgba(0,255,163,0.10)', color: '#00FFA3', label: 'تقرير سوق', borderAccent: '#00FFA3' },
  WEEKLY_REVIEW: { bg: 'rgba(179,136,255,0.10)', color: '#B388FF', label: 'أسبوعي', borderAccent: '#B388FF' },
  PAIR_ANALYSIS: { bg: 'rgba(255,140,66,0.10)', color: '#FF8C42', label: 'تحليل زوج', borderAccent: '#FF8C42' },
  ANALYSIS: { bg: 'rgba(0,212,255,0.10)', color: '#00D4FF', label: 'تحليل', borderAccent: '#00D4FF' },
  ARTICLE: { bg: 'rgba(255,255,255,0.04)', color: '#8B92A8', label: 'مقال', borderAccent: '#8B92A8' },
  BREAKING: { bg: 'rgba(255,71,87,0.10)', color: '#FF4757', label: 'عاجل', borderAccent: '#FF4757' },
  EDUCATIONAL: { bg: 'rgba(16,185,129,0.10)', color: '#10B981', label: 'تعليمي', borderAccent: '#10B981' },
  OPINION: { bg: 'rgba(179,136,255,0.10)', color: '#B388FF', label: 'رأي', borderAccent: '#B388FF' },
}

// ── Category labels ──
const CATEGORY_LABELS: Record<string, string> = {
  CRYPTO: 'كريبتو',
  FOREX: 'فوركس',
  STOCKS: 'أسهم',
  COMMODITIES: 'سلع',
  ECONOMY: 'اقتصاد',
  REGULATION: 'تشريعات',
  TECHNOLOGY: 'تقنية',
  EDUCATION: 'تعليم',
  GEOPOLITICS: 'جيوسياسة',
  DEFI: 'ديفاي',
  NFT: 'NFT',
}

// ── Category colors ──
const CATEGORY_COLORS: Record<string, string> = {
  CRYPTO: '#00D4FF',
  FOREX: '#00FFA3',
  STOCKS: '#FF8C42',
  COMMODITIES: '#FFB800',
  ECONOMY: '#B388FF',
  REGULATION: '#FF4757',
  TECHNOLOGY: '#00D4FF',
  EDUCATION: '#10B981',
  GEOPOLITICS: '#FF4757',
  DEFI: '#B388FF',
  NFT: '#FF8C42',
}

// ── Tab definitions ──
type TabKey = 'hourly' | 'daily' | 'weekly' | 'pair' | 'financial' | 'economic'

interface TabDef {
  key: TabKey
  label: string
  icon: LucideIcon
  accent: string
  bg: string
}

const TABS: TabDef[] = [
  { key: 'hourly', label: 'ساعي', icon: Clock, accent: T.amber, bg: 'rgba(255,184,0,0.12)' },
  { key: 'daily', label: 'يومي', icon: Newspaper, accent: T.accent, bg: 'rgba(0,212,255,0.12)' },
  { key: 'weekly', label: 'أسبوعي', icon: Calendar, accent: T.purple, bg: 'rgba(179,136,255,0.12)' },
  { key: 'pair', label: 'حسب الزوج', icon: TrendingUp, accent: T.orange, bg: 'rgba(255,140,66,0.12)' },
  { key: 'financial', label: 'مالية', icon: BarChart3, accent: T.green, bg: 'rgba(0,255,163,0.12)' },
  { key: 'economic', label: 'اقتصادية', icon: Globe2, accent: T.red, bg: 'rgba(255,71,87,0.12)' },
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

// ── Sort options ──
type SortOption = 'newest' | 'oldest' | 'quality'

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'الأحدث',
  oldest: 'الأقدم',
  quality: 'أعلى جودة',
}

// ── Impact display ──
const IMPACT_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  HIGH: { label: 'عالي', color: T.red, bg: 'rgba(255,71,87,0.12)' },
  MEDIUM: { label: 'متوسط', color: T.amber, bg: 'rgba(255,184,0,0.12)' },
  LOW: { label: 'منخفض', color: T.text3, bg: 'rgba(90,97,120,0.12)' },
}

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
  const weeks = Math.floor(days / 7)
  return `منذ ${weeks} أ`
}

function formatTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ar-SA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSentimentDisplay(score: number): { label: string; color: string; bg: string } {
  if (score >= 0.3) return { label: 'إيجابي', color: T.green, bg: 'rgba(0,255,163,0.12)' }
  if (score <= -0.3) return { label: 'سلبي', color: T.red, bg: 'rgba(255,71,87,0.12)' }
  return { label: 'محايد', color: T.text2, bg: 'rgba(139,146,168,0.12)' }
}

// ── Left border color by type ──
function getTypeBorderColor(type: string): string {
  switch (type) {
    case 'HOURLY_UPDATE': return T.amber
    case 'NEWS_DIGEST':
    case 'MARKET_REPORT': return T.accent
    case 'WEEKLY_REVIEW': return T.purple
    case 'PAIR_ANALYSIS': return T.orange
    default: return T.text3
  }
}

// ── Skeleton Card ──
function SkeletonCard() {
  return (
    <div
      style={{
        background: T.glass,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        backdropFilter: 'blur(12px)',
        borderRight: `3px solid rgba(255,255,255,0.04)`,
      }}
    >
      <div style={{ padding: '16px 18px' }}>
        {/* Badges row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 48, height: 20, borderRadius: 99, background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ width: 56, height: 20, borderRadius: 99, background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ width: 32, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.03)', marginLeft: 'auto' }} />
        </div>
        {/* Title */}
        <div style={{ width: '80%', height: 18, borderRadius: 6, background: 'rgba(255,255,255,0.05)', marginBottom: 8 }} />
        <div style={{ width: '55%', height: 18, borderRadius: 6, background: 'rgba(255,255,255,0.04)', marginBottom: 12 }} />
        {/* Summary */}
        <div style={{ width: '100%', height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 14 }} />
        {/* Bottom row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 60, height: 20, borderRadius: 99, background: 'rgba(255,255,255,0.03)' }} />
          <div style={{ width: 60, height: 20, borderRadius: 99, background: 'rgba(255,255,255,0.03)' }} />
          <div style={{ width: 50, height: 20, borderRadius: 99, background: 'rgba(255,255,255,0.03)' }} />
        </div>
      </div>
    </div>
  )
}

// ── Main Page Component (wrapped in Suspense) ──
function ReportsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const {
    articles,
    stats,
    agentState,
    loading,
    fetchFeed,
    fetchStats,
    fetchState,
    setFeedFilters,
    startAutoRefresh,
    stopAutoRefresh,
  } = useContentAgentStore()

  // ── Derive active tab from URL search params ──
  const validTabs: TabKey[] = ['hourly', 'daily', 'weekly', 'pair', 'financial', 'economic']
  const urlTab = searchParams.get('tab')
  const derivedTab: TabKey = validTabs.includes(urlTab as TabKey) ? (urlTab as TabKey) : 'hourly'

  const [manualTab, setManualTab] = useState<TabKey | null>(null)
  const activeTab = manualTab ?? derivedTab
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // ── Fetch all reports on mount ──
  useEffect(() => {
    setFeedFilters({ type: undefined, category: undefined, symbol: undefined, status: ContentStatus.PUBLISHED, page: 1, limit: 50 })
    fetchFeed()
    fetchStats()
    fetchState()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [])

  // ── Manual refresh ──
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchFeed(), fetchStats(), fetchState()])
    setRefreshing(false)
  }, [fetchFeed, fetchStats, fetchState])

  // ── Tab click handler — updates URL ──
  const handleTabClick = useCallback((tab: TabKey) => {
    setManualTab(tab)
    setExpandedId(null)
    if (tab !== 'pair') setSelectedPair(null)
    router.push(`/dashboard/news?tab=${tab}`, { scroll: false })
  }, [router])

  // ── Client-side filtering based on active tab ──
  const filteredReports = useMemo(() => {
    let filtered: ContentArticle[] = articles

    switch (activeTab) {
      case 'hourly':
        filtered = filtered.filter((a) => a.type === ContentType.HOURLY_UPDATE)
        break
      case 'daily':
        filtered = filtered.filter((a) => a.type === ContentType.NEWS_DIGEST || a.type === ContentType.MARKET_REPORT)
        break
      case 'weekly':
        filtered = filtered.filter((a) => a.type === ContentType.WEEKLY_REVIEW)
        break
      case 'pair':
        if (selectedPair) {
          filtered = filtered.filter((a) => a.relatedSymbols?.some((s) => s.includes(selectedPair)))
        }
        break
      case 'financial':
        filtered = filtered.filter((a) => ['CRYPTO', 'FOREX', 'STOCKS', 'COMMODITIES', 'DEFI'].includes(a.category))
        break
      case 'economic':
        filtered = filtered.filter((a) => ['ECONOMY', 'REGULATION', 'GEOPOLITICS'].includes(a.category))
        break
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (a) =>
          a.titleAr?.toLowerCase().includes(q) ||
          a.titleEn?.toLowerCase().includes(q) ||
          a.summaryAr?.toLowerCase().includes(q)
      )
    }

    if (categoryFilter) {
      filtered = filtered.filter((a) => a.category === categoryFilter)
    }

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
  }, [articles, activeTab, selectedPair, searchQuery, categoryFilter, sortOption])

  // ── Stats calculations ──
  const computedStats = useMemo(() => {
    const total = articles.length
    const today = articles.filter((a) => {
      const d = new Date(a.createdAt)
      const now = new Date()
      return d.toDateString() === now.toDateString()
    }).length
    let lastUpdate = ''
    if (articles.length > 0) {
      const sorted = [...articles].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      lastUpdate = timeAgo(sorted[0].createdAt)
    }
    return { total, today, lastUpdate }
  }, [articles])

  // ── Available categories for filter dropdown ──
  const availableCategories = useMemo(() => {
    const cats = new Set<string>()
    filteredReports.forEach((a) => {
      if (a.category) cats.add(a.category)
    })
    return Array.from(cats)
  }, [filteredReports])

  // ── Current tab config ──
  const currentTab = TABS.find((t) => t.key === activeTab) || TABS[0]

  return (
    <div
      style={{
        direction: 'rtl',
        fontFamily: FONT_AR,
        minHeight: '100dvh',
        background: T.bg,
        color: T.text,
      }}
    >
      {/* ── Global CSS ── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes live-pulse { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.6); opacity: 1; } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes glow-border { 0%, 100% { box-shadow: 0 0 8px rgba(0,212,255,0.08); } 50% { box-shadow: 0 0 16px rgba(0,212,255,0.15); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }
        .report-card-enter { animation: fade-in 0.25s ease-out both; }
        .report-card-enter:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
      `}</style>

      {/* ── Page Container ── */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px' }}>

        {/* ══════════════════════════════════════════
            HEADER — Compact
        ══════════════════════════════════════════ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${currentTab.accent}22, ${currentTab.accent}08)`,
            border: `1px solid ${currentTab.accent}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <currentTab.icon size={18} color={currentTab.accent} />
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text, letterSpacing: '-0.2px' }}>
            التقارير
          </h1>

          {/* LIVE badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 10px', borderRadius: 20,
            background: 'rgba(255,71,87,0.06)',
            border: '0.5px solid rgba(255,71,87,0.15)',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: T.red, animation: 'live-pulse 2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 9, color: T.red, fontFamily: FONT_MONO, fontWeight: 700 }}>LIVE</span>
          </div>

          {/* Last update */}
          <span style={{
            fontSize: 10, color: T.text3, fontFamily: FONT_MONO,
            marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Clock size={10} />
            {computedStats.lastUpdate || '—'}
          </span>
        </div>

        {/* ══════════════════════════════════════════
            TAB PILLS — Horizontal
        ══════════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 14,
          overflowX: 'auto', paddingBottom: 2,
          scrollbarWidth: 'none',
        }} className="custom-scrollbar">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 99,
                  fontFamily: FONT_AR, fontSize: 12, fontWeight: isActive ? 800 : 500,
                  color: isActive ? tab.accent : T.text3,
                  background: isActive ? tab.bg : 'rgba(255,255,255,0.03)',
                  border: isActive ? `1px solid ${tab.accent}33` : '1px solid transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ══════════════════════════════════════════
            PAIR SELECTOR — Only on "حسب الزوج"
        ══════════════════════════════════════════ */}
        {activeTab === 'pair' && (
          <div style={{
            display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap',
            padding: '10px 14px', background: T.card,
            borderRadius: 12, border: `1px solid ${T.border}`,
            backdropFilter: 'blur(12px)', alignItems: 'center',
          }}>
            <span style={{
              fontSize: 11, color: T.text2, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4,
            }}>
              <TrendingUp size={13} color={T.orange} />
              اختر الزوج:
            </span>
            <button
              onClick={() => setSelectedPair(null)}
              style={{
                padding: '4px 14px', borderRadius: 8,
                border: `1px solid ${!selectedPair ? T.orange : T.border}`,
                background: !selectedPair ? 'rgba(255,140,66,0.12)' : 'transparent',
                color: !selectedPair ? T.orange : T.text3,
                cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO,
                transition: 'all 0.15s',
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
                    padding: '4px 14px', borderRadius: 8,
                    border: `1px solid ${isActive ? T.orange : T.border}`,
                    background: isActive ? 'rgba(255,140,66,0.12)' : 'transparent',
                    color: isActive ? T.orange : T.text3,
                    cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO,
                    transition: 'all 0.15s',
                  }}
                >
                  {pair.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════
            STATS BAR — Compact inline
        ══════════════════════════════════════════ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '6px 14px', marginBottom: 12,
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 10, border: `0.5px solid ${T.border}`,
          fontSize: 11, color: T.text3,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileText size={11} color={T.accent} />
            <span style={{ color: T.text, fontWeight: 700, fontFamily: FONT_MONO }}>{computedStats.total}</span>
            <span>تقرير</span>
          </span>
          <span style={{ width: 1, height: 12, background: T.border2 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: T.green, fontWeight: 700, fontFamily: FONT_MONO }}>{computedStats.today}</span>
            <span>اليوم</span>
          </span>
          <span style={{ width: 1, height: 12, background: T.border2 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} />
            <span>آخر تحديث: {computedStats.lastUpdate || '—'}</span>
          </span>
          {agentState && (
            <>
              <span style={{ width: 1, height: 12, background: T.border2 }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: FONT_MONO }}>
                <Circle size={6} fill={agentState.status === 'GENERATING' ? T.amber : T.green} color={agentState.status === 'GENERATING' ? T.amber : T.green} />
                {agentState.status === 'GENERATING' ? 'يولّد' : agentState.status === 'IDLE' ? 'جاهز' : agentState.status}
              </span>
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════
            FILTER BAR — Compact
        ══════════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          marginBottom: 14, flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: T.card, borderRadius: 10,
            padding: '7px 12px', flex: '1 1 200px',
            border: `1px solid ${T.border}`, backdropFilter: 'blur(8px)',
          }}>
            <Search size={13} color={T.text3} />
            <input
              type="text"
              placeholder="بحث في التقارير..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="بحث في التقارير"
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: T.text, fontSize: 12, width: '100%', fontFamily: FONT_AR,
              }}
            />
          </div>

          {/* Category Filter */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="تصفية حسب الفئة"
              style={{
                padding: '7px 12px', borderRadius: 10,
                border: `1px solid ${T.border}`, background: T.card,
                color: T.text, fontSize: 11, fontFamily: FONT_AR,
                cursor: 'pointer', outline: 'none',
                backdropFilter: 'blur(8px)',
              }}
            >
              <option value="">كل الفئات</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="ترتيب التقارير"
              style={{
                padding: '7px 12px', borderRadius: 10,
                border: `1px solid ${T.border}`, background: T.card,
                color: T.text, fontSize: 11, fontFamily: FONT_AR,
                cursor: 'pointer', outline: 'none',
                backdropFilter: 'blur(8px)',
              }}
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="تحديث التقارير"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 10,
              border: `1px solid ${T.border}`, background: T.card,
              color: T.text2, cursor: refreshing ? 'not-allowed' : 'pointer',
              fontSize: 11, fontFamily: FONT_AR, fontWeight: 600,
              backdropFilter: 'blur(8px)', transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* ── Reports count line ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10, padding: '0 2px',
        }}>
          <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>
            {filteredReports.length} تقرير
            {activeTab === 'pair' && selectedPair ? ` — ${selectedPair}` : ''}
          </span>
        </div>

        {/* ══════════════════════════════════════════
            LOADING STATE — Skeleton cards
        ══════════════════════════════════════════ */}
        {loading && articles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          /* ══════════════════════════════════════════
              EMPTY STATE
          ══════════════════════════════════════════ */
          <div style={{
            background: T.glass, border: `1px solid ${T.border}`,
            borderRadius: 16, padding: '48px 28px', textAlign: 'center',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `${currentTab.accent}0D`,
              border: `1px solid ${currentTab.accent}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Inbox size={28} color={currentTab.accent} style={{ opacity: 0.6 }} />
            </div>
            <h2 style={{
              color: T.text, fontSize: 16, fontWeight: 800,
              margin: '0 0 8px', fontFamily: FONT_AR,
            }}>
              لا توجد تقارير في هذا القسم حالياً
            </h2>
            <p style={{
              color: T.text3, fontSize: 12, margin: 0,
              lineHeight: 1.8, maxWidth: 360, marginInline: 'auto',
            }}>
              {searchQuery
                ? 'جرّب تعديل كلمات البحث أو تغيير الفلاتر'
                : 'سيتم توليد التقارير تلقائياً بواسطة وكيل المحتوى الذكي — راجع لاحقاً'}
            </p>
          </div>
        ) : (
          /* ══════════════════════════════════════════
              REPORTS FEED
          ══════════════════════════════════════════ */
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
        <RefreshCw size={24} color={T.accent} style={{ animation: 'spin 1s linear infinite' }} />
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
  const impact = IMPACT_DISPLAY[article.impactLevel] || IMPACT_DISPLAY.LOW
  const borderColor = getTypeBorderColor(article.type)

  return (
    <article
      className="report-card-enter"
      style={{
        background: T.glass,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        backdropFilter: 'blur(12px)',
        borderRight: `3px solid ${borderColor}`,
        animationDelay: `${index * 40}ms`,
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${borderColor}44`
        e.currentTarget.style.borderRightColor = borderColor
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.border
        e.currentTarget.style.borderRightColor = borderColor
      }}
    >
      <div style={{ padding: '14px 16px' }}>
        {/* ── Top Row: badges + time ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {/* Type badge */}
          <span style={{
            fontSize: 9, padding: '2px 9px', borderRadius: 99,
            background: typeBadge.bg, color: typeBadge.color, fontWeight: 800,
          }}>
            {typeBadge.label}
          </span>

          {/* Category badge */}
          <span style={{
            fontSize: 9, padding: '2px 9px', borderRadius: 99,
            background: `${catColor}12`, color: catColor, fontWeight: 700,
          }}>
            {catLabel}
          </span>

          {/* Related Symbols — compact */}
          {article.relatedSymbols?.slice(0, 3).map((sym) => (
            <span key={sym} style={{
              fontSize: 8, padding: '1px 6px', borderRadius: 5,
              background: 'rgba(0,212,255,0.06)', color: T.accent,
              fontWeight: 800, fontFamily: FONT_MONO,
            }}>
              {sym}
            </span>
          ))}

          {/* Time ago — pushed to end */}
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
          margin: '0 0 4px', lineHeight: 1.7,
        }}>
          {article.titleAr || 'بدون عنوان'}
        </h3>

        {/* ── English Title ── */}
        {article.titleEn && (
          <p style={{
            color: T.text3, fontSize: 11, margin: '0 0 10px',
            direction: 'ltr', textAlign: 'left',
            fontFamily: FONT_MONO, lineHeight: 1.4,
          }}>
            {article.titleEn}
          </p>
        )}

        {/* ── Summary (Arabic) in subtle highlighted box ── */}
        {article.summaryAr && (
          <div style={{
            color: T.text2, fontSize: 12, lineHeight: 1.8,
            margin: '0 0 12px', padding: '8px 12px',
            background: 'rgba(0,212,255,0.03)',
            borderRadius: 8,
            borderRight: `2px solid ${borderColor}55`,
          }}>
            {article.summaryAr}
          </div>
        )}

        {/* ── Bottom Row: sentiment + impact + quality + expand ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: 'wrap', paddingTop: 6,
          borderTop: `0.5px solid ${T.border}`,
        }}>
          {/* Sentiment */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 9, padding: '2px 8px', borderRadius: 99,
            background: sentiment.bg, color: sentiment.color, fontWeight: 700,
          }}>
            {article.sentimentScore !== undefined && article.sentimentScore !== null && (
              <span style={{ fontFamily: FONT_MONO, fontSize: 8 }}>
                {(article.sentimentScore * 100).toFixed(0)}%
              </span>
            )}
            {sentiment.label}
          </span>

          {/* Impact */}
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 99,
            background: impact.bg, color: impact.color, fontWeight: 700,
          }}>
            {impact.label}
          </span>

          {/* Quality Score */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 9, padding: '2px 8px', borderRadius: 99,
            background: 'rgba(255,184,0,0.06)', color: T.amber, fontWeight: 700,
          }}>
            <Star size={8} />
            {article.qualityScore || 0}%
          </span>

          {/* Views */}
          {article.views > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 9, color: T.text3,
            }}>
              <Eye size={9} />
              {article.views}
            </span>
          )}

          {/* Read Time */}
          {article.readingTimeMinutes > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 9, color: T.text3,
            }}>
              <BookOpen size={9} />
              {article.readingTimeMinutes} د
            </span>
          )}

          {/* Expand button */}
          {article.contentAr && (
            <button
              onClick={onToggle}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 8,
                background: 'rgba(0,212,255,0.06)',
                border: '1px solid rgba(0,212,255,0.15)',
                color: T.accent, cursor: 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: FONT_AR,
                marginInlineStart: 'auto',
                transition: 'all 0.15s',
              }}
            >
              {isExpanded ? 'إغلاق' : 'اقرأ المزيد'}
              {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded Content ── */}
      {isExpanded && article.contentAr && (
        <div style={{
          padding: '14px 16px',
          borderTop: `0.5px solid ${T.border}`,
          background: 'rgba(0,212,255,0.015)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
          }}>
            <FileText size={14} color={borderColor} />
            <span style={{ fontSize: 13, fontWeight: 800, color: borderColor }}>المحتوى الكامل</span>
            {article.generationSource && (
              <span style={{
                fontSize: 8, padding: '1px 7px', borderRadius: 5,
                background: 'rgba(255,255,255,0.03)', color: T.text3,
                fontFamily: FONT_MONO,
              }}>
                {article.generationSource}
              </span>
            )}
          </div>
          <div
            style={{
              color: T.text2, fontSize: 13, lineHeight: 2,
              whiteSpace: 'pre-wrap', maxHeight: 360,
              overflowY: 'auto', padding: '0 2px',
            }}
            className="custom-scrollbar"
          >
            {article.contentAr}
          </div>

          {/* Risk Warning */}
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'rgba(255,184,0,0.05)',
            border: `0.5px solid rgba(255,184,0,0.15)`,
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
