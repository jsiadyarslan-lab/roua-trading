'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  RefreshCw,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  ArrowUpDown,
  Sparkles,
  Brain,
  Vote,
  Shield,
  Clock,
  DollarSign,
  Activity,
  Search,
  Zap,
  ChevronLeft,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'

// ── Data Types ──
interface PredictionEvent {
  id: string
  sourceId: string
  source: string
  title: string
  description?: string
  category?: string
  relatedSymbols: string
  marketProbability: number
  aiProbability?: number | null
  predictionGap?: number | null
  gapDirection?: 'market_higher' | 'ai_higher' | 'aligned' | null
  signalBoost?: number | null
  volume24h?: number
  liquidity?: number
  endDate?: string | null
  status: string
  impactAssessment?: string | null
  lastSyncedAt: string
}

interface PredictionMarketVote {
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
  eventsAnalyzed: number
  avgGap: number
}

// ── Defensive Helpers ──
function safeParseJSON(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch { /* ignore */ }
  }
  return []
}

function safeParseImpact(val: unknown): Record<string, unknown> | null {
  if (!val) return null
  if (typeof val === 'object' && val !== null) return val as Record<string, unknown>
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch { return null }
  }
  return null
}

function safeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

function safeString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val
  if (val != null) return String(val)
  return fallback
}

function formatPercent(val: number | null | undefined, decimals = 1): string {
  if (val == null || !Number.isFinite(val)) return '—'
  return `${(val * 100).toFixed(decimals)}%`
}

function formatVolume(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return '—'
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
  return val.toFixed(0)
}

function gapColor(gap: number | null | undefined): string {
  if (gap == null || !Number.isFinite(gap)) return 'var(--text-muted)'
  const absGap = Math.abs(gap)
  if (absGap < 0.05) return 'var(--profit)'
  if (absGap < 0.15) return 'var(--warning)'
  return 'var(--loss)'
}

function gapLabel(gap: number | null | undefined): string {
  if (gap == null || !Number.isFinite(gap)) return '—'
  const absGap = Math.abs(gap)
  if (absGap < 0.05) return 'متوافق'
  if (absGap < 0.15) return 'متوسط'
  return 'كبير'
}

function categoryLabel(cat?: string): string {
  switch (cat) {
    case 'politics': return 'سياسة'
    case 'economy': return 'اقتصاد'
    case 'technology': return 'تقنية'
    case 'sports': return 'رياضة'
    case 'other': return 'أخرى'
    default: return cat || 'أخرى'
  }
}

function categoryColor(cat?: string): string {
  switch (cat) {
    case 'politics': return '#FF6B6B'
    case 'economy': return '#FFB800'
    case 'technology': return '#00D4FF'
    case 'sports': return '#00FFC6'
    default: return '#A259FF'
  }
}

function voteConfig(vote: 'BUY' | 'SELL' | 'HOLD') {
  if (vote === 'BUY') return {
    label: 'شراء',
    Icon: TrendingUp,
    color: 'var(--profit)',
    bgColor: 'var(--profit-bg)',
    borderColor: 'var(--border-profit)',
    gradient: 'linear-gradient(135deg, #00FFC6, #10B981)',
  }
  if (vote === 'SELL') return {
    label: 'بيع',
    Icon: TrendingDown,
    color: 'var(--loss)',
    bgColor: 'var(--loss-bg)',
    borderColor: 'var(--border-loss)',
    gradient: 'linear-gradient(135deg, #FF4D4D, #EF4444)',
  }
  return {
    label: 'انتظار',
    Icon: Minus,
    color: 'var(--warning)',
    bgColor: 'var(--warning-bg)',
    borderColor: 'var(--border-warning)',
    gradient: 'linear-gradient(135deg, #FFB800, #F59E0B)',
  }
}

// ── Constants ──
const TABS = [
  { id: 'events', label: 'الأحداث' },
  { id: 'gaps', label: 'أكبر الفجوات' },
  { id: 'vote', label: 'تصويت AI' },
]

const CATEGORIES = [
  { id: '', label: 'الكل' },
  { id: 'politics', label: 'سياسة' },
  { id: 'economy', label: 'اقتصاد' },
  { id: 'technology', label: 'تقنية' },
  { id: 'sports', label: 'رياضة' },
  { id: 'other', label: 'أخرى' },
]

