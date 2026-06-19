'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, Minus, Loader2,
  Clock, Activity, ChevronDown, ChevronUp, Zap, AlertTriangle,
  CheckCircle2, XCircle, Timer, Target, Shield, BarChart3,
  Play, Sparkles, Cpu, FileText, Award,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

interface TradingBrief {
  id: string
  pair: string
  direction: 'BUY' | 'SELL'
  entryPrice: number
  stopLoss: number
  takeProfit: number
  confidence: number
  timeframe: string
  issuedAt: string
  expiresAt: string
  isActive: boolean
  strictRules: { maxEntryPrice?: number; minEntryPrice?: number; maxSlippage: number }
  lastReviewedAt: string
  reviewStatus: 'ACTIVE' | 'MODIFIED' | 'CANCELLED' | 'EXECUTED'
  analysisSummary?: string
}

interface CouncilVote {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
}

interface CouncilResult {
  consensusScore: number
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  analyses: CouncilVote[]
  masterStrategy: string
  source?: string
  isFallback?: boolean
}

interface CouncilSession {
  timestamp: string
  pairsAnalyzed: number
  briefsIssued: number
  briefsModified: number
  briefsCancelled: number
  briefsExecuted: number
  durationMs: number
}

type Tab = 'active' | 'history' | 'consensus' | 'performance'

// ═══════════════════════════════════════════════════
// Design Tokens
// ═══════════════════════════════════════════════════

const C = {
  bg: '#0B0E14',
  surface: 'rgba(255,255,255,0.03)',
  surfaceHover: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.08)',
  borderActive: 'rgba(168,85,247,0.25)',
  text: '#F1F5F9',
  text2: '#94A3B8',
  text3: '#64748B',
  green: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
  cyan: '#06B6D4',
  purple: '#A855F7',
  blue: '#3B82F6',
  dim: '#475569',
}

const dirColor: Record<string, string> = { BUY: C.green, SELL: C.red, HOLD: C.amber }
const dirIcon: Record<string, string> = { BUY: '▲', SELL: '▼', HOLD: '◆' }
const dirLabel: Record<string, string> = { BUY: 'شراء', SELL: 'بيع', HOLD: 'انتظار' }
const tfColor: Record<string, string> = {
  M1: C.red, M5: C.amber, M15: C.cyan, M30: C.blue,
  H1: C.purple, H4: C.purple, D1: C.green, W1: C.green,
}
const stColor: Record<string, string> = { ACTIVE: C.green, MODIFIED: C.amber, CANCELLED: C.red, EXECUTED: C.cyan }
const stLabel: Record<string, string> = { ACTIVE: 'نشط', MODIFIED: 'مُعدّل', CANCELLED: 'ملغى', EXECUTED: 'منفّذ' }

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ساعة`
  return `${Math.floor(h / 24)} يوم`
}

function timeLeft(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'منتهي'
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m} دقيقة متبقية`
  return `${Math.floor(m / 60)} ساعة ${m % 60} دقيقة متبقية`
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(6)
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} ثانية`
  return `${Math.floor(s / 60)} دقيقة ${s % 60} ثانية`
}

// ═══════════════════════════════════════════════════
// SVG Circular Progress Ring
// ═══════════════════════════════════════════════════

function ConsensusRing({ score, color, size = 120 }: { score: number; color: string; size?: number }) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 8px ${color}60)` }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 900, color }}>{score}%</span>
        <span style={{ fontSize: size * 0.09, color: C.text3, fontWeight: 600 }}>ثقة</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════

