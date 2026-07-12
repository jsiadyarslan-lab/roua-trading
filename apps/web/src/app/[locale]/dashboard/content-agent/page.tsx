'use client'

import { useState, useEffect } from 'react'
import { getDirection } from '@/lib/i18n-utils';
import { useLocale } from 'next-intl'
import { T } from '@/lib/unified-tokens';
import {
  PenLine, Sparkles, TrendingUp, FileText, BarChart3,
  Settings2, Plus, Clock, Eye, ThumbsUp, Share2,
  AlertTriangle, CheckCircle2, XCircle, Zap, RefreshCw,
  ChevronDown, ChevronUp, Globe, Tag, Calendar,
  Activity, Hash, Send, Archive, ExternalLink, Layers,
  Search, Filter, Newspaper, BookOpen, MessageSquare,
  ArrowUpRight, ArrowDownRight, Target, Award, PieChart
} from 'lucide-react'
import {
  useContentAgentStore, ContentAgentStatus, ContentStatus,
  ContentType, ContentCategory, ContentLanguage, ContentPriority,
} from '@/hooks/useContentAgentStore'

/* ═══════════════════════════════════════════════
   Design Tokens — matching Roua Trading theme
   ═══════════════════════════════════════════════ */
const FONT_AR = "'Cairo', sans-serif"
const FONT_EN = "'Inter', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ═══════════════════════════════════════════════
   Helper Functions
   ═══════════════════════════════════════════════ */
