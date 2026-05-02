'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
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
} from 'lucide-react'
import { useContentAgentStore, ContentType, ContentCategory, ContentStatus } from '@/hooks/useContentAgentStore'
import type { ContentArticle } from '@/hooks/useContentAgentStore'

// ── Design Tokens ──
const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  card: 'rgba(26, 29, 41, 0.65)',
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
  border2: 'rgba(255,255,255,0.12)',
  glass: 'rgba(26, 29, 41, 0.65)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

// ── Type badge config ──
const TYPE_BADGES: Record<string, { bg: string; color: string; label: string }> = {
  HOURLY_UPDATE: { bg: 'rgba(255,184,0,0.12)', color: '#FFB800', label: 'ساعي' },
  NEWS_DIGEST: { bg: 'rgba(0,212,255,0.12)', color: '#00D4FF', label: 'يومي' },
  MARKET_REPORT: { bg: 'rgba(0,255,163,0.12)', color: '#00FFA3', label: 'تقرير سوق' },
  WEEKLY_REVIEW: { bg: 'rgba(179,136,255,0.12)', color: '#B388FF', label: 'أسبوعي' },
  PAIR_ANALYSIS: { bg: 'rgba(255,140,66,0.12)', color: '#FF8C42', label: 'تحليل زوج' },
  ANALYSIS: { bg: 'rgba(0,212,255,0.12)', color: '#00D4FF', label: 'تحليل' },
  ARTICLE: { bg: 'rgba(255,255,255,0.06)', color: '#8B92A8', label: 'مقال' },
  BREAKING: { bg: 'rgba(255,71,87,0.12)', color: '#FF4757', label: 'عاجل' },
  EDUCATIONAL: { bg: 'rgba(16,185,129,0.12)', color: '#10B981', label: 'تعليمي' },
  OPINION: { bg: 'rgba(179,136,255,0.12)', color: '#B388FF', label: 'رأي' },
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
  icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>
  accent: string
}

const TABS: TabDef[] = [
  { key: 'hourly', label: 'ساعي', icon: Clock, accent: T.amber },
  { key: 'daily', label: 'يومي', icon: Newspaper, accent: T.accent },
  { key: 'weekly', label: 'أسبوعي', icon: Calendar, accent: T.purple },
  { key: 'pair', label: 'حسب الزوج', icon: TrendingUp, accent: T.orange },
  { key: 'financial', label: 'مالية', icon: BarChart3, accent: T.green },
  { key: 'economic', label: 'اقتصادية', icon: Globe2, accent: T.red },
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
  HIGH: { label: 'تأثير عالي', color: T.red, bg: 'rgba(255,71,87,0.12)' },
  MEDIUM: { label: 'تأثير متوسط', color: T.amber, bg: 'rgba(255,184,0,0.12)' },
  LOW: { label: 'تأثير منخفض', color: T.text3, bg: 'rgba(90,97,120,0.12)' },
}

