'use client'

import { useState, useEffect } from 'react'
import {
  PenLine, Sparkles, TrendingUp, FileText, BarChart3,
  Settings2, Plus, Clock, Eye, ThumbsUp, Share2,
  AlertTriangle, CheckCircle2, XCircle, Zap, RefreshCw,
  ChevronDown, ChevronUp, Globe, Tag, Calendar,
  Activity, Hash, Send, Archive, ExternalLink, Layers,
  Search, Filter, Newspaper, BookOpen, MessageSquare
} from 'lucide-react'
import {
  useContentAgentStore, ContentAgentStatus, ContentStatus,
  ContentType, ContentCategory, ContentLanguage, ContentPriority,
} from '@/hooks/useContentAgentStore'

/* ═══════════════════════════════════════════════
   Design Tokens — matching Roua Trading theme
   ═══════════════════════════════════════════════ */
const T = {
  bg:       '#0B0E14',
  bg2:      '#1A1D29',
  bg3:      '#141824',
  card:     '#1A1D29',
  accent:   '#00D4FF',
  green:    '#00FFA3',
  red:      '#FF4757',
  amber:    '#FFB800',
  purple:   '#B388FF',
  orange:   '#FF8C42',
  text:     '#F0F2F5',
  text2:    '#8B92A8',
  text3:    '#5A6178',
  border:   'rgba(255,255,255,0.06)',
  border2:  'rgba(255,255,255,0.12)',
  glass:    'rgba(26, 29, 41, 0.65)',
  glow:     'rgba(0,212,255,0.15)',
}

const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ═══════════════════════════════════════════════
   Helper Functions
   ═══════════════════════════════════════════════ */
function getStatusColor(status: ContentAgentStatus | null): string {
  if (!status) return T.text3
  switch (status) {
    case ContentAgentStatus.GENERATING: return T.accent
    case ContentAgentStatus.PUBLISHING: return T.green
    case ContentAgentStatus.CURATING: return T.purple
    case ContentAgentStatus.PAUSED: return T.amber
    case ContentAgentStatus.ERROR: return T.red
    case ContentAgentStatus.IDLE: return T.text2
    default: return T.text3
  }
}

function getStatusLabel(status: ContentAgentStatus | null): string {
  if (!status) return 'غير مُفعّل'
  switch (status) {
    case ContentAgentStatus.IDLE: return 'في الانتظار'
    case ContentAgentStatus.GENERATING: return 'يولّد المحتوى'
    case ContentAgentStatus.PUBLISHING: return 'ينشر المحتوى'
    case ContentAgentStatus.CURATING: return 'يُنقّح المصادر'
    case ContentAgentStatus.PAUSED: return 'متوقف مؤقتاً'
    case ContentAgentStatus.ERROR: return 'خطأ'
    default: return status
  }
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
    [ContentCategory.COMMODITIES]: '#FF8C42',
    [ContentCategory.ECONOMY]: '#B388FF',
    [ContentCategory.REGULATION]: '#FF4757',
    [ContentCategory.TECHNOLOGY]: '#00D4FF',
    [ContentCategory.EDUCATION]: '#10B981',
    [ContentCategory.GEOPOLITICS]: '#FF6B81',
    [ContentCategory.DEFI]: '#A78BFA',
    [ContentCategory.NFT]: '#F472B6',
  }
  return map[c] || T.text3
}