// ── ProbabilityBar Component ──
function ProbabilityBar({ market, ai, gap }: { market: number; ai?: number | null; gap?: number | null }) {
  const mktPct = Number.isFinite(market) ? market : 0
  const aiPct = ai != null && Number.isFinite(ai) ? ai : null
  const gapVal = gap != null && Number.isFinite(gap) ? gap : null

  return (
    <div style={{ width: '100%' }}>
      {/* Market Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, color: '#00D4FF', fontFamily: 'var(--font-ar), Inter, sans-serif', width: '32px', flexShrink: 0 }}>السوق</span>
        <div style={{ flex: 1, height: '10px', background: 'var(--bg-input)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Math.max(mktPct * 100, 0), 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #00D4FF, #0A84FF)',
              borderRadius: '5px',
              position: 'relative',
            }}
          />
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#00D4FF', width: '36px', textAlign: 'left', flexShrink: 0 }} dir="ltr">
          {(mktPct * 100).toFixed(0)}%
        </span>
      </div>

      {/* AI Bar */}
      {aiPct !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, color: '#A259FF', fontFamily: 'var(--font-ar), Inter, sans-serif', width: '32px', flexShrink: 0 }}>AI</span>
          <div style={{ flex: 1, height: '10px', background: 'var(--bg-input)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(Math.max(aiPct * 100, 0), 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #A259FF, #7C3AED)',
                borderRadius: '5px',
                position: 'relative',
              }}
            />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#A259FF', width: '36px', textAlign: 'left', flexShrink: 0 }} dir="ltr">
            {(aiPct * 100).toFixed(0)}%
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-faint)', fontFamily: 'var(--font-ar), Inter, sans-serif', width: '32px', flexShrink: 0 }}>AI</span>
          <div style={{ flex: 1, height: '10px', background: 'var(--bg-input)', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '8px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>لم يتم التحليل بعد</span>
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-faint)', width: '36px', textAlign: 'left', flexShrink: 0 }}>—</span>
        </div>
      )}

      {/* Gap Indicator */}
      {gapVal !== null && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '2px' }}>
          <ArrowUpDown size={10} style={{ color: gapColor(gapVal) }} />
          <span style={{ fontSize: '9px', fontWeight: 600, color: gapColor(gapVal), fontFamily: 'var(--font-ar), Inter, sans-serif' }}>
            الفجوة: {formatPercent(gapVal)} ({gapLabel(gapVal)})
          </span>
        </div>
      )}
    </div>
  )
}

// ── Stats Card Component ──
function StatCard({ icon, label, value, color, gradient, delay = 0 }: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
  gradient: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '14px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: '-15px', right: '-15px',
        width: '50px', height: '50px',
        background: color,
        filter: 'blur(30px)', opacity: 0.1,
        pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '7px',
          background: gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{label}</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">{value}</div>
    </motion.div>
  )
}