// ── Helpers ──
function timeAgo(value?: string | null): string {
  if (!value) return 'غير متاح'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'غير متاح'
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  const days = Math.floor(hours / 24)
  if (days < 7) return `منذ ${days} يوم`
  const weeks = Math.floor(days / 7)
  return `منذ ${weeks} أسبوع`
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

// ── Main Page Component ──
export default function ReportsPage() {
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

  const [activeTab, setActiveTab] = useState<TabKey>('hourly')
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

  // ── Client-side filtering based on active tab ──
  const filteredReports = useMemo(() => {
    let filtered: ContentArticle[] = articles

    // Tab-based filtering
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

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (a) =>
          a.titleAr?.toLowerCase().includes(q) ||
          a.titleEn?.toLowerCase().includes(q) ||
          a.summaryAr?.toLowerCase().includes(q)
      )
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter((a) => a.category === categoryFilter)
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
  }, [articles, activeTab, selectedPair, searchQuery, categoryFilter, sortOption])

  // ── Stats calculations ──
  const computedStats = useMemo(() => {
    const total = articles.length
    const today = articles.filter((a) => {
      const d = new Date(a.createdAt)
      const now = new Date()
      return d.toDateString() === now.toDateString()
    }).length
    const maxQuality = articles.reduce((max, a) => Math.max(max, a.qualityScore || 0), 0)

    // Last update time
    let lastUpdate = ''
    if (articles.length > 0) {
      const sorted = [...articles].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      lastUpdate = timeAgo(sorted[0].createdAt)
    }

    return { total, today, maxQuality, lastUpdate }
  }, [articles])

  // ── Available categories for filter dropdown ──
  const availableCategories = useMemo(() => {
    const cats = new Set<string>()
    filteredReports.forEach((a) => {
      if (a.category) cats.add(a.category)
    })
    return Array.from(cats)
  }, [filteredReports])

  // ── Tab click handler ──
  const handleTabClick = useCallback((tab: TabKey) => {
    setActiveTab(tab)
    setExpandedId(null)
    if (tab !== 'pair') {
      setSelectedPair(null)
    }
  }, [])

  return (
    <div
      style={{
        padding: '28px 20px',
        direction: 'rtl',
        fontFamily: FONT_AR,
        maxWidth: 1280,
        margin: '0 auto',
        minHeight: '100dvh',
        background: T.bg,
      }}
    >
      {/* ── Global CSS ── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes live-pulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.4); opacity: 1; } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        .report-card { animation: fade-in 0.3s ease-out; transition: transform 0.2s, box-shadow 0.2s; }
        .report-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .tab-btn { transition: all 0.25s ease; }
        .tab-btn:hover { background: rgba(255,255,255,0.04); }
        .pair-btn { transition: all 0.2s ease; }
        .pair-btn:hover { transform: translateY(-1px); }
        .expand-btn { transition: all 0.2s ease; }
        .expand-btn:hover { filter: brightness(1.2); }
        @media (max-width: 768px) {
          .reports-wrapper { padding: 16px 10px !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .tabs-scroll { overflow-x: auto; flex-wrap: nowrap !important; }
          .tab-btn { white-space: nowrap; flex-shrink: 0; }
        }
      `}</style>

      <div className="reports-wrapper" style={{ padding: '28px 20px' }}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #00D4FF, #00FFA3)',
              }}
            >
              <FileText size={22} color="#0B0E14" />
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: T.text, letterSpacing: '-0.3px' }}>التقارير</h1>
            <span
              style={{
                fontSize: 10,
                padding: '3px 10px',
                borderRadius: 20,
                background: 'rgba(0,212,255,0.1)',
                color: T.accent,
                fontFamily: FONT_MONO,
                fontWeight: 700,
              }}
            >
              REPORTS
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 12px',
                borderRadius: 20,
                background: 'rgba(255,71,87,0.08)',
                border: '0.5px solid rgba(255,71,87,0.2)',
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: T.red,
                  animation: 'live-pulse 2s ease-in-out infinite',
                }}
              />
              <span style={{ fontSize: 10, color: T.red, fontFamily: FONT_MONO, fontWeight: 700 }}>LIVE</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2, lineHeight: 1.7 }}>
            تقارير آلية شاملة لأسواق المال — تولد تلقائياً كل ساعة ويومياً وأسبوعياً
          </p>
        </div>

        {/* ── Tab Navigation ── */}
        <div
          className="tabs-scroll"
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: `1px solid ${T.border2}`,
            marginBottom: 20,
            overflowX: 'auto',
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                className="tab-btn"
                onClick={() => handleTabClick(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '14px 22px',
                  fontFamily: FONT_AR,
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 500,
                  color: isActive ? tab.accent : T.text3,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2.5px solid ${tab.accent}` : '2.5px solid transparent',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Pair Selector (only on "حسب الزوج" tab) ── */}
        {activeTab === 'pair' && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 20,
              flexWrap: 'wrap',
              padding: '14px 16px',
              background: T.card,
              borderRadius: 14,
              border: `1px solid ${T.border}`,
              backdropFilter: 'blur(12px)',
            }}
          >
            <span style={{ fontSize: 12, color: T.text2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <TrendingUp size={14} color={T.orange} />
              اختر الزوج:
            </span>
            <button
              className="pair-btn"
              onClick={() => setSelectedPair(null)}
              style={{
                padding: '6px 16px',
                borderRadius: 10,
                border: `1px solid ${!selectedPair ? T.orange : T.border}`,
                background: !selectedPair ? 'rgba(255,140,66,0.12)' : T.bg2,
                color: !selectedPair ? T.orange : T.text2,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: FONT_MONO,
              }}
            >
              الكل
            </button>
            {PAIR_OPTIONS.map((pair) => {
              const isActive = selectedPair === pair.value
              return (
                <button
                  key={pair.value}
                  className="pair-btn"
                  onClick={() => setSelectedPair(isActive ? null : pair.value)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 10,
                    border: `1px solid ${isActive ? T.orange : T.border}`,
                    background: isActive ? 'rgba(255,140,66,0.12)' : T.bg2,
                    color: isActive ? T.orange : T.text2,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: FONT_MONO,
                  }}
                >
                  {pair.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Stats Bar ── */}
        <div
          className="stats-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {[
            {
              icon: FileText,
              label: 'إجمالي التقارير',
              value: String(computedStats.total),
              color: T.accent,
              bg: 'rgba(0,212,255,0.08)',
            },
            {
              icon: Newspaper,
              label: 'تقارير اليوم',
              value: String(computedStats.today),
              color: T.green,
              bg: 'rgba(0,255,163,0.08)',
            },
            {
              icon: Star,
              label: 'أعلى جودة',
              value: computedStats.maxQuality > 0 ? `${computedStats.maxQuality}%` : '—',
              color: T.amber,
              bg: 'rgba(255,184,0,0.08)',
            },
            {
              icon: Clock,
              label: 'آخر تحديث',
              value: computedStats.lastUpdate || '—',
              color: T.purple,
              bg: 'rgba(179,136,255,0.08)',
            },
          ].map((stat, i) => {
            const Icon = stat.icon
            return (
              <div
                key={i}
                style={{
                  background: stat.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 14,
                  padding: '16px',
                  textAlign: 'center',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <Icon size={22} color={stat.color} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 18, fontWeight: 900, color: stat.color, fontFamily: FONT_MONO, marginBottom: 4 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>{stat.label}</div>
              </div>
            )
          })}
        </div>

        {/* ── Filter Bar ── */}
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Search */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: T.bg,
              borderRadius: 10,
              padding: '8px 14px',
              flex: '1 1 220px',
              border: `1px solid ${T.border}`,
            }}
          >
            <Search size={14} color={T.text3} />
            <input
              type="text"
              placeholder="بحث في التقارير..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="بحث في التقارير"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: T.text,
                fontSize: 12,
                width: '100%',
                fontFamily: FONT_AR,
              }}
            />
          </div>

          {/* Category Filter */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Filter size={14} color={T.text3} />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="تصفية حسب الفئة"
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.bg,
                color: T.text,
                fontSize: 12,
                fontFamily: FONT_AR,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">كل الفئات</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat] || cat}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Zap size={14} color={T.text3} />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="ترتيب التقارير"
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.bg,
                color: T.text,
                fontSize: 12,
                fontFamily: FONT_AR,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="تحديث التقارير"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 10,
              border: `1px solid ${T.border}`,
              background: T.bg,
              color: T.text2,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontFamily: FONT_AR,
              fontWeight: 700,
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            تحديث
          </button>
        </div>

        {/* ── Reports Count ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
            padding: '0 4px',
          }}
        >
          <span style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>
            {filteredReports.length} تقرير
            {activeTab === 'pair' && selectedPair ? ` — ${selectedPair}` : ''}
          </span>
          {agentState && (
            <span style={{ fontSize: 10, color: T.text3, fontFamily: FONT_MONO }}>
              الوكيل: {agentState.status === 'GENERATING' ? '🟡 يولّد' : agentState.status === 'IDLE' ? '🟢 جاهز' : agentState.status}
            </span>
          )}
        </div>

        {/* ── Loading State ── */}
        {loading && articles.length === 0 ? (
          <div
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 20,
              padding: '48px 32px',
              textAlign: 'center',
              backdropFilter: 'blur(12px)',
            }}
          >
            <RefreshCw size={32} color={T.accent} style={{ marginBottom: 16, animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 15, color: T.text2, margin: 0 }}>جارٍ تحميل التقارير...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          /* ── Empty State ── */
          <div
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 20,
              padding: '56px 32px',
              textAlign: 'center',
              backdropFilter: 'blur(12px)',
            }}
          >
            <FileText size={40} color={T.accent} style={{ marginBottom: 16, opacity: 0.5 }} />
            <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>لا توجد تقارير مطابقة</h2>
            <p style={{ color: T.text2, fontSize: 13, margin: 0, lineHeight: 1.7 }}>
              {searchQuery
                ? 'جرّب تعديل كلمات البحث أو تغيير الفلاتر'
                : 'لا توجد تقارير في هذا القسم حالياً — سيتم توليدها تلقائياً'}
            </p>
          </div>
        ) : (
          /* ── Reports Feed ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="custom-scrollbar">
            {filteredReports.map((article) => {
              const isExpanded = expandedId === article.id
              return <ReportCard key={article.id} article={article} isExpanded={isExpanded} onToggle={() => setExpandedId(isExpanded ? null : article.id)} />
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Report Card Component ──
function ReportCard({
  article,
  isExpanded,
  onToggle,
}: {
  article: ContentArticle
  isExpanded: boolean
  onToggle: () => void
}) {
  const typeBadge = TYPE_BADGES[article.type] || TYPE_BADGES.ARTICLE
  const catColor = CATEGORY_COLORS[article.category] || T.text2
  const catLabel = CATEGORY_LABELS[article.category] || article.category
  const sentiment = getSentimentDisplay(article.sentimentScore || 0)
  const impact = IMPACT_DISPLAY[article.impactLevel] || IMPACT_DISPLAY.LOW

  return (
    <article
      className="report-card"
      style={{
        background: T.glass,
        border: `1px solid ${T.border}`,
        borderRadius: 18,
        overflow: 'hidden',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div style={{ padding: '20px 22px' }}>
        {/* ── Top Row: badges + time ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {/* Type badge */}
          <span
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 99,
              background: typeBadge.bg,
              color: typeBadge.color,
              fontWeight: 800,
            }}
          >
            {typeBadge.label}
          </span>

          {/* Category badge */}
          <span
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 99,
              background: `${catColor}14`,
              color: catColor,
              fontWeight: 700,
            }}
          >
            {catLabel}
          </span>

          {/* Related Symbols */}
          {article.relatedSymbols?.slice(0, 4).map((sym) => (
            <span
              key={sym}
              style={{
                fontSize: 9,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'rgba(0,212,255,0.08)',
                color: T.accent,
                fontWeight: 800,
                fontFamily: FONT_MONO,
              }}
            >
              {sym}
            </span>
          ))}

          {/* Time ago */}
          <span
            style={{
              fontSize: 10,
              color: T.text3,
              marginInlineStart: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Clock size={10} />
            {timeAgo(article.publishedAt || article.createdAt)}
          </span>
        </div>

        {/* ── Title (Arabic) ── */}
        <h3
          style={{
            color: T.text,
            fontSize: 17,
            fontWeight: 800,
            margin: '0 0 6px',
            lineHeight: 1.7,
          }}
        >
          {article.titleAr || 'بدون عنوان'}
        </h3>

        {/* ── English Title ── */}
        {article.titleEn && (
          <p
            style={{
              color: T.text3,
              fontSize: 12,
              margin: '0 0 12px',
              direction: 'ltr',
              textAlign: 'left',
              fontFamily: FONT_MONO,
              lineHeight: 1.5,
            }}
          >
            {article.titleEn}
          </p>
        )}

        {/* ── Summary (Arabic) in highlighted box ── */}
        {article.summaryAr && (
          <div
            style={{
              color: T.text2,
              fontSize: 13,
              lineHeight: 1.8,
              margin: '0 0 14px',
              padding: '10px 14px',
              background: 'rgba(0,212,255,0.04)',
              borderRadius: 12,
              borderRight: `3px solid ${T.accent}44`,
            }}
          >
            {article.summaryAr}
          </div>
        )}

        {/* ── Bottom Row: Sentiment | Impact | Quality | Views | Read time ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            paddingTop: 4,
            borderTop: `1px solid ${T.border}`,
          }}
        >
          {/* Sentiment */}
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 99,
              background: sentiment.bg,
              color: sentiment.color,
              fontWeight: 700,
            }}
          >
            {article.sentimentScore !== undefined && article.sentimentScore !== null && (
              <span style={{ fontFamily: FONT_MONO, fontSize: 9 }}>
                {(article.sentimentScore * 100).toFixed(0)}%
              </span>
            )}
            {sentiment.label}
          </span>

          {/* Impact */}
          <span
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 99,
              background: impact.bg,
              color: impact.color,
              fontWeight: 700,
            }}
          >
            {impact.label}
          </span>

          {/* Quality Score */}
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 99,
              background: 'rgba(255,184,0,0.08)',
              color: T.amber,
              fontWeight: 700,
            }}
          >
            <Star size={10} />
            {article.qualityScore || 0}%
          </span>

          {/* Views */}
          {article.views > 0 && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: T.text3,
              }}
            >
              <Eye size={10} />
              {article.views}
            </span>
          )}

          {/* Read Time */}
          {article.readingTimeMinutes > 0 && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: T.text3,
              }}
            >
              <BookOpen size={10} />
              {article.readingTimeMinutes} د
            </span>
          )}

          {/* Expand button */}
          {article.contentAr && (
            <button
              className="expand-btn"
              onClick={onToggle}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 14px',
                borderRadius: 10,
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.2)',
                color: T.accent,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: FONT_AR,
                marginInlineStart: 'auto',
              }}
            >
              اقرأ المزيد
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded Content ── */}
      {isExpanded && article.contentAr && (
        <div
          style={{
            padding: '18px 22px',
            borderTop: `1px solid ${T.border}`,
            background: 'rgba(0,212,255,0.02)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <FileText size={16} color={T.accent} />
            <span style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>المحتوى الكامل</span>
            {article.generationSource && (
              <span
                style={{
                  fontSize: 9,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                  color: T.text3,
                  fontFamily: FONT_MONO,
                }}
              >
                {article.generationSource}
              </span>
            )}
          </div>
          <div
            style={{
              color: T.text2,
              fontSize: 14,
              lineHeight: 2,
              whiteSpace: 'pre-wrap',
              maxHeight: 400,
              overflowY: 'auto',
              padding: '0 4px',
            }}
            className="custom-scrollbar"
          >
            {article.contentAr}
          </div>
        </div>
      )}
    </article>
  )
}