export default function CouncilPage() {
  const t = useTranslations('dashboard')
  const locale = useLocale()

  const [activeBriefs, setActiveBriefs] = useState<TradingBrief[]>([])
  const [historyBriefs, setHistoryBriefs] = useState<TradingBrief[]>([])
  const [lastSession, setLastSession] = useState<CouncilSession | null>(null)
  const [sessionRunning, setSessionRunning] = useState(false)
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null)
  const [councilLoading, setCouncilLoading] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT')
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('active')
  const [filterDir, setFilterDir] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [loading, setLoading] = useState(true)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [backendOffline, setBackendOffline] = useState(false)

  const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT']

  // ── Fetchers ──
  const fetchActiveBriefs = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/briefs/active')
      if (!res.ok) { setBackendOffline(true); return }
      setBackendOffline(false)
      const data = await res.json()
      setActiveBriefs(data.data || [])
    } catch { setBackendOffline(true) }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/briefs/history')
      if (res.ok) setHistoryBriefs((await res.json()).data || [])
    } catch {}
  }, [])

  const fetchLastSession = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/session/last')
      if (res.ok) setLastSession((await res.json()).data || null)
    } catch {}
  }, [])

  const fetchSessionStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/session/status')
      if (res.ok) setSessionRunning((await res.json()).data?.isRunning || false)
    } catch {}
  }, [])

  const fetchCouncil = useCallback(async () => {
    setCouncilLoading(true)
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, language: locale }),
        signal: AbortSignal.timeout(45000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) setCouncilResult(data.data)
      }
    } catch {}
    setCouncilLoading(false)
  }, [selectedSymbol, locale])

  const triggerSession = useCallback(async () => {
    setTriggerLoading(true)
    try {
      const res = await fetch('/api/strategic-council/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'], language: locale }),
      })
      const data = await res.json()
      if (data.data?.status === 'processing') setSessionRunning(true)
    } catch {}
    setTriggerLoading(false)
  }, [locale])

  // ── Effects ──
  useEffect(() => {
    Promise.all([fetchActiveBriefs(), fetchLastSession(), fetchSessionStatus()]).finally(() => setLoading(false))
    fetchHistory()
  }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      fetchActiveBriefs(); fetchLastSession(); fetchSessionStatus()
    }, 15000)
    return () => clearInterval(iv)
  }, [fetchActiveBriefs, fetchLastSession, fetchSessionStatus])

  useEffect(() => {
    if (!sessionRunning) return
    const iv = setInterval(() => {
      fetchSessionStatus(); fetchActiveBriefs(); fetchLastSession()
    }, 5000)
    return () => clearInterval(iv)
  }, [sessionRunning, fetchSessionStatus, fetchActiveBriefs, fetchLastSession])

  const filteredActive = useMemo(() =>
    filterDir === 'ALL' ? activeBriefs : activeBriefs.filter(b => b.direction === filterDir)
  , [activeBriefs, filterDir])

  const filteredHistory = useMemo(() =>
    filterDir === 'ALL' ? historyBriefs : historyBriefs.filter(b => b.direction === filterDir)
  , [historyBriefs, filterDir])

  const perf = useMemo(() => {
    const ex = historyBriefs.filter(b => b.reviewStatus === 'EXECUTED').length
    const cn = historyBriefs.filter(b => b.reviewStatus === 'CANCELLED').length
    return {
      total: historyBriefs.length, executed: ex, cancelled: cn,
      buy: historyBriefs.filter(b => b.direction === 'BUY').length,
      sell: historyBriefs.filter(b => b.direction === 'SELL').length,
    }
  }, [historyBriefs])

  if (loading) {
    return (
      <SubPageLayout title="المجلس الاستراتيجي" icon="🏛️">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: C.purple }} />
        </div>
      </SubPageLayout>
    )
  }

  return (
    <SubPageLayout title="المجلس الاستراتيجي" icon="🏛️">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* ═══════════════════════════════════════ */}
        {/* HERO HEADER */}
        {/* ═══════════════════════════════════════ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: `linear-gradient(135deg, ${C.purple}25, ${C.cyan}15)`,
              border: `1px solid ${C.purple}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 24px ${C.purple}20`,
            }}>
              <Brain size={24} style={{ color: C.purple }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.text, letterSpacing: '-0.3px' }}>
                المجلس الاستراتيجي
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
                {activeBriefs.length} بريف نشط
                {lastSession && ` · آخر جلسة ${timeAgo(lastSession.timestamp)}`}
                {sessionRunning && ' · جاري التحليل...'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={triggerSession}
              disabled={triggerLoading || sessionRunning}
              style={{
                padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: sessionRunning
                  ? `linear-gradient(135deg, ${C.amber}15, ${C.amber}08)`
                  : `linear-gradient(135deg, ${C.purple}20, ${C.cyan}12)`,
                border: `1px solid ${sessionRunning ? C.amber + '40' : C.purple + '30'}`,
                color: sessionRunning ? C.amber : C.purple,
                cursor: triggerLoading || sessionRunning ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {triggerLoading || sessionRunning ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              {sessionRunning ? 'جاري التحليل...' : 'تشغيل جلسة'}
            </button>
          </div>
        </div>

        {/* Offline Banner */}
        {backendOffline && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            background: `${C.amber}10`, border: `1px solid ${C.amber}30`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <AlertTriangle size={16} style={{ color: C.amber }} />
            <span style={{ fontSize: 13, color: C.amber }}>الخادم غير متاح — يتم المحاولة تلقائياً</span>
          </div>
        )}

        {/* Session Stats Bar */}
        {lastSession && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10, marginBottom: 20,
          }}>
            {[
              { label: 'الأزواج المحلّلة', value: String(lastSession.pairsAnalyzed), color: C.cyan, icon: <Activity size={13} /> },
              { label: 'بريفات جديدة', value: String(lastSession.briefsIssued), color: C.green, icon: <Zap size={13} /> },
              { label: 'مُعدّلة', value: String(lastSession.briefsModified), color: C.amber, icon: <RefreshCw size={13} /> },
              { label: 'ملغاة', value: String(lastSession.briefsCancelled), color: C.red, icon: <XCircle size={13} /> },
              { label: 'منفّذة', value: String(lastSession.briefsExecuted || 0), color: C.purple, icon: <CheckCircle2 size={13} /> },
              { label: 'المدة', value: fmtDuration(lastSession.durationMs), color: C.text2, icon: <Timer size={13} /> },
            ].map((s, i) => (
              <div key={i} style={{
                background: C.surface, borderRadius: 10, padding: '10px 12px',
                border: `1px solid ${C.border}`, textAlign: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 4 }}>
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <span style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 15, color: s.color, fontWeight: 800 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* TABS */}
        {/* ═══════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 20, padding: 4,
          background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`,
        }}>
          {([
            ['active', 'البريفات النشطة', activeBriefs.length],
            ['history', 'السجل', historyBriefs.length],
            ['consensus', 'إجماع المجلس', null],
            ['performance', 'الأداء', null],
          ] as [Tab, string, number | null][]).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key)
                if (key === 'history' && historyBriefs.length === 0) fetchHistory()
                if (key === 'consensus' && !councilResult) fetchCouncil()
              }}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: tab === key ? `${C.purple}12` : 'transparent',
                border: tab === key ? `1px solid ${C.purple}30` : '1px solid transparent',
                color: tab === key ? C.purple : C.text3,
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {label}
              {count !== null && count > 0 && (
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 11,
                  background: tab === key ? `${C.purple}20` : `${C.text3}15`,
                  color: tab === key ? C.purple : C.text3,
                }}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════ */}
        {/* TAB CONTENTS */}
        {/* ═══════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >

          {/* ── ACTIVE BRIEFS ── */}
          {tab === 'active' && (
            <div>
              {/* Filter */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['ALL', 'BUY', 'SELL'] as const).map(d => (
                  <button key={d} onClick={() => setFilterDir(d)} style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: filterDir === d ? `${dirColor[d] || C.cyan}15` : C.surface,
                    border: `1px solid ${filterDir === d ? (dirColor[d] || C.cyan) + '30' : C.border}`,
                    color: filterDir === d ? (dirColor[d] || C.cyan) : C.text3,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    {d === 'ALL' ? 'الكل' : d === 'BUY' ? '▲ شراء' : '▼ بيع'}
                  </button>
                ))}
              </div>

              {filteredActive.length === 0 ? (
                <EmptyState />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredActive.map(brief => (
                    <PremiumBriefCard
                      key={brief.id}
                      brief={brief}
                      expanded={expandedBrief === brief.id}
                      onToggle={() => setExpandedBrief(expandedBrief === brief.id ? null : brief.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['ALL', 'BUY', 'SELL'] as const).map(d => (
                  <button key={d} onClick={() => setFilterDir(d)} style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: filterDir === d ? `${dirColor[d] || C.cyan}15` : C.surface,
                    border: `1px solid ${filterDir === d ? (dirColor[d] || C.cyan) + '30' : C.border}`,
                    color: filterDir === d ? (dirColor[d] || C.cyan) : C.text3,
                    cursor: 'pointer',
                  }}>
                    {d === 'ALL' ? 'الكل' : d === 'BUY' ? '▲ شراء' : '▼ بيع'}
                  </button>
                ))}
              </div>

              {filteredHistory.length === 0 ? (
                <EmptyState text="لا يوجد سجل بعد" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredHistory.slice(0, 50).map(brief => (
                    <PremiumBriefCard
                      key={brief.id}
                      brief={brief}
                      expanded={expandedBrief === brief.id}
                      onToggle={() => setExpandedBrief(expandedBrief === brief.id ? null : brief.id)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CONSENSUS ── */}
          {tab === 'consensus' && (
            <div>
              {/* Symbol Selector */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {SYMBOLS.map(sym => (
                  <button key={sym} onClick={() => { setSelectedSymbol(sym); setCouncilResult(null) }} style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    fontFamily: 'monospace',
                    background: selectedSymbol === sym ? `${C.purple}12` : C.surface,
                    border: `1px solid ${selectedSymbol === sym ? C.purple + '30' : C.border}`,
                    color: selectedSymbol === sym ? C.purple : C.text3,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>{sym}</button>
                ))}
              </div>

              {!councilResult && !councilLoading && (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <button onClick={fetchCouncil} style={{
                    padding: '14px 32px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                    background: `linear-gradient(135deg, ${C.purple}20, ${C.cyan}12)`,
                    border: `1px solid ${C.purple}30`,
                    color: C.purple, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    boxShadow: `0 0 32px ${C.purple}15`,
                  }}>
                    <Brain size={20} />
                    تحليل {selectedSymbol} بالمجلس
                  </button>
                </div>
              )}

              {councilLoading && (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <Loader2 size={32} className="animate-spin" style={{ color: C.purple }} />
                  <div style={{ marginTop: 16, fontSize: 13, color: C.text3 }}>
                    المجلس يحلل {selectedSymbol}...
                  </div>
                </div>
              )}

              {councilResult && (
                <ConsensusPanel result={councilResult} symbol={selectedSymbol} onRefresh={fetchCouncil} />
              )}
            </div>
          )}

          {/* ── PERFORMANCE ── */}
          {tab === 'performance' && (
            <div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12, marginBottom: 20,
              }}>
                {[
                  { label: 'إجمالي البريفات', value: perf.total, color: C.cyan, icon: <BarChart3 size={18} /> },
                  { label: 'منفّذة', value: perf.executed, color: C.green, icon: <CheckCircle2 size={18} /> },
                  { label: 'ملغاة', value: perf.cancelled, color: C.red, icon: <XCircle size={18} /> },
                  { label: 'شراء', value: perf.buy, color: C.green, icon: <TrendingUp size={18} /> },
                  { label: 'بيع', value: perf.sell, color: C.red, icon: <TrendingDown size={18} /> },
                ].map((s, i) => (
                  <div key={i} style={{
                    background: C.surface, borderRadius: 12, padding: 18,
                    border: `1px solid ${C.border}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ color: s.color }}>{s.icon}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Status Distribution */}
              {historyBriefs.length > 0 && (
                <div style={{
                  background: C.surface, borderRadius: 12, padding: 20,
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text2, marginBottom: 16 }}>
                    توزيع حالات البريفات
                  </div>
                  <div style={{ display: 'flex', gap: 3, height: 28, borderRadius: 8, overflow: 'hidden' }}>
                    {(['EXECUTED', 'ACTIVE', 'MODIFIED', 'CANCELLED'] as const).map(status => {
                      const count = historyBriefs.filter(b => b.reviewStatus === status).length
                      const pct = (count / historyBriefs.length) * 100
                      if (pct === 0) return null
                      return (
                        <div key={status} style={{
                          width: `${pct}%`, background: stColor[status] + '50',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff',
                        }} title={`${stLabel[status]}: ${count}`}>
                          {pct > 8 ? `${count}` : ''}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                    {(['EXECUTED', 'ACTIVE', 'MODIFIED', 'CANCELLED'] as const).map(status => (
                      <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: stColor[status] }} />
                        <span style={{ fontSize: 12, color: C.text3 }}>{stLabel[status]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {historyBriefs.length === 0 && <EmptyState text="لا توجد بيانات أداء بعد" />}
            </div>
          )}

          </motion.div>
        </AnimatePresence>
      </div>
    </SubPageLayout>
  )
}

// ═══════════════════════════════════════════════════
// Premium Brief Card
// ═══════════════════════════════════════════════════

function PremiumBriefCard({ brief, expanded, onToggle, compact }: {
  brief: TradingBrief; expanded: boolean; onToggle: () => void; compact?: boolean
}) {
  const dc = dirColor[brief.direction]
  const slDist = brief.direction === 'BUY'
    ? ((brief.entryPrice - brief.stopLoss) / brief.entryPrice) * 100
    : ((brief.stopLoss - brief.entryPrice) / brief.entryPrice) * 100
  const tpDist = brief.direction === 'BUY'
    ? ((brief.takeProfit - brief.entryPrice) / brief.entryPrice) * 100
    : ((brief.entryPrice - brief.takeProfit) / brief.entryPrice) * 100
  const rr = slDist > 0 ? (tpDist / slDist).toFixed(1) : '—'

  return (
    <div style={{
      background: C.surface, borderRadius: 14,
      border: `1px solid ${brief.reviewStatus === 'ACTIVE' ? C.borderActive : C.border}`,
      overflow: 'hidden', transition: 'all 0.2s',
    }}>
      {/* Top Row */}
      <div onClick={onToggle} style={{
        padding: '14px 18px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Direction Badge */}
        <div style={{
          padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800,
          background: `${dc}18`, color: dc,
          minWidth: 44, textAlign: 'center',
        }}>
          {dirIcon[brief.direction]} {dirLabel[brief.direction]}
        </div>

        {/* Pair */}
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>
          {brief.pair}
        </span>

        {/* Timeframe */}
        <span style={{
          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: `${tfColor[brief.timeframe] || C.dim}15`,
          color: tfColor[brief.timeframe] || C.dim,
        }}>{brief.timeframe}</span>

        {/* Status */}
        {brief.reviewStatus !== 'ACTIVE' && (
          <span style={{
            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: `${stColor[brief.reviewStatus]}15`, color: stColor[brief.reviewStatus],
          }}>{stLabel[brief.reviewStatus]}</span>
        )}

        <div style={{ flex: 1 }} />

        {/* Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 60, height: 5, background: `${C.text3}20`, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${brief.confidence}%`, height: '100%',
              background: brief.confidence >= 80 ? C.green : brief.confidence >= 60 ? C.amber : C.red,
              borderRadius: 3,
            }} />
          </div>
          <span style={{
            fontSize: 13, fontWeight: 800,
            color: brief.confidence >= 80 ? C.green : brief.confidence >= 60 ? C.amber : C.red,
            minWidth: 32,
          }}>{brief.confidence}%</span>
        </div>

        {/* Time */}
        <span style={{ fontSize: 11, color: C.text3 }}>{timeAgo(brief.issuedAt)}</span>

        {expanded ? <ChevronUp size={16} style={{ color: C.text3 }} /> : <ChevronDown size={16} style={{ color: C.text3 }} />}
      </div>

      {/* ═══ WHY THIS SIGNAL? — ALWAYS VISIBLE (not hidden behind toggle) ═══ */}
      {brief.analysisSummary && (
        <div style={{
          padding: '0 18px 14px',
        }}>
          <div style={{
            background: `${C.purple}06`, borderRadius: 10, padding: '12px 14px',
            border: `1px solid ${C.purple}12`,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
            }}>
              <Sparkles size={13} style={{ color: C.purple }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.purple }}>لماذا هذه الإشارة؟</span>
            </div>
            <div style={{
              fontSize: 12, color: C.text2, lineHeight: 1.7,
              maxHeight: expanded ? 'none' : 60, overflow: 'hidden',
              whiteSpace: 'pre-wrap',
            }}>
              {brief.analysisSummary}
            </div>
            {!expanded && brief.analysisSummary.length > 120 && (
              <div onClick={onToggle} style={{
                fontSize: 11, color: C.purple, cursor: 'pointer', marginTop: 6, fontWeight: 600,
              }}>عرض التحليل الكامل ↓</div>
            )}
          </div>
        </div>
      )}

      {/* Price Row (compact mode) */}
      {compact && !expanded && (
        <div style={{
          padding: '0 18px 12px', display: 'flex', gap: 16, fontSize: 12, color: C.text3,
        }}>
          <span>دخول: <b style={{ color: C.text }}>{fmtPrice(brief.entryPrice)}</b></span>
          <span>SL: <b style={{ color: C.red }}>{fmtPrice(brief.stopLoss)}</b></span>
          <span>TP: <b style={{ color: C.green }}>{fmtPrice(brief.takeProfit)}</b></span>
        </div>
      )}

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 18px 16px', borderTop: `1px solid ${C.border}`,
              marginTop: 4, paddingTop: 14,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* Price Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <PriceBox label="الدخول" value={fmtPrice(brief.entryPrice)} color={C.text} icon={<Target size={12} />} />
                <PriceBox label="وقف الخسارة" value={fmtPrice(brief.stopLoss)} color={C.red} sub={`${slDist.toFixed(1)}%`} icon={<Shield size={12} />} />
                <PriceBox label="جني الأرباح" value={fmtPrice(brief.takeProfit)} color={C.green} sub={`${tpDist.toFixed(1)}%`} icon={<Award size={12} />} />
                <PriceBox label="عائد/مخاطرة" value={`1:${rr}`} color={C.cyan} icon={<BarChart3 size={12} />} />
              </div>

              {/* Time Info */}
              <div style={{ display: 'flex', gap: 20, fontSize: 12, color: C.text3, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} /> أُصدر: {timeAgo(brief.issuedAt)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Timer size={12} /> {timeLeft(brief.expiresAt)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={12} /> آخر مراجعة: {timeAgo(brief.lastReviewedAt)}
                </span>
              </div>

              {/* Strict Rules */}
              {brief.strictRules && (
                <div style={{
                  background: `${C.text3}06`, borderRadius: 8, padding: '10px 12px',
                  display: 'flex', gap: 16, fontSize: 12, color: C.text3, flexWrap: 'wrap',
                }}>
                  {brief.strictRules.maxEntryPrice && (
                    <span>أقصى دخول: <b style={{ color: C.text }}>{fmtPrice(brief.strictRules.maxEntryPrice)}</b></span>
                  )}
                  {brief.strictRules.minEntryPrice && (
                    <span>أدنى دخول: <b style={{ color: C.text }}>{fmtPrice(brief.strictRules.minEntryPrice)}</b></span>
                  )}
                  <span>انزلاق مسموح: <b style={{ color: C.text }}>{(brief.strictRules.maxSlippage * 100).toFixed(1)}%</b></span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Price Box
// ═══════════════════════════════════════════════════

function PriceBox({ label, value, color, sub, icon }: {
  label: string; value: string; color: string; sub?: string; icon: React.ReactNode
}) {
  return (
    <div style={{
      background: `${C.text3}06`, borderRadius: 10, padding: '10px 12px',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Consensus Panel
// ═══════════════════════════════════════════════════

function ConsensusPanel({ result, symbol, onRefresh }: {
  result: CouncilResult; symbol: string; onRefresh: () => void
}) {
  const rc = dirColor[result.recommendation] || C.amber
  const fullLabel = result.consensusScore >= 75
    ? (result.recommendation === 'BUY' ? 'شراء قوي' : result.recommendation === 'SELL' ? 'بيع قوي' : 'انتظار')
    : (result.recommendation === 'BUY' ? 'شراء' : result.recommendation === 'SELL' ? 'بيع' : 'انتظار')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Verdict Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${rc}0C, ${C.surface})`,
        borderRadius: 16, padding: 28, border: `1px solid ${rc}20`,
        display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
      }}>
        {/* Ring */}
        <ConsensusRing score={result.consensusScore} color={rc} size={130} />

        {/* Verdict Text */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>{symbol}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: rc, marginBottom: 8 }}>
            {fullLabel}
          </div>
          {result.isFallback && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: `${C.amber}15`, color: C.amber,
            }}>
              <AlertTriangle size={12} /> وضع احتياطي
            </div>
          )}
          {result.source === 'nestjs' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: `${C.green}15`, color: C.green, marginLeft: 8,
            }}>
              <Cpu size={12} /> {result.analyses?.length || 0} نماذج AI
            </div>
          )}
        </div>

        {/* Refresh */}
        <button onClick={onRefresh} style={{
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: `${C.purple}10`, border: `1px solid ${C.purple}30`,
          color: C.purple, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <RefreshCw size={14} /> إعادة تحليل
        </button>
      </div>

      {/* Vote Distribution */}
      {result.analyses && result.analyses.length > 0 && (
        <div style={{
          background: C.surface, borderRadius: 14, padding: 18,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>
            🗳️ توزيع تصويت الأدوار ({result.analyses.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.analyses.map((vote, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10,
                  background: `${C.text3}06`,
                  borderLeft: `3px solid ${dirColor[vote.vote] || C.amber}`,
                }}
              >
                {/* Role */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{vote.role}</div>
                  <div style={{ fontSize: 11, color: C.text3 }}>{vote.model}</div>
                </div>

                {/* Vote */}
                <div style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                  background: `${dirColor[vote.vote]}18`, color: dirColor[vote.vote],
                  minWidth: 56, textAlign: 'center',
                }}>
                  {dirIcon[vote.vote]} {dirLabel[vote.vote] || vote.vote}
                </div>

                {/* Confidence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
                  <div style={{ width: 50, height: 4, background: `${C.text3}20`, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${vote.confidence}%`, height: '100%',
                      background: vote.confidence >= 75 ? C.green : vote.confidence >= 50 ? C.amber : C.red,
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text2 }}>{vote.confidence}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Master Strategy */}
      {result.masterStrategy && (
        <div style={{
          background: `${C.cyan}06`, borderRadius: 14, padding: 18,
          border: `1px solid ${C.cyan}15`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          }}>
            <FileText size={16} style={{ color: C.cyan }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.cyan }}>الاستراتيجية الموحّدة</span>
          </div>
          <div style={{
            fontSize: 13, color: C.text2, lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
          }}>
            {result.masterStrategy}
          </div>
        </div>
      )}

      {/* Role Reasoning — THE "WHY" FOR EACH VOTE */}
      {result.analyses && result.analyses.some(a => a.reason && a.reason.length > 10) && (
        <div style={{
          background: C.surface, borderRadius: 14, padding: 18,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
          }}>
            <Sparkles size={16} style={{ color: C.purple }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>لماذا صوّت كل دور؟</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.analyses.filter(a => a.reason && a.reason.length > 10).map((vote, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 8,
                background: `${C.text3}06`,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: `${dirColor[vote.vote]}15`, color: dirColor[vote.vote],
                  }}>{vote.role}</span>
                  <span style={{ fontSize: 11, color: C.text3 }}>{vote.model}</span>
                </div>
                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.6 }}>
                  {vote.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Empty State
// ═══════════════════════════════════════════════════

function EmptyState({ text = 'لا توجد بيانات' }: { text?: string }) {
  return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <Brain size={36} style={{ color: C.text3, marginBottom: 16 }} />
      <div style={{ fontSize: 14, color: C.text3 }}>{text}</div>
    </div>
  )
}
