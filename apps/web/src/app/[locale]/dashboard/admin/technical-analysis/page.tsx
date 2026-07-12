'use client'

import { useState, useEffect } from 'react'
import { getDirection } from '@/lib/i18n-utils';
import { useLocale } from 'next-intl'
import {
  LineChart, Sparkles, TrendingUp, FileText, BarChart3,
  Settings2, Plus, Clock, Eye, ThumbsUp, Share2,
  AlertTriangle, CheckCircle2, XCircle, Zap, RefreshCw,
  ChevronDown, ChevronUp, Globe, Tag, Calendar,
  Activity, Hash, Send, Archive, ExternalLink, Layers,
  Search, Filter, Newspaper, BookOpen, MessageSquare,
  ArrowUpRight, ArrowDownRight, Target, Award, PieChart,
  CandlestickChart, Gauge, Crosshair, BarChart
} from 'lucide-react'
import {
  useContentAgentStore, ContentAgentStatus, ContentStatus,
  ContentType, ContentCategory, ContentLanguage, ContentPriority,
} from '@/hooks/useContentAgentStore'

/* ═══════════════════════════════════════════════
   Design Tokens
   ═══════════════════════════════════════════════ */
const FONT_AR = "'Cairo', sans-serif"
const FONT_EN = "'Inter', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ═══════════════════════════════════════════════
   Helper Functions
   ═══════════════════════════════════════════════ */
function getStatusColor(status: ContentAgentStatus | null): string {
  if (!status) return '#6B7280'
  switch (status) {
    case ContentAgentStatus.GENERATING: return '#047857'
    case ContentAgentStatus.PUBLISHING: return '#00FFA3'
    case ContentAgentStatus.CURATING: return '#B388FF'
    case ContentAgentStatus.PAUSED: return '#FFB800'
    case ContentAgentStatus.ERROR: return '#FF4757'
    case ContentAgentStatus.IDLE: return '#9CA3B5'
    default: return '#6B7280'
  }
}

function getStatusLabel(status: ContentAgentStatus | null): string {
  if (!status) return 'غير مُفعّل'
  switch (status) {
    case ContentAgentStatus.IDLE: return 'في الانتظار'
    case ContentAgentStatus.GENERATING: return 'يولّد التحليلات'
    case ContentAgentStatus.PUBLISHING: return 'ينشر التحليلات'
    case ContentAgentStatus.CURATING: return 'يُنقّح المصادر'
    case ContentAgentStatus.PAUSED: return 'متوقف مؤقتاً'
    case ContentAgentStatus.ERROR: return 'خطأ'
    default: return status
  }
}

function getTypeLabel(t: ContentType): string {
  const map: Record<ContentType, string> = {
    [ContentType.ARTICLE]: 'مقال تحليلي',
    [ContentType.ANALYSIS]: 'تحليل فني',
    [ContentType.NEWS_DIGEST]: 'ملخص سوقي',
    [ContentType.MARKET_REPORT]: 'تقرير سوق',
    [ContentType.EDUCATIONAL]: 'تعليمي',
    [ContentType.OPINION]: 'رأي تحليلي',
    [ContentType.BREAKING]: 'عاجل',
    [ContentType.HOURLY_UPDATE]: 'تحديث ساعي',
    [ContentType.WEEKLY_REVIEW]: 'مراجعة أسبوعية',
    [ContentType.PAIR_ANALYSIS]: 'تحليل زوج',
  }
  return map[t] || t
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
    [ContentCategory.COMMODITIES]: '#FFB800',
    [ContentCategory.ECONOMY]: '#B388FF',
    [ContentCategory.REGULATION]: '#FF4757',
    [ContentCategory.TECHNOLOGY]: '#00D4FF',
    [ContentCategory.EDUCATION]: '#10b981',
    [ContentCategory.GEOPOLITICS]: '#FF4757',
    [ContentCategory.DEFI]: '#B388FF',
    [ContentCategory.NFT]: '#F472B6',
  }
  return map[c] || '#6B7280'
}

function getStatusBadgeStyle(s: ContentStatus): { bg: string; color: string; label: string } {
  switch (s) {
    case ContentStatus.PUBLISHED:
      return { bg: 'rgba(0,255,163,0.10)', color: '#00FFA3', label: 'منشور' }
    case ContentStatus.DRAFT:
      return { bg: 'rgba(255,255,255,0.06)', color: '#9CA3B5', label: 'مسودة' }
    case ContentStatus.IN_REVIEW:
      return { bg: 'rgba(0,212,255,0.10)', color: '#047857', label: 'قيد المراجعة' }
    case ContentStatus.APPROVED:
      return { bg: 'rgba(0,212,255,0.10)', color: '#047857', label: 'معتمد' }
    case ContentStatus.SCHEDULED:
      return { bg: 'rgba(255,184,0,0.10)', color: '#FFB800', label: 'مجدول' }
    case ContentStatus.ARCHIVED:
      return { bg: 'rgba(255,255,255,0.04)', color: '#6B7280', label: 'مؤرشف' }
    case ContentStatus.REJECTED:
      return { bg: 'rgba(255,71,87,0.10)', color: '#FF4757', label: 'مرفوض' }
    default:
      return { bg: 'rgba(255,255,255,0.04)', color: '#6B7280', label: s }
  }
}

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `منذ ${hrs} ساعة`
  const days = Math.floor(hrs / 24)
  return `منذ ${days} يوم`
}

