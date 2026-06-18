'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, Minus, Loader2,
  Clock, Activity, ChevronDown, ChevronUp, Zap, AlertTriangle,
  CheckCircle2, XCircle, Timer, Target, Shield, DollarSign,
  BarChart3, History, Play, Filter,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'
import { useScopedStyle } from '@/hooks/useScopedStyle'

// ── Types ──

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

interface CouncilSession {
  timestamp: string
  pairsAnalyzed: number
  briefsIssued: number
  briefsModified: number
  briefsCancelled: number
  briefsExecuted: number
  durationMs: number
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

type Tab = 'active' | 'history' | 'consensus' | 'performance'
type FilterDir = 'ALL' | 'BUY' | 'SELL'

// ── Color tokens ──
const C = {
  bg: '#0B0E14',
  card: 'rgba(255,255,255,0.025)',
  cardHover: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.06)',
  borderActive: 'rgba(0,212,255,0.2)',
  text: '#E2E8F0',
  text2: '#94A3B8',
  text3: '#64748B',
  dim: '#475569',
  green: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
  cyan: '#06B6D4',
  purple: '#A855F7',
  blue: '#3B82F6',
}

const directionColor: Record<string, string> = { BUY: C.green, SELL: C.red, HOLD: C.amber }
const directionIcon: Record<string, string> = { BUY: '▲', SELL: '▼', HOLD: '◆' }
const directionLabel: Record<string, string> = { BUY: 'شراء', SELL: 'بيع', HOLD: 'انتظار' }

const timeframeColor: Record<string, string> = {
  M1: C.red, M5: C.amber, M15: C.cyan, M30: C.blue,
  H1: C.purple, H4: C.purple, D1: C.green, W1: C.green,
}

const statusColor: Record<string, string> = {
  ACTIVE: C.green, MODIFIED: C.amber, CANCELLED: C.red, EXECUTED: C.cyan,
}
const statusLabel: Record<string, string> = {
  ACTIVE: 'نشط', MODIFIED: 'مُعدّل', CANCELLED: 'ملغى', EXECUTED: 'منفّذ',
}

// ── Helpers ──

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('ar', { month: 'short', day: 'numeric' })
  } catch { return '—' }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 60) return `${min} د`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} س`
    return `${Math.floor(hr / 24)} ي`
  } catch { return '—' }
}

function timeLeft(iso: string): string {
  try {
    const diff = new Date(iso).getTime() - Date.now()
    if (diff <= 0) return 'منتهي'
    const min = Math.floor(diff / 60000)
    if (min < 60) return `${min} د متبقية`
    const hr = Math.floor(min / 60)
    return `${hr} س ${min % 60} د متبقية`
  } catch { return '—' }
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}ث`
  const m = Math.floor(s / 60)
  return `${m}د ${s % 60}ث`
}