function getStatusColor(status: ContentAgentStatus | null): string {
  if (!status) return T.text3
  switch (status) {
    case ContentAgentStatus.GENERATING: return T.accent2
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
      return { bg: 'rgba(0,212,255,0.10)', color: T.accent2, label: 'قيد المراجعة' }
    case ContentStatus.APPROVED:
      return { bg: 'rgba(0,212,255,0.10)', color: T.accent2, label: 'معتمد' }
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
      borderRadius: 16,
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
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: FONT_AR,
  fontSize: 12,
  fontWeight: 700,
  transition: 'all 0.15s',
  outline: 'none',
}

/* ═══════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════ */
export default function ContentAgentPage() {
  const locale = useLocale();
  const dir = getDirection(locale);
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

  // ── Computed stats ──
  const totalGenerated = agentState?.totalGenerated ?? 0
  const totalPublished = agentState?.totalPublished ?? 0
  const dailyGenerated = agentState?.dailyGenerated ?? 0
  const dailyQuota = agentState?.dailyQuota ?? 20
  const publishRate = totalGenerated > 0 ? Math.round((totalPublished / totalGenerated) * 100) : 0
  const dailyPercent = Math.min((dailyGenerated / dailyQuota) * 100, 100)
  const qualityScore = stats?.avgQualityScore ?? 0

  return (
    <>
      <style>{CONTENT_AGENT_CSS}</style>
      <div dir={dir} style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: FONT_AR }}>
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
            {/* Agent Avatar */}
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `linear-gradient(135deg, ${isGenerating ? '#00D4FF' : T.accent}, ${isGenerating ? '#0A84FF' : '#047857'})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isGenerating ? `0 0 28px rgba(0,212,255,0.35)` : `0 0 28px rgba(5,150,105,0.25)`,
              transition: 'all 0.4s ease',
              position: 'relative',
            }}>
              <PenLine size={26} color="#fff" strokeWidth={2.5} />
              {isGenerating && (
                <div style={{
                  position: 'absolute', inset: -3, borderRadius: 18,
                  border: '2px solid rgba(0,212,255,0.3)',
                  animation: 'content-pulse 2s ease-in-out infinite',
                }} />
              )}
            </div>
            <div>
              <h1 style={{
                fontFamily: FONT_AR, fontSize: 24, fontWeight: 900, margin: 0, lineHeight: 1.2,
                background: 'linear-gradient(135deg, #F0F2F5, #8B92A8)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                وكيل المحتوى
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: getStatusColor(status),
                  boxShadow: `0 0 10px ${getStatusColor(status)}`,
                  animation: isGenerating ? 'content-pulse 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 700, color: getStatusColor(status) }}>
                  {getStatusLabel(status)}
                </span>
                {agentState && (
                  <span style={{
                    fontFamily: FONT_AR, fontSize: 11, color: T.text3,
                    marginRight: 8, padding: '2px 10px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {agentState.totalGenerated} محتوى مُوَلَّد
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setActiveTab('generate')}
              style={{
                ...btnStyle,
                background: 'linear-gradient(135deg, #059669, #047857)',
                color: '#fff',
                fontWeight: 800,
                padding: '11px 24px',
                fontSize: 13,
                borderRadius: 10,
                boxShadow: '0 4px 16px rgba(5,150,105,0.3)',
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
                border: `1px solid rgba(255,71,87,0.25)`,
                padding: '11px 20px',
                fontSize: 13,
                borderRadius: 10,
              }}
            >
              <Zap size={15} />
              تنبيه عاجل
            </button>
            <button
              onClick={() => {
                fetchState(); fetchStats(); fetchFeed(); fetchTrending(); fetchGaps()
              }}
              style={{
                ...btnStyle,
                background: 'rgba(255,255,255,0.06)',
                color: T.text2,
                padding: '11px 14px',
                borderRadius: 10,
                border: `1px solid ${T.border}`,
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* ── Stats Bar — Redesigned ── */}
        <div style={{ padding: '24px 32px 0' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
          }}>
            {/* Total Content */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 14, padding: '18px 20px',
              border: `1px solid ${T.border}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'radial-gradient(circle at top right, rgba(0,212,255,0.06), transparent)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={15} color={T.accent2} />
                </div>
                <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, fontWeight: 600 }}>إجمالي المحتوى</span>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 28, color: T.accent2, fontWeight: 800, direction: 'ltr', textAlign: 'right', lineHeight: 1 }}>
                {totalGenerated}
              </div>
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: T.accent2, width: `${Math.min(publishRate, 100)}%`, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 4 }}>{publishRate}% معدل النشر</div>
            </div>

            {/* Published */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 14, padding: '18px 20px',
              border: `1px solid ${T.border}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'radial-gradient(circle at top right, rgba(0,255,163,0.06), transparent)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,255,163,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={15} color={T.green} />
                </div>
                <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, fontWeight: 600 }}>المنشورات</span>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 28, color: T.green, fontWeight: 800, direction: 'ltr', textAlign: 'right', lineHeight: 1 }}>
                {totalPublished}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                <ArrowUpRight size={12} color={T.green} />
                <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.green, fontWeight: 700 }}>نشط</span>
              </div>
            </div>

            {/* Daily Quota */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 14, padding: '18px 20px',
              border: `1px solid ${T.border}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'radial-gradient(circle at top right, rgba(255,184,0,0.06), transparent)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,184,0,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={15} color={T.amber} />
                </div>
                <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, fontWeight: 600 }}>الحصة اليومية</span>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 28, color: dailyPercent >= 100 ? T.red : T.amber, fontWeight: 800, direction: 'ltr', textAlign: 'right', lineHeight: 1 }}>
                {dailyGenerated}<span style={{ fontSize: 14, color: T.text3, fontWeight: 500 }}>/{dailyQuota}</span>
              </div>
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: dailyPercent >= 100 ? T.red : T.amber, width: `${dailyPercent}%`, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 4 }}>
                {dailyPercent >= 100 ? 'اكتملت الحصة' : `${dailyQuota - dailyGenerated} متبقي`}
              </div>
            </div>

            {/* Quality Score */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 14, padding: '18px 20px',
              border: `1px solid ${T.border}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${qualityScore >= 70 ? 'rgba(0,255,163,0.06)' : 'rgba(255,184,0,0.06)'}, transparent)`, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: qualityScore >= 70 ? 'rgba(0,255,163,0.10)' : 'rgba(255,184,0,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Award size={15} color={qualityScore >= 70 ? T.green : T.amber} />
                </div>
                <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, fontWeight: 600 }}>متوسط الجودة</span>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 28, color: qualityScore >= 70 ? T.green : T.amber, fontWeight: 800, direction: 'ltr', textAlign: 'right', lineHeight: 1 }}>
                {qualityScore ? `${qualityScore.toFixed(0)}%` : '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                <Target size={12} color={qualityScore >= 70 ? T.green : T.amber} />
                <span style={{ fontFamily: FONT_AR, fontSize: 10, color: qualityScore >= 70 ? T.green : T.amber, fontWeight: 600 }}>
                  {qualityScore >= 80 ? 'ممتاز' : qualityScore >= 70 ? 'جيد' : qualityScore >= 50 ? 'مقبول' : 'يحتاج تحسين'}
                </span>
              </div>
            </div>

            {/* Total Views */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 14, padding: '18px 20px',
              border: `1px solid ${T.border}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'radial-gradient(circle at top right, rgba(179,136,255,0.06), transparent)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(179,136,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Eye size={15} color={T.purple} />
                </div>
                <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, fontWeight: 600 }}>إجمالي المشاهدات</span>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 28, color: T.purple, fontWeight: 800, direction: 'ltr', textAlign: 'right', lineHeight: 1 }}>
                {stats?.totalViews ? Number(stats.totalViews).toLocaleString('en') : '0'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                <TrendingUp size={12} color={T.purple} />
                <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>جميع الأوقات</span>
              </div>
            </div>

            {/* Scheduled */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 14, padding: '18px 20px',
              border: `1px solid ${T.border}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'radial-gradient(circle at top right, rgba(255,255,255,0.04), transparent)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={15} color={T.text2} />
                </div>
                <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, fontWeight: 600 }}>مجدول للنشر</span>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 28, color: T.text, fontWeight: 800, direction: 'ltr', textAlign: 'right', lineHeight: 1 }}>
                {agentState?.pendingSchedule ?? 0}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                <Calendar size={12} color={T.text3} />
                <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>في الانتظار</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div style={{
            margin: '20px 32px 0', padding: '14px 20px',
            background: 'rgba(255,71,87,0.08)',
            border: `1px solid rgba(255,71,87,0.20)`,
            borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 12,
            fontFamily: FONT_AR, fontSize: 13, color: T.red,
          }}>
            <AlertTriangle size={18} />
            <span style={{ fontWeight: 700 }}>{error}</span>
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div style={{
          padding: '0 32px',
          marginTop: 24,
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: 24,
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '14px 22px',
                  fontFamily: FONT_AR, fontSize: 13, fontWeight: isActive ? 800 : 500,
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
                    padding: '2px 8px', borderRadius: 10,
                    background: `${T.accent}20`, color: T.accent,
                    fontFamily: FONT_MONO,
                  }}>{articles.length}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '0 32px 48px' }}>
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'feed' && <FeedTab />}
          {activeTab === 'generate' && <GenerateTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════
     Overview Tab — Redesigned
     ═══════════════════════════════════════════════ */
  function OverviewTab() {
    const [expandedLog, setExpandedLog] = useState(false)
    const displayLogs = expandedLog ? logs : logs.slice(0, 6)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Top Row: Agent Status + Performance ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {/* Agent Status Card */}
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${getStatusColor(status)}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={17} color={getStatusColor(status)} />
                </div>
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>حالة الوكيل</div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 1 }}>الحالة الحالية والتفاصيل</div>
                </div>
              </div>

              {/* Status Badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 10,
                background: `${getStatusColor(status)}08`, border: `1px solid ${getStatusColor(status)}18`,
                marginBottom: 18,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: getStatusColor(status),
                  boxShadow: `0 0 10px ${getStatusColor(status)}`,
                  animation: isGenerating ? 'content-pulse 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: getStatusColor(status) }}>
                  {getStatusLabel(status)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <StatusInfoRow icon={<FileText size={12} />} label="المحتوى المولّد" value={String(totalGenerated)} />
                <StatusInfoRow icon={<Send size={12} />} label="المنشورات" value={String(totalPublished)} color={T.green} />
                <StatusInfoRow icon={<Clock size={12} />} label="الجدولات المعلقة" value={String(agentState?.pendingSchedule ?? 0)} color={T.amber} />
                <StatusInfoRow icon={<AlertTriangle size={12} />} label="أخطاء" value={String(agentState?.errors ?? 0)} color={(agentState?.errors ?? 0) > 0 ? T.red : T.text3} />
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <CapabilityBadge icon={<Sparkles size={9} />} label="توليد AI ثنائي اللغة" color={T.accent} />
                <CapabilityBadge icon={<Globe size={9} />} label="SEO ذكي" color={T.accent2} />
                <CapabilityBadge icon={<Zap size={9} />} label="تنبيهات عاجلة" color={T.red} />
                <CapabilityBadge icon={<Calendar size={9} />} label="جدولة تلقائية" color={T.amber} />
              </div>
            </div>
          </GlassCard>

          {/* Performance Analytics Card */}
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChart3 size={17} color={T.accent} />
                </div>
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>تحليلات الأداء</div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 1 }}>مؤشرات الإنتاجية والجودة</div>
                </div>
              </div>

              {/* Publish Rate Circle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
                <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                    <circle cx="40" cy="40" r="34" fill="none" stroke={T.accent} strokeWidth="6"
                      strokeDasharray={`${publishRate * 2.14} ${214 - publishRate * 2.14}`}
                      strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 800, color: T.accent }}>{publishRate}%</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 4 }}>معدل النشر</div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, lineHeight: 1.7 }}>
                    {totalPublished} من أصل {totalGenerated} محتوى تم نشره بنجاح
                  </div>
                </div>
              </div>

              {/* Quality Bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: T.text2 }}>جودة المحتوى</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 800, color: qualityScore >= 70 ? T.green : T.amber }}>{qualityScore ? `${qualityScore.toFixed(0)}%` : '—'}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    background: `linear-gradient(90deg, ${qualityScore >= 70 ? T.green : T.amber}, ${qualityScore >= 70 ? '#10B981' : '#FCD34D'})`,
                    width: `${qualityScore || 0}%`, transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>

              {/* Category Breakdown Mini Bars */}
              {stats?.articlesByCategory && Object.keys(stats.articlesByCategory).length > 0 && (
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 8 }}>توزيع الفئات</div>
                  {Object.entries(stats.articlesByCategory).slice(0, 4).map(([cat, count]) => {
                    const maxCount = Math.max(...Object.values(stats!.articlesByCategory) as number[])
                    const pct = maxCount > 0 ? (Number(count) / maxCount) * 100 : 0
                    const catColor = getCategoryColor(cat as ContentCategory)
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, width: 50, textAlign: 'left', flexShrink: 0 }}>{getCategoryLabel(cat as ContentCategory)}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: catColor, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                        </div>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.text3, width: 20, textAlign: 'right' }}>{String(count)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Content Stats Card */}
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(179,136,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PieChart size={17} color={T.purple} />
                </div>
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>إحصائيات المحتوى</div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 1 }}>التوزيع حسب الحالة</div>
                </div>
              </div>

              {stats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <StatBarRow label="إجمالي المقالات" value={stats.totalArticles} max={stats.totalArticles || 1} color={T.accent2} />
                  <StatBarRow label="منشورة" value={stats.publishedArticles} max={stats.totalArticles || 1} color={T.green} />
                  <StatBarRow label="مسودات" value={stats.draftArticles} max={stats.totalArticles || 1} color={T.text2} />
                  <StatBarRow label="مجدولة" value={stats.scheduledArticles} max={stats.totalArticles || 1} color={T.amber} />
                  <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                    <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text2 }}>إعادات المشاركة</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 800, color: T.purple }}>{stats.totalShares}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                    <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text2 }}>الفئة الأقوى</span>
                    <span style={{
                      fontFamily: FONT_AR, fontSize: 11, fontWeight: 800,
                      color: getCategoryColor(stats.topPerformingCategory as ContentCategory),
                      padding: '2px 10px', borderRadius: 6,
                      background: `${getCategoryColor(stats.topPerformingCategory as ContentCategory)}12`,
                    }}>
                      {getCategoryLabel(stats.topPerformingCategory as ContentCategory)}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: FONT_AR, fontSize: 13, color: T.text3, textAlign: 'center', padding: '32px 0' }}>
                  لا توجد إحصائيات بعد
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* ── Middle Row: Trending + Gaps ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Trending Topics */}
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,184,0,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={17} color={T.amber} />
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>المواضيع الرائجة</div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 1 }}>أكثر المواضيع تفاعلاً الآن</div>
                  </div>
                </div>
              </div>
              {trendingTopics.length === 0 ? (
                <div style={{
                  fontFamily: FONT_AR, fontSize: 13, color: T.text3, textAlign: 'center', padding: '32px 0',
                  background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px dashed ${T.border}`,
                }}>
                  لا توجد مواضيع رائجة حالياً
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trendingTopics.slice(0, 6).map((topic, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10,
                      background: i < 3 ? `${getCategoryColor(topic.category)}04` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${i < 3 ? `${getCategoryColor(topic.category)}12` : T.border}`,
                      transition: 'all 0.15s',
                    }}>
                      <span style={{
                        fontFamily: FONT_MONO, fontSize: 11, fontWeight: 900,
                        color: i < 3 ? T.amber : T.text3, width: 22,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.5 }}>
                          {topic.topicAr || topic.topic}
                        </div>
                        {topic.relatedSymbols?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                            {topic.relatedSymbols.slice(0, 3).map((sym, j) => (
                              <span key={j} style={{
                                fontFamily: FONT_MONO, fontSize: 9, padding: '2px 7px',
                                borderRadius: 4, background: 'rgba(0,212,255,0.08)', color: T.accent2, fontWeight: 700,
                              }}>{sym}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{
                          fontSize: 9, padding: '3px 8px', borderRadius: 5,
                          background: `${getCategoryColor(topic.category)}12`,
                          color: getCategoryColor(topic.category),
                          fontFamily: FONT_AR, fontWeight: 800,
                        }}>
                          {getCategoryLabel(topic.category)}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {topic.sentiment > 0 ? <ArrowUpRight size={10} color={T.green} /> : topic.sentiment < 0 ? <ArrowDownRight size={10} color={T.red} /> : null}
                          <span style={{
                            fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800,
                            color: topic.sentiment > 0 ? T.green : topic.sentiment < 0 ? T.red : T.text3,
                          }}>
                            {topic.sentiment > 0 ? '+' : ''}{(topic.sentiment * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Content Gaps */}
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,140,66,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={17} color={T.orange} />
                </div>
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>فجوات المحتوى</div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 1 }}>فئات تحتاج محتوى جديد</div>
                </div>
              </div>
              {contentGaps.length === 0 ? (
                <div style={{
                  fontFamily: FONT_AR, fontSize: 13, color: T.text3, textAlign: 'center', padding: '32px 0',
                  background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px dashed ${T.border}`,
                }}>
                  لا توجد فجوات محتوى حالياً — التغطية ممتازة
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contentGaps.slice(0, 5).map((gap, i) => {
                    const priorityConfig = gap.priority === 'HIGH'
                      ? { bg: 'rgba(255,71,87,0.06)', border: 'rgba(255,71,87,0.15)', color: T.red, label: 'عاجل' }
                      : gap.priority === 'MEDIUM'
                        ? { bg: 'rgba(255,184,0,0.06)', border: 'rgba(255,184,0,0.15)', color: T.amber, label: 'متوسط' }
                        : { bg: 'rgba(255,255,255,0.03)', border: T.border, color: T.text3, label: 'منخفض' }
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 10,
                        background: priorityConfig.bg,
                        border: `1px solid ${priorityConfig.border}`,
                      }}>
                        <span style={{
                          fontSize: 9, padding: '3px 10px', borderRadius: 6,
                          background: `${priorityConfig.color}15`,
                          color: priorityConfig.color,
                          fontFamily: FONT_AR, fontWeight: 800,
                        }}>
                          {priorityConfig.label}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 700, color: T.text }}>
                            {gap.categoryAr || getCategoryLabel(gap.category)}
                          </div>
                          <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 3, lineHeight: 1.5 }}>
                            آخر محتوى: {gap.lastArticleAt ? timeAgo(gap.lastArticleAt) : 'لا يوجد'} &middot; {gap.gapHours}س بدون محتوى
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveTab('generate')}
                          style={{ ...btnStyle, background: `${T.accent}12`, color: T.accent, fontSize: 10, padding: '6px 14px', borderRadius: 8, border: `1px solid ${T.accent}25` }}
                        >
                          <Plus size={12} />
                          توليد
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* ── Bottom Row: Recent Articles + Event Log ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recent Articles */}
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Newspaper size={17} color={T.accent2} />
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>آخر المحتوى</div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 1 }}>أحدث المقالات المولّدة</div>
                  </div>
                </div>
                <button onClick={() => setActiveTab('feed')} style={{ ...btnStyle, background: `${T.accent}10`, color: T.accent, fontSize: 11, padding: '6px 14px', borderRadius: 8, border: `1px solid ${T.accent}20` }}>
                  عرض الكل
                </button>
              </div>
              {articles.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '40px 20px', fontFamily: FONT_AR, color: T.text3,
                  background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px dashed ${T.border}`,
                }}>
                  <FileText size={36} style={{ marginBottom: 10, opacity: 0.2 }} />
                  <div style={{ fontSize: 13, fontWeight: 700 }}>لا يوجد محتوى بعد</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>ابدأ بتوليد أول مقال من تبويب التوليد</div>
                </div>
              ) : (
                <div style={{ maxHeight: 380, overflowY: 'auto' }} className="custom-scrollbar">
                  {articles.slice(0, 5).map((article) => (
                    <ArticleRow key={article.id} article={article} compact />
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Event Log */}
          <GlassCard>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={17} color={T.accent2} />
                  </div>
                  <div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>سجل الأحداث</div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginTop: 1 }}>آخر نشاطات الوكيل</div>
                  </div>
                </div>
                <span style={{
                  fontFamily: FONT_MONO, fontSize: 11, color: T.text3,
                  padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>{logs.length} حدث</span>
              </div>
              <div style={{ maxHeight: 340, overflowY: 'auto', direction: 'ltr' }} className="custom-scrollbar">
                {displayLogs.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '32px 20px', fontFamily: FONT_AR, fontSize: 13, color: T.text3, direction: 'inherit',
                    background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px dashed ${T.border}`,
                  }}>
                    لا توجد أحداث بعد
                  </div>
                ) : (
                  displayLogs.map((log, i) => {
                    const logColor = log.type === 'success' ? T.green
                      : log.type === 'error' ? T.red
                      : log.type === 'warning' ? T.amber
                      : log.type === 'content' ? T.purple
                      : T.text2
                    const logIcon = log.type === 'success' ? <CheckCircle2 size={11} />
                      : log.type === 'error' ? <XCircle size={11} />
                      : log.type === 'warning' ? <AlertTriangle size={11} />
                      : log.type === 'content' ? <Sparkles size={11} />
                      : <Activity size={11} />
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '8px 12px',
                        borderBottom: i < displayLogs.length - 1 ? `1px solid ${T.border}` : 'none',
                        fontFamily: FONT_AR, fontSize: 12,
                        animation: i === 0 ? 'fadeInSlideUp 0.3s ease-out' : 'none',
                        alignItems: 'flex-start',
                      }}>
                        <span style={{ color: logColor, display: 'flex', marginTop: 1, flexShrink: 0 }}>{logIcon}</span>
                        <span style={{ color: logColor, direction: 'inherit', flex: 1, lineHeight: 1.6 }}>{log.msg}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.text3, whiteSpace: 'nowrap', paddingTop: 2 }}>
                          {log.time}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
              {logs.length > 6 && (
                <button
                  onClick={() => setExpandedLog(!expandedLog)}
                  style={{ ...btnStyle, width: '100%', marginTop: 12, background: 'rgba(255,255,255,0.04)', color: T.text3, fontSize: 11, padding: '10px 0', justifyContent: 'center', borderRadius: 8, border: `1px solid ${T.border}` }}
                >
                  {expandedLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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
                background: showFilters ? `${T.accent}10` : 'rgba(255,255,255,0.06)',
                color: showFilters ? T.accent : T.text2,
                fontSize: 11, borderRadius: 8, border: `1px solid ${showFilters ? T.accent + '25' : T.border}`,
              }}
            >
              <Filter size={13} />
              فلاتر
              {(filterCategory || filterType || filterStatus) && (
                <span style={{
                  fontSize: 9, padding: '2px 7px', borderRadius: 8,
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
                style={{ ...btnStyle, background: 'rgba(255,71,87,0.08)', color: T.red, fontSize: 10, padding: '5px 12px', borderRadius: 8 }}
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

    const inputStyle: React.CSSProperties = {
      width: '100%', padding: '12px 16px', borderRadius: 10,
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
      color: T.text, fontFamily: FONT_AR, fontSize: 13, outline: 'none', direction: 'inherit',
      transition: 'border-color 0.15s',
    }
    const selectStyle: React.CSSProperties = {
      width: '100%', padding: '12px 14px', borderRadius: 10,
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`,
      color: T.text, fontFamily: FONT_AR, fontSize: 12, outline: 'none', direction: 'inherit',
    }
    const labelStyle: React.CSSProperties = {
      fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 8, display: 'block',
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setFormMode('content')} style={{
              ...btnStyle, flex: 1, justifyContent: 'center',
              background: formMode === 'content' ? `${T.accent}12` : 'rgba(255,255,255,0.04)',
              color: formMode === 'content' ? T.accent : T.text2,
              border: `1px solid ${formMode === 'content' ? T.accent + '30' : T.border}`,
              padding: '13px', borderRadius: 10,
            }}>
              <Sparkles size={15} /> توليد محتوى
            </button>
            <button onClick={() => setFormMode('breaking')} style={{
              ...btnStyle, flex: 1, justifyContent: 'center',
              background: formMode === 'breaking' ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.04)',
              color: formMode === 'breaking' ? T.red : T.text2,
              border: `1px solid ${formMode === 'breaking' ? 'rgba(255,71,87,0.3)' : T.border}`,
              padding: '13px', borderRadius: 10,
            }}>
              <Zap size={15} /> تنبيه عاجل
            </button>
          </div>

          {formMode === 'content' ? (
            <GlassCard>
              <div style={{ padding: 24 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 16, fontWeight: 800, marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={18} color={T.accent} />
                  توليد محتوى جديد
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={labelStyle}>الموضوع *</label>
                    <input type="text" value={genTopic} onChange={(e) => setGenTopic(e.target.value)}
                      placeholder="مثال: تحليل سوق البيتكوين بعد قرار الفيدرالي"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>النوع</label>
                      <select value={genType} onChange={(e) => setGenType(e.target.value as ContentType)} style={selectStyle}>
                        {Object.values(ContentType).map(t => <option key={t} value={t} style={{ background: T.bg2 }}>{getTypeLabel(t)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>الفئة</label>
                      <select value={genCategory} onChange={(e) => setGenCategory(e.target.value as ContentCategory)} style={selectStyle}>
                        {Object.values(ContentCategory).map(c => <option key={c} value={c} style={{ background: T.bg2 }}>{getCategoryLabel(c as ContentCategory)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>اللغة</label>
                      <select value={genLanguage} onChange={(e) => setGenLanguage(e.target.value as ContentLanguage)} style={selectStyle}>
                        <option value={ContentLanguage.AR} style={{ background: T.bg2 }}>عربي</option>
                        <option value={ContentLanguage.EN} style={{ background: T.bg2 }}>English</option>
                        <option value={ContentLanguage.BILINGUAL} style={{ background: T.bg2 }}>ثنائي اللغة</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>الأولوية</label>
                      <select value={genPriority} onChange={(e) => setGenPriority(e.target.value as ContentPriority)} style={selectStyle}>
                        {Object.values(ContentPriority).map(p => (
                          <option key={p} value={p} style={{ background: T.bg2 }}>
                            {p === ContentPriority.URGENT ? 'عاجل' : p === ContentPriority.HIGH ? 'عالي' : p === ContentPriority.NORMAL ? 'عادي' : 'منخفض'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>الرموز ذات الصلة (اختياري)</label>
                    <input type="text" value={genSymbols} onChange={(e) => setGenSymbols(e.target.value)}
                      placeholder="BTC, ETH, SOL — مفصولة بفواصل"
                      style={{ ...inputStyle, fontFamily: FONT_MONO, fontSize: 12, direction: 'ltr' }}
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
                      background: loading || !genTopic.trim() ? `${T.accent}20` : `linear-gradient(135deg, ${T.accent}, #047857)`,
                      color: loading || !genTopic.trim() ? T.text3 : '#fff', fontWeight: 800, padding: '14px', fontSize: 14,
                      borderRadius: 10,
                      cursor: loading || !genTopic.trim() ? 'not-allowed' : 'pointer',
                      boxShadow: loading || !genTopic.trim() ? 'none' : '0 4px 16px rgba(5,150,105,0.3)',
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
                <div style={{ fontFamily: FONT_AR, fontSize: 16, fontWeight: 800, marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Zap size={18} color={T.red} /> تنبيه عاجل
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={labelStyle}>الموضوع العاجل *</label>
                    <input type="text" value={breakingTopic} onChange={(e) => setBreakingTopic(e.target.value)}
                      placeholder="مثال: انهيار مفاجئ في سوق الكريبتو"
                      style={{ ...inputStyle, border: '1px solid rgba(255,71,87,0.25)' }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>الرموز المتأثرة</label>
                    <input type="text" value={breakingSymbols} onChange={(e) => setBreakingSymbols(e.target.value)}
                      placeholder="BTC, ETH — مفصولة بفواصل"
                      style={{ ...inputStyle, fontFamily: FONT_MONO, fontSize: 12, direction: 'ltr' }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>سياق إضافي</label>
                    <textarea value={breakingContext} onChange={(e) => setBreakingContext(e.target.value)}
                      placeholder="تفاصيل إضافية تساعد AI في توليد محتوى دقيق..."
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical' }}
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
                      borderRadius: 10,
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
            <div style={{ padding: 24 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Zap size={15} color={T.amber} /> توليد سريع
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
            <div style={{ padding: 24 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Layers size={15} color={T.orange} /> ملء الفجوات تلقائياً
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text2, lineHeight: 1.9, marginBottom: 14 }}>
                يقوم الوكيل تلقائياً بتحديد الفئات التي تحتاج محتوى جديد وملئها. يمكنك أيضاً التوليد يدوياً لفئة محددة.
              </div>
              {contentGaps.filter(g => g.priority === 'HIGH').length > 0 && (
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={12} /> فجوات عاجلة:
                  </div>
                  {contentGaps.filter(g => g.priority === 'HIGH').map((gap, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 6, borderRadius: 8, background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.1)' }}>
                      <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text, fontWeight: 600 }}>{gap.categoryAr || getCategoryLabel(gap.category)}</span>
                      <span style={{ fontFamily: FONT_AR, fontSize: 9, color: T.text3 }}>({gap.gapHours}س بدون محتوى)</span>
                      <button
                        onClick={() => generateContent({ type: ContentType.ARTICLE, category: gap.category, topic: gap.suggestedTopics?.[0] || `محتوى جديد: ${gap.categoryAr || gap.category}`, language: ContentLanguage.BILINGUAL, priority: ContentPriority.HIGH })}
                        disabled={loading}
                        style={{ ...btnStyle, marginLeft: 'auto', background: 'rgba(255,71,87,0.10)', color: T.red, fontSize: 9, padding: '5px 12px', borderRadius: 7 }}
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
            <div style={{ padding: 24 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <MessageSquare size={15} color={T.accent2} /> نصائح التوليد
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <TipItem text="كلما كان الموضوع أكثر تحديداً، كان المحتوى أدق وأكثر فائدة للقارئ" />
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
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,184,0,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={17} color={T.amber} />
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>الحصة اليومية</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 5,
                  background: dailyPercent >= 100 ? T.red : `linear-gradient(90deg, ${T.accent}, #10B981)`,
                  width: `${dailyPercent}%`, transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 800, color: T.text }}>
                {dailyGenerated}/{dailyQuota}
              </span>
            </div>
            <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text3, lineHeight: 1.9 }}>
              يتم إعادة تعيين الحصة اليومية كل يوم في الساعة 00:00 UTC. الحصة الافتراضية هي 20 محتوى يومياً. يمكن تعديلها من إعدادات الوكيل.
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={17} color={T.accent2} />
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>الجدولة التلقائية</div>
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
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={17} color={T.accent} />
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>إعدادات AI</div>
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
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,255,163,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={17} color={T.green} />
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: T.text }}>عتبات الجودة</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ThresholdRow label="الحد الأدنى للجودة للنشر التلقائي" value="70%" color={T.green} />
              <ThresholdRow label="عتبة التنبيهات العاجلة" value="90%" color={T.red} />
              <ThresholdRow label="الحد الأدنى لدرجة المشاعر" value="+-0.3" color={T.amber} />
            </div>
            <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text3, lineHeight: 1.9, marginTop: 18 }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ width: 4, height: 28, borderRadius: 2, background: catColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
            {article.titleAr || article.titleEn}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: `${catColor}12`, color: catColor, fontFamily: FONT_AR, fontWeight: 700 }}>
              {getCategoryLabel(article.category as ContentCategory)}
            </span>
            <span style={{ fontFamily: FONT_AR, fontSize: 9, color: T.text3 }}>{timeAgo(article.createdAt)}</span>
          </div>
        </div>
        <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 5, background: badge.bg, color: badge.color, fontFamily: FONT_AR, fontWeight: 700, flexShrink: 0 }}>
          {badge.label}
        </span>
      </div>
    )
  }

  return (
    <GlassCard>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 9, padding: '3px 10px', borderRadius: 6, background: `${catColor}12`, color: catColor, fontFamily: FONT_AR, fontWeight: 800 }}>
            {getCategoryLabel(article.category as ContentCategory)}
          </span>
          <span style={{ fontSize: 9, padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: T.text2, fontFamily: FONT_AR, fontWeight: 700 }}>
            {getTypeLabel(article.type as ContentType)}
          </span>
          <span style={{ fontSize: 9, padding: '3px 10px', borderRadius: 6, background: badge.bg, color: badge.color, fontFamily: FONT_AR, fontWeight: 700 }}>
            {badge.label}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>{timeAgo(article.createdAt)}</span>
        </div>
        <div style={{ fontFamily: FONT_AR, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.7, marginBottom: 8 }}>
          {article.titleAr || article.titleEn}
        </div>
        {(article.summaryAr || article.summaryEn) && (
          <div style={{ fontFamily: FONT_AR, fontSize: 13, color: T.text2, lineHeight: 1.8, marginBottom: 10 }}>
            {expanded ? (article.summaryAr || article.summaryEn) : (article.summaryAr || article.summaryEn).substring(0, 150) + '...'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {article.relatedSymbols?.slice(0, 5).map((sym: string, i: number) => (
            <span key={i} style={{ fontFamily: FONT_MONO, fontSize: 9, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,212,255,0.08)', color: T.accent2, fontWeight: 700 }}>{sym}</span>
          ))}
          {article.tags?.slice(0, 4).map((tag: string, i: number) => (
            <span key={i} style={{ fontFamily: FONT_AR, fontSize: 9, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: T.text3 }}>
              #{tag}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Award size={12} color={article.qualityScore >= 70 ? T.green : T.amber} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 800, color: article.qualityScore >= 70 ? T.green : T.amber }}>{article.qualityScore}%</span>
            <span style={{ fontFamily: FONT_AR, fontSize: 9, color: T.text3 }}>جودة</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Eye size={12} color={T.text3} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.text3 }}>{Number(article.views || 0).toLocaleString('en')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ThumbsUp size={12} color={T.text3} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.text3 }}>{article.likes || 0}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Share2 size={12} color={T.text3} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.text3 }}>{article.shares || 0}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={12} color={T.text3} />
            <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>{article.readingTimeMinutes || 0} د</span>
          </div>
          <div style={{ flex: 1 }} />
          {article.status === ContentStatus.DRAFT && (
            <button onClick={() => publishContent(article.id)} style={{ ...btnStyle, background: `${T.accent}12`, color: T.accent, fontSize: 10, padding: '6px 14px', borderRadius: 8, border: `1px solid ${T.accent}25` }}>
              <Send size={11} /> نشر
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.04)', color: T.text2, fontSize: 10, padding: '6px 14px', borderRadius: 8, border: `1px solid ${T.border}` }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'أقل' : 'تفاصيل'}
          </button>
          <button onClick={() => archiveContent(article.id)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.04)', color: T.text3, fontSize: 10, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}` }}>
            <Archive size={12} />
          </button>
        </div>
        {expanded && (article.contentAr || article.contentEn) && (
          <div style={{
            marginTop: 16, padding: '16px 18px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.border}`,
            fontFamily: FONT_AR, fontSize: 14, color: T.text2, lineHeight: 2,
            direction: 'inherit', maxHeight: 400, overflowY: 'auto',
          }} className="custom-scrollbar">
            {(article.contentAr || article.contentEn).substring(0, 2000)}{(article.contentAr || article.contentEn).length > 2000 ? '...' : ''}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function StatusInfoRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: color || T.text3, display: 'flex' }}>{icon}</span>
        <span style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text3 }}>{label}</span>
      </div>
      <span style={{ fontFamily: FONT_AR, fontSize: 13, color: color || T.text, fontWeight: 800 }}>{value}</span>
    </div>
  )
}

function StatBarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text2 }}>{label}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 800, color }}>{value}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function CapabilityBadge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '4px 9px', borderRadius: 6, background: `${color}12`, color, fontWeight: 700, fontFamily: FONT_AR }}>
      {icon} {label}
    </span>
  )
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: any) => void; options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label style={{ fontFamily: FONT_AR, fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 5, display: 'block' }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value || '')}
        style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: T.text, fontFamily: FONT_AR, fontSize: 11, outline: 'none', direction: 'inherit', minWidth: 120 }}>
        <option value="" style={{ background: T.bg2 }}>الكل</option>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: T.bg2 }}>{o.label}</option>)}
      </select>
    </div>
  )
}

function QuickPreset({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12,
      background: `${color}06`, border: `1px solid ${color}18`, cursor: 'pointer', textAlign: 'right',
      transition: 'all 0.15s', direction: 'inherit',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}30` }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}06`; e.currentTarget.style.borderColor = `${color}18` }}
    >
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <span style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: T.text }}>{label}</span>
    </button>
  )
}

function TipItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', fontFamily: FONT_AR, fontSize: 12, color: T.text2, lineHeight: 1.7 }}>
      <span style={{ color: T.accent, flexShrink: 0, marginTop: 3, fontSize: 8 }}>&#9679;</span>
      {text}
    </div>
  )
}

function ScheduleRow({ label, time, active }: { label: string; time: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: active ? 'rgba(5,150,105,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(5,150,105,0.15)' : T.border}` }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? T.accent : T.text3, boxShadow: active ? `0 0 8px ${T.accent}` : 'none' }} />
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
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 800, color, padding: '3px 10px', borderRadius: 6, background: `${color}10` }}>{value}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   CSS Keyframes
   ═══════════════════════════════════════════════ */
const CONTENT_AGENT_CSS = `
@keyframes content-pulse {
  0%, 100% { opacity: 0.65; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.15); }
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