// ── Event Card Component ──
function EventCard({ event, index, onAnalyze, analyzing }: {
  event: PredictionEvent
  index: number
  onAnalyze: (id: string) => void
  analyzing: string | null
}) {
  const symbols = safeParseJSON(event.relatedSymbols)
  const isAnalyzing = analyzing === event.id

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Category color accent line */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '3px', height: '100%',
        background: categoryColor(event.category),
        borderRadius: '0 10px 10px 0',
      }} />

      <div className="pm-event-card" style={{ padding: '16px' }}>
        {/* Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ flex: 1, paddingInlineEnd: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif', lineHeight: '1.5' }}>
                {event.title}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {/* Category Badge */}
              <span style={{
                fontSize: '8px', fontWeight: 700,
                padding: '2px 7px', borderRadius: '4px',
                background: `${categoryColor(event.category)}18`,
                border: `1px solid ${categoryColor(event.category)}40`,
                color: categoryColor(event.category),
                fontFamily: 'var(--font-ar), Inter, sans-serif',
              }}>
                {categoryLabel(event.category)}
              </span>

              {/* Source */}
              <span style={{ fontSize: '8px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                {safeString(event.source, '—')}
              </span>

              {/* Signal Boost */}
              {event.signalBoost != null && Number.isFinite(event.signalBoost) && (
                <span style={{
                  fontSize: '8px', fontWeight: 700,
                  padding: '2px 6px', borderRadius: '4px',
                  background: event.signalBoost >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)',
                  border: `1px solid ${event.signalBoost >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`,
                  color: event.signalBoost >= 0 ? 'var(--profit)' : 'var(--loss)',
                  fontFamily: 'var(--font-mono)',
                }} dir="ltr">
                  {event.signalBoost >= 0 ? '+' : ''}{(event.signalBoost * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          {/* Analyze Button */}
          <button
            onClick={() => onAnalyze(event.id)}
            disabled={isAnalyzing}
            className="pm-analyze-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '10px 16px', borderRadius: '7px',
              border: '1px solid var(--purple-border)',
              background: 'linear-gradient(135deg, var(--purple-bg), rgba(162, 89, 255, 0.08))',
              color: 'var(--purple)', fontSize: '10px', fontWeight: 600,
              fontFamily: 'var(--font-ar), Inter, sans-serif',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: isAnalyzing ? 0.7 : 1,
              transition: 'all 0.15s',
              flexShrink: 0,
              minHeight: 44,
            }}
          >
            {isAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            تحليل AI
          </button>
        </div>

        {/* Related Symbols */}
        {symbols.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {symbols.map((sym, i) => (
              <span key={i} style={{
                fontSize: '9px', fontWeight: 600,
                padding: '2px 8px', borderRadius: '4px',
                background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
              }} dir="ltr">{sym}</span>
            ))}
          </div>
        )}

        {/* Probability Bars */}
        <ProbabilityBar
          market={event.marketProbability}
          ai={event.aiProbability}
          gap={event.predictionGap}
        />

        {/* Footer: Volume, Liquidity, End Date */}
        <div className="pm-footer-row" style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <DollarSign size={10} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>الحجم:</span>
            <span style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} dir="ltr">
              {formatVolume(safeNumber(event.volume24h))}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={10} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>السيولة:</span>
            <span style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} dir="ltr">
              {formatVolume(safeNumber(event.liquidity))}
            </span>
          </div>
          {event.endDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} style={{ color: 'var(--text-faint)' }} />
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>الانتهاء:</span>
              <span style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }} dir="ltr">
                {new Date(event.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        {event.description && (
          <div style={{
            marginTop: '10px', padding: '8px 10px', borderRadius: '6px',
            background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
            fontSize: '10px', color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ar), Inter, sans-serif', lineHeight: '1.6',
          }}>
            {event.description}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Gap Card Component ──
function GapCard({ event, index }: { event: PredictionEvent; index: number }) {
  const symbols = safeParseJSON(event.relatedSymbols)
  const gap = event.predictionGap
  const gapVal = safeNumber(gap)
  const absGap = gapVal != null ? Math.abs(gapVal) : 0

  // Scale the bar width based on gap size (max ~50% = full bar)
  const barWidth = Math.min((absGap / 0.5) * 100, 100)

  const isMarketHigher = event.gapDirection === 'market_higher'
  const isAiHigher = event.gapDirection === 'ai_higher'
  const isAligned = event.gapDirection === 'aligned'

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderInlineEnd: `3px solid ${gapColor(gapVal)}`,
        borderRadius: '10px',
        padding: '14px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow effect for large gaps */}
      {absGap > 0.15 && (
        <div style={{
          position: 'absolute', top: '-20px', right: '-20px',
          width: '80px', height: '80px',
          background: gapColor(gapVal),
          filter: 'blur(40px)', opacity: 0.08,
          pointerEvents: 'none',
        }} />
      )}

      {/* Top row: Title + Direction */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif', lineHeight: '1.5', marginBottom: '4px' }}>
            {event.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '8px', fontWeight: 700,
              padding: '2px 6px', borderRadius: '4px',
              background: `${categoryColor(event.category)}18`,
              border: `1px solid ${categoryColor(event.category)}40`,
              color: categoryColor(event.category),
              fontFamily: 'var(--font-ar), Inter, sans-serif',
            }}>
              {categoryLabel(event.category)}
            </span>
            {symbols.slice(0, 3).map((sym, i) => (
              <span key={i} style={{
                fontSize: '8px', fontWeight: 600,
                padding: '1px 6px', borderRadius: '3px',
                background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                color: 'var(--accent)', fontFamily: 'var(--font-mono)',
              }} dir="ltr">{sym}</span>
            ))}
          </div>
        </div>

        {/* Gap Badge */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '6px 12px', borderRadius: '8px',
          background: `${gapColor(gapVal)}10`,
          border: `1px solid ${gapColor(gapVal)}30`,
          flexShrink: 0, marginInlineStart: '10px',
        }}>
          <span style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: gapColor(gapVal) }} dir="ltr">
            {formatPercent(gapVal, 1)}
          </span>
          <span style={{ fontSize: '8px', color: gapColor(gapVal), fontFamily: 'var(--font-ar), Inter, sans-serif', fontWeight: 600 }}>
            {gapLabel(gapVal)}
          </span>
        </div>
      </div>

      {/* Gap Visualization Bar */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>حجم الفجوة</span>
          <span style={{ fontSize: '9px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: gapColor(gapVal) }} dir="ltr">
            {absGap.toFixed(3)}
          </span>
        </div>
        <div style={{ height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.05 }}
            style={{
              height: '100%',
              background: `linear-gradient(90deg, ${gapColor(gapVal)}, ${gapColor(gapVal)}80)`,
              borderRadius: '4px',
            }}
          />
        </div>
      </div>

      {/* Direction + Signal Boost */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Direction */}
        {isMarketHigher && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={11} style={{ color: '#00D4FF' }} />
            <span style={{ fontSize: '9px', color: '#00D4FF', fontFamily: 'var(--font-ar), Inter, sans-serif', fontWeight: 600 }}>
              السوق أعلى
            </span>
          </div>
        )}
        {isAiHigher && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingDown size={11} style={{ color: '#A259FF' }} />
            <span style={{ fontSize: '9px', color: '#A259FF', fontFamily: 'var(--font-ar), Inter, sans-serif', fontWeight: 600 }}>
              AI أعلى
            </span>
          </div>
        )}
        {isAligned && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={11} style={{ color: 'var(--profit)' }} />
            <span style={{ fontSize: '9px', color: 'var(--profit)', fontFamily: 'var(--font-ar), Inter, sans-serif', fontWeight: 600 }}>
              متوافق
            </span>
          </div>
        )}

        {/* Signal Boost */}
        {event.signalBoost != null && Number.isFinite(event.signalBoost) && (
          <span style={{
            fontSize: '8px', fontWeight: 700,
            padding: '2px 8px', borderRadius: '4px',
            background: event.signalBoost >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)',
            border: `1px solid ${event.signalBoost >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`,
            color: event.signalBoost >= 0 ? 'var(--profit)' : 'var(--loss)',
            fontFamily: 'var(--font-mono)',
          }} dir="ltr">
            إشارة: {event.signalBoost >= 0 ? '+' : ''}{(event.signalBoost * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* Market vs AI mini */}
      <div className="pm-market-ai-mini" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <div style={{
          flex: 1, padding: '6px 8px', borderRadius: '6px',
          background: 'rgba(0, 212, 255, 0.06)', border: '1px solid rgba(0, 212, 255, 0.15)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '8px', color: '#00D4FF', fontFamily: 'var(--font-ar), Inter, sans-serif', marginBottom: '2px' }}>السوق</div>
          <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#00D4FF' }} dir="ltr">
            {formatPercent(event.marketProbability, 0)}
          </div>
        </div>
        <div style={{
          flex: 1, padding: '6px 8px', borderRadius: '6px',
          background: 'rgba(162, 89, 255, 0.06)', border: '1px solid rgba(162, 89, 255, 0.15)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '8px', color: '#A259FF', fontFamily: 'var(--font-ar), Inter, sans-serif', marginBottom: '2px' }}>AI</div>
          <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#A259FF' }} dir="ltr">
            {event.aiProbability != null && Number.isFinite(event.aiProbability) ? formatPercent(event.aiProbability, 0) : '—'}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Confidence Gauge Component ──
function ConfidenceGauge({ confidence }: { confidence: number }) {
  const safeConf = typeof confidence === 'number' && Number.isFinite(confidence)
    ? Math.min(Math.max(confidence, 0), 100)
    : 0
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (safeConf / 100) * circumference

  const gaugeColor = safeConf >= 70 ? 'var(--profit)' : safeConf >= 40 ? 'var(--warning)' : 'var(--loss)'

  return (
    <div className="pm-confidence-gauge" style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto' }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', maxWidth: 100, maxHeight: 100 }}>
        {/* Background circle */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--bg-input)"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <motion.circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={gaugeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '22px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: gaugeColor }} dir="ltr">
          {Math.round(safeConf)}
        </div>
        <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>%</div>
      </div>
    </div>
  )
}

// ── Main Page ──
export default function PredictionMarketPage() {
  const { loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState('events')
  const [events, setEvents] = useState<PredictionEvent[]>([])
  const [gaps, setGaps] = useState<PredictionEvent[]>([])
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [error, setError] = useState('')

  // AI Vote state
  const [voteSymbol, setVoteSymbol] = useState('')
  const [voteData, setVoteData] = useState<PredictionMarketVote | null>(null)
  const [voteLoading, setVoteLoading] = useState(false)
  const [voteError, setVoteError] = useState('')

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      const res = await fetch(`/api/prediction-market/events?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setEvents(data.data)
        } else {
          setEvents([])
        }
      } else {
        setEvents([])
      }
    } catch {
      setError('تعذر تحميل الأحداث. تحقق من اتصالك وحاول مجدداً.')
    } finally {
      setLoading(false)
    }
  }, [category])

  // Fetch top gaps
  const fetchGaps = useCallback(async () => {
    try {
      const res = await fetch('/api/prediction-market/gaps/top?limit=10')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setGaps(data.data)
        } else {
          setGaps([])
        }
      }
    } catch { /* silent */ }
  }, [])

  // Sync events
  const handleSync = async () => {
    setSyncing(true)
    setError('')
    try {
      const res = await fetch('/api/prediction-market/sync?force=true', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || data.message || 'فشل في المزامنة')
      await fetchEvents()
      await fetchGaps()
    } catch (err: any) {
      setError(err.message || 'فشل في المزامنة')
    } finally {
      setSyncing(false)
    }
  }

  // Analyze event
  const handleAnalyze = async (id: string) => {
    setAnalyzing(id)
    try {
      const res = await fetch(`/api/prediction-market/analyze/${id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل في التحليل')
      // Refresh events to get updated AI probability
      await fetchEvents()
      await fetchGaps()
    } catch { /* silent */ } finally {
      setAnalyzing(null)
    }
  }

  // Fetch AI Vote
  const handleFetchVote = async () => {
    if (!voteSymbol.trim()) return
    setVoteLoading(true)
    setVoteError('')
    setVoteData(null)
    try {
      const res = await fetch(`/api/prediction-market/vote/${encodeURIComponent(voteSymbol.trim().toUpperCase())}`)
      const data = await res.json()
      if (data.success && data.data) {
        setVoteData(data.data)
      } else {
        setVoteError('لا توجد بيانات تصويت متاحة لهذا الرمز')
      }
    } catch {
      setVoteError('تعذر جلب تصويت AI. حاول مجدداً.')
    } finally {
      setVoteLoading(false)
    }
  }

  // Initial data load
  useEffect(() => {
    fetchEvents()
    fetchGaps()
  }, [fetchEvents, fetchGaps])

  // Computed stats
  const totalEvents = events.length
  const avgGap = events.length > 0
    ? events.reduce((sum, e) => {
        const g = safeNumber(e.predictionGap)
        return sum + (g != null ? Math.abs(g) : 0)
      }, 0) / events.length
    : 0
  const alignedEvents = events.filter(e => e.gapDirection === 'aligned').length
  const totalVolume = events.reduce((sum, e) => {
    const v = safeNumber(e.volume24h)
    return sum + (v != null ? v : 0)
  }, 0)

  // Auth loading
  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <SubPageLayout
      title="الأسواق التنبؤية"
      icon={<Target size={15} color="#fff" />}
      iconBg="linear-gradient(135deg, #00D4FF, #7C3AED)"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={
        <button
          onClick={handleSync}
          disabled={syncing}
          aria-label="مزامنة الأحداث"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '8px',
            border: '1px solid var(--accent-border)',
            background: 'var(--accent-bg)', color: 'var(--accent)',
            fontSize: '11px', fontWeight: 600,
            fontFamily: 'var(--font-ar), Inter, sans-serif',
            cursor: syncing ? 'not-allowed' : 'pointer',
            opacity: syncing ? 0.7 : 1,
            transition: 'all 0.15s',
          }}
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          مزامنة
        </button>
      }
    >
      <style>{`
        @media (max-width: 767px) {
          .pm-stats-row { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .pm-category-pills { overflow-x: auto; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; }
          .pm-category-pills::-webkit-scrollbar { display: none; }
          .pm-event-card { padding: 12px !important; }
          .pm-event-card .pm-analyze-btn { min-height: 44px; min-width: 44px; padding: 8px 14px !important; }
          .pm-gap-card { padding: 12px !important; }
          .pm-vote-section { padding: 12px !important; }
          .pm-confidence-gauge { width: 80px !important; height: 80px !important; }
          .pm-confidence-gauge svg { width: 80px !important; height: 80px !important; }
          .pm-vote-symbol-input { font-size: 16px !important; min-height: 48px !important; }
          .pm-event-card > div:first-child { flex-direction: column; gap: 8px; }
          .pm-event-card .pm-analyze-btn { align-self: flex-start; }
          .pm-legal-disclaimer { padding: 12px !important; }
        }
        @media (max-width: 480px) {
          .pm-stats-row { grid-template-columns: 1fr !important; }
          .pm-stats-row .pm-stat-value { font-size: 15px !important; }
          .pm-footer-row { flex-direction: column; gap: 6px !important; align-items: flex-start !important; }
          .pm-market-ai-mini { flex-direction: column; gap: 6px !important; }
        }
      `}</style>

      {/* ── Error Banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', borderRadius: '8px',
              background: 'var(--loss-bg)', border: '1px solid var(--border-loss)',
              marginBottom: '16px', overflow: 'hidden',
            }}
          >
            <AlertTriangle size={13} style={{ color: 'var(--loss)', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--loss)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{error}</span>
            <button onClick={() => setError('')} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--loss)', opacity: 0.6 }}>
              <XCircle size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stats Row ── */}
      <div className="pm-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        <StatCard
          icon={<BarChart3 size={12} color="#fff" />}
          label="إجمالي الأحداث"
          value={totalEvents}
          color="#00D4FF"
          gradient="linear-gradient(135deg, #00D4FF, #0A84FF)"
          delay={0}
        />
        <StatCard
          icon={<ArrowUpDown size={12} color="#fff" />}
          label="متوسط الفجوة"
          value={formatPercent(avgGap)}
          color="#FFB800"
          gradient="linear-gradient(135deg, #FFB800, #F59E0B)"
          delay={0.05}
        />
        <StatCard
          icon={<CheckCircle2 size={12} color="#fff" />}
          label="أحداث متوافقة"
          value={alignedEvents}
          color="#00FFC6"
          gradient="linear-gradient(135deg, #00FFC6, #10B981)"
          delay={0.1}
        />
        <StatCard
          icon={<DollarSign size={12} color="#fff" />}
          label="أحجام التداول"
          value={formatVolume(totalVolume)}
          color="#A259FF"
          gradient="linear-gradient(135deg, #A259FF, #7C3AED)"
          delay={0.15}
        />
      </div>

      {/* ── Category Filter ── */}
      <div className="pm-category-pills" style={{
        display: 'flex', gap: '6px', marginBottom: '16px',
        flexWrap: 'wrap', overflow: 'hidden',
      }}>
        {CATEGORIES.map(cat => {
          const isActive = category === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              style={{
                padding: '5px 14px', borderRadius: '20px',
                border: isActive ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                background: isActive ? 'var(--accent-bg)' : 'var(--bg-card)',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '10px', fontWeight: 600,
                fontFamily: 'var(--font-ar), Inter, sans-serif',
                cursor: 'pointer', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {/* Events Tab */}
        {activeTab === 'events' && (
          <motion.div
            key="events"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '48px', textAlign: 'center',
              }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #00D4FF, #7C3AED)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', opacity: 0.6,
                }}>
                  <Loader2 size={20} className="animate-spin" color="#fff" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>جارٍ تحميل الأحداث...</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '4px' }}>يتم جلب بيانات الأسواق التنبؤية</p>
              </div>
            ) : events.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '48px', textAlign: 'center',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '120px', height: '120px',
                  background: 'linear-gradient(135deg, #00D4FF, #7C3AED)',
                  filter: 'blur(60px)', opacity: 0.08,
                  pointerEvents: 'none',
                }} />
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, #00D4FF, #7C3AED)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', opacity: 0.25,
                }}>
                  <Target size={24} color="#fff" />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>لا توجد أحداث تنبؤية</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '6px', lineHeight: '1.6' }}>
                  اضغط على زر المزامنة لجلب أحدث الأحداث من الأسواق التنبؤية
                </p>
              </motion.div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '7px',
                    background: 'linear-gradient(135deg, #00D4FF, #7C3AED)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Target size={11} color="#fff" strokeWidth={2.2} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>الأحداث التنبؤية</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700,
                    background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                    color: 'var(--accent)', padding: '1px 7px', borderRadius: '10px',
                    fontFamily: 'var(--font-mono)',
                  }}>{events.length}</span>
                </div>
                <AnimatePresence mode="popLayout">
                  {events.map((event, i) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      index={i}
                      onAnalyze={handleAnalyze}
                      analyzing={analyzing}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* Top Gaps Tab */}
        {activeTab === 'gaps' && (
          <motion.div
            key="gaps"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '48px', textAlign: 'center',
              }}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>جارٍ تحميل الفجوات...</p>
              </div>
            ) : gaps.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '48px', textAlign: 'center',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100px', height: '100px',
                  background: 'linear-gradient(135deg, #FFB800, #EF4444)',
                  filter: 'blur(60px)', opacity: 0.08,
                  pointerEvents: 'none',
                }} />
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, #FFB800, #EF4444)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', opacity: 0.25,
                }}>
                  <ArrowUpDown size={24} color="#fff" />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>لا توجد فجوات كبيرة</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '6px', lineHeight: '1.6' }}>
                  قم بتحليل بعض الأحداث لتظهر الفجوات بين السوق و AI
                </p>
              </motion.div>
            ) : (
              <div>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '7px',
                    background: 'linear-gradient(135deg, #FFB800, #EF4444)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ArrowUpDown size={11} color="#fff" strokeWidth={2.2} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>أكبر الفجوات</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700,
                    background: 'var(--warning-bg)', border: '1px solid var(--border-warning)',
                    color: 'var(--warning)', padding: '1px 7px', borderRadius: '10px',
                    fontFamily: 'var(--font-mono)',
                  }}>{gaps.length}</span>
                </div>

                {/* Gap legend */}
                <div style={{
                  display: 'flex', gap: '12px', marginBottom: '12px',
                  padding: '10px 14px', borderRadius: '8px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--profit)' }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>متوافق {'<'} 5%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--warning)' }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>متوسط 5-15%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--loss)' }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>كبير {'>'} 15%</span>
                  </div>
                </div>

                {/* Gap Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <AnimatePresence mode="popLayout">
                    {gaps.map((event, i) => (
                      <GapCard key={event.id} event={event} index={i} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* AI Vote Tab */}
        {activeTab === 'vote' && (
          <motion.div
            key="vote"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Vote Input Section */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '16px', marginBottom: '16px',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Section glow */}
              <div style={{
                position: 'absolute', top: '-30px', left: '-30px',
                width: '100px', height: '100px',
                background: 'var(--purple)',
                filter: 'blur(50px)', opacity: 0.08,
                pointerEvents: 'none',
              }} />

              {/* Section Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '7px',
                  background: 'linear-gradient(135deg, var(--purple), #7C3AED)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Brain size={11} color="#fff" strokeWidth={2.2} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>تصويت AI للرمز</span>
                <span style={{
                  fontSize: '8px', fontWeight: 700,
                  background: 'var(--purple-bg)', border: '1px solid var(--purple-border)',
                  color: 'var(--purple)', padding: '1px 6px', borderRadius: '6px',
                  fontFamily: 'var(--font-ar), Inter, sans-serif',
                }}>AI</span>
              </div>

              {/* Input Row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                }}>
                  <Search size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                  <input
                    type="text"
                    className="pm-vote-symbol-input"
                    value={voteSymbol}
                    onChange={(e) => setVoteSymbol(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchVote()}
                    placeholder="أدخل رمز الأصل (مثال: BTC)"
                    dir="ltr"
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)',
                      color: 'var(--text-main)',
                    }}
                  />
                </div>
                <button
                  onClick={handleFetchVote}
                  disabled={voteLoading || !voteSymbol.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '8px',
                    border: '1px solid var(--purple-border)',
                    background: 'linear-gradient(135deg, var(--purple-bg), rgba(162, 89, 255, 0.12))',
                    color: 'var(--purple)', fontSize: '11px', fontWeight: 600,
                    fontFamily: 'var(--font-ar), Inter, sans-serif',
                    cursor: voteLoading || !voteSymbol.trim() ? 'not-allowed' : 'pointer',
                    opacity: voteLoading || !voteSymbol.trim() ? 0.5 : 1,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {voteLoading ? <Loader2 size={12} className="animate-spin" /> : <Vote size={12} />}
                  تصويت
                </button>
              </div>

              {/* Vote Error */}
              {voteError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 12px', borderRadius: '6px',
                  background: 'var(--loss-bg)', border: '1px solid var(--border-loss)',
                  marginTop: '10px',
                }}>
                  <AlertTriangle size={11} style={{ color: 'var(--loss)', flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', color: 'var(--loss)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{voteError}</span>
                </div>
              )}
            </div>

            {/* Vote Result */}
            {voteData && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '20px',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Background glow */}
                <div style={{
                  position: 'absolute', top: '-30px', right: '-30px',
                  width: '100px', height: '100px',
                  background: voteConfig(voteData.vote).color === 'var(--profit)' ? '#00FFC6' :
                    voteConfig(voteData.vote).color === 'var(--loss)' ? '#FF4D4D' : '#FFB800',
                  filter: 'blur(50px)', opacity: 0.08,
                  pointerEvents: 'none',
                }} />

                {/* Vote Header */}
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>تصويت AI لـ</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }} dir="ltr">{voteSymbol}</span>
                  </div>
                </div>

                {/* Vote Badge */}
                {(() => {
                  const config = voteConfig(voteData.vote)
                  const { Icon } = config
                  return (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 20px', borderRadius: '10px',
                        background: config.bgColor, border: `1px solid ${config.borderColor}`,
                      }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '7px',
                          background: config.gradient,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={14} color="#fff" strokeWidth={2.2} />
                        </div>
                        <span style={{ fontSize: '18px', fontWeight: 900, color: config.color, fontFamily: 'var(--font-ar), Inter, sans-serif' }}>
                          {config.label}
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Confidence Gauge */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>مستوى الثقة</span>
                  </div>
                  <ConfidenceGauge confidence={voteData.confidence} />
                </div>

                {/* Stats Row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    padding: '10px', borderRadius: '8px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginBottom: '4px' }}>أحداث تم تحليلها</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} dir="ltr">
                      {typeof voteData.eventsAnalyzed === 'number' ? voteData.eventsAnalyzed : 0}
                    </div>
                  </div>
                  <div style={{
                    padding: '10px', borderRadius: '8px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginBottom: '4px' }}>متوسط الفجوة</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: gapColor(voteData.avgGap) }} dir="ltr">
                      {formatPercent(voteData.avgGap)}
                    </div>
                  </div>
                </div>

                {/* Reason */}
                <div style={{
                  padding: '12px 14px', borderRadius: '8px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Brain size={12} style={{ color: 'var(--purple)' }} />
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--purple)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>تفسير AI</span>
                  </div>
                  <p style={{
                    fontSize: '11px', color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-ar), Inter, sans-serif', lineHeight: '1.7',
                    margin: 0,
                  }}>
                    {safeString(voteData.reason, 'لا يوجد تفسير متاح')}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Empty Vote State */}
            {!voteData && !voteLoading && !voteError && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '40px', textAlign: 'center',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100px', height: '100px',
                  background: 'linear-gradient(135deg, var(--purple), #7C3AED)',
                  filter: 'blur(60px)', opacity: 0.08,
                  pointerEvents: 'none',
                }} />
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, var(--purple), #7C3AED)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px', opacity: 0.2,
                }}>
                  <Vote size={22} color="#fff" />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>أدخل رمز الأصل للحصول على تصويت AI</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', marginTop: '6px', lineHeight: '1.6' }}>
                  سيقوم AI بتحليل الأحداث التنبؤية المرتبطة وتقديم توصية مدعومة بالبيانات
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Legal Disclaimer ── */}
      <div className="pm-legal-disclaimer" style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        padding: '12px 16px', borderRadius: '8px',
        background: 'var(--warning-bg)', border: '1px solid var(--border-warning)',
        marginTop: '20px',
      }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '6px',
          background: 'linear-gradient(135deg, #FFB800, #F59E0B)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: '1px',
        }}>
          <AlertTriangle size={10} color="#fff" strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif', lineHeight: '1.7' }}>
          الأسواق التنبؤية هي أداة تعليمية وتحليلية فقط. لا تشكل نصيحة استثمارية. قد يكون التداول في الأسواق التنبؤية محظوراً في بعض الولايات القضائية.
        </span>
      </div>
    </SubPageLayout>
  )
}