// ── Main Component ──

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
  const [filterDir, setFilterDir] = useState<FilterDir>('ALL')
  const [loading, setLoading] = useState(true)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [backendOffline, setBackendOffline] = useState(false)

  // ── Fetchers ──

  const fetchActiveBriefs = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/briefs/active')
      if (!res.ok) { setBackendOffline(true); return }
      const data = await res.json()
      setBackendOffline(false)
      setActiveBriefs(data.data || [])
    } catch { setBackendOffline(true) }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/briefs/history')
      if (!res.ok) return
      const data = await res.json()
      setHistoryBriefs(data.data || [])
    } catch {}
  }, [])

  const fetchLastSession = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/session/last')
      if (!res.ok) return
      const data = await res.json()
      setLastSession(data.data || null)
    } catch {}
  }, [])

  const fetchSessionStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/strategic-council/session/status')
      if (!res.ok) return
      const data = await res.json()
      setSessionRunning(data.data?.isRunning || false)
    } catch {}
  }, [])

  const fetchCouncil = useCallback(async () => {
    setCouncilLoading(true)
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, language: locale }),
        signal: AbortSignal.timeout(45000),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.success && data.data) {
        setCouncilResult(data.data)
      }
    } catch {}
    setCouncilLoading(false)
  }, [selectedSymbol, locale])

  const triggerSession = useCallback(async () => {
    setTriggerLoading(true)
    try {
      const res = await fetch('/api/strategic-council/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'], language: locale }),
      })
      const data = await res.json()
      if (data.data?.status === 'processing') {
        setSessionRunning(true)
      }
    } catch {}
    setTriggerLoading(false)
  }, [locale])

  // ── Effects ──

  useEffect(() => {
    Promise.all([fetchActiveBriefs(), fetchLastSession(), fetchSessionStatus()]).finally(() => setLoading(false))
    fetchHistory()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchActiveBriefs()
      fetchLastSession()
      fetchSessionStatus()
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchActiveBriefs, fetchLastSession, fetchSessionStatus])

  useEffect(() => {
    if (sessionRunning) {
      const interval = setInterval(() => {
        fetchSessionStatus()
        fetchActiveBriefs()
        fetchLastSession()
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [sessionRunning, fetchSessionStatus, fetchActiveBriefs, fetchLastSession])

  // ── Filtered briefs ──
  const filteredActive = useMemo(() => {
    if (filterDir === 'ALL') return activeBriefs
    return activeBriefs.filter(b => b.direction === filterDir)
  }, [activeBriefs, filterDir])

  const filteredHistory = useMemo(() => {
    if (filterDir === 'ALL') return historyBriefs
    return historyBriefs.filter(b => b.direction === filterDir)
  }, [historyBriefs, filterDir])

  // ── Performance stats from history ──
  const perfStats = useMemo(() => {
    const executed = historyBriefs.filter(b => b.reviewStatus === 'EXECUTED')
    const cancelled = historyBriefs.filter(b => b.reviewStatus === 'CANCELLED')
    const total = historyBriefs.length
    const buyCount = historyBriefs.filter(b => b.direction === 'BUY').length
    const sellCount = historyBriefs.filter(b => b.direction === 'SELL').length
    return { total, executed: executed.length, cancelled: cancelled.length, buyCount, sellCount }
  }, [historyBriefs])

  // ── Symbols for council ──
  const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT']

  if (loading) {
    return (
      <SubPageLayout title={t('councilTitle') || 'المجلس الاستراتيجي'} icon="🏛️">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Loader2 size={32} className="animate-spin" style={{ color: C.purple }} />
        </div>
      </SubPageLayout>
    )
  }

  return (
    <SubPageLayout title={t('councilTitle') || 'المجلس الاستراتيجي'} icon="🏛️">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 12px' }}>
        {/* ═══ Header ═══ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(135deg, ${C.purple}30, ${C.cyan}20)`,
              border: `1px solid ${C.purple}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Brain size={20} style={{ color: C.purple }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
                {t('councilTitle') || 'المجلس الاستراتيجي'}
              </div>
              <div style={{ fontSize: 11, color: C.text3 }}>
                {activeBriefs.length} بريف نشط · {lastSession ? formatTime(lastSession.timestamp) : '—'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={triggerSession}
              disabled={triggerLoading || sessionRunning}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: sessionRunning ? `${C.amber}15` : `${C.purple}15`,
                border: `1px solid ${sessionRunning ? C.amber + '40' : C.purple + '40'}`,
                color: sessionRunning ? C.amber : C.purple,
                cursor: triggerLoading || sessionRunning ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {triggerLoading || sessionRunning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              {sessionRunning ? 'جاري التحليل...' : 'تشغيل جلسة'}
            </button>
            <button
              onClick={() => { fetchActiveBriefs(); fetchLastSession(); fetchHistory() }}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: `${C.cyan}10`, border: `1px solid ${C.cyan}30`,
                color: C.cyan, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <RefreshCw size={14} />
              تحديث
            </button>
          </div>
        </div>

        {/* ═══ Backend Offline Banner ═══ */}
        {backendOffline && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 12,
            background: `${C.amber}10`, border: `1px solid ${C.amber}30`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={16} style={{ color: C.amber }} />
            <span style={{ fontSize: 12, color: C.amber }}>الخادم غير متاح — يتم المحاولة تلقائياً</span>
          </div>
        )}

        {/* ═══ Last Session Summary ═══ */}
        {lastSession && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 8, marginBottom: 16,
          }}>
            <SessionStat label="الوقت" value={formatTime(lastSession.timestamp)} icon={<Clock size={12} />} color={C.text2} />
            <SessionStat label="الأزواج" value={String(lastSession.pairsAnalyzed)} icon={<Activity size={12} />} color={C.cyan} />
            <SessionStat label="بريفات جديدة" value={String(lastSession.briefsIssued)} icon={<Zap size={12} />} color={C.green} />
            <SessionStat label="مُعدّلة" value={String(lastSession.briefsModified)} icon={<RefreshCw size={12} />} color={C.amber} />
            <SessionStat label="ملغاة" value={String(lastSession.briefsCancelled)} icon={<XCircle size={12} />} color={C.red} />
            <SessionStat label="منفّذة" value={String(lastSession.briefsExecuted || 0)} icon={<CheckCircle2 size={12} />} color={C.purple} />
            <SessionStat label="المدة" value={formatDuration(lastSession.durationMs)} icon={<Timer size={12} />} color={C.text2} />
          </div>
        )}

        {/* ═══ Tabs ═══ */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 12,
          background: C.bg, padding: '4px', borderRadius: 10,
          border: `1px solid ${C.border}`,
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
                flex: 1, padding: '8px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                background: tab === key ? `${C.purple}15` : 'transparent',
                border: tab === key ? `1px solid ${C.purple}30` : '1px solid transparent',
                color: tab === key ? C.purple : C.text3,
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {label}
              {count !== null && count > 0 && (
                <span style={{
                  padding: '1px 6px', borderRadius: 10, fontSize: 10,
                  background: tab === key ? `${C.purple}20` : `${C.dim}20`,
                  color: tab === key ? C.purple : C.text3,
                }}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ Tab Content ═══ */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >

          {/* ── Active Briefs Tab ── */}
          {tab === 'active' && (
            <div>
              {/* Direction Filter */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {(['ALL', 'BUY', 'SELL'] as FilterDir[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setFilterDir(d)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: filterDir === d ? `${directionColor[d] || C.cyan}15` : `${C.dim}10`,
                      border: `1px solid ${filterDir === d ? (directionColor[d] || C.cyan) + '30' : C.border}`,
                      color: filterDir === d ? (directionColor[d] || C.cyan) : C.text3,
                      cursor: 'pointer',
                    }}
                  >
                    {d === 'ALL' ? 'الكل' : d === 'BUY' ? '▲ شراء' : '▼ بيع'}
                  </button>
                ))}
              </div>

              {filteredActive.length === 0 ? (
                <EmptyState text="لا توجد بريفات نشطة" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredActive.map(brief => (
                    <BriefCard
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

          {/* ── History Tab ── */}
          {tab === 'history' && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {(['ALL', 'BUY', 'SELL'] as FilterDir[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setFilterDir(d)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: filterDir === d ? `${directionColor[d] || C.cyan}15` : `${C.dim}10`,
                      border: `1px solid ${filterDir === d ? (directionColor[d] || C.cyan) + '30' : C.border}`,
                      color: filterDir === d ? (directionColor[d] || C.cyan) : C.text3,
                      cursor: 'pointer',
                    }}
                  >
                    {d === 'ALL' ? 'الكل' : d === 'BUY' ? '▲ شراء' : '▼ بيع'}
                  </button>
                ))}
              </div>

              {filteredHistory.length === 0 ? (
                <EmptyState text="لا يوجد سجل بعد" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredHistory.slice(0, 50).map(brief => (
                    <BriefCard
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

          {/* ── Consensus Tab ── */}
          {tab === 'consensus' && (
            <div>
              {/* Symbol Selector */}
              <div style={{
                display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap',
              }}>
                {SYMBOLS.map(sym => (
                  <button
                    key={sym}
                    onClick={() => { setSelectedSymbol(sym); setCouncilResult(null) }}
                    style={{
                      padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      fontFamily: 'monospace',
                      background: selectedSymbol === sym ? `${C.purple}15` : `${C.dim}08`,
                      border: `1px solid ${selectedSymbol === sym ? C.purple + '30' : C.border}`,
                      color: selectedSymbol === sym ? C.purple : C.text3,
                      cursor: 'pointer',
                    }}
                  >
                    {sym}
                  </button>
                ))}
              </div>

              {/* Fetch Council Button */}
              {!councilResult && !councilLoading && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <button
                    onClick={fetchCouncil}
                    style={{
                      padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                      background: `linear-gradient(135deg, ${C.purple}20, ${C.cyan}15)`,
                      border: `1px solid ${C.purple}30`,
                      color: C.purple, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <Brain size={18} />
                    تحليل {selectedSymbol} بـ AI Council
                  </button>
                </div>
              )}

              {councilLoading && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Loader2 size={28} className="animate-spin" style={{ color: C.purple }} />
                  <div style={{ marginTop: 12, fontSize: 12, color: C.text3 }}>
                    المجلس يحلل {selectedSymbol}...
                  </div>
                </div>
              )}

              {councilResult && (
                <ConsensusView result={councilResult} symbol={selectedSymbol} onRefresh={fetchCouncil} />
              )}
            </div>
          )}

          {/* ── Performance Tab ── */}
          {tab === 'performance' && (
            <div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10, marginBottom: 16,
              }}>
                <PerfStat label="إجمالي البريفات" value={perfStats.total} color={C.cyan} icon={<BarChart3 size={16} />} />
                <PerfStat label="منفّذة" value={perfStats.executed} color={C.green} icon={<CheckCircle2 size={16} />} />
                <PerfStat label="ملغاة" value={perfStats.cancelled} color={C.red} icon={<XCircle size={16} />} />
                <PerfStat label="شراء" value={perfStats.buyCount} color={C.green} icon={<TrendingUp size={16} />} />
                <PerfStat label="بيع" value={perfStats.sellCount} color={C.red} icon={<TrendingDown size={16} />} />
              </div>

              {/* Status Distribution */}
              {historyBriefs.length > 0 && (
                <div style={{
                  background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text2, marginBottom: 12 }}>
                    توزيع حالات البريفات
                  </div>
                  <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 6, overflow: 'hidden' }}>
                    {(['EXECUTED', 'ACTIVE', 'MODIFIED', 'CANCELLED'] as const).map(status => {
                      const count = historyBriefs.filter(b => b.reviewStatus === status).length
                      const pct = (count / historyBriefs.length) * 100
                      if (pct === 0) return null
                      return (
                        <div
                          key={status}
                          style={{
                            width: `${pct}%`, background: statusColor[status] + '60',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#fff',
                          }}
                          title={`${statusLabel[status]}: ${count} (${pct.toFixed(0)}%)`}
                        >
                          {pct > 8 ? `${count}` : ''}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                    {(['EXECUTED', 'ACTIVE', 'MODIFIED', 'CANCELLED'] as const).map(status => (
                      <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: statusColor[status] }} />
                        <span style={{ fontSize: 10, color: C.text3 }}>{statusLabel[status]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {historyBriefs.length === 0 && (
                <EmptyState text="لا توجد بيانات أداء بعد" />
              )}
            </div>
          )}

          </motion.div>
        </AnimatePresence>
      </div>
    </SubPageLayout>
  )
}

// ── Sub-components ──

function SessionStat({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      background: C.card, borderRadius: 8, padding: '8px 10px',
      border: `1px solid ${C.border}`, textAlign: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 9, color: C.text3, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 13, color, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function PerfStat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: C.card, borderRadius: 10, padding: 14,
      border: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    }}>
      <div style={{ color }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.text3 }}>{label}</div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center',
    }}>
      <Brain size={32} style={{ color: C.dim, marginBottom: 12 }} />
      <div style={{ fontSize: 12, color: C.text3 }}>{text}</div>
    </div>
  )
}

function BriefCard({ brief, expanded, onToggle, compact }: {
  brief: TradingBrief
  expanded: boolean
  onToggle: () => void
  compact?: boolean
}) {
  const dirCol = directionColor[brief.direction]
  const slDistance = brief.direction === 'BUY'
    ? ((brief.entryPrice - brief.stopLoss) / brief.entryPrice) * 100
    : ((brief.stopLoss - brief.entryPrice) / brief.entryPrice) * 100
  const tpDistance = brief.direction === 'BUY'
    ? ((brief.takeProfit - brief.entryPrice) / brief.entryPrice) * 100
    : ((brief.entryPrice - brief.takeProfit) / brief.entryPrice) * 100
  const rr = slDistance > 0 ? (tpDistance / slDistance).toFixed(2) : '—'

  return (
    <div style={{
      background: C.card, borderRadius: 10,
      border: `1px solid ${brief.reviewStatus === 'ACTIVE' ? C.borderActive : C.border}`,
      overflow: 'hidden', transition: 'all 0.2s',
    }}>
      {/* Top Row */}
      <div
        onClick={onToggle}
        style={{
          padding: '10px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        {/* Direction Badge */}
        <div style={{
          padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 800,
          background: `${dirCol}18`, color: dirCol,
          minWidth: 36, textAlign: 'center',
        }}>
          {directionIcon[brief.direction]} {directionLabel[brief.direction]}
        </div>

        {/* Pair */}
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>
          {brief.pair}
        </span>

        {/* Timeframe */}
        <span style={{
          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
          background: `${timeframeColor[brief.timeframe] || C.dim}15`,
          color: timeframeColor[brief.timeframe] || C.dim,
        }}>
          {brief.timeframe}
        </span>

        {/* Status Badge (non-active only) */}
        {brief.reviewStatus !== 'ACTIVE' && (
          <span style={{
            padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
            background: `${statusColor[brief.reviewStatus]}15`,
            color: statusColor[brief.reviewStatus],
          }}>
            {statusLabel[brief.reviewStatus]}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 50, height: 4, background: `${C.dim}20`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${brief.confidence}%`, height: '100%',
              background: brief.confidence >= 80 ? C.green : brief.confidence >= 60 ? C.amber : C.red,
              borderRadius: 2,
            }} />
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: brief.confidence >= 80 ? C.green : brief.confidence >= 60 ? C.amber : C.red,
            minWidth: 28,
          }}>{brief.confidence}%</span>
        </div>

        {/* Time */}
        <span style={{ fontSize: 9, color: C.text3 }}>
          {timeAgo(brief.issuedAt)}
        </span>

        {/* Expand Icon */}
        {expanded ? <ChevronUp size={14} style={{ color: C.text3 }} /> : <ChevronDown size={14} style={{ color: C.text3 }} />}
      </div>

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
              padding: '12px 14px', borderTop: `1px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* Price Grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
              }}>
                <PriceBox label="الدخول" value={formatPrice(brief.entryPrice)} color={C.text} icon={<Target size={11} />} />
                <PriceBox label="وقف الخسارة" value={formatPrice(brief.stopLoss)} color={C.red} sub={`${slDistance.toFixed(1)}%`} icon={<Shield size={11} />} />
                <PriceBox label="جني الأرباح" value={formatPrice(brief.takeProfit)} color={C.green} sub={`${tpDistance.toFixed(1)}%`} icon={<DollarSign size={11} />} />
                <PriceBox label="العائد/المخاطرة" value={`1:${rr}`} color={C.cyan} icon={<BarChart3 size={11} />} />
              </div>

              {/* Time Info */}
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.text3 }}>
                <span>⏰ أُصدر: {formatTime(brief.issuedAt)}</span>
                <span>⏳ ينتهي: {timeLeft(brief.expiresAt)}</span>
                <span>🔍 آخر مراجعة: {timeAgo(brief.lastReviewedAt)}</span>
              </div>

              {/* Strict Rules */}
              {brief.strictRules && (
                <div style={{
                  background: `${C.dim}08`, borderRadius: 6, padding: '8px 10px',
                  display: 'flex', gap: 12, fontSize: 10, color: C.text3, flexWrap: 'wrap',
                }}>
                  {brief.strictRules.maxEntryPrice && (
                    <span>أقصى دخول: <b style={{ color: C.text }}>{formatPrice(brief.strictRules.maxEntryPrice)}</b></span>
                  )}
                  {brief.strictRules.minEntryPrice && (
                    <span>أدنى دخول: <b style={{ color: C.text }}>{formatPrice(brief.strictRules.minEntryPrice)}</b></span>
                  )}
                  <span>انزلاق مسموح: <b style={{ color: C.text }}>{(brief.strictRules.maxSlippage * 100).toFixed(1)}%</b></span>
                </div>
              )}

              {/* AI Analysis Summary — THE MISSING FIELD */}
              {brief.analysisSummary && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.purple, marginBottom: 6 }}>
                    🧠 تحليل المجلس
                  </div>
                  <div style={{
                    background: `${C.purple}08`, borderRadius: 8, padding: '10px 12px',
                    border: `1px solid ${C.purple}15`,
                    fontSize: 11, color: C.text2, lineHeight: 1.6,
                    maxHeight: expanded ? 300 : 0, overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {brief.analysisSummary}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact mode: show prices inline */}
      {compact && !expanded && (
        <div style={{
          padding: '0 14px 8px', display: 'flex', gap: 12, fontSize: 10, color: C.text3,
        }}>
          <span>دخول: <b style={{ color: C.text }}>{formatPrice(brief.entryPrice)}</b></span>
          <span>SL: <b style={{ color: C.red }}>{formatPrice(brief.stopLoss)}</b></span>
          <span>TP: <b style={{ color: C.green }}>{formatPrice(brief.takeProfit)}</b></span>
        </div>
      )}
    </div>
  )
}

function PriceBox({ label, value, color, sub, icon }: { label: string; value: string; color: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: `${C.dim}06`, borderRadius: 8, padding: '8px 10px',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 9, color: C.text3, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ConsensusView({ result, symbol, onRefresh }: {
  result: CouncilResult
  symbol: string
  onRefresh: () => void
}) {
  const recColor = directionColor[result.recommendation] || C.amber
  const recLabel = result.recommendation === 'BUY' ? 'شراء قوي' :
    result.recommendation === 'SELL' ? 'بيع قوي' : 'انتظار'
  const fullLabel = result.consensusScore >= 75 ? recLabel :
    result.recommendation === 'BUY' ? 'شراء' :
    result.recommendation === 'SELL' ? 'بيع' : 'انتظار'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Consensus Score */}
      <div style={{
        background: `linear-gradient(135deg, ${recColor}10, ${C.card})`,
        borderRadius: 12, padding: 20, border: `1px solid ${recColor}25`,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>{symbol} — توصية المجلس</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: recColor, marginBottom: 8 }}>
          {fullLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 200, height: 8, background: `${C.dim}20`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${result.consensusScore}%`, height: '100%',
              background: recColor, borderRadius: 4,
              boxShadow: `0 0 12px ${recColor}80`,
            }} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: recColor }}>{result.consensusScore}%</span>
        </div>
        {result.isFallback && (
          <div style={{ marginTop: 8, fontSize: 10, color: C.amber }}>
            ⚠️ المجلس يعمل في وضع احتياطي (نماذج AI غير متاحة)
          </div>
        )}
        {result.source === 'nestjs' && (
          <div style={{ marginTop: 6, fontSize: 10, color: C.green }}>
            ✓ إجماع حقيقي من {result.analyses?.length || 0} نماذج AI
          </div>
        )}
      </div>

      {/* Vote Distribution */}
      {result.analyses && result.analyses.length > 0 && (
        <div style={{
          background: C.card, borderRadius: 10, padding: 14,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>
            🗳️ توزيع تصويت الأدوار ({result.analyses.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.analyses.map((vote, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6,
                background: `${C.dim}06`,
                borderLeft: `3px solid ${directionColor[vote.vote] || C.amber}`,
              }}>
                {/* Role */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{vote.role}</div>
                  <div style={{ fontSize: 9, color: C.text3 }}>{vote.model}</div>
                </div>

                {/* Vote */}
                <div style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800,
                  background: `${directionColor[vote.vote]}18`, color: directionColor[vote.vote],
                  minWidth: 50, textAlign: 'center',
                }}>
                  {directionIcon[vote.vote]} {directionLabel[vote.vote] || vote.vote}
                </div>

                {/* Confidence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 70 }}>
                  <div style={{ width: 40, height: 3, background: `${C.dim}20`, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${vote.confidence}%`, height: '100%',
                      background: vote.confidence >= 75 ? C.green : vote.confidence >= 50 ? C.amber : C.red,
                    }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.text2 }}>{vote.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Master Strategy */}
      {result.masterStrategy && (
        <div style={{
          background: `${C.cyan}08`, borderRadius: 10, padding: 14,
          border: `1px solid ${C.cyan}20`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.cyan, marginBottom: 8 }}>
            📋 الاستراتيجية الموحّدة
          </div>
          <div style={{
            fontSize: 11, color: C.text2, lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}>
            {result.masterStrategy}
          </div>
        </div>
      )}

      {/* Refresh */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onRefresh}
          style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: `${C.purple}10`, border: `1px solid ${C.purple}30`,
            color: C.purple, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={14} />
          إعادة تحليل
        </button>
      </div>
    </div>
  )
}