function getImpactLabel(impact: string): { label: string; color: string } {
  switch (impact) {
    case 'HIGH': return { label: 'تأثير عالي', color: '#FF4757' }
    case 'MEDIUM': return { label: 'تأثير متوسط', color: '#FFB800' }
    case 'LOW': return { label: 'تأثير منخفض', color: '#00FFA3' }
    default: return { label: impact, color: '#6B7280' }
  }
}

function getSentimentLabel(score: number): { label: string; color: string; icon: React.ReactNode } {
  if (score > 0.3) return { label: 'صعودي', color: '#00FFA3', icon: <ArrowUpRight size={12} /> }
  if (score < -0.3) return { label: 'هبوطي', color: '#FF4757', icon: <ArrowDownRight size={12} /> }
  return { label: 'محايد', color: '#FFB800', icon: <Crosshair size={12} /> }
}

/* ═══════════════════════════════════════════════
   Reusable Components
   ═══════════════════════════════════════════════ */
function GlassCard({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(16px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
      border: `1px solid ${'#2A313C'}`,
      borderRadius: 'var(--radius-xl)',
      boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)${glow ? `, 0 0 30px ${glow}` : ''}`,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: FONT_AR,
  fontSize: 13,
  fontWeight: 700,
  transition: 'all 0.15s',
  outline: 'none',
}

/* ═══════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════ */
export default function TechnicalAnalysisPage() {
  const locale = useLocale();
  const dir = getDirection(locale);
  const {
    agentState, stats, articles, trendingTopics, contentGaps, logs, loading, error,
    fetchState, fetchStats, fetchFeed, fetchTrending, fetchGaps,
    generateContent, generateBreaking, publishContent, archiveContent,
    startAutoRefresh, stopAutoRefresh,
  } = useContentAgentStore()

  const [activeTab, setActiveTab] = useState<'analyses' | 'generate' | 'settings'>('analyses')

  const status = agentState?.status ?? null
  const isGenerating = status === ContentAgentStatus.GENERATING

  // ── Initial load & auto-refresh ──
  useEffect(() => {
    fetchState()
    fetchStats()
    fetchFeed()
    fetchTrending()
    fetchGaps()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [fetchState, fetchStats, fetchFeed, fetchTrending, fetchGaps, startAutoRefresh, stopAutoRefresh])

  // ── Computed stats ──
  const totalGenerated = agentState?.totalGenerated ?? 0
  const totalPublished = agentState?.totalPublished ?? 0
  const dailyGenerated = agentState?.dailyGenerated ?? 0
  const dailyQuota = agentState?.dailyQuota ?? 20
  const publishRate = totalGenerated > 0 ? Math.round((totalPublished / totalGenerated) * 100) : 0
  const dailyPercent = Math.min((dailyGenerated / dailyQuota) * 100, 100)
  const qualityScore = stats?.avgQualityScore ?? 0

  const TABS = [
    { id: 'analyses' as const, label: 'التحليلات الفنية', icon: <LineChart size={14} /> },
    { id: 'generate' as const, label: 'توليد تحليل', icon: <Sparkles size={14} /> },
    { id: 'settings' as const, label: 'الإعدادات', icon: <Settings2 size={14} /> },
  ]

  return (
    <>
      <style>{TA_CSS}</style>
      <div dir={dir} style={{ minHeight: '100vh', background: '#0B0E14', color: '#F0F2F5', fontFamily: FONT_AR }}>
        {/* ── Header ── */}
        <div style={{
          padding: '28px 32px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-xl)',
              background: `linear-gradient(135deg, ${isGenerating ? '#00D4FF' : '#059669'}, ${isGenerating ? '#0A84FF' : '#047857'})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isGenerating ? `0 0 28px rgba(0,212,255,0.35)` : `0 0 28px rgba(5,150,105,0.25)`,
              transition: 'all 0.4s ease',
              position: 'relative',
            }}>
              <LineChart size={26} color="#fff" strokeWidth={2.5} />
              {isGenerating && (
                <div style={{
                  position: 'absolute', inset: -3, borderRadius: 'var(--radius-xl)',
                  border: '2px solid rgba(0,212,255,0.3)',
                  animation: 'ta-pulse 2s ease-in-out infinite',
                }} />
              )}
            </div>
            <div>
              <h1 style={{
                fontFamily: FONT_AR, fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1.2,
                background: 'linear-gradient(135deg, #F0F2F5, #8B92A8)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                تحليلات فنية
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: getStatusColor(status),
                  boxShadow: `0 0 10px ${getStatusColor(status)}`,
                  animation: isGenerating ? 'ta-pulse 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 700, color: getStatusColor(status) }}>
                  {getStatusLabel(status)}
                </span>
                {agentState && (
                  <span style={{
                    fontFamily: FONT_AR, fontSize: 11, color: '#6B7280',
                    marginRight: 8, padding: '2px 10px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {agentState.totalGenerated} تحليل مُوَلَّد
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setActiveTab('generate')}
              style={{
                ...btnStyle,
                background: 'linear-gradient(135deg, #059669, #047857)',
                color: '#fff', fontWeight: 800, padding: '11px 24px', fontSize: 13, borderRadius: 'var(--radius-lg)',
                boxShadow: '0 4px 16px rgba(5,150,105,0.3)',
              }}
            >
              <Sparkles size={15} /> توليد تحليل
            </button>
            <button
              onClick={() => setActiveTab('generate')}
              style={{
                ...btnStyle,
                background: 'rgba(255,71,87,0.10)', color: '#FF4757',
                border: '1px solid rgba(255,71,87,0.25)', padding: '11px 20px', fontSize: 13, borderRadius: 'var(--radius-lg)',
              }}
            >
              <Zap size={15} /> تنبيه عاجل
            </button>
            <button
              onClick={() => { fetchState(); fetchStats(); fetchFeed(); fetchTrending(); fetchGaps() }}
              style={{
                ...btnStyle, background: 'rgba(255,255,255,0.06)', color: '#9CA3B5',
                padding: '11px 14px', borderRadius: 'var(--radius-lg)', border: `1px solid ${'#2A313C'}`,
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* ── Stats Bar ── */}
        <div style={{ padding: '24px 32px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <MiniStatCard icon={<LineChart size={15} />} label="إجمالي التحليلات" value={String(totalGenerated)} color={'#047857'} sub={`${publishRate}% معدل النشر`} />
            <MiniStatCard icon={<Send size={15} />} label="المنشورة" value={String(totalPublished)} color={'#00FFA3'} sub="نشط" />
            <MiniStatCard icon={<Calendar size={15} />} label="الحصة اليومية" value={`${dailyGenerated}/${dailyQuota}`} color={'#FFB800'} sub={dailyPercent >= 100 ? 'اكتملت' : `${dailyQuota - dailyGenerated} متبقي`} />
            <MiniStatCard icon={<Award size={15} />} label="متوسط الجودة" value={qualityScore ? `${qualityScore.toFixed(0)}%` : '—'} color={qualityScore >= 70 ? '#00FFA3' : '#FFB800'} sub={qualityScore >= 80 ? 'ممتاز' : qualityScore >= 70 ? 'جيد' : 'يحتاج تحسين'} />
            <MiniStatCard icon={<Eye size={15} />} label="المشاهدات" value={stats?.totalViews ? Number(stats.totalViews).toLocaleString('en') : '0'} color={'#B388FF'} sub="جميع الأوقات" />
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div style={{
            margin: '20px 32px 0', padding: '14px 20px',
            background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.20)', borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT_AR, fontSize: 13, color: '#FF4757',
          }}>
            <AlertTriangle size={18} />
            <span style={{ fontWeight: 700 }}>{error}</span>
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div style={{ padding: '0 32px', marginTop: 24, display: 'flex', gap: 0, borderBottom: `1px solid ${'#2A313C'}`, marginBottom: 24 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px',
                fontFamily: FONT_AR, fontSize: 13, fontWeight: isActive ? 800 : 500,
                color: isActive ? '#059669' : '#9CA3B5', background: 'transparent', border: 'none',
                borderBottom: isActive ? '2px solid ' + '#059669' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {tab.icon} {tab.label}
                {tab.id === 'analyses' && articles.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--radius-lg)', background: '#059669' + '20', color: '#059669', fontFamily: FONT_MONO }}>{articles.length}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '0 32px 48px' }}>
          {activeTab === 'analyses' && <AnalysesTab />}
          {activeTab === 'generate' && <GenerateTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════
     Analyses Tab — Main Content
     ═══════════════════════════════════════════════ */
  function AnalysesTab() {
    const [filterCategory, setFilterCategory] = useState<ContentCategory | ''>('')
    const [filterStatus, setFilterStatus] = useState<ContentStatus | ''>('')
    const [showFilters, setShowFilters] = useState(false)

    const filteredArticles = articles.filter(a => {
      if (filterCategory && a.category !== filterCategory) return false
      if (filterStatus && a.status !== filterStatus) return false
      return true
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowFilters(!showFilters)} style={{
            ...btnStyle, background: showFilters ? '#059669' + '10' : 'rgba(255,255,255,0.06)',
            color: showFilters ? '#059669' : '#9CA3B5', fontSize: 11, borderRadius: 'var(--radius-md)',
            border: `1px solid ${showFilters ? '#059669' + '25' : '#2A313C'}`,
          }}>
            <Filter size={13} /> فلاتر
            {(filterCategory || filterStatus) && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-md)', background: '#059669' + '20', color: '#059669', fontFamily: FONT_MONO }}>
                {[filterCategory, filterStatus].filter(Boolean).length}
              </span>
            )}
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280' }}>{filteredArticles.length} تحليل</span>
          {(filterCategory || filterStatus) && (
            <button onClick={() => { setFilterCategory(''); setFilterStatus('') }}
              style={{ ...btnStyle, background: 'rgba(255,71,87,0.08)', color: '#FF4757', fontSize: 11, padding: '5px 12px', borderRadius: 'var(--radius-md)' }}>
              <XCircle size={11} /> مسح
            </button>
          )}
        </div>
        {showFilters && (
          <GlassCard>
            <div style={{ padding: '14px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <FilterSelect label="الفئة" value={filterCategory} onChange={setFilterCategory} options={Object.values(ContentCategory).map(c => ({ value: c, label: getCategoryLabel(c as ContentCategory) }))} />
              <FilterSelect label="الحالة" value={filterStatus} onChange={setFilterStatus} options={Object.values(ContentStatus).map(s => ({ value: s, label: getStatusBadgeStyle(s as ContentStatus).label }))} />
            </div>
          </GlassCard>
        )}

        {filteredArticles.length === 0 ? (
          <GlassCard>
            <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: FONT_AR, color: '#6B7280' }}>
              <LineChart size={44} style={{ marginBottom: 14, opacity: 0.25 }} />
              <div style={{ fontSize: 17, fontWeight: 800 }}>لا توجد تحليلات فنية</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>ابدأ بتوليد تحليل فني من تبويب التوليد</div>
            </div>
          </GlassCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
            {filteredArticles.map((article) => (
              <AnalysisCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════
     Generate Tab
     ═══════════════════════════════════════════════ */
  function GenerateTab() {
    const [genType, setGenType] = useState<ContentType>(ContentType.ANALYSIS)
    const [genCategory, setGenCategory] = useState<ContentCategory>(ContentCategory.CRYPTO)
    const [genTopic, setGenTopic] = useState('')
    const [genLanguage, setGenLanguage] = useState<ContentLanguage>(ContentLanguage.BILINGUAL)
    const [genPriority, setGenPriority] = useState<ContentPriority>(ContentPriority.HIGH)
    const [genSymbols, setGenSymbols] = useState('')
    const [formMode, setFormMode] = useState<'analysis' | 'breaking'>('analysis')
    const [breakingTopic, setBreakingTopic] = useState('')
    const [breakingSymbols, setBreakingSymbols] = useState('')
    const [breakingContext, setBreakingContext] = useState('')

    const inputStyle: React.CSSProperties = {
      width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-lg)',
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${'#2A313C'}`,
      color: '#F0F2F5', fontFamily: FONT_AR, fontSize: 13, outline: 'none', direction: 'inherit',
    }
    const selectStyle: React.CSSProperties = {
      width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-lg)',
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${'#2A313C'}`,
      color: '#F0F2F5', fontFamily: FONT_AR, fontSize: 13, outline: 'none', direction: 'inherit',
    }
    const labelStyle: React.CSSProperties = {
      fontFamily: FONT_AR, fontSize: 13, fontWeight: 700, color: '#9CA3B5', marginBottom: 8, display: 'block',
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setFormMode('analysis')} style={{
              ...btnStyle, flex: 1, justifyContent: 'center',
              background: formMode === 'analysis' ? '#059669' + '12' : 'rgba(255,255,255,0.04)',
              color: formMode === 'analysis' ? '#059669' : '#9CA3B5',
              border: `1px solid ${formMode === 'analysis' ? '#059669' + '30' : '#2A313C'}`,
              padding: '13px', borderRadius: 'var(--radius-lg)',
            }}>
              <LineChart size={15} /> تحليل فني
            </button>
            <button onClick={() => setFormMode('breaking')} style={{
              ...btnStyle, flex: 1, justifyContent: 'center',
              background: formMode === 'breaking' ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.04)',
              color: formMode === 'breaking' ? '#FF4757' : '#9CA3B5',
              border: `1px solid ${formMode === 'breaking' ? 'rgba(255,71,87,0.3)' : '#2A313C'}`,
              padding: '13px', borderRadius: 'var(--radius-lg)',
            }}>
              <Zap size={15} /> تنبيه عاجل
            </button>
          </div>

          {formMode === 'analysis' ? (
            <GlassCard>
              <div style={{ padding: 24 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 17, fontWeight: 800, marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <LineChart size={18} color={'#059669'} /> توليد تحليل فني جديد
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={labelStyle}>الموضوع *</label>
                    <input type="text" value={genTopic} onChange={(e) => setGenTopic(e.target.value)}
                      placeholder="مثال: تحليل فني للبيتكوين — مستويات الدعم والمقاومة" style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>نوع التحليل</label>
                      <select value={genType} onChange={(e) => setGenType(e.target.value as ContentType)} style={selectStyle}>
                        <option value={ContentType.ANALYSIS} style={{ background: '#0F1117' }}>تحليل فني</option>
                        <option value={ContentType.MARKET_REPORT} style={{ background: '#0F1117' }}>تقرير سوق</option>
                        <option value={ContentType.ARTICLE} style={{ background: '#0F1117' }}>مقال تحليلي</option>
                        <option value={ContentType.NEWS_DIGEST} style={{ background: '#0F1117' }}>ملخص سوقي</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>الفئة</label>
                      <select value={genCategory} onChange={(e) => setGenCategory(e.target.value as ContentCategory)} style={selectStyle}>
                        {Object.values(ContentCategory).map(c => <option key={c} value={c} style={{ background: '#0F1117' }}>{getCategoryLabel(c as ContentCategory)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>اللغة</label>
                      <select value={genLanguage} onChange={(e) => setGenLanguage(e.target.value as ContentLanguage)} style={selectStyle}>
                        <option value={ContentLanguage.AR} style={{ background: '#0F1117' }}>عربي</option>
                        <option value={ContentLanguage.EN} style={{ background: '#0F1117' }}>English</option>
                        <option value={ContentLanguage.BILINGUAL} style={{ background: '#0F1117' }}>ثنائي اللغة</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>الأولوية</label>
                      <select value={genPriority} onChange={(e) => setGenPriority(e.target.value as ContentPriority)} style={selectStyle}>
                        {Object.values(ContentPriority).map(p => (
                          <option key={p} value={p} style={{ background: '#0F1117' }}>
                            {p === ContentPriority.URGENT ? 'عاجل' : p === ContentPriority.HIGH ? 'عالي' : p === ContentPriority.NORMAL ? 'عادي' : 'منخفض'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>الرموز (اختياري)</label>
                    <input type="text" value={genSymbols} onChange={(e) => setGenSymbols(e.target.value)}
                      placeholder="BTC, ETH, SOL — مفصولة بفواصل"
                      style={{ ...inputStyle, fontFamily: FONT_MONO, fontSize: 13, direction: 'ltr' }} />
                  </div>
                  <button onClick={() => {
                    if (!genTopic.trim()) return
                    generateContent({ type: genType, category: genCategory, topic: genTopic, symbols: genSymbols ? genSymbols.split(',').map(s => s.trim()) : undefined, language: genLanguage, priority: genPriority })
                  }} disabled={loading || !genTopic.trim()} style={{
                    ...btnStyle, width: '100%', justifyContent: 'center',
                    background: loading || !genTopic.trim() ? '#059669' + '20' : 'linear-gradient(135deg, ' + '#059669' + ', #047857)',
                    color: loading || !genTopic.trim() ? '#6B7280' : '#fff', fontWeight: 800, padding: '14px', fontSize: 15, borderRadius: 'var(--radius-lg)',
                    cursor: loading || !genTopic.trim() ? 'not-allowed' : 'pointer',
                    boxShadow: loading || !genTopic.trim() ? 'none' : '0 4px 16px rgba(5,150,105,0.3)',
                  }}>
                    {loading ? <><RefreshCw size={16} style={{ animation: 'ta-spin 1s linear infinite' }} /> جارٍ التوليد...</> : <><Sparkles size={16} /> توليد التحليل الفني</>}
                  </button>
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard glow="rgba(255,71,87,0.10)">
              <div style={{ padding: 24 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 17, fontWeight: 800, marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Zap size={18} color={'#FF4757'} /> تنبيه عاجل
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={labelStyle}>الموضوع العاجل *</label>
                    <input type="text" value={breakingTopic} onChange={(e) => setBreakingTopic(e.target.value)}
                      placeholder="مثال: انهيار مفاجئ في سوق الكريبتو"
                      style={{ ...inputStyle, border: '1px solid rgba(255,71,87,0.25)' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>الرموز المتأثرة</label>
                    <input type="text" value={breakingSymbols} onChange={(e) => setBreakingSymbols(e.target.value)}
                      placeholder="BTC, ETH" style={{ ...inputStyle, fontFamily: FONT_MONO, fontSize: 13, direction: 'ltr' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>سياق إضافي</label>
                    <textarea value={breakingContext} onChange={(e) => setBreakingContext(e.target.value)}
                      placeholder="تفاصيل تساعد AI في توليد تحليل دقيق..." rows={4}
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <button onClick={() => {
                    if (!breakingTopic.trim()) return
                    generateBreaking(breakingTopic, breakingSymbols ? breakingSymbols.split(',').map(s => s.trim()) : [], breakingContext)
                  }} disabled={loading || !breakingTopic.trim()} style={{
                    ...btnStyle, width: '100%', justifyContent: 'center',
                    background: loading || !breakingTopic.trim() ? 'rgba(255,71,87,0.2)' : 'linear-gradient(135deg, #FF4757, #C0392B)',
                    color: loading || !breakingTopic.trim() ? '#6B7280' : '#fff', fontWeight: 800, padding: '14px', fontSize: 15, borderRadius: 'var(--radius-lg)',
                    cursor: loading || !breakingTopic.trim() ? 'not-allowed' : 'pointer',
                  }}>
                    {loading ? <><RefreshCw size={16} style={{ animation: 'ta-spin 1s linear infinite' }} /> جارٍ النشر...</> : <><Zap size={16} /> نشر التنبيه العاجل</>}
                  </button>
                </div>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Right: Quick Presets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 15, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Zap size={15} color={'#FFB800'} /> توليد سريع
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <QuickPreset label="تحليل BTC/USD" icon={<LineChart size={13} />} color={'#FFB800'}
                  onClick={() => generateContent({ type: ContentType.ANALYSIS, category: ContentCategory.CRYPTO, topic: 'تحليل فني للبيتكوين — مستويات الدعم والمقاومة', symbols: ['BTC'], language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })} />
                <QuickPreset label="تحليل EUR/USD" icon={<CandlestickChart size={13} />} color={'#00D4FF'}
                  onClick={() => generateContent({ type: ContentType.ANALYSIS, category: ContentCategory.FOREX, topic: 'تحليل فني لزوج اليورو دولار', symbols: ['EUR', 'USD'], language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })} />
                <QuickPreset label="تقرير سوق الأسهم" icon={<BarChart size={13} />} color={'#00FFA3'}
                  onClick={() => generateContent({ type: ContentType.MARKET_REPORT, category: ContentCategory.STOCKS, topic: 'تقرير سوق الأسهم الأمريكية', symbols: ['AAPL', 'MSFT', 'NVDA'], language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })} />
                <QuickPreset label="ملخص الكريبتو" icon={<TrendingUp size={13} />} color={'#FFB800'}
                  onClick={() => generateContent({ type: ContentType.NEWS_DIGEST, category: ContentCategory.CRYPTO, topic: 'ملخص سوق الكريبتو اليومي', language: ContentLanguage.BILINGUAL, priority: ContentPriority.NORMAL })} />
                <QuickPreset label="تحليل الذهب" icon={<Gauge size={13} />} color={'#d4af37'}
                  onClick={() => generateContent({ type: ContentType.ANALYSIS, category: ContentCategory.COMMODITIES, topic: 'تحليل فني للذهب — XAU/USD', symbols: ['XAU'], language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })} />
                <QuickPreset label="مستجدات DeFi" icon={<Layers size={13} />} color={'#B388FF'}
                  onClick={() => generateContent({ type: ContentType.ARTICLE, category: ContentCategory.DEFI, topic: 'أحدث المستجدات في عالم التمويل اللامركزي', language: ContentLanguage.BILINGUAL, priority: ContentPriority.NORMAL })} />
              </div>
            </div>
          </GlassCard>

          {contentGaps.filter(g => g.priority === 'HIGH').length > 0 && (
            <GlassCard>
              <div style={{ padding: 24 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 15, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Layers size={15} color={'#FF8040'} /> فجوات تحتاج تحليل
                </div>
                {contentGaps.filter(g => g.priority === 'HIGH').map((gap, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 6, borderRadius: 'var(--radius-md)', background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.1)' }}>
                    <span style={{ fontFamily: FONT_AR, fontSize: 13, color: '#F0F2F5', fontWeight: 600 }}>{gap.categoryAr || getCategoryLabel(gap.category)}</span>
                    <span style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280' }}>({gap.gapHours}س)</span>
                    <button onClick={() => generateContent({ type: ContentType.ANALYSIS, category: gap.category, topic: gap.suggestedTopics?.[0] || `تحليل فني: ${gap.categoryAr || gap.category}`, language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })}
                      disabled={loading} style={{ ...btnStyle, marginLeft: 'auto', background: 'rgba(255,71,87,0.10)', color: '#FF4757', fontSize: 11, padding: '5px 12px', borderRadius: 'var(--radius-md)' }}>
                      <Plus size={10} /> توليد
                    </button>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════
     Settings Tab
     ═══════════════════════════════════════════════ */
  function SettingsTab() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GlassCard>
          <div style={{ padding: 24 }}>
            <SectionHeader icon={<Calendar size={17} />} color={'#FFB800'} title="الحصة اليومية" subtitle="استهلاك الحصة اليومية" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 10, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 'var(--radius-sm)', background: dailyPercent >= 100 ? '#FF4757' : `linear-gradient(90deg, ${'#059669'}, ${'#10b981'})`, width: `${dailyPercent}%`, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 800, color: '#F0F2F5' }}>{dailyGenerated}/{dailyQuota}</span>
            </div>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, color: '#6B7280', lineHeight: 1.9 }}>يتم إعادة تعيين الحصة اليومية كل يوم في الساعة 00:00 UTC. الحصة الافتراضية هي 20 تحليل يومياً.</div>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={{ padding: 24 }}>
            <SectionHeader icon={<Sparkles size={17} />} color={'#059669'} title="إعدادات AI" subtitle="نموذج ومعلمات التوليد" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SettingRow label="نموذج AI" value="GLM-5" />
              <SettingRow label="درجة الإبداع" value="0.7" />
              <SettingRow label="الحد الأقصى للكلمات" value="2000" />
              <SettingRow label="تضمين تحليل الرسوم البيانية" value="مُفعّل" />
              <SettingRow label="تضمين أهداف الأسعار" value="مُفعّل" />
              <SettingRow label="تحذيرات المخاطر" value="مُفعّل" />
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={{ padding: 24 }}>
            <SectionHeader icon={<CheckCircle2 size={17} />} color={'#00FFA3'} title="عتبات الجودة" subtitle="معايير النشر التلقائي" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ThresholdRow label="الحد الأدنى للنشر التلقائي" value="70%" color={'#00FFA3'} />
              <ThresholdRow label="عتبة التنبيهات العاجلة" value="90%" color={'#FF4757'} />
              <ThresholdRow label="الحد الأدنى لدرجة المشاعر" value="+-0.3" color={'#FFB800'} />
            </div>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, color: '#6B7280', lineHeight: 1.9, marginTop: 18 }}>التحليلات التي لا تحقق الحد الأدنى تبقى كمسودة للمراجعة اليدوية.</div>
          </div>
        </GlassCard>
        <GlassCard>
          <div style={{ padding: 24 }}>
            <SectionHeader icon={<Clock size={17} />} color={'#047857'} title="الجدولة التلقائية" subtitle="مواعيد التوليد الدورية" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ScheduleRow label="تحليل السوق الصباحي" time="08:00 UTC" active />
              <ScheduleRow label="ملء الفجوات" time="كل 6 ساعات" active />
              <ScheduleRow label="تقرير نهاية الأسبوع" time="الجمعة 16:00 UTC" active={false} />
              <ScheduleRow label="تحليل ما بعد الجلسة" time="يومياً 20:00 UTC" active={false} />
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }
}

/* ═══════════════════════════════════════════════
   Analysis Card — Professional Design
   ═══════════════════════════════════════════════ */
function AnalysisCard({ article }: { article: any }) {
  const badge = getStatusBadgeStyle(article.status as ContentStatus)
  const catColor = getCategoryColor(article.category as ContentCategory)
  const [expanded, setExpanded] = useState(false)
  const { publishContent, archiveContent } = useContentAgentStore()
  const impact = getImpactLabel(article.impactLevel || 'MEDIUM')
  const sentiment = getSentimentLabel(article.sentimentScore || 0)

  return (
    <GlassCard>
      <div style={{ padding: '20px 24px' }}>
        {/* Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: `${catColor}12`, color: catColor, fontFamily: FONT_AR, fontWeight: 800 }}>
            {getCategoryLabel(article.category as ContentCategory)}
          </span>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.05)', color: '#9CA3B5', fontFamily: FONT_AR, fontWeight: 700 }}>
            {getTypeLabel(article.type as ContentType)}
          </span>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: badge.bg, color: badge.color, fontFamily: FONT_AR, fontWeight: 700 }}>
            {badge.label}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280' }}>{timeAgo(article.createdAt)}</span>
        </div>

        {/* Title */}
        <div style={{ fontFamily: FONT_AR, fontSize: 17, fontWeight: 800, color: '#F0F2F5', lineHeight: 1.7, marginBottom: 10 }}>
          {article.titleAr || article.titleEn}
        </div>

        {/* Summary */}
        {(article.summaryAr || article.summaryEn) && (
          <div style={{ fontFamily: FONT_AR, fontSize: 13, color: '#9CA3B5', lineHeight: 1.8, marginBottom: 12 }}>
            {expanded ? (article.summaryAr || article.summaryEn) : (article.summaryAr || article.summaryEn).substring(0, 150) + '...'}
          </div>
        )}

        {/* Sentiment + Impact + Quality Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, padding: '10px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: `1px solid ${'#2A313C'}` }}>
          {/* Sentiment */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: `${sentiment.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {sentiment.icon}
            </div>
            <div>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 800, color: sentiment.color }}>{sentiment.label}</div>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280' }}>المشاعر</div>
            </div>
          </div>
          {/* Impact */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: `${impact.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gauge size={12} color={impact.color} />
            </div>
            <div>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 800, color: impact.color }}>{impact.label}</div>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280' }}>التأثير</div>
            </div>
          </div>
          {/* Quality */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: `${article.qualityScore >= 70 ? '#00FFA3' : '#FFB800'}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={12} color={article.qualityScore >= 70 ? '#00FFA3' : '#FFB800'} />
            </div>
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 800, color: article.qualityScore >= 70 ? '#00FFA3' : '#FFB800' }}>{article.qualityScore}%</div>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280' }}>الجودة</div>
            </div>
          </div>
          {/* Reading Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={12} color={'#6B7280'} />
            </div>
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 800, color: '#6B7280' }}>{article.readingTimeMinutes || 0} د</div>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280' }}>القراءة</div>
            </div>
          </div>
        </div>

        {/* Symbols + Tags */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {article.relatedSymbols?.slice(0, 5).map((sym: string, i: number) => (
            <span key={i} style={{ fontFamily: FONT_MONO, fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: 'rgba(0,212,255,0.08)', color: '#047857', fontWeight: 700 }}>{sym}</span>
          ))}
          {article.tags?.slice(0, 4).map((tag: string, i: number) => (
            <span key={i} style={{ fontFamily: FONT_AR, fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.04)', color: '#6B7280' }}>#{tag}</span>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: `1px solid ${'#2A313C'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Eye size={12} color={'#6B7280'} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#6B7280' }}>{Number(article.views || 0).toLocaleString('en')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ThumbsUp size={12} color={'#6B7280'} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#6B7280' }}>{article.likes || 0}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Share2 size={12} color={'#6B7280'} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#6B7280' }}>{article.shares || 0}</span>
          </div>
          <div style={{ flex: 1 }} />
          {article.status === ContentStatus.DRAFT && (
            <button onClick={() => publishContent(article.id)} style={{ ...btnStyle, background: '#059669' + '12', color: '#059669', fontSize: 11, padding: '6px 14px', borderRadius: 'var(--radius-md)', border: `1px solid ${'#059669'}25` }}>
              <Send size={11} /> نشر
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.04)', color: '#9CA3B5', fontSize: 11, padding: '6px 14px', borderRadius: 'var(--radius-md)', border: `1px solid ${'#2A313C'}` }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'إغلاق' : 'قراءة'}
          </button>
          <button onClick={() => archiveContent(article.id)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.04)', color: '#6B7280', fontSize: 11, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: `1px solid ${'#2A313C'}` }}>
            <Archive size={12} />
          </button>
        </div>

        {/* Expanded Content */}
        {expanded && (article.contentAr || article.contentEn) && (
          <div style={{
            marginTop: 16, padding: '18px 20px', borderRadius: 'var(--radius-lg)',
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${'#2A313C'}`,
            fontFamily: FONT_AR, fontSize: 15, color: '#9CA3B5', lineHeight: 2.1,
            direction: 'inherit', maxHeight: 500, overflowY: 'auto',
          }} className="custom-scrollbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${'#2A313C'}` }}>
              <LineChart size={14} color={'#059669'} />
              <span style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, color: '#059669' }}>التحليل الفني الكامل</span>
            </div>
            {(article.contentAr || article.contentEn).substring(0, 3000)}{(article.contentAr || article.contentEn).length > 3000 ? '...' : ''}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

/* ═══════════════════════════════════════════════
   Shared Sub-Components
   ═══════════════════════════════════════════════ */

function MiniStatCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string; color: string; sub: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-xl)', padding: '16px 18px',
      border: `1px solid ${'#2A313C'}`, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle at top right, ${color}08, transparent)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <span style={{ fontFamily: FONT_AR, fontSize: 11, color: '#9CA3B5', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 22, color, fontWeight: 800, direction: 'ltr', textAlign: 'right', lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function SectionHeader({ icon, color, title, subtitle }: { icon: React.ReactNode; color: string; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', background: `${color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <div style={{ fontFamily: FONT_AR, fontSize: 15, fontWeight: 800, color: '#F0F2F5' }}>{title}</div>
        <div style={{ fontFamily: FONT_AR, fontSize: 11, color: '#6B7280', marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: any) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 5, display: 'block' }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value || '')}
        style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.04)', border: `1px solid ${'#2A313C'}`, color: '#F0F2F5', fontFamily: FONT_AR, fontSize: 11, outline: 'none', direction: 'inherit', minWidth: 120 }}>
        <option value="" style={{ background: '#0F1117' }}>الكل</option>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: '#0F1117' }}>{o.label}</option>)}
      </select>
    </div>
  )
}

function QuickPreset({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-lg)',
      background: `${color}06`, border: `1px solid ${color}18`, cursor: 'pointer', textAlign: 'right',
      transition: 'all 0.15s', direction: 'inherit',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}30` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}06`; e.currentTarget.style.borderColor = `${color}18` }}
    >
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <span style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: '#F0F2F5' }}>{label}</span>
    </button>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${'#2A313C'}` }}>
      <span style={{ fontFamily: FONT_AR, fontSize: 13, color: '#9CA3B5' }}>{label}</span>
      <span style={{ fontFamily: FONT_AR, fontSize: 13, color: '#F0F2F5', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function ThresholdRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${'#2A313C'}` }}>
      <span style={{ fontFamily: FONT_AR, fontSize: 13, color: '#9CA3B5' }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 800, color, padding: '3px 10px', borderRadius: 'var(--radius-sm)', background: `${color}10` }}>{value}</span>
    </div>
  )
}

function ScheduleRow({ label, time, active }: { label: string; time: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--radius-lg)', background: active ? 'rgba(5,150,105,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(5,150,105,0.15)' : '#2A313C'}` }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#059669' : '#6B7280', boxShadow: active ? `0 0 8px ${'#059669'}` : 'none' }} />
      <div style={{ flex: 1 }}><div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 700, color: '#F0F2F5' }}>{label}</div></div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#6B7280' }}>{time}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   CSS Keyframes
   ═══════════════════════════════════════════════ */
const TA_CSS = `
@keyframes ta-pulse {
  0%, 100% { opacity: 0.65; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.15); }
}
@keyframes ta-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`