function getStatusBadgeStyle(s: ContentStatus): { bg: string; color: string; label: string } {
  switch (s) {
    case ContentStatus.PUBLISHED:
      return { bg: 'rgba(0,255,163,0.10)', color: T.green, label: 'منشور' }
    case ContentStatus.DRAFT:
      return { bg: 'rgba(255,255,255,0.06)', color: T.text2, label: 'مسودة' }
    case ContentStatus.IN_REVIEW:
      return { bg: 'rgba(0,212,255,0.10)', color: T.accent, label: 'قيد المراجعة' }
    case ContentStatus.APPROVED:
      return { bg: 'rgba(0,212,255,0.10)', color: T.accent, label: 'معتمد' }
    case ContentStatus.SCHEDULED:
      return { bg: 'rgba(255,184,0,0.10)', color: T.amber, label: 'مجدول' }
    case ContentStatus.ARCHIVED:
      return { bg: 'rgba(255,255,255,0.04)', color: T.text3, label: 'مؤرشف' }
    case ContentStatus.REJECTED:
      return { bg: 'rgba(255,71,87,0.10)', color: T.red, label: 'مرفوض' }
    default:
      return { bg: 'rgba(255,255,255,0.04)', color: T.text3, label: s }
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

/* ═══════════════════════════════════════════════
   Reusable Components
   ═══════════════════════════════════════════════ */
function GlassCard({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: string }) {
  return (
    <div style={{
      background: T.glass,
      backdropFilter: 'blur(16px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)${glow ? `, 0 0 30px ${glow}` : ''}`,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

function StatCard({ icon, label, value, subValue, color, mono }: {
  icon: React.ReactNode; label: string; value: string; subValue?: string; color?: string; mono?: boolean
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 10,
      padding: '14px 16px',
      border: `1px solid ${T.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: color || T.accent, display: 'flex' }}>{icon}</span>
        <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text2, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: mono ? FONT_MONO : FONT_AR, fontSize: 18, color: color || T.text, fontWeight: 800, direction: 'ltr', textAlign: 'right' }}>
        {value}
      </div>
      {subValue && (
        <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>{subValue}</div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: FONT_AR,
  fontSize: 12,
  fontWeight: 700,
  transition: 'all 0.15s',
  outline: 'none',
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3 }}>{label}</span>
      <span style={{ fontFamily: FONT_AR, fontSize: 12, color: valueColor || T.text, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════ */
export default function ContentAgentPage() {
  const {
    agentState, stats, articles, trendingTopics, contentGaps, logs, loading, error,
    fetchState, fetchStats, fetchFeed, fetchTrending, fetchGaps,
    generateContent, generateBreaking, publishContent, archiveContent,
    startAutoRefresh, stopAutoRefresh,
  } = useContentAgentStore()

  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'generate' | 'settings'>('overview')

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

  // ── Tab definitions ──
  const TABS = [
    { id: 'overview' as const, label: 'نظرة عامة', icon: <PenLine size={14} /> },
    { id: 'feed' as const, label: 'المحتوى', icon: <FileText size={14} /> },
    { id: 'generate' as const, label: 'التوليد', icon: <Sparkles size={14} /> },
    { id: 'settings' as const, label: 'الإعدادات', icon: <Settings2 size={14} /> },
  ]

  return (
    <>
      <style>{CONTENT_AGENT_CSS}</style>
      <div dir="rtl" style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: FONT_AR }}>
        {/* ── Header ── */}
        <div style={{
          padding: '24px 28px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Agent Avatar */}
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: `linear-gradient(135deg, ${isGenerating ? '#00D4FF' : T.purple}, ${isGenerating ? '#0A84FF' : '#6C3CE0'})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isGenerating ? `0 0 24px rgba(0,212,255,0.3)` : `0 0 24px rgba(179,136,255,0.2)`,
              transition: 'all 0.4s ease',
            }}>
              <PenLine size={26} color="#000" strokeWidth={2.5} />
            </div>
            <div>
              <h1 style={{ fontFamily: FONT_AR, fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>
                وكيل المحتوى
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: getStatusColor(status),
                  boxShadow: `0 0 8px ${getStatusColor(status)}`,
                  animation: isGenerating ? 'content-pulse 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: getStatusColor(status) }}>
                  {getStatusLabel(status)}
                </span>
                {agentState && (
                  <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginRight: 8 }}>
                    • {agentState.totalGenerated} محتوى مُوَلَّد
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setActiveTab('generate')}
              style={{
                ...btnStyle,
                background: 'linear-gradient(135deg, #B388FF, #6C3CE0)',
                color: '#fff',
                fontWeight: 800,
                padding: '10px 24px',
                fontSize: 13,
              }}
            >
              <Sparkles size={15} />
              توليد محتوى
            </button>
            <button
              onClick={() => setActiveTab('generate')}
              style={{
                ...btnStyle,
                background: 'rgba(255,71,87,0.10)',
                color: T.red,
                border: `1px solid rgba(255,71,87,0.3)`,
                padding: '10px 20px',
                fontSize: 13,
              }}
            >
              <Zap size={15} />
              تنبيه عاجل
            </button>
            <button
              onClick={() => {
                fetchState()
                fetchStats()
                fetchFeed()
                fetchTrending()
                fetchGaps()
              }}
              style={{
                ...btnStyle,
                background: 'rgba(255,255,255,0.06)',
                color: T.text2,
                padding: '10px 14px',
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* ── Stats Bar ── */}
        <div style={{
          padding: '20px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}>
          <StatCard
            icon={<FileText size={13} />}
            label="إجمالي المحتوى"
            value={String(agentState?.totalGenerated ?? 0)}
            color={T.accent}
          />
          <StatCard
            icon={<Send size={13} />}
            label="المنشورات"
            value={String(agentState?.totalPublished ?? 0)}
            color={T.green}
          />
          <StatCard
            icon={<Calendar size={13} />}
            label="الحصة اليومية"
            value={`${agentState?.dailyGenerated ?? 0}/${agentState?.dailyQuota ?? '—'}`}
            color={T.amber}
            mono
          />
          <StatCard
            icon={<Eye size={13} />}
            label="إجمالي المشاهدات"
            value={stats?.totalViews ? Number(stats.totalViews).toLocaleString('en') : '0'}
            color={T.purple}
            mono
          />
          <StatCard
            icon={<Activity size={13} />}
            label="متوسط الجودة"
            value={stats?.avgQualityScore ? `${stats.avgQualityScore.toFixed(0)}%` : '—'}
            color={stats?.avgQualityScore && stats.avgQualityScore >= 70 ? T.green : T.amber}
          />
          <StatCard
            icon={<Clock size={13} />}
            label="مجدول للنشر"
            value={String(agentState?.pendingSchedule ?? 0)}
            color={T.text2}
          />
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div style={{
            margin: '0 28px 16px', padding: '12px 18px',
            background: 'rgba(255,71,87,0.10)',
            border: `1px solid rgba(255,71,87,0.25)`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: FONT_AR, fontSize: 12, color: T.red,
          }}>
            <XCircle size={16} />
            {error}
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div style={{
          padding: '0 28px',
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: 20,
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '12px 20px',
                  fontFamily: FONT_AR, fontSize: 12, fontWeight: isActive ? 800 : 500,
                  color: isActive ? T.accent : T.text2,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'feed' && articles.length > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    padding: '1px 6px', borderRadius: 8,
                    background: `${T.accent}20`, color: T.accent,
                    fontFamily: FONT_MONO,
                  }}>{articles.length}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '0 28px 40px' }}>
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'feed' && <FeedTab />}
          {activeTab === 'generate' && <GenerateTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════
     Overview Tab
     ═══════════════════════════════════════════════ */
  function OverviewTab() {
    const [expandedLog, setExpandedLog] = useState(false)
    const displayLogs = expandedLog ? logs : logs.slice(0, 8)

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Agent Status */}
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <PenLine size={15} color={T.accent} />
                حالة الوكيل
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <InfoRow label="الحالة" value={getStatusLabel(status)} valueColor={getStatusColor(status)} />
                <InfoRow label="المحتوى المولّد" value={String(agentState?.totalGenerated ?? 0)} />
                <InfoRow label="المنشورات" value={String(agentState?.totalPublished ?? 0)} />
                <InfoRow label="الجدولات المعلقة" value={String(agentState?.pendingSchedule ?? 0)} />
                <InfoRow label="آخر توليد" value={timeAgo(agentState?.lastGenerationAt)} />
                <InfoRow label="آخر نشر" value={timeAgo(agentState?.lastPublishAt)} />
                <InfoRow label="أخطاء" value={String(agentState?.errors ?? 0)} valueColor={(agentState?.errors ?? 0) > 0 ? T.red : T.text} />
                <InfoRow label="القوالب النشطة" value={String(agentState?.activeTemplates ?? 0)} />
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <CapabilityBadge icon={<Sparkles size={10} />} label="توليد AI ثنائي اللغة" color={T.purple} />
                <CapabilityBadge icon={<Globe size={10} />} label="SEO ذكي" color={T.accent} />
                <CapabilityBadge icon={<Zap size={10} />} label="تنبيهات عاجلة" color={T.red} />
                <CapabilityBadge icon={<Calendar size={10} />} label="جدولة تلقائية" color={T.amber} />
              </div>
            </div>
          </GlassCard>

          {/* Trending Topics */}
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={15} color={T.amber} />
                المواضيع الرائجة
              </div>
              {trendingTopics.length === 0 ? (
                <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text3, textAlign: 'center', padding: '16px 0' }}>
                  لا توجد مواضيع رائجة حالياً
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trendingTopics.slice(0, 6).map((topic, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${T.border}`,
                    }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800, color: i < 3 ? T.amber : T.text3, width: 18 }}>
                        #{i + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text }}>
                          {topic.topicAr || topic.topic}
                        </div>
                        {topic.relatedSymbols?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                            {topic.relatedSymbols.slice(0, 3).map((sym, j) => (
                              <span key={j} style={{
                                fontFamily: FONT_MONO, fontSize: 8, padding: '1px 5px',
                                borderRadius: 3, background: `${T.accent}15`, color: T.accent,
                              }}>{sym}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 8, padding: '2px 6px', borderRadius: 4,
                        background: `${getCategoryColor(topic.category)}15`,
                        color: getCategoryColor(topic.category),
                        fontFamily: FONT_AR, fontWeight: 700,
                      }}>
                        {getCategoryLabel(topic.category)}
                      </span>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800, color: topic.sentiment > 0 ? T.green : topic.sentiment < 0 ? T.red : T.text3 }}>
                          {topic.sentiment > 0 ? '+' : ''}{(topic.sentiment * 100).toFixed(0)}%
                        </div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 7, color: T.text3 }}>مشاعر</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Content Gaps */}
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={15} color={T.orange} />
                فجوات المحتوى
              </div>
              {contentGaps.length === 0 ? (
                <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text3, textAlign: 'center', padding: '16px 0' }}>
                  لا توجد فجوات محتوى حالياً — التغطية ممتازة
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {contentGaps.slice(0, 5).map((gap, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${gap.priority === 'HIGH' ? 'rgba(255,71,87,0.15)' : T.border}`,
                    }}>
                      <span style={{
                        fontSize: 8, padding: '2px 8px', borderRadius: 4,
                        background: gap.priority === 'HIGH' ? 'rgba(255,71,87,0.12)' : gap.priority === 'MEDIUM' ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.06)',
                        color: gap.priority === 'HIGH' ? T.red : gap.priority === 'MEDIUM' ? T.amber : T.text3,
                        fontFamily: FONT_AR, fontWeight: 800,
                      }}>
                        {gap.priority === 'HIGH' ? 'عاجل' : gap.priority === 'MEDIUM' ? 'متوسط' : 'منخفض'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text }}>
                          {gap.categoryAr || getCategoryLabel(gap.category)}
                        </div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 2 }}>
                          آخر محتوى: {gap.lastArticleAt ? timeAgo(gap.lastArticleAt) : 'لا يوجد'} — {gap.gapHours}س بدون محتوى
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('generate')}
                        style={{ ...btnStyle, background: 'rgba(179,136,255,0.10)', color: T.purple, fontSize: 10, padding: '5px 12px' }}
                      >
                        <Plus size={11} />
                        توليد
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Content Stats */}
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={15} color={T.green} />
                إحصائيات المحتوى
              </div>
              {stats ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MiniStat label="إجمالي المقالات" value={String(stats.totalArticles)} color={T.accent} />
                  <MiniStat label="منشورة" value={String(stats.publishedArticles)} color={T.green} />
                  <MiniStat label="مسودات" value={String(stats.draftArticles)} color={T.text2} />
                  <MiniStat label="مجدولة" value={String(stats.scheduledArticles)} color={T.amber} />
                  <MiniStat label="إعادات المشاركة" value={String(stats.totalShares)} color={T.purple} />
                  <MiniStat label="الفئة الأقوى" value={getCategoryLabel(stats.topPerformingCategory as ContentCategory)} color={T.orange} />
                </div>
              ) : (
                <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text3, textAlign: 'center', padding: '20px 0' }}>
                  لا توجد إحصائيات بعد
                </div>
              )}
            </div>
          </GlassCard>

          {/* Recent Articles */}
          <GlassCard style={{ flex: 1 }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Newspaper size={15} color={T.accent} />
                  آخر المحتوى
                </div>
                <button onClick={() => setActiveTab('feed')} style={{ ...btnStyle, background: 'rgba(0,212,255,0.08)', color: T.accent, fontSize: 10, padding: '5px 12px' }}>
                  عرض الكل
                </button>
              </div>
              {articles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', fontFamily: FONT_AR, fontSize: 12, color: T.text3 }}>
                  لا يوجد محتوى بعد — ابدأ بتوليد أول مقال
                </div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }} className="custom-scrollbar">
                  {articles.slice(0, 5).map((article) => (
                    <ArticleRow key={article.id} article={article} compact />
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Event Log */}
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={15} color={T.accent} />
                  سجل الأحداث
                </div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3 }}>{logs.length} حدث</span>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', direction: 'ltr' }} className="custom-scrollbar">
                {displayLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: FONT_AR, fontSize: 12, color: T.text3, direction: 'rtl' }}>
                    لا توجد أحداث بعد
                  </div>
                ) : (
                  displayLogs.map((log, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 8, padding: '6px 10px',
                      borderBottom: i < displayLogs.length - 1 ? `1px solid ${T.border}` : 'none',
                      fontFamily: FONT_AR, fontSize: 11,
                      animation: i === 0 ? 'fadeInSlideUp 0.3s ease-out' : 'none',
                    }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.text3, whiteSpace: 'nowrap', paddingTop: 1 }}>
                        {log.time}
                      </span>
                      <span style={{
                        color: log.type === 'success' ? T.green
                          : log.type === 'error' ? T.red
                          : log.type === 'warning' ? T.amber
                          : log.type === 'content' ? T.purple
                          : T.text2,
                        direction: 'rtl',
                      }}>
                        {log.msg}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {logs.length > 8 && (
                <button
                  onClick={() => setExpandedLog(!expandedLog)}
                  style={{ ...btnStyle, width: '100%', marginTop: 10, background: 'rgba(255,255,255,0.04)', color: T.text3, fontSize: 11, padding: '8px 0', justifyContent: 'center' }}
                >
                  {expandedLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expandedLog ? 'عرض أقل' : `عرض الكل (${logs.length})`}
                </button>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════
     Feed Tab
     ═══════════════════════════════════════════════ */
  function FeedTab() {
    const [filterCategory, setFilterCategory] = useState<ContentCategory | ''>('')
    const [filterType, setFilterType] = useState<ContentType | ''>('')
    const [filterStatus, setFilterStatus] = useState<ContentStatus | ''>('')
    const [showFilters, setShowFilters] = useState(false)

    const filteredArticles = articles.filter(a => {
      if (filterCategory && a.category !== filterCategory) return false
      if (filterType && a.type !== filterType) return false
      if (filterStatus && a.status !== filterStatus) return false
      return true
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <GlassCard>
          <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                ...btnStyle,
                background: showFilters ? 'rgba(0,212,255,0.10)' : 'rgba(255,255,255,0.06)',
                color: showFilters ? T.accent : T.text2,
                fontSize: 11,
              }}
            >
              <Filter size={13} />
              فلاتر
              {(filterCategory || filterType || filterStatus) && (
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 6,
                  background: `${T.accent}20`, color: T.accent, fontFamily: FONT_MONO,
                }}>
                  {[filterCategory, filterType, filterStatus].filter(Boolean).length}
                </span>
              )}
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3 }}>{filteredArticles.length} محتوى</span>
            {(filterCategory || filterType || filterStatus) && (
              <button
                onClick={() => { setFilterCategory(''); setFilterType(''); setFilterStatus('') }}
                style={{ ...btnStyle, background: 'rgba(255,71,87,0.08)', color: T.red, fontSize: 10, padding: '5px 12px' }}
              >
                <XCircle size={11} />
                مسح الفلاتر
              </button>
            )}
          </div>
          {showFilters && (
            <div style={{ padding: '0 20px 14px', display: 'flex', gap: 12, flexWrap: 'wrap', borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <FilterSelect label="الفئة" value={filterCategory} onChange={setFilterCategory} options={Object.values(ContentCategory).map(c => ({ value: c, label: getCategoryLabel(c as ContentCategory) }))} />
              <FilterSelect label="النوع" value={filterType} onChange={setFilterType} options={Object.values(ContentType).map(t => ({ value: t, label: getTypeLabel(t as ContentType) }))} />
              <FilterSelect label="الحالة" value={filterStatus} onChange={setFilterStatus} options={Object.values(ContentStatus).map(s => ({ value: s, label: getStatusBadgeStyle(s as ContentStatus).label }))} />
            </div>
          )}
        </GlassCard>

        {filteredArticles.length === 0 ? (
          <GlassCard>
            <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: FONT_AR, color: T.text3 }}>
              <FileText size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 700 }}>لا يوجد محتوى</div>
              <div style={{ fontSize: 11, marginTop: 6 }}>ابدأ بتوليد محتوى من تبويب التوليد</div>
            </div>
          </GlassCard>
        ) : (
          filteredArticles.map((article) => (
            <ArticleRow key={article.id} article={article} />
          ))
        )}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════
     Generate Tab
     ═══════════════════════════════════════════════ */
  function GenerateTab() {
    const [genType, setGenType] = useState<ContentType>(ContentType.ARTICLE)
    const [genCategory, setGenCategory] = useState<ContentCategory>(ContentCategory.CRYPTO)
    const [genTopic, setGenTopic] = useState('')
    const [genLanguage, setGenLanguage] = useState<ContentLanguage>(ContentLanguage.BILINGUAL)
    const [genPriority, setGenPriority] = useState<ContentPriority>(ContentPriority.NORMAL)
    const [genSymbols, setGenSymbols] = useState('')
    const [formMode, setFormMode] = useState<'content' | 'breaking'>('content')
    const [breakingTopic, setBreakingTopic] = useState('')
    const [breakingSymbols, setBreakingSymbols] = useState('')
    const [breakingContext, setBreakingContext] = useState('')

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setFormMode('content')} style={{
              ...btnStyle, flex: 1, justifyContent: 'center',
              background: formMode === 'content' ? 'rgba(179,136,255,0.12)' : 'rgba(255,255,255,0.04)',
              color: formMode === 'content' ? T.purple : T.text2,
              border: `1px solid ${formMode === 'content' ? 'rgba(179,136,255,0.3)' : T.border}`,
              padding: '12px',
            }}>
              <Sparkles size={15} /> توليد محتوى
            </button>
            <button onClick={() => setFormMode('breaking')} style={{
              ...btnStyle, flex: 1, justifyContent: 'center',
              background: formMode === 'breaking' ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.04)',
              color: formMode === 'breaking' ? T.red : T.text2,
              border: `1px solid ${formMode === 'breaking' ? 'rgba(255,71,87,0.3)' : T.border}`,
              padding: '12px',
            }}>
              <Zap size={15} /> تنبيه عاجل
            </button>
          </div>

          {formMode === 'content' ? (
            <GlassCard>
              <div style={{ padding: 24 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 15, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color={T.purple} />
                  توليد محتوى جديد
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>الموضوع *</label>
                    <input type="text" value={genTopic} onChange={(e) => setGenTopic(e.target.value)}
                      placeholder="مثال: تحليل سوق البيتكوين بعد قرار الفيدرالي"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_AR, fontSize: 13, outline: 'none', direction: 'rtl' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>النوع</label>
                      <select value={genType} onChange={(e) => setGenType(e.target.value as ContentType)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_AR, fontSize: 12, outline: 'none', direction: 'rtl' }}>
                        {Object.values(ContentType).map(t => <option key={t} value={t} style={{ background: T.bg2 }}>{getTypeLabel(t)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>الفئة</label>
                      <select value={genCategory} onChange={(e) => setGenCategory(e.target.value as ContentCategory)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_AR, fontSize: 12, outline: 'none', direction: 'rtl' }}>
                        {Object.values(ContentCategory).map(c => <option key={c} value={c} style={{ background: T.bg2 }}>{getCategoryLabel(c as ContentCategory)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>اللغة</label>
                      <select value={genLanguage} onChange={(e) => setGenLanguage(e.target.value as ContentLanguage)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_AR, fontSize: 12, outline: 'none', direction: 'rtl' }}>
                        <option value={ContentLanguage.AR} style={{ background: T.bg2 }}>عربي</option>
                        <option value={ContentLanguage.EN} style={{ background: T.bg2 }}>English</option>
                        <option value={ContentLanguage.BILINGUAL} style={{ background: T.bg2 }}>ثنائي اللغة</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>الأولوية</label>
                      <select value={genPriority} onChange={(e) => setGenPriority(e.target.value as ContentPriority)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_AR, fontSize: 12, outline: 'none', direction: 'rtl' }}>
                        {Object.values(ContentPriority).map(p => (
                          <option key={p} value={p} style={{ background: T.bg2 }}>
                            {p === ContentPriority.URGENT ? 'عاجل' : p === ContentPriority.HIGH ? 'عالي' : p === ContentPriority.NORMAL ? 'عادي' : 'منخفض'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>الرموز ذات الصلة (اختياري)</label>
                    <input type="text" value={genSymbols} onChange={(e) => setGenSymbols(e.target.value)}
                      placeholder="BTC, ETH, SOL — مفصولة بفواصل"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_MONO, fontSize: 12, outline: 'none', direction: 'ltr' }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!genTopic.trim()) return
                      generateContent({ type: genType, category: genCategory, topic: genTopic, symbols: genSymbols ? genSymbols.split(',').map(s => s.trim()) : undefined, language: genLanguage, priority: genPriority })
                    }}
                    disabled={loading || !genTopic.trim()}
                    style={{
                      ...btnStyle, width: '100%', justifyContent: 'center',
                      background: loading || !genTopic.trim() ? 'rgba(179,136,255,0.2)' : 'linear-gradient(135deg, #B388FF, #6C3CE0)',
                      color: loading || !genTopic.trim() ? T.text3 : '#fff', fontWeight: 800, padding: '14px', fontSize: 14,
                      cursor: loading || !genTopic.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? <><RefreshCw size={16} style={{ animation: 'content-spin 1s linear infinite' }} /> جارٍ التوليد...</> : <><Sparkles size={16} /> توليد المحتوى</>}
                  </button>
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard glow="rgba(255,71,87,0.10)">
              <div style={{ padding: 24 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 15, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Zap size={18} color={T.red} /> تنبيه عاجل
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>الموضوع العاجل *</label>
                    <input type="text" value={breakingTopic} onChange={(e) => setBreakingTopic(e.target.value)}
                      placeholder="مثال: انهيار مفاجئ في سوق الكريبتو"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,71,87,0.3)', color: T.text, fontFamily: FONT_AR, fontSize: 13, outline: 'none', direction: 'rtl' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>الرموز المتأثرة</label>
                    <input type="text" value={breakingSymbols} onChange={(e) => setBreakingSymbols(e.target.value)}
                      placeholder="BTC, ETH — مفصولة بفواصل"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_MONO, fontSize: 12, outline: 'none', direction: 'ltr' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 6, display: 'block' }}>سياق إضافي</label>
                    <textarea value={breakingContext} onChange={(e) => setBreakingContext(e.target.value)}
                      placeholder="تفاصيل إضافية تساعد AI في توليد محتوى دقيق..."
                      rows={4}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_AR, fontSize: 13, outline: 'none', direction: 'rtl', resize: 'vertical' }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!breakingTopic.trim()) return
                      generateBreaking(breakingTopic, breakingSymbols ? breakingSymbols.split(',').map(s => s.trim()) : [], breakingContext)
                    }}
                    disabled={loading || !breakingTopic.trim()}
                    style={{
                      ...btnStyle, width: '100%', justifyContent: 'center',
                      background: loading || !breakingTopic.trim() ? 'rgba(255,71,87,0.2)' : 'linear-gradient(135deg, #FF4757, #C0392B)',
                      color: loading || !breakingTopic.trim() ? T.text3 : '#fff', fontWeight: 800, padding: '14px', fontSize: 14,
                      cursor: loading || !breakingTopic.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? <><RefreshCw size={16} style={{ animation: 'content-spin 1s linear infinite' }} /> جارٍ النشر...</> : <><Zap size={16} /> نشر التنبيه العاجل</>}
                  </button>
                </div>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Right: Quick Presets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color={T.amber} /> توليد سريع
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <QuickPreset label="ملخص الكريبتو اليومي" icon={<TrendingUp size={13} />} color="#FFB800"
                  onClick={() => generateContent({ type: ContentType.NEWS_DIGEST, category: ContentCategory.CRYPTO, topic: 'ملخص سوق الكريبتو اليومي', language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })} />
                <QuickPreset label="تقرير الفوركس الأسبوعي" icon={<BarChart3 size={13} />} color="#00D4FF"
                  onClick={() => generateContent({ type: ContentType.MARKET_REPORT, category: ContentCategory.FOREX, topic: 'تقرير سوق الفوركس الأسبوعي', language: ContentLanguage.BILINGUAL, priority: ContentPriority.NORMAL })} />
                <QuickPreset label="تحليل البيتكوين" icon={<Activity size={13} />} color="#FF8C42"
                  onClick={() => generateContent({ type: ContentType.ANALYSIS, category: ContentCategory.CRYPTO, topic: 'تحليل فني وأساسي للبيتكوين', symbols: ['BTC'], language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })} />
                <QuickPreset label="دليل المتداول المبتدئ" icon={<BookOpen size={13} />} color="#10B981"
                  onClick={() => generateContent({ type: ContentType.EDUCATIONAL, category: ContentCategory.EDUCATION, topic: 'دليل شامل للمتداول المبتدئ في الأسواق المالية', language: ContentLanguage.AR, priority: ContentPriority.LOW })} />
                <QuickPreset label="مستجدات DeFi" icon={<Layers size={13} />} color="#A78BFA"
                  onClick={() => generateContent({ type: ContentType.ARTICLE, category: ContentCategory.DEFI, topic: 'أحدث المستجدات في عالم التمويل اللامركزي', language: ContentLanguage.BILINGUAL, priority: ContentPriority.NORMAL })} />
                <QuickPreset label="تحليل الأسهم الأمريكية" icon={<TrendingUp size={13} />} color="#00FFA3"
                  onClick={() => generateContent({ type: ContentType.MARKET_REPORT, category: ContentCategory.STOCKS, topic: 'تحليل أسواق الأسهم الأمريكية', symbols: ['AAPL', 'MSFT', 'NVDA'], language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })} />
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={15} color={T.orange} /> ملء الفجوات تلقائياً
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text2, lineHeight: 1.8, marginBottom: 12 }}>
                يقوم الوكيل تلقائياً بتحديد الفئات التي تحتاج محتوى جديد وملئها. يمكنك أيضاً التوليد يدوياً لفئة محددة.
              </div>
              {contentGaps.filter(g => g.priority === 'HIGH').length > 0 && (
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 6 }}>فجوات عاجلة:</div>
                  {contentGaps.filter(g => g.priority === 'HIGH').map((gap, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 4, borderRadius: 6, background: 'rgba(255,71,87,0.05)' }}>
                      <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text, fontWeight: 600 }}>{gap.categoryAr || getCategoryLabel(gap.category)}</span>
                      <span style={{ fontFamily: FONT_AR, fontSize: 9, color: T.text3 }}>({gap.gapHours}س بدون محتوى)</span>
                      <button
                        onClick={() => generateContent({ type: ContentType.ARTICLE, category: gap.category, topic: gap.suggestedTopics?.[0] || `محتوى جديد: ${gap.categoryAr || gap.category}`, language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })}
                        disabled={loading}
                        style={{ ...btnStyle, marginLeft: 'auto', background: 'rgba(255,71,87,0.10)', color: T.red, fontSize: 9, padding: '4px 10px' }}
                      >
                        <Plus size={10} /> توليد
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={15} color={T.accent} /> نصائح التوليد
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <TipItem text="كلما كان الموضوع أكثر تحديداً، كان المحتوى أدق وأكثر فائدة" />
                <TipItem text="أضف الرموز المتعلقة بالموضوع للحصول على بيانات سوق محدثة في المحتوى" />
                <TipItem text="استخدم نوع 'ملخص أخبار' للحصول على تجميع شامل لأحداث اليوم" />
                <TipItem text="التنبيهات العاجلة تُنشر فوراً بدون مراجعة — استخدمها بحكمة" />
              </div>
            </div>
          </GlassCard>
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
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={15} color={T.amber} /> الحصة اليومية
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: (agentState?.dailyGenerated ?? 0) >= (agentState?.dailyQuota ?? 20) ? T.red : T.green,
                  width: `${Math.min(((agentState?.dailyGenerated ?? 0) / (agentState?.dailyQuota || 20)) * 100, 100)}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 800, color: T.text }}>
                {agentState?.dailyGenerated ?? 0}/{agentState?.dailyQuota ?? '—'}
              </span>
            </div>
            <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, lineHeight: 1.8 }}>
              يتم إعادة تعيين الحصة اليومية كل يوم في الساعة 00:00 UTC. الحصة الافتراضية هي 20 محتوى يومياً. يمكن تعديلها من إعدادات الوكيل.
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} color={T.accent} /> الجدولة التلقائية
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ScheduleRow label="ملخص السوق الصباحي" time="08:00 UTC" active />
              <ScheduleRow label="ملء الفجوات" time="كل 6 ساعات" active />
              <ScheduleRow label="تقرير نهاية الأسبوع" time="الجمعة 16:00 UTC" active={false} />
              <ScheduleRow label="تحليل الأحداث الاقتصادية" time="يومياً 12:00 UTC" active={false} />
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={15} color={T.purple} /> إعدادات AI
            </div>
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
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={15} color={T.green} /> عتبات الجودة
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ThresholdRow label="الحد الأدنى للجودة للنشر التلقائي" value="70%" color={T.green} />
              <ThresholdRow label="عتبة التنبيهات العاجلة" value="90%" color={T.red} />
              <ThresholdRow label="الحد الأدنى لدرجة المشاعر" value="+-0.3" color={T.amber} />
            </div>
            <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, lineHeight: 1.8, marginTop: 16 }}>
              المحتوى الذي لا يحقق الحد الأدنى لجودة يبقى كمسودة للمراجعة اليدوية. التنبيهات العاجلة تتطلب درجة جودة أعلى لضمان الدقة.
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }
}

/* ═══════════════════════════════════════════════
   Shared Sub-Components
   ═══════════════════════════════════════════════ */

function ArticleRow({ article, compact = false }: { article: any; compact?: boolean }) {
  const badge = getStatusBadgeStyle(article.status as ContentStatus)
  const catColor = getCategoryColor(article.category as ContentCategory)
  const [expanded, setExpanded] = useState(false)
  const { publishContent, archiveContent } = useContentAgentStore()

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {article.titleAr || article.titleEn}
          </div>
        </div>
        <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: badge.bg, color: badge.color, fontFamily: FONT_AR, fontWeight: 700, flexShrink: 0 }}>
          {badge.label}
        </span>
      </div>
    )
  }

  return (
    <GlassCard>
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 8, padding: '2px 8px', borderRadius: 4, background: `${catColor}15`, color: catColor, fontFamily: FONT_AR, fontWeight: 800 }}>
            {getCategoryLabel(article.category as ContentCategory)}
          </span>
          <span style={{ fontSize: 8, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: T.text2, fontFamily: FONT_AR, fontWeight: 700 }}>
            {getTypeLabel(article.type as ContentType)}
          </span>
          <span style={{ fontSize: 8, padding: '2px 8px', borderRadius: 4, background: badge.bg, color: badge.color, fontFamily: FONT_AR, fontWeight: 700 }}>
            {badge.label}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: FONT_AR, fontSize: 9, color: T.text3 }}>{timeAgo(article.createdAt)}</span>
        </div>
        <div style={{ fontFamily: FONT_AR, fontSize: 16, fontWeight: 800, color: T.text, lineHeight: 1.6, marginBottom: 6 }}>
          {article.titleAr || article.titleEn}
        </div>
        {(article.summaryAr || article.summaryEn) && (
          <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, lineHeight: 1.7, marginBottom: 8 }}>
            {expanded ? (article.summaryAr || article.summaryEn) : (article.summaryAr || article.summaryEn).substring(0, 120) + '...'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {article.relatedSymbols?.slice(0, 5).map((sym: string, i: number) => (
            <span key={i} style={{ fontFamily: FONT_MONO, fontSize: 8, padding: '2px 6px', borderRadius: 3, background: `${T.accent}12`, color: T.accent, fontWeight: 700 }}>{sym}</span>
          ))}
          {article.tags?.slice(0, 4).map((tag: string, i: number) => (
            <span key={i} style={{ fontFamily: FONT_AR, fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.text3 }}>
              #{tag}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Activity size={11} color={article.qualityScore >= 70 ? T.green : T.amber} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800, color: article.qualityScore >= 70 ? T.green : T.amber }}>{article.qualityScore}%</span>
            <span style={{ fontFamily: FONT_AR, fontSize: 8, color: T.text3 }}>جودة</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={11} color={T.text3} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3 }}>{Number(article.views || 0).toLocaleString('en')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ThumbsUp size={11} color={T.text3} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3 }}>{article.likes || 0}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Share2 size={11} color={T.text3} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3 }}>{article.shares || 0}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color={T.text3} />
            <span style={{ fontFamily: FONT_AR, fontSize: 9, color: T.text3 }}>{article.readingTimeMinutes || 0} د</span>
          </div>
          <div style={{ flex: 1 }} />
          {article.status === ContentStatus.DRAFT && (
            <button onClick={() => publishContent(article.id)} style={{ ...btnStyle, background: 'rgba(0,255,163,0.10)', color: T.green, fontSize: 10, padding: '5px 12px', border: '1px solid rgba(0,255,163,0.2)' }}>
              <Send size={11} /> نشر
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.04)', color: T.text2, fontSize: 10, padding: '5px 12px' }}>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'أقل' : 'تفاصيل'}
          </button>
          <button onClick={() => archiveContent(article.id)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.04)', color: T.text3, fontSize: 10, padding: '5px 10px' }}>
            <Archive size={11} />
          </button>
        </div>
        {expanded && (article.contentAr || article.contentEn) && (
          <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.border}`, fontFamily: FONT_AR, fontSize: 13, color: T.text2, lineHeight: 1.9, direction: 'rtl', maxHeight: 400, overflowY: 'auto' }} className="custom-scrollbar">
            {(article.contentAr || article.contentEn).substring(0, 2000)}{(article.contentAr || article.contentEn).length > 2000 ? '...' : ''}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function CapabilityBadge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '3px 8px', borderRadius: 5, background: `${color}12`, color, fontWeight: 700, fontFamily: FONT_AR }}>
      {icon} {label}
    </span>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontFamily: FONT_AR, fontSize: 9, color: T.text3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: any) => void; options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label style={{ fontFamily: FONT_AR, fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block' }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value || '')}
        style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border2}`, color: T.text, fontFamily: FONT_AR, fontSize: 11, outline: 'none', direction: 'rtl', minWidth: 120 }}>
        <option value="" style={{ background: T.bg2 }}>الكل</option>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: T.bg2 }}>{o.label}</option>)}
      </select>
    </div>
  )
}

function QuickPreset({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10,
      background: `${color}08`, border: `1px solid ${color}22`, cursor: 'pointer', textAlign: 'right',
      transition: 'all 0.15s', direction: 'rtl',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}15`; e.currentTarget.style.borderColor = `${color}44` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}08`; e.currentTarget.style.borderColor = `${color}22` }}
    >
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <span style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: T.text }}>{label}</span>
    </button>
  )
}

function TipItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', fontFamily: FONT_AR, fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
      <span style={{ color: T.accent, flexShrink: 0, marginTop: 2 }}>&#9679;</span>
      {text}
    </div>
  )
}

function ScheduleRow({ label, time, active }: { label: string; time: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: active ? 'rgba(0,255,163,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(0,255,163,0.12)' : T.border}` }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? T.green : T.text3, boxShadow: active ? `0 0 6px ${T.green}` : 'none' }} />
      <div style={{ flex: 1 }}><div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text }}>{label}</div></div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3 }}>{time}</span>
    </div>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2 }}>{label}</span>
      <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function ThresholdRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2 }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 800, color, padding: '2px 8px', borderRadius: 4, background: `${color}10` }}>{value}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   CSS Keyframes
   ═══════════════════════════════════════════════ */
const CONTENT_AGENT_CSS = `
@keyframes content-pulse {
  0%, 100% { opacity: 0.65; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.1); }
}
@keyframes content-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes fadeInSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
`
