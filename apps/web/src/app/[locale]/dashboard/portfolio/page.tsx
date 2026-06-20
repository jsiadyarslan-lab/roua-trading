'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl'

// Lazy-load AICoachPanel to avoid blocking initial render
// Uses error-safe dynamic import to prevent ReferenceError
// i18n: AICoachPanel fallbacks use hardcoded strings because dynamic() options
// are evaluated at module scope where hooks are unavailable. These are rarely shown.
const AICoachPanel = dynamic(
  () => import('@/components/portfolio/AICoachPanel').catch(() => ({
    default: () => (
      <div style={{ padding: 24, textAlign: 'center', background: T.card, borderRadius: 12 }}>
        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.red }}>
          {/* i18n: dashboard.portfolio.coachLoadError */}
          تعذر تحميل المُدرّب الذكي. يرجى تحديث الصفحة.
        </div>
      </div>
    ),
  })),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>{/* i18n: dashboard.portfolio.coachLoading */}جاري تحميل المُدرّب الذكي...</div>
      </div>
    ),
  },
)

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, BarChart, Bar,
} from 'recharts'
import { TrendingUp, TrendingDown, Award, Target, BarChart2, X as XIcon, Shield, Activity, RefreshCw, Loader2, AlertTriangle, ChevronRight, Clock, History, Brain, Download, FileText } from 'lucide-react'
import { usePaperTradesStore, ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { fetchPositionsUnified, fetchSummaryUnified, closePositionUnified } from '@/lib/api-fetch'
import { fmtPriceLocale } from '@/lib/price-format'
import {
  getJournalEntries, computeJournalStats, generateReportHTML,
  exportJournalJSON, getJournalEntryCount, clearJournal,
  type JournalEntry, type JournalStats,
} from '@/lib/charts/TradeJournal'

/* ── Theme ── */
import { T } from '@/lib/unified-tokens'

function fmt(n: number, decimals = 2) {
  // FIX V169: Protect against NaN/Infinity — these produce "NaN"/"Infinity" in toLocaleString
  if (!Number.isFinite(n)) return (0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const formatPrice = (value: number, symbol?: string) => {
  // FIX V169: Handle NaN and invalid values — show '—' instead of NaN
  if (!Number.isFinite(value) || value === 0) return '—'
  return fmtPriceLocale(value, symbol)
}

/* ── Types ── */
interface Position {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  exitPrice?: number
  currentPrice: number
  unrealizedPnl: number
  realizedPnl?: number
  exchange: string
  stopLoss?: number
  takeProfit?: number
  status?: string
  openedAt: string
  closedAt?: string
  source?: string // V140B: smart_executor / agent / auto_paper / user_manual
}

interface Trade {
  id: string
  symbol: string
  side: string
  type: string
  quantity: number
  price: number
  pnl: number | null
  fee: number | null
  feeCurrency: string | null
  executedAt: string
}

interface PositionSummary {
  totalPositions: number
  totalValue: number
  unrealizedPnl: number
  realizedPnl: number
}

/* ── Stat Card ── */
function StatCard({ label, value, sub, color, icon: Icon, note }: {
  label: string; value: string; sub?: string; color: string
  icon: any; note?: string
}) {
  return (
    <div style={{
      flex: 1, padding: '12px 14px',
      background: T.card,
      border: `0.5px solid ${color}22`,
      borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}66, transparent)`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text2 }}>{label}</span>
        <Icon size={13} color={color} strokeWidth={2} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 22, fontWeight: 800, color,
        letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && (
        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3 }}>{sub}</div>
      )}
      {note && (
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '1px 7px', borderRadius: 8,
          background: `${color}14`,
          fontFamily: "'Cairo', sans-serif", fontSize: 9.5, color,
          alignSelf: 'flex-start', marginTop: 2,
        }}>{note}</div>
      )}
    </div>
  )
}

/* ── Tab Button ── */
function TabButton({ label, active, onClick, icon: Icon, count }: {
  label: string; active: boolean; onClick: () => void; icon: any; count?: number
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8,
        background: active ? `${T.blue}18` : 'transparent',
        border: `0.5px solid ${active ? T.blue : T.border}`,
        color: active ? T.cyan : T.text2,
        fontFamily: "'Cairo', sans-serif", fontSize: 12, fontWeight: active ? 700 : 500,
        cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      <Icon size={14} />
      {label}
      {count !== undefined && (
        <span style={{
          padding: '1px 6px', borderRadius: 10,
          background: active ? T.blue : T.border,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: active ? T.text : T.text3,
        }}>{count}</span>
      )}
    </button>
  )
}

/* ── Custom tooltip ── */
function ChartTooltip({ active, payload, label, prefix = '$' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: T.bg2, border: `0.5px solid ${T.blue}44`,
      borderRadius: 8, padding: '6px 12px',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{ fontSize: 9, color: T.text2, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.cyan }}>
        {prefix}{payload[0].value.toLocaleString()}
      </div>
    </div>
  )
}

/* ── API Error Banner ── */
function ApiErrorBanner({ error, onRetry, retryLabel }: { error: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div style={{
      background: `${T.red}08`, border: `0.5px solid ${T.red}22`,
      borderRadius: 10, padding: '10px 14px', marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <AlertTriangle size={14} style={{ color: T.red, flexShrink: 0 }} />
      <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.red, flex: 1 }}>{error}</span>
      <button onClick={onRetry} style={{
        padding: '3px 10px', borderRadius: 5,
        background: `${T.red}18`, color: T.red,
        border: `0.5px solid ${T.red}44`,
        fontFamily: "'Cairo', sans-serif", fontSize: 9.5, cursor: 'pointer',
      }}>{retryLabel}</button>
    </div>
  )
}

function formatDuration(start: string | number, end: string | number) {
  if (!start || !end) return '-'
  const diff = new Date(end).getTime() - new Date(start).getTime()
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  return `${hours}h ${mins}m`
}

/* ── Main page ── */
export default function PortfolioPage() {
  const t = useTranslations('dashboard.portfolio')
  const tc = useTranslations('common')
  const [tab, setTab] = useState<'positions' | 'performance' | 'risk' | 'journal' | 'coach'>('positions')
  const [positions, setPositions] = useState<Position[]>([])
  const [closedPositions, setClosedPositions] = useState<Position[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [summary, setSummary] = useState<PositionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const { closedTrades: closedPaperTrades } = usePaperTradesStore()
  // V168: Use the shared positions store which merges API + paper trading positions
  // V189: Filter positions by active credential
  const storeAllPositions = usePositionsStore(s => s.positions)
  const storeActiveCredentialId = usePositionsStore(s => s.activeCredentialId)
  const storeGetActivePositions = usePositionsStore(s => s.getActivePositions)
  const storePositions = storeActiveCredentialId ? storeGetActivePositions() : storeAllPositions
  const storeAccount = usePositionsStore(s => s.account)
  const storeFetchPositions = usePositionsStore(s => s.fetchPositions)
  const storeFetchAccount = usePositionsStore(s => s.fetchAccount)

  // New states for P5 (Portfolio Optimization)
  const [searchQuery, setSearchQuery] = useState('')
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL')
  const [showPanicConfirm, setShowPanicConfirm] = useState(false)
  const [closingAll, setClosingAll] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // ── Journal state ──
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [journalStats, setJournalStats] = useState<JournalStats | null>(null)

  // Refresh journal data on mount and tab switch
  useEffect(() => {
    if (tab === 'journal' || journalEntries.length === 0) {
      setJournalEntries(getJournalEntries())
      setJournalStats(computeJournalStats())
    }
  }, [tab])

  // PDF export handler
  const handleExportPDF = useCallback(() => {
    const html = generateReportHTML()
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) {
      win.onload = () => {
        win.print()
      }
    }
    // Cleanup after delay
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }, [])

  // JSON export handler
  const handleExportJSON = useCallback(() => {
    const json = exportJournalJSON()
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `roua_journal_${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  // FIX: Inject scoped CSS via useEffect instead of <style> tag
  // <style> tags in client components cause "Node cannot be found" in Next.js 16
  useScopedStyle(`
    @media (max-width: 767px) {
      .portfolio-page-root { min-height: 100% !important; height: 100% !important; }
    }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: #0B0E14; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
    .portfolio-charts-row { display: flex; gap: 10px; margin-bottom: 12px; }
    .portfolio-distribution { flex: 0 0 300px; }
    .portfolio-tabs-row { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    @media (max-width: 767px) {
      .portfolio-charts-row { flex-direction: column !important; }
      .portfolio-distribution { flex: 0 0 auto !important; width: 100% !important; }
      .portfolio-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .portfolio-table-wrap > div { min-width: 700px; }
      .portfolio-table-wrap > div.mobile-cards-enabled { min-width: 0 !important; }
      .portfolio-stats-row { flex-wrap: wrap !important; }
      .portfolio-stats-row > * { flex: 1 1 calc(50% - 4px) !important; min-width: 140px; }
    }
  `)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const fetchPositions = useCallback(async () => {
    try {
      // V192: Use the shared store as primary source (respects activeCredentialId filtering)
      await storeFetchPositions()
      // Also fetch account to ensure activeCredentialId is loaded
      await storeFetchAccount()
      const storeP = usePositionsStore.getState()
      const filteredPositions = storeP.activeCredentialId
        ? storeP.getActivePositions()
        : storeP.positions
      const mappedPositions = filteredPositions.map((p: any) => ({
        id: p.id || p.dbId,
        symbol: p.symbol,
        side: p.side === 'long' ? 'BUY' : p.side === 'short' ? 'SELL' : p.side,
        quantity: Number(p.qty) || 0,
        entryPrice: Number(p.avgEntryPrice || p.entryPrice) || 0,
        currentPrice: Number(p.currentPrice) || 0,
        unrealizedPnl: Number(p.unrealizedPnl) || 0,
        exchange: p.exchange,
        stopLoss: Number(p.stopLoss || p.sl) || undefined,
        takeProfit: Number(p.takeProfit || p.tp) || undefined,
        openedAt: p.openedAt,
        source: p.source || p.tradeSource,
      })) as Position[]
      setPositions(mappedPositions)
      setApiError(null)
    } catch (e: unknown) {
      setApiError(`${t('connectionError')}: ${e instanceof Error ? e.message : t('unknown')}`)
    }
  }, [storeFetchPositions, storeFetchAccount])

  const fetchClosedPositions = useCallback(async () => {
    try {
      // V205: Pass credentialId to API for server-side filtering instead of client-side
      const activeCredId = usePositionsStore.getState().activeCredentialId
      const credParam = activeCredId ? `&credentialId=${encodeURIComponent(activeCredId)}` : ''
      const res = await fetch(`/api/trading/positions/history?limit=0${credParam}`)
      if (res.ok) {
        const data = await res.json()
        const allClosed = Array.isArray(data) ? data : (data.data || data.positions || [])
        // V205: Backend now filters by credentialId, so no need for client-side filtering
        setClosedPositions(allClosed)
      } else {
        // V207: Log API error instead of silently swallowing — helps debug why trades don't appear
        const errData = await res.json().catch(() => ({}))
        console.warn(`[Portfolio] Closed positions API error (${res.status}):`, errData?.error || errData?.message || res.statusText)
      }
    } catch (e: unknown) {
      // V207: Log network errors instead of silently swallowing
      console.warn('[Portfolio] Closed positions fetch failed:', e instanceof Error ? e.message : e)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      // V168: Use store account as primary source
      await storeFetchAccount()
      const acct = usePositionsStore.getState().account
      if (acct) {
        setSummary({
          totalPositions: positions.length,
          totalValue: Number(acct.equity) || Number(acct.totalValue) || 0,
          unrealizedPnl: Number(acct.unrealizedPnl) || 0,
          realizedPnl: Number(acct.realizedPnl) || 0,
        })
        return
      }
      // Fallback to unified fetch
      const result = await fetchSummaryUnified()
      if (result.summary) {
        setSummary(result.summary as PositionSummary)
      }
    } catch (_e: unknown) {
      // Error handled silently
    }
  }, [storeFetchAccount, positions.length])

  const fetchTrades = useCallback(async () => {
    try {
      // V205: Pass credentialId to API for server-side filtering
      const activeCredId = usePositionsStore.getState().activeCredentialId
      const credParam = activeCredId ? `&credentialId=${encodeURIComponent(activeCredId)}` : ''
      const res = await fetch(`/api/trading/trades?limit=0${credParam}`) // V331: fetch ALL trades, not just 100
      if (res.ok) {
        const data = await res.json()
        setTrades(Array.isArray(data) ? data : (data.data || data.trades || []))
      } else {
        // V207: Log API error instead of silently swallowing
        const errData = await res.json().catch(() => ({}))
        console.warn(`[Portfolio] Trades API error (${res.status}):`, errData?.error || errData?.message || res.statusText)
      }
    } catch (e: unknown) {
      // V207: Log network errors instead of silently swallowing
      console.warn('[Portfolio] Trades fetch failed:', e instanceof Error ? e.message : e)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setApiError(null)
    await Promise.all([fetchPositions(), fetchClosedPositions(), fetchSummary(), fetchTrades()])
    setLoading(false)
  }, [fetchPositions, fetchClosedPositions, fetchSummary, fetchTrades])

  useEffect(() => { fetchAll() }, [fetchAll])

  // V192: Sync positions when activeCredentialId changes (e.g., user switches account)
  useEffect(() => {
    const storeP = usePositionsStore.getState()
    const filteredPositions = storeP.activeCredentialId
      ? storeP.getActivePositions()
      : storeP.positions
    if (filteredPositions.length > 0 || storeP.positions.length === 0) {
      const mappedPositions = filteredPositions.map((p: any) => ({
        id: p.id || p.dbId,
        symbol: p.symbol,
        side: p.side === 'long' ? 'BUY' : p.side === 'short' ? 'SELL' : p.side,
        quantity: Number(p.qty) || 0,
        entryPrice: Number(p.avgEntryPrice || p.entryPrice) || 0,
        currentPrice: Number(p.currentPrice) || 0,
        unrealizedPnl: Number(p.unrealizedPnl) || 0,
        exchange: p.exchange,
        stopLoss: Number(p.stopLoss || p.sl) || undefined,
        takeProfit: Number(p.takeProfit || p.tp) || undefined,
        openedAt: p.openedAt,
        source: p.source || p.tradeSource,
      })) as Position[]
      setPositions(mappedPositions)
    }
  }, [storePositions, storeActiveCredentialId])

  // V205/V210: Re-fetch ALL data (open + closed + trades) when activeCredentialId changes
  // This ensures the portfolio immediately reflects the newly selected account's data
  useEffect(() => {
    // V210: Also re-fetch open positions from the store (which sends credentialId to API)
    storeFetchPositions()
    fetchClosedPositions()
    fetchTrades()
  }, [storeActiveCredentialId, storeFetchPositions, fetchClosedPositions, fetchTrades])

  const handleClosePosition = async (pos: Position) => {
    setClosing(pos.id)
    try {
      // FIX: Pass pos.id (UUID) as the primary ID so NestJS is tried first.
      // Also pass the symbol via the exchangeSymbol field for Alpaca fallback.
      // Previously, pos.symbol was passed, which skipped NestJS entirely
      // and went directly to Alpaca — causing 404 for DB-only positions.
      const result = await closePositionUnified(pos.id, undefined, { dbId: pos.id })
      if (result.success) {
        setPositions(prev => prev.filter(p => p.id !== pos.id))
        fetchSummary()
        fetchClosedPositions()
        fetchTrades()
      } else {
        setApiError(`${t('closePositionFailed')}: ${result.error || t('unknown')}`)
      }
    } catch (e: unknown) {
      setApiError(`${t('closePositionError')}: ${e instanceof Error ? e.message : t('unknown')}`)
    }
    setClosing(null)
  }

  const handleCloseAllPositions = async () => {
    setClosingAll(true)
    setApiError(null)
    try {
      const openPositions = positions.filter(p => p.status === 'OPEN' || p.status === undefined)
      let allSuccess = true
      
      for (const pos of openPositions) {
        // FIX: Pass pos.id (UUID) so NestJS is tried first
        const result = await closePositionUnified(pos.id, undefined, { dbId: pos.id })
        if (!result.success) {
          allSuccess = false
          setApiError(t('closePositionSymbolFailed', { symbol: pos.symbol }) + `: ${result.error || t('unknown')}`)
        }
      }
      
      if (allSuccess) {
        setPositions([]) // all closed
      } else {
        await fetchPositions() // fetch remaining open
      }
      
      await fetchSummary()
      await fetchClosedPositions()
      await fetchTrades()
      setShowPanicConfirm(false)
    } catch (e: unknown) {
      setApiError(`${t('closeAllPositionsError')}: ${e instanceof Error ? e.message : t('unknown')}`)
    }
    setClosingAll(false)
  }

  // ── V140: Time period filter for closed trades ──
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM'>('ALL')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // ── Computed date range based on period filter ──
  const getDateRange = useCallback(() => {
    const now = new Date()
    let from: Date | undefined
    let to: Date | undefined = now
    switch (periodFilter) {
      case 'DAY':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'WEEK':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
        break
      case 'MONTH':
        from = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'YEAR':
        from = new Date(now.getFullYear(), 0, 1)
        break
      case 'CUSTOM':
        from = customFrom ? new Date(customFrom) : undefined
        to = customTo ? new Date(customTo + 'T23:59:59') : now
        break
      default: // ALL
        from = undefined
        to = undefined
    }
    return { from, to }
  }, [periodFilter, customFrom, customTo])

  // ── V140: Filtered closed positions by date range ──
  const dateFilteredClosedPositions = useMemo(() => {
    const { from, to } = getDateRange()
    if (!from && !to) return closedPositions
    return closedPositions.filter(p => {
      // V331: If closedAt is missing, skip this position from date filtering rather than using openedAt
      const dateStr = p.closedAt || ''
      if (!dateStr) return true // No date at all — include it (don't exclude)
      const closedAt = new Date(dateStr).getTime()
      if (isNaN(closedAt)) return true // Invalid date — include it
      if (from && closedAt < from.getTime()) return false
      if (to && closedAt > to.getTime()) return false
      return true
    })
  }, [closedPositions, getDateRange])

  const dateFilteredTrades = useMemo(() => {
    const { from, to } = getDateRange()
    if (!from && !to) return trades
    return trades.filter(t => {
      const execAt = new Date(t.executedAt).getTime()
      if (from && execAt < from.getTime()) return false
      if (to && execAt > to.getTime()) return false
      return true
    })
  }, [trades, getDateRange])

  const dateFilteredPaperTrades = useMemo(() => {
    const { from, to } = getDateRange()
    if (!from && !to) return closedPaperTrades
    return closedPaperTrades.filter(p => {
      const closeTime = new Date(p.closeTime).getTime()
      if (from && closeTime < from.getTime()) return false
      if (to && closeTime > to.getTime()) return false
      return true
    })
  }, [closedPaperTrades, getDateRange])

  // ── Computed values (V140: uses date-filtered data) ──
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
  // FIX V140: Single source of truth for realized P&L — use closedPositions ONLY.
  // Previously summed from closedPositions + closedPaperTrades + trades, causing triple-counting.
  // Paper trades from localStorage are only added if NOT already in closedPositions (deduped).
  const dedupedPaperPnl = dateFilteredPaperTrades
    .filter(t => !dateFilteredClosedPositions.some(p =>
      p.symbol === t.symbol && Math.abs((p.entryPrice || 0) - t.entryPrice) < 0.01
    ))
    .reduce((sum, p) => sum + (p.realizedPnl || 0), 0)
  // FIX V169: Add NaN protection — Number(x) || 0 catches NaN (NaN is falsy)
  const totalRealizedPnl = Number(dateFilteredClosedPositions.reduce((sum, p) => sum + (Number(p.realizedPnl) || 0), 0) + dedupedPaperPnl) || 0
  // FIX V140: totalTradePnl now uses the same deduped logic
  const totalTradePnl = Number(dateFilteredClosedPositions.reduce((sum, p) => sum + (Number(p.realizedPnl) || 0), 0) + dedupedPaperPnl) || 0
  // FIX V140: Win rate uses combined history (deduped), not separate arrays
  const winningCount = dateFilteredClosedPositions.filter(p => (p.realizedPnl || 0) > 0).length
    + dateFilteredPaperTrades.filter(p => (p.realizedPnl || 0) > 0 && !dateFilteredClosedPositions.some(cp => cp.symbol === p.symbol && Math.abs((cp.entryPrice || 0) - p.entryPrice) < 0.01)).length
  const losingCount = dateFilteredClosedPositions.filter(p => (p.realizedPnl || 0) < 0).length
    + dateFilteredPaperTrades.filter(p => (p.realizedPnl || 0) < 0 && !dateFilteredClosedPositions.some(cp => cp.symbol === p.symbol && Math.abs((cp.entryPrice || 0) - p.entryPrice) < 0.01)).length
  const totalTradeCount = dateFilteredClosedPositions.length + dateFilteredPaperTrades.filter(t => !dateFilteredClosedPositions.some(p => p.symbol === t.symbol && Math.abs((p.entryPrice || 0) - t.entryPrice) < 0.01)).length
  const winRate = totalTradeCount > 0 ? (winningCount / totalTradeCount) * 100 : 0

  // FIX V169: Total profit/loss size — with NaN protection
  const totalProfitSize = Number(dateFilteredClosedPositions.filter(p => (Number(p.realizedPnl) || 0) > 0).reduce((sum, p) => sum + (Number(p.realizedPnl) || 0), 0)
    + dateFilteredPaperTrades.filter(p => (Number(p.realizedPnl) || 0) > 0 && !dateFilteredClosedPositions.some(cp => cp.symbol === p.symbol && Math.abs((Number(cp.entryPrice) || 0) - p.entryPrice) < 0.01)).reduce((sum, p) => sum + (Number(p.realizedPnl) || 0), 0)) || 0
  const totalLossSize = Number(dateFilteredClosedPositions.filter(p => (Number(p.realizedPnl) || 0) < 0).reduce((sum, p) => sum + Math.abs(Number(p.realizedPnl) || 0), 0)
    + dateFilteredPaperTrades.filter(p => (Number(p.realizedPnl) || 0) < 0 && !dateFilteredClosedPositions.some(cp => cp.symbol === p.symbol && Math.abs((Number(cp.entryPrice) || 0) - p.entryPrice) < 0.01)).reduce((sum, p) => sum + Math.abs(Number(p.realizedPnl) || 0), 0)) || 0

  // V169: P&L breakdown by source type (SMART/AGENT/PAPER/MANUAL)
  const pnlByCategory = useMemo(() => {
    const categories: Record<string, { label: string; color: string; pnl: number; count: number; wins: number }> = {
      SMART: { label: t('categorySmart'), color: T.amber, pnl: 0, count: 0, wins: 0 },
      AGENT: { label: t('categoryAgent'), color: T.purple, pnl: 0, count: 0, wins: 0 },
      PAPER: { label: t('categoryPaper'), color: T.cyan, pnl: 0, count: 0, wins: 0 },
      MANUAL: { label: t('categoryManual'), color: T.text2, pnl: 0, count: 0, wins: 0 },
    }
    // From DB closed positions
    dateFilteredClosedPositions.forEach(p => {
      const cat = p.source === 'smart_executor' ? 'SMART'
        : p.source === 'agent' ? 'AGENT'
        : p.source === 'auto_paper' ? 'PAPER' : 'MANUAL'
      const pnl = Number(p.realizedPnl) || 0
      categories[cat].pnl += pnl
      categories[cat].count++
      if (pnl > 0) categories[cat].wins++
    })
    // From localStorage paper trades (deduped)
    dateFilteredPaperTrades
      .filter(t => !dateFilteredClosedPositions.some(cp => cp.symbol === t.symbol && Math.abs((Number(cp.entryPrice) || 0) - t.entryPrice) < 0.01))
      .forEach(t => {
        const pnl = Number(t.realizedPnl) || 0
        categories.PAPER.pnl += pnl
        categories.PAPER.count++
        if (pnl > 0) categories.PAPER.wins++
      })
    return Object.entries(categories).filter(([, v]) => v.count > 0)
  }, [dateFilteredClosedPositions, dateFilteredPaperTrades])

  // V168: Export functions
  const exportToCSV = useCallback((data: any[], filename: string) => {
    if (data.length === 0) return
    const headers = Object.keys(data[0])
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h]
        // Escape quotes and wrap in quotes if contains comma
        const str = String(val ?? '')
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
      }).join(','))
    ]
    const blob = new Blob(['\ufeff' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const exportOpenPositions = useCallback(() => {
    const data = positions.map(p => ({
      [t('csvPair')]: p.symbol,
      [t('csvDirection')]: p.side === 'BUY' ? tc('buy') : tc('sell'),
      [t('csvQuantity')]: p.quantity,
      [t('csvEntryPrice')]: p.entryPrice,
      [t('csvCurrentPrice')]: p.currentPrice,
      [t('csvStopLoss')]: p.stopLoss || '',
      [t('csvTakeProfit')]: p.takeProfit || '',
      'P&L': p.unrealizedPnl || 0,
      [t('csvDateOpened')]: p.openedAt || '',
      // V331: Translate source to Arabic label instead of raw English enum
      [t('csvSource')]: p.source === 'smart_executor' ? 'منفذ ذكي' :
                        p.source === 'agent' ? 'وكيل مستقل' :
                        p.source === 'auto_paper' ? 'ورقي' :
                        p.source === 'mt5_sync' || p.source === 'reconciliation' ? 'مزامنة MT5' :
                        p.source || 'يدوي',
    }))
    exportToCSV(data, 'open_positions')
  }, [positions, exportToCSV])

  const exportClosedTrades = useCallback((data: any[]) => {
    const csvData = data.map(trade => ({
      [t('csvPair')]: trade.symbol,
      [t('csvDirection')]: trade.side === 'BUY' ? tc('buy') : tc('sell'),
      [t('csvType')]: trade.type,
      [t('csvQuantity')]: trade.quantity,
      [t('csvEntryPrice')]: trade.price,
      [t('csvExitPrice')]: trade.exitPrice || '',
      'P&L': trade.pnl || 0,
      [t('csvCloseReason')]: trade.exitReason || '',
      [t('csvDateOpened')]: trade.openedAt || '',
      [t('csvDateClosed')]: trade.executedAt,
    }))
    exportToCSV(csvData, 'closed_trades')
  }, [exportToCSV])

  // ── Performance chart data (daily P&L from trades + closed paper trades) ──
  const performanceData = (() => {
    const dailyMap: Record<string, { date: string; pnl: number; trades: number }> = {}
    // V331: Use closedPositions (from DB) for daily P&L — NOT the raw trades array
    // This prevents double-counting: closedPositions already includes deduped paper trades
    dateFilteredClosedPositions.forEach(p => {
      const dateStr = p.closedAt || p.openedAt
      if (!dateStr) return
      const day = new Date(dateStr).toISOString().split('T')[0]
      if (!dailyMap[day]) dailyMap[day] = { date: day, pnl: 0, trades: 0 }
      dailyMap[day].pnl += (Number(p.realizedPnl) || 0)
      dailyMap[day].trades++
    })
    // V331: Only add paper trades that are NOT already in closedPositions (deduped)
    const dbPositionIds = new Set(closedPositions.map(p => p.id))
    closedPaperTrades.forEach(p => {
      if (dbPositionIds.has(p.id)) return // Skip — already counted above
      const day = new Date(p.closeTime).toISOString().split('T')[0]
      if (!dailyMap[day]) dailyMap[day] = { date: day, pnl: 0, trades: 0 }
      dailyMap[day].pnl += (p.realizedPnl || 0)
      dailyMap[day].trades++
    })
    return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))
  })()

  // ── Equity curve (cumulative P&L) ──
  const equityCurve = (() => {
    let cumPnl = 0
    return performanceData.map(d => {
      cumPnl += d.pnl
      return { date: d.date, value: cumPnl }
    })
  })()

  // ── Distribution by symbol ──
  const distribution = (() => {
    const symMap: Record<string, number> = {}
    positions.forEach(p => { symMap[p.symbol] = (symMap[p.symbol] || 0) + Math.abs(p.unrealizedPnl || 0) })
    const total = Object.values(symMap).reduce((s, v) => s + v, 0) || 1
    const colors = ['#0A84FF', '#FFB800', '#F7931A', '#00FFA3', '#B388FF', '#FF4757', '#00D4FF']
    return Object.entries(symMap).map(([name, value], i) => ({
      name, value: Math.round((value / total) * 100), color: colors[i % colors.length],
    }))
  })()

  // ── Risk metrics ──
  const allPnlValues = [...trades.map(t => t.pnl || 0), ...closedPaperTrades.map(p => p.realizedPnl || 0)]
  // V331: Fixed avgWin/avgLoss — was dividing total PnL (includes losses) by winning count
  const winningPnlSum = dateFilteredClosedPositions.filter(p => (p.realizedPnl || 0) > 0).reduce((s, p) => s + (Number(p.realizedPnl) || 0), 0)
  const losingPnlSum = dateFilteredClosedPositions.filter(p => (p.realizedPnl || 0) < 0).reduce((s, p) => s + Math.abs(Number(p.realizedPnl) || 0), 0)
  const avgWin = winningCount > 0 ? winningPnlSum / winningCount : 0
  const avgLoss = losingCount > 0 ? losingPnlSum / losingCount : 0
  const profitFactor = avgLoss > 0 ? Math.min(avgWin / avgLoss, 999) : avgWin > 0 ? 999 : 0
  const maxDrawdown = (() => {
    let peak = 0, maxDD = 0, cumPnl = 0
    performanceData.forEach(d => {
      cumPnl += d.pnl
      if (cumPnl > peak) peak = cumPnl
      const dd = peak - cumPnl
      if (dd > maxDD) maxDD = dd
    })
    return maxDD
  })()

  const sharpeRatio = (() => {
    if (performanceData.length < 2) return null
    const returns = performanceData.map(d => d.pnl)
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
    const stdDev = Math.sqrt(variance)
    return stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null
  })()

  // ── Combined and Filtered History ──
  // FIX: Only show CLOSED positions (status=CLOSED) from DB, not ENTRY trades.
  // Previously mixed Position records with paper trades from localStorage causing
  // duplicate entries. Now we only use closedPositions from the API (Position table)
  // and filter out paper trades that are already recorded in the Position table.
  const combinedHistory = [
    ...dateFilteredClosedPositions.map(p => {
      // V140: Derive exitPrice from trades relation or currentPrice or entryPrice
      const tradesData = (p as any).trades as Trade[] | undefined
      const exitTrade = tradesData?.find((t: Trade) => t.type === 'EXIT' || t.side !== p.side)
      const derivedExitPrice = (p as any).exitPrice
        ? Number((p as any).exitPrice)
        : exitTrade?.price
          ? Number(exitTrade.price)
          : undefined  // V331: DO NOT fall back to currentPrice — it's the last live quote, not the fill price
      // V331: Read closeReason directly from DB instead of guessing from price proximity
      const exitReason = (() => {
        const reason = (p as any).closeReason || ''
        const reasonUpper = reason.toUpperCase()
        if (reasonUpper.includes('STOP_LOSS') || reasonUpper === 'SL') return 'SL'
        if (reasonUpper.includes('TAKE_PROFIT') || reasonUpper === 'TP') return 'TP'
        if (reasonUpper.includes('LIQUIDATED')) return 'LIQ'
        if (reasonUpper.includes('AUTO_STALE') || reasonUpper.includes('STALE')) return 'STALE'
        if (reasonUpper.includes('EXCHANGE_SYNC')) return 'SYNC'
        if (reasonUpper.includes('AUTO_CLOSE') || reasonUpper.includes('TIME_EXPIRED')) return 'AUTO'
        if (reasonUpper.includes('STRATEGY_EXIT')) return 'STRATEGY'
        if (!reason) {
          // Fallback: only guess if DB has no closeReason at all
          if (p.stopLoss && derivedExitPrice) {
            const slPrice = Number(p.stopLoss)
            const exit = Number(derivedExitPrice)
            const isLong = p.side === 'BUY'
            if (isLong && exit <= slPrice * 1.001) return 'SL'
            if (!isLong && exit >= slPrice * 0.999) return 'SL'
          }
          if (p.takeProfit && derivedExitPrice) {
            const tpPrice = Number(p.takeProfit)
            const exit = Number(derivedExitPrice)
            const isLong = p.side === 'BUY'
            if (isLong && exit >= tpPrice * 0.999) return 'TP'
            if (!isLong && exit <= tpPrice * 1.001) return 'TP'
          }
          return 'MANUAL'
        }
        return 'MANUAL'
      })()

      return {
        id: p.id, symbol: p.symbol, side: p.side,
        type: p.source === 'smart_executor' ? 'SMART' :
              p.source === 'agent' ? 'AGENT' :
              p.source === 'auto_paper' ? 'PAPER' : 'MANUAL',
        quantity: Number(p.quantity) || 0,
        price: Number(p.entryPrice) || 0,  // FIX V169: Ensure entryPrice is a valid number
        pnl: Number(p.realizedPnl) || 0,
        exitPrice: derivedExitPrice,
        stopLoss: p.stopLoss ? Number(p.stopLoss) : undefined,
        takeProfit: p.takeProfit ? Number(p.takeProfit) : undefined,
        exitReason,
        fee: null, feeCurrency: null, executedAt: p.closedAt || null, // V331: null instead of openedAt fallback
        openedAt: p.openedAt
      }
    }),
    // FIX: Only include paper trades that are NOT already in closedPositions
    // (paper trades from the Smart Executor are recorded in DB, not localStorage)
    ...dateFilteredPaperTrades
      .filter(t => !dateFilteredClosedPositions.some(p =>
        p.symbol === t.symbol && Math.abs((p.entryPrice || 0) - t.entryPrice) < 0.01
      ))
      .map(t => ({
      id: t.id, symbol: t.symbol, side: t.side === 'long' ? 'BUY' : 'SELL', type: 'PAPER',
      quantity: t.qty, price: t.entryPrice, exitPrice: t.exitPrice, pnl: t.realizedPnl,
      fee: null, feeCurrency: null, executedAt: new Date(t.closeTime).toISOString(),
      openedAt: new Date(t.entryTime).toISOString()
    }))
  ].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())

  const filteredHistory = combinedHistory.filter(t => {
    if (searchQuery && !t.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (sideFilter !== 'ALL' && t.side !== sideFilter) return false
    if (statusFilter === 'WIN' && (t.pnl || 0) <= 0) return false
    if (statusFilter === 'LOSS' && (t.pnl || 0) >= 0) return false
    return true
  })

  return (
    <div className="portfolio-page-root" style={{
      width: '100%', minHeight: 'calc(100vh - 100px)',
      background: T.bg, overflow: 'auto',
      padding: '12px 14px', boxSizing: 'border-box',
      direction: 'inherit',
      fontFamily: "'Cairo', sans-serif",
    }}>
      {/* Scoped styles injected via useScopedStyle to avoid Next.js 16 "Node cannot be found" error */}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: T.blue }} />
        <h1 style={{
          fontFamily: "'Cairo', sans-serif", fontWeight: 900,
          fontSize: 18, color: T.text, margin: 0,
        }}>{t('title')}</h1>
        <div style={{ flex: 1 }} />
        {/* V168: Export buttons */}
        {(positions.length > 0 || filteredHistory.length > 0) && (
          <div style={{ display: 'flex', gap: 4 }}>
            {positions.length > 0 && (
              <button
                onClick={exportOpenPositions}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 7,
                  border: `0.5px solid ${T.green}44`, background: `${T.green}0d`,
                  color: T.green, fontFamily: "'Cairo', sans-serif",
                  fontSize: 9, cursor: 'pointer', transition: 'all 0.2s',
                }}
                title={t('exportOpenCSV')}
              >
                <Download size={10} />
                {t('open')}
              </button>
            )}
            {filteredHistory.length > 0 && (
              <button
                onClick={() => exportClosedTrades(filteredHistory)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 7,
                  border: `0.5px solid ${T.blue}44`, background: `${T.blue}0d`,
                  color: T.cyan, fontFamily: "'Cairo', sans-serif",
                  fontSize: 9, cursor: 'pointer', transition: 'all 0.2s',
                }}
                title={t('exportClosedCSV')}
              >
                <FileText size={10} />
                {t('closed')}
              </button>
            )}
          </div>
        )}
        <button
          onClick={fetchAll}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7,
            border: `0.5px solid ${T.border}`, background: T.card,
            color: T.text2, fontFamily: "'Cairo', sans-serif",
            fontSize: 10, cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> {tc('refresh')}
        </button>
      </div>

      {/* ── API Error Banner ── */}
      {apiError && <ApiErrorBanner error={apiError} onRetry={fetchAll} retryLabel={tc('retry')} />}

      {/* V193: MetaAPI down warning for MT5 accounts */}
      {usePositionsStore(s => s.account?.metaapiDown === true) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8, marginBottom: 8,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
          <AlertTriangle size={14} color="#f87171" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#f87171', fontFamily: "'Cairo', sans-serif" }}>
              MetaAPI غير متصل — حساب MT5 لا يمكنه جلب البيانات الحقيقية
            </div>
            <div style={{ fontSize: 8, color: T.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
              {usePositionsStore(s => s.account?.metaapiError)
                ? `${usePositionsStore(s => s.account?.metaapiError)}`
                : 'مفتاح METAAPI_TOKEN غير مضبوط أو غير صالح. يجب إضافته في متغيرات البيئة ليعمل حساب MT5 الحقيقي.'}
            </div>
            <div style={{ fontSize: 8, color: T.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2, opacity: 0.7 }}>
              💡 اذهب إلى الإعدادات → مفاتيح البورصات → اضغط زر فحص الاتصال للحصول على تفاصيل أكثر
            </div>
          </div>
        </div>
      )}
      {usePositionsStore(s => s.account?.isStaleBalance === true) && !usePositionsStore(s => s.account?.metaapiDown === true) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8, marginBottom: 8,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
        }}>
          <AlertTriangle size={14} color={T.amber} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.amber, fontFamily: "'Cairo', sans-serif" }}>
              بيانات مؤقتة — الرصيد من ذاكرة التخزين المؤقت
            </div>
            <div style={{ fontSize: 8, color: T.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
              فشل الاتصال بـ MetaAPI مؤقتاً. البيانات المعروضة قد لا تكون محدثة.
            </div>
            <div style={{ fontSize: 8, color: T.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2, opacity: 0.7 }}>
              💡 اذهب إلى الإعدادات → مفاتيح البورصات → اضغط زر فحص الاتصال للحصول على تفاصيل أكثر
            </div>
          </div>
        </div>
      )}

      {/* ── Stats cards ── */}
      <div className="portfolio-stats-row" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatCard
          label={t('openPositions')} value={String(positions.length)}
          color={T.cyan} icon={BarChart2}
          sub={`${t('value')}: $${fmt(summary?.totalValue || 0, 0)}`}
        />
        <StatCard
          label={t('unrealizedPnl')} value={`${totalUnrealizedPnl > 0 ? '+' : totalUnrealizedPnl < 0 ? '-' : ''}$${fmt(Math.abs(totalUnrealizedPnl), 2)}`}
          color={totalUnrealizedPnl > 0 ? T.green : totalUnrealizedPnl < 0 ? T.red : T.text2}
          icon={totalUnrealizedPnl > 0 ? TrendingUp : totalUnrealizedPnl < 0 ? TrendingDown : BarChart2}
        />
        <StatCard
          label={t('realizedProfit')} value={`${totalRealizedPnl > 0 ? '+' : totalRealizedPnl < 0 ? '-' : ''}$${fmt(Math.abs(totalRealizedPnl), 2)}`}
          color={totalRealizedPnl > 0 ? T.green : totalRealizedPnl < 0 ? T.red : T.text2}
          icon={TrendingUp}
          sub={`${closedPositions.length} ${t('closedTradeCount')}`}
        />
        <StatCard
          label={t('totalProfit')} value={`+$${fmt(totalProfitSize, 2)}`}
          color={T.green} icon={TrendingUp}
          sub={`${winningCount} ${t('winningTradeCount')}`}
        />
        <StatCard
          label={t('totalLoss')} value={`-$${fmt(totalLossSize, 2)}`}
          color={T.red} icon={TrendingDown}
          sub={`${losingCount} ${t('losingTradeCount')}`}
        />
        <StatCard
          label={t('winRate')} value={`${winRate.toFixed(1)}%`}
          sub={t('fromTradeCount', { count: totalTradeCount })}
          color={T.amber} icon={Target}
          note={winRate >= 60 ? t('excellent') : winRate >= 40 ? t('good') : undefined}
        />
        <StatCard
          label="Sharpe Ratio" value={sharpeRatio !== null ? sharpeRatio.toFixed(2) : '—'}
          color={T.purple} icon={Award}
        />
      </div>

      {/* V169: P&L by category breakdown */}
      {pnlByCategory.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {pnlByCategory.map(([key, cat]) => {
            const catPnl = Number(cat.pnl) || 0
            const catWinRate = cat.count > 0 ? (cat.wins / cat.count) * 100 : 0
            return (
              <div key={key} style={{
                flex: '1 1 140px', padding: '10px 12px',
                background: T.card,
                border: `0.5px solid ${cat.color}22`,
                borderRadius: 10,
                display: 'flex', flexDirection: 'column', gap: 3,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg, transparent, ${cat.color}66, transparent)`,
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: cat.color, fontWeight: 700 }}>{cat.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: T.text3 }}>{cat.count} {t('tradeCount')}</span>
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 16, fontWeight: 800,
                  color: catPnl > 0 ? T.green : catPnl < 0 ? T.red : T.text2,
                  letterSpacing: '-0.02em',
                }}>
                  {catPnl > 0 ? '+' : catPnl < 0 ? '-' : ''}${fmt(Math.abs(catPnl), 2)}
                </div>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>
                  {t('winRateLabel')}: {catWinRate.toFixed(0)}% ({cat.wins}/{cat.count})
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="portfolio-tabs-row" style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <TabButton label={t('tabTrades')} icon={Activity} active={tab === 'positions'} onClick={() => setTab('positions')} count={positions.length + combinedHistory.length} /> // V331: Use combinedHistory to avoid double-counting
        <TabButton label={t('tabPerformance')} icon={TrendingUp} active={tab === 'performance'} onClick={() => setTab('performance')} />
        <TabButton label={t('tabRisk')} icon={Shield} active={tab === 'risk'} onClick={() => setTab('risk')} />
        <TabButton label='سجل التداول' icon={FileText} active={tab === 'journal'} onClick={() => setTab('journal')} count={getJournalEntryCount()} />
        <TabButton label={t('tabCoach')} icon={Brain} active={tab === 'coach'} onClick={() => setTab('coach')} />
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* TAB: الصفقات                                  */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'positions' && (
        <>
          {/* Charts row */}
          <div className="portfolio-charts-row" style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {/* Distribution donut */}
            <div className="portfolio-distribution" style={{
              flex: '0 0 300px',
              background: T.card, border: `0.5px solid ${T.border}`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{
                fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                fontSize: 12, color: T.text, marginBottom: 8,
              }}>{t('positionDistribution')}</div>
              {distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={distribution}
                      innerRadius={55} outerRadius={85}
                      dataKey="value" nameKey="name"
                      stroke="none"
                    >
                      {distribution.map((entry, i) => (
                        <Cell key={entry.name + '-' + i} fill={entry.color} opacity={0.85} />
                      ))}
                    </Pie>
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val}%`, '']}
                      contentStyle={{ background: T.bg2, border: `0.5px solid ${T.border2}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>{t('noOpenPositions')}</span>
                </div>
              )}
            </div>

            {/* Equity curve */}
            <div style={{
              flex: 1,
              background: T.card, border: `0.5px solid ${T.border}`,
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{
                fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                fontSize: 12, color: T.text, marginBottom: 8,
              }}>{t('realizedProfitCurve')}</div>
              {equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={equityCurve}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={T.cyan} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={T.cyan} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="value" stroke={T.cyan} fill="url(#eqGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>{t('noPerformanceData')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="portfolio-table-wrap">
          {/* ── Open Positions table ── */}
          <div className={isMobile ? 'mobile-cards-enabled' : ''} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 10, overflow: 'hidden', marginBottom: 12,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '8px 14px', gap: 8,
              borderBottom: `0.5px solid ${T.border}`,
              background: `linear-gradient(90deg, ${T.green}0a, transparent)`,
            }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: T.green }} />
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                fontSize: 12, color: T.text, flex: 1,
              }}>{t('openTrades')}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text3 }}>
                {positions.length} {t('position')}
              </span>
              {positions.length > 0 && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: totalUnrealizedPnl > 0 ? T.green : totalUnrealizedPnl < 0 ? T.red : T.text2, fontWeight: 700,
                  marginInlineStart: 8,
                }}>
                  P&L: {totalUnrealizedPnl > 0 ? '+' : totalUnrealizedPnl < 0 ? '-' : ''}${fmt(Math.abs(totalUnrealizedPnl), 2)}
                </span>
              )}
            </div>

            {loading ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <Loader2 className="animate-spin" style={{ color: T.blue, margin: '0 auto' }} size={24} />
                <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3, marginTop: 8 }}>{tc('loading')}</p>
              </div>
            ) : positions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Activity size={28} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 8px' }} />
                <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3 }}>{t('noOpenTrades')}</p>
              </div>
            ) : isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
                {positions.map((pos) => (
                  <div key={pos.id} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `0.5px solid ${T.border}`,
                    borderRadius: 10, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: T.text }}>{pos.symbol}</span>
                        <span style={{
                          padding: '1px 6px', borderRadius: 4,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                          background: pos.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                          color: pos.side === 'BUY' ? T.green : T.red,
                          border: `0.5px solid ${pos.side === 'BUY' ? T.green : T.red}44`,
                        }}>{pos.side === 'BUY' ? t('buyArrow') : t('sellArrow')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13, fontWeight: 700,
                          color: (pos.unrealizedPnl || 0) > 0 ? T.green : (pos.unrealizedPnl || 0) < 0 ? T.red : T.text2,
                        }}>
                          {(pos.unrealizedPnl || 0) > 0 ? '+' : (pos.unrealizedPnl || 0) < 0 ? '-' : ''}${fmt(Math.abs(pos.unrealizedPnl || 0))}
                        </span>
                        <button onClick={() => handleClosePosition(pos)} disabled={closing === pos.id} style={{
                          padding: '4px 8px', borderRadius: 5,
                          background: `${T.red}18`, color: T.red,
                          border: `0.5px solid ${T.red}44`,
                          cursor: closing === pos.id ? 'wait' : 'pointer',
                          fontFamily: "'Cairo', sans-serif", fontSize: 9,
                          opacity: closing === pos.id ? 0.5 : 1,
                        }}>
                          <XIcon size={10} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 10 }}>
                      <div><span style={{ color: T.text3 }}>{t('quantityLabel')}: </span><span style={{ color: T.text2 }}>{pos.quantity}</span></div>
                      <div><span style={{ color: T.text3 }}>{t('entryLabel')}: </span><span style={{ color: T.text2 }}>{formatPrice(pos.entryPrice, pos.symbol)}</span></div>
                      <div><span style={{ color: T.text3 }}>{t('currentLabel')}: </span><span style={{ color: T.text, fontWeight: 700 }}>{pos.currentPrice ? formatPrice(pos.currentPrice, pos.symbol) : '—'}</span></div>
                      <div><span style={{ color: T.text3 }}>SL: </span><span style={{ color: T.red }}>{pos.stopLoss ? formatPrice(pos.stopLoss, pos.symbol) : '—'}</span></div>
                      <div><span style={{ color: T.text3 }}>TP: </span><span style={{ color: T.green }}>{pos.takeProfit ? formatPrice(pos.takeProfit, pos.symbol) : '—'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Table head */}
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <div role="table" aria-label={t('openTrades')} style={{ minWidth: 800 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 70px 70px 90px 90px 80px 80px 80px 80px',
                  padding: '5px 14px', gap: 0,
                  borderBottom: `0.5px solid ${T.border}`,
                }}>
                  {[t('headerPair'),t('headerDirection'),t('headerSize'),t('headerEntryPrice'),t('headerCurrentPrice'),'SL','TP','P&L',t('headerAction')].map((h) => (
                    <div key={h} style={{
                      fontFamily: "'Cairo', sans-serif", fontSize: 9.5,
                      color: T.text3, textAlign: 'center',
                    }}>{h}</div>
                  ))}
                </div>
                {/* Rows */}
                {positions.map((pos, i) => (
                  <div
                    key={pos.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 70px 70px 90px 90px 80px 80px 80px 80px',
                      padding: '7px 14px', gap: 0,
                      borderBottom: i < positions.length - 1 ? `0.5px solid ${T.border}` : 'none',
                      alignItems: 'center',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent',
                      transition: 'background 0.2s',
                      cursor: 'default'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent'}
                  >
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.symbol}</div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700,
                        background: pos.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                        color: pos.side === 'BUY' ? T.green : T.red,
                        border: `0.5px solid ${pos.side === 'BUY' ? T.green : T.red}44`,
                      }}>{pos.side === 'BUY' ? t('buyArrow') : t('sellArrow')}</span>
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.quantity}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatPrice(pos.entryPrice, pos.symbol)}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.currentPrice ? formatPrice(pos.currentPrice, pos.symbol) : '—'}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.red, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.stopLoss ? formatPrice(pos.stopLoss, pos.symbol) : '—'}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.green, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.takeProfit ? formatPrice(pos.takeProfit, pos.symbol) : '—'}</div>
                    <div style={{
                      textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11, fontWeight: 700,
                      color: (pos.unrealizedPnl || 0) > 0 ? T.green : (pos.unrealizedPnl || 0) < 0 ? T.red : T.text2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {(pos.unrealizedPnl || 0) > 0 ? '+' : (pos.unrealizedPnl || 0) < 0 ? '-' : ''}${fmt(Math.abs(pos.unrealizedPnl || 0))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleClosePosition(pos)}
                        disabled={closing === pos.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', borderRadius: 5,
                          background: `${T.red}18`, color: T.red,
                          border: `0.5px solid ${T.red}44`,
                          cursor: closing === pos.id ? 'wait' : 'pointer',
                          fontFamily: "'Cairo', sans-serif", fontSize: 9.5,
                          opacity: closing === pos.id ? 0.5 : 1,
                        }}
                      >
                        <XIcon size={9} />
                        {closing === pos.id ? '...' : tc('close')}
                      </button>
                    </div>
                  </div>
                ))}
                </div>
                </div>
              </>
            )}
          </div>

          {/* ── Closed Positions ── */}
          <div className={isMobile ? 'mobile-cards-enabled' : ''} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 10, overflow: 'hidden', marginBottom: 12,
          }}>
            <div
              onClick={() => setShowClosed(!showClosed)}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '8px 14px', gap: 8,
                borderBottom: showClosed ? `0.5px solid ${T.border}` : 'none',
                background: `linear-gradient(90deg, ${T.blue}0a, transparent)`,
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 3, height: 14, borderRadius: 2, background: T.blue }} />
              <History size={13} style={{ color: T.text3 }} />
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                fontSize: 12, color: T.text, flex: 1,
              }}>{t('closedTrades')}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text3 }}>
                {closedPositions.length + closedPaperTrades.length} {t('tradeCount')}
              </span>
              {totalRealizedPnl !== 0 && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: totalRealizedPnl > 0 ? T.green : totalRealizedPnl < 0 ? T.red : T.text2, fontWeight: 700,
                  marginInlineStart: 8,
                }}>
                  P&L: {totalRealizedPnl > 0 ? '+' : totalRealizedPnl < 0 ? '-' : ''}${fmt(Math.abs(totalRealizedPnl), 2)}
                </span>
              )}
              <ChevronRight size={14} style={{ color: T.text3, transform: showClosed ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
            </div>

            {showClosed && (
              filteredHistory.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <History size={28} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 8px' }} />
                  <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3 }}>{t('noMatchingClosedTrades')}</p>
                  <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginTop: 4 }}>{t('tryChangingFilters')}</p>
                </div>
              ) : (
                <>
                  {/* Filters Bar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, padding: '10px 14px',
                    borderBottom: `0.5px solid ${T.border}`, background: 'rgba(0,0,0,0.2)',
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                  }}>
                    {/* V140: Period filter — يومي/أسبوعي/شهري/سنوي/محدد */}
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {(['ALL','DAY','WEEK','MONTH','YEAR','CUSTOM'] as const).map(period => (
                        <button key={period} onClick={() => setPeriodFilter(period)} style={{
                          padding: '3px 8px', borderRadius: 5,
                          border: `0.5px solid ${periodFilter === period ? T.blue : T.border}`,
                          background: periodFilter === period ? `${T.blue}22` : T.bg,
                          color: periodFilter === period ? T.blue : T.text2,
                          fontFamily: "'Cairo', sans-serif", fontSize: 9, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                          {{ ALL: t('periodAll'), DAY: t('periodDaily'), WEEK: t('periodWeekly'), MONTH: t('periodMonthly'), YEAR: t('periodYearly'), CUSTOM: t('periodCustom') }[period]}
                        </button>
                      ))}
                    </div>
                    {/* V140: Custom date range inputs */}
                    {periodFilter === 'CUSTOM' && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{
                          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5,
                          padding: '2px 6px', color: T.text, fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        }} />
                        <span style={{ color: T.text3, fontSize: 10 }}>→</span>
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{
                          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5,
                          padding: '2px 6px', color: T.text, fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        }} />
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder={t('searchBySymbol')}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{
                        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                        padding: '4px 10px', color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                        width: isMobile ? '100%' : 120, outline: 'none'
                      }}
                    />
                    <select
                      value={sideFilter}
                      onChange={e => setSideFilter(e.target.value as any)}
                      style={{
                        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                        padding: '4px 8px', color: T.text, fontSize: 11, fontFamily: "'Cairo', sans-serif", outline: 'none'
                      }}
                    >
                      <option value="ALL">{t('allDirections')}</option>
                      <option value="BUY">{tc('buy')}</option>
                      <option value="SELL">{tc('sell')}</option>
                    </select>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as any)}
                      style={{
                        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                        padding: '4px 8px', color: T.text, fontSize: 11, fontFamily: "'Cairo', sans-serif", outline: 'none'
                      }}
                    >
                      <option value="ALL">{t('allResults')}</option>
                      <option value="WIN">{t('winning')}</option>
                      <option value="LOSS">{t('losing')}</option>
                    </select>
                  </div>

                  {isMobile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
                      {filteredHistory.map((pt) => (
                        <div key={pt.id} style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: `0.5px solid ${T.border}`,
                          borderRadius: 10, padding: '10px 12px',
                          display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: T.text }}>{pt.symbol}</span>
                              {/* V140B: Source badge — shows منفذ/وكيل/ورقي/يدوي */}
                              <span style={{
                                padding: '0px 3px', borderRadius: 3,
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 7, fontWeight: 700,
                                background: pt.type === 'SMART' ? `${T.amber}14` : pt.type === 'AGENT' ? `${T.purple}14` : pt.type === 'PAPER' ? `${T.cyan}14` : `${T.border}`,
                                color: pt.type === 'SMART' ? T.amber : pt.type === 'AGENT' ? T.purple : pt.type === 'PAPER' ? T.cyan : T.text3,
                                border: `0.5px solid ${pt.type === 'SMART' ? T.amber : pt.type === 'AGENT' ? T.purple : pt.type === 'PAPER' ? T.cyan : T.border}`,
                              }}>{pt.type === 'SMART' ? t('sourceSmart') : pt.type === 'AGENT' ? t('sourceAgent') : pt.type === 'PAPER' ? t('sourcePaper') : t('sourceManual')}</span>
                              <span style={{
                                padding: '1px 6px', borderRadius: 4,
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                                background: pt.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                                color: pt.side === 'BUY' ? T.green : T.red,
                                border: `0.5px solid ${pt.side === 'BUY' ? T.green : T.red}44`,
                              }}>{pt.side === 'BUY' ? tc('buy') : tc('sell')}</span>
                            </div>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 13, fontWeight: 700,
                              color: (pt.pnl || 0) > 0 ? T.green : (pt.pnl || 0) < 0 ? T.red : T.text2,
                            }}>
                              {(pt.pnl || 0) > 0 ? '+' : (pt.pnl || 0) < 0 ? '-' : ''}${fmt(Math.abs(pt.pnl || 0))}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
                            <div><span style={{ color: T.text3 }}>{t('sizeLabel')}: </span><span style={{ color: T.text2 }}>{pt.quantity}</span></div>
                            <div><span style={{ color: T.text3 }}>{t('entryLabel')}: </span><span style={{ color: T.text2 }}>{formatPrice(pt.price, pt.symbol)}</span></div>
                            <div><span style={{ color: T.text3 }}>{t('closeLabel')}: </span><span style={{ color: T.text2 }}>{(pt as any).exitPrice ? formatPrice((pt as any).exitPrice, pt.symbol) : '—'}</span></div>
                            <div><span style={{ color: T.text3 }}>{t('stopLossLabel')}: </span><span style={{ color: T.red }}>{(pt as any).stopLoss ? formatPrice((pt as any).stopLoss, pt.symbol) : '—'}</span></div>
                            <div><span style={{ color: T.text3 }}>{t('takeProfitLabel')}: </span><span style={{ color: T.green }}>{(pt as any).takeProfit ? formatPrice((pt as any).takeProfit, pt.symbol) : '—'}</span></div>
                            <div><span style={{ color: T.text3 }}>{t('reasonLabel')}: </span><span style={{
                              color: (pt as any).exitReason === 'SL' ? T.red : (pt as any).exitReason === 'TP' ? T.green : T.text3,
                            }}>{(pt as any).exitReason === 'SL' ? t('exitSL') : (pt as any).exitReason === 'TP' ? t('exitTP') : t('exitManual')}</span></div>
                            <div><span style={{ color: T.text3 }}>{t('durationLabel')}: </span><span style={{ color: T.text2 }}>{formatDuration(pt.openedAt, pt.executedAt)}</span></div>
                            <div><span style={{ color: T.text3 }}>{t('timeLabel')}: </span><span style={{ color: T.text2 }}>{pt.executedAt ? new Date(pt.executedAt).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <>
                  <div role="table" aria-label={t('closedTrades')} style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 50px 55px 70px 70px 65px 65px 70px 55px 55px 70px 90px',
                    padding: '5px 14px', gap: 0,
                    borderBottom: `0.5px solid ${T.border}`,
                  }}>
                    {[t('headerPair'),t('headerDirection'),t('headerSize'),t('entryLabel'),t('headerClose'),t('headerStopLoss'),t('headerTakeProfit'),t('headerRealizedPnl'),t('headerReason'),t('headerDuration'),t('headerStatus'),t('headerCloseTime')].map((h) => (
                      <div key={h} style={{
                        fontFamily: "'Cairo', sans-serif", fontSize: 9.5,
                        color: T.text3, textAlign: 'center',
                      }}>{h}</div>
                    ))}
                  </div>
                  {/* Unified filtered history map */}
                  {filteredHistory.map((pt, i) => (
                    <div
                      key={pt.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '100px 50px 55px 70px 70px 65px 65px 70px 55px 55px 70px 90px',
                        padding: '6px 14px', gap: 0,
                        borderBottom: i < filteredHistory.length - 1 ? `0.5px solid ${T.border}` : 'none',
                        alignItems: 'center',
                        background: i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent',
                        transition: 'background 0.2s',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: T.text }}>{pt.symbol}</span>
                        {/* V140B: Source badge — shows منفذ/وكيل/ورقي/يدوي */}
                        <span style={{
                          padding: '0px 3px', borderRadius: 3,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 7, fontWeight: 700,
                          background: pt.type === 'SMART' ? `${T.amber}14` : pt.type === 'AGENT' ? `${T.purple}14` : pt.type === 'PAPER' ? `${T.cyan}14` : `${T.border}`,
                          color: pt.type === 'SMART' ? T.amber : pt.type === 'AGENT' ? T.purple : pt.type === 'PAPER' ? T.cyan : T.text3,
                          border: `0.5px solid ${pt.type === 'SMART' ? T.amber : pt.type === 'AGENT' ? T.purple : pt.type === 'PAPER' ? T.cyan : T.border}`,
                        }}>{pt.type === 'SMART' ? t('sourceSmart') : pt.type === 'AGENT' ? t('sourceAgent') : pt.type === 'PAPER' ? t('sourcePaper') : t('sourceManual')}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: 3,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                          background: pt.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                          color: pt.side === 'BUY' ? T.green : T.red,
                        }}>{pt.side === 'BUY' ? tc('buy') : tc('sell')}</span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{pt.quantity}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{formatPrice(pt.price, pt.symbol)}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>
                        {(pt as any).exitPrice ? formatPrice((pt as any).exitPrice, pt.symbol) : '—'}
                      </div>
                      {/* V140F: Stop Loss column */}
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.red }}>
                        {(pt as any).stopLoss ? formatPrice((pt as any).stopLoss, pt.symbol) : '—'}
                      </div>
                      {/* V140F: Take Profit column */}
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.green }}>
                        {(pt as any).takeProfit ? formatPrice((pt as any).takeProfit, pt.symbol) : '—'}
                      </div>
                      <div style={{
                        textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10, fontWeight: 700,
                        color: (pt.pnl || 0) > 0 ? T.green : (pt.pnl || 0) < 0 ? T.red : T.text2,
                      }}>
                        {(pt.pnl || 0) > 0 ? '+' : (pt.pnl || 0) < 0 ? '-' : ''}${fmt(Math.abs(pt.pnl || 0))}
                      </div>
                      {/* V140F: Exit reason — SL / TP / Manual */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '1px 5px', borderRadius: 3,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 700,
                          background: (pt as any).exitReason === 'SL' ? `${T.red}18` :
                                      (pt as any).exitReason === 'TP' ? `${T.green}18` : `${T.blue}12`,
                          color: (pt as any).exitReason === 'SL' ? T.red :
                                  (pt as any).exitReason === 'TP' ? T.green : T.text3,
                          border: `0.5px solid ${(pt as any).exitReason === 'SL' ? T.red :
                                                  (pt as any).exitReason === 'TP' ? T.green : T.border}44`,
                        }}>
                          {(pt as any).exitReason === 'SL' ? t('exitSLShort') :
                            (pt as any).exitReason === 'TP' ? t('exitTPShort') : t('sourceManual')}
                        </span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text3 }}>
                        {formatDuration(pt.openedAt, pt.executedAt)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: 3,
                          fontFamily: "'Cairo', sans-serif", fontSize: 9, fontWeight: 700,
                          background: `${T.blue}18`, color: T.blue,
                        }}>{t('closed')}</span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text3 }}>
                        {pt.executedAt ? new Date(pt.executedAt).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                    </div>
                  ))}
                </>
                  )}
                </>
              )
            )}
          </div>

          {/* ── Trade History: REMOVED V140 ── */}
          {/* The "سجل الصفقات المنفذة" section was redundant with "الصفقات المغلقة"
              which already shows per-position P&L, entry/exit prices, and time-based filters.
              The `trades` data is still fetched for performance charts and risk metrics. */}
          </div>{/* end portfolio-table-wrap */}
        </>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: الأداء                                   */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'performance' && (
        <>
          {/* Performance Stats */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <StatCard label={t('totalTrades')} value={String(trades.length)} color={T.blue} icon={Activity} />
            <StatCard label={t('winningTrades')} value={String(winningCount)} color={T.green} icon={TrendingUp} sub={`${winRate.toFixed(1)}%`} />
            <StatCard label={t('losingTrades')} value={String(losingCount)} color={T.red} icon={TrendingDown} />
            <StatCard label={t('avgProfit')} value={`$${fmt(avgWin, 2)}`} color={T.green} icon={TrendingUp} />
            <StatCard label={t('avgLoss')} value={`$${fmt(avgLoss, 2)}`} color={T.red} icon={TrendingDown} />
          </div>

          {/* Daily P&L Bar Chart */}
          <div style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 12,
          }}>
            <div style={{
              fontFamily: "'Cairo', sans-serif", fontWeight: 700,
              fontSize: 12, color: T.text, marginBottom: 8,
            }}>{t('dailyPnl')}</div>
            {performanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={performanceData}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip
                    contentStyle={{ background: T.bg2, border: `0.5px solid ${T.border2}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'P&L']}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {performanceData.map((entry, i) => (
                      <Cell key={entry.date + '-' + i} fill={entry.pnl > 0 ? T.green : entry.pnl < 0 ? T.red : T.text2} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>{t('noPerformanceDataAction')}</span>
              </div>
            )}
          </div>

          {/* Equity Curve */}
          <div style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{
              fontFamily: "'Cairo', sans-serif", fontWeight: 700,
              fontSize: 12, color: T.text, marginBottom: 8,
            }}>{t('cumulativeEquityCurve')}</div>
            {equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={T.cyan} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={T.cyan} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="value" stroke={T.cyan} fill="url(#perfGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>{t('noPerformanceData')}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: المخاطر                                  */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'risk' && (
        <>
          {/* Risk Stats */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <StatCard label={t('profitFactor')} value={profitFactor >= 999 ? '999+' : profitFactor.toFixed(2)} color={T.green} icon={TrendingUp}
              note={profitFactor >= 2 ? t('excellent') : profitFactor >= 1.5 ? t('good') : profitFactor >= 1 ? t('acceptable') : t('danger')} />
            <StatCard label={t('maxDrawdown')} value={`$${fmt(maxDrawdown, 2)}`} color={T.red} icon={TrendingDown}
              note={maxDrawdown === 0 ? t('noDrawdown') : undefined} />
            <StatCard label="Sharpe Ratio" value={sharpeRatio !== null ? sharpeRatio.toFixed(2) : '—'} color={T.purple} icon={Award}
              note={sharpeRatio !== null ? (sharpeRatio >= 2 ? t('excellent') : sharpeRatio >= 1 ? t('good') : t('weak')) : undefined} />
            <StatCard label={t('openRisk')} value={String(positions.length)} color={T.amber} icon={Shield}
              sub={`${positions.filter(p => !p.stopLoss).length} ${t('withoutStopLoss')}`} />
          </div>

          {/* Risk Breakdown */}
          <div style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 10, padding: '16px', marginBottom: 12,
          }}>
            <div style={{
              fontFamily: "'Cairo', sans-serif", fontWeight: 700,
              fontSize: 12, color: T.text, marginBottom: 12,
            }}>{t('riskAnalysisTitle')}</div>

            {/* Risk metrics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Win/Loss ratio */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>{t('winLossRatio')}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 6, borderRadius: 3, background: `${T.red}22`, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: T.green, width: `${winRate}%`, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: winRate >= 50 ? T.green : T.red }}>
                    {winRate.toFixed(1)}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.green }}>{winningCount} {t('wins')}</span>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.red }}>{losingCount} {t('losses')}</span>
                </div>
              </div>

              {/* Avg win vs avg loss */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>{t('avgProfitVsLoss')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>{t('avgProfit')}</span>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: T.green }}>+${fmt(avgWin, 2)}</div>
                  </div>
                  <div style={{ textAlign: 'start' }}>
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>{t('avgLoss')}</span>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: T.red }}>-${fmt(avgLoss, 2)}</div>
                  </div>
                </div>
              </div>

              {/* Open exposure */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>{t('openExposure')}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: totalUnrealizedPnl > 0 ? T.green : totalUnrealizedPnl < 0 ? T.red : T.text2 }}>
                  {totalUnrealizedPnl > 0 ? '+' : totalUnrealizedPnl < 0 ? '-' : ''}${fmt(Math.abs(totalUnrealizedPnl), 2)}
                </div>
                <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>{t('openPositionCount', { count: positions.length })}</span>
              </div>

              {/* SL coverage */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${positions.some(p => !p.stopLoss) ? T.red + '44' : T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>{t('stopLossCoverage')}</div>
                {positions.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 6, borderRadius: 3, background: `${T.red}22`, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            background: positions.every(p => p.stopLoss) ? T.green : T.red,
                            width: `${(positions.filter(p => p.stopLoss).length / positions.length) * 100}%`,
                            transition: 'width 0.3s',
                          }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: positions.every(p => p.stopLoss) ? T.green : T.red }}>
                        {positions.filter(p => p.stopLoss).length}/{positions.length}
                      </span>
                    </div>
                    {!positions.every(p => p.stopLoss) && (
                      <span className="animate-pulse" style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.red, marginTop: 4, display: 'block', fontWeight: 700 }}>
                        ⚠️ {t('warning')}: {positions.filter(p => !p.stopLoss).length} {t('warningNoStopLoss')}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3 }}>{t('noOpenPositions')}</span>
                )}
              </div>
            </div>
          </div>

          {/* Risk Warning */}
          <div style={{
            background: `${T.amber}08`, border: `0.5px solid ${T.amber}22`,
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ color: T.amber, marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 700, color: T.amber, marginBottom: 2 }}>{t('riskManagementAlert')}</div>
              <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3, lineHeight: 1.6 }}>
                {t('riskDisclaimer')}
                {t('riskDisclaimerLine2')}
                {t('riskDisclaimerLine3')}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: سجل التداول الذكي                         */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'journal' && (
        <>
          {/* Journal Header with Export Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 3, height: 20, borderRadius: 2, background: T.amber }} />
            <span style={{ fontFamily: "'Cairo', sans-serif", fontWeight: 900, fontSize: 15, color: T.text }}>
              سجل التداول الذكي
            </span>
            <div style={{ flex: 1 }} />
            {journalEntries.length > 0 && (
              <>
                <button
                  onClick={handleExportPDF}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px', borderRadius: 8,
                    border: `0.5px solid ${T.amber}44`, background: `${T.amber}14`,
                    color: T.amber, fontFamily: "'Cairo', sans-serif",
                    fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <FileText size={12} />
                  تقرير PDF للمستثمرين
                </button>
                <button
                  onClick={handleExportJSON}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 7,
                    border: `0.5px solid ${T.border}`, background: T.card,
                    color: T.text2, fontFamily: "'Cairo', sans-serif",
                    fontSize: 9, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <Download size={10} />
                  JSON
                </button>
              </>
            )}
          </div>

          {journalEntries.length === 0 ? (
            <div style={{
              background: T.card, border: `0.5px solid ${T.border}`,
              borderRadius: 10, padding: 40, textAlign: 'center',
            }}>
              <FileText size={40} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 12px' }} />
              <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                لا توجد بيانات تداول بعد
              </div>
              <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3, lineHeight: 1.7 }}>
                سيتم تسجيل كل اقتراح تداول تلقائياً عند استخدامه.
                <br />
                استخدم نظام التداول الآلي على الشارت لبدء تجميع البيانات.
                <br />
                <span style={{ color: T.amber, fontSize: 10 }}>
                  كل يوم استخدام = دليل إضافي لأداء النظام
                </span>
              </div>
            </div>
          ) : journalStats ? (
            <>
              {/* ── Journal Core Stats ── */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <StatCard
                  label='إجمالي الاقتراحات' value={String(journalStats.totalTrades)}
                  color={T.blue} icon={Activity}
                  sub={`${journalStats.closedTrades} مغلق · ${journalStats.pendingTrades} معلق`}
                />
                <StatCard
                  label='نسبة النجاح'
                  value={`${Math.round(journalStats.winRate * 100)}%`}
                  color={journalStats.winRate >= 0.5 ? T.green : T.red}
                  icon={Target}
                  note={journalStats.winRate >= 0.6 ? 'ممتاز' : journalStats.winRate >= 0.45 ? 'جيد' : journalStats.closedTrades > 0 ? 'يحتاج تحسين' : undefined}
                  sub={`${journalStats.wins} رابح · ${journalStats.losses} خاسر`}
                />
                <StatCard
                  label='صافي الربح'
                  value={`${journalStats.totalPnL >= 0 ? '+' : ''}${journalStats.totalPnL}`}
                  color={journalStats.totalPnL >= 0 ? T.green : T.red}
                  icon={TrendingUp}
                />
                <StatCard
                  label='معامل الربح'
                  value={journalStats.profitFactor >= 999 ? '999+' : String(journalStats.profitFactor)}
                  color={T.green} icon={Award}
                  note={journalStats.profitFactor >= 2 ? 'ممتاز' : journalStats.profitFactor >= 1.5 ? 'جيد' : undefined}
                />
                <StatCard
                  label='متوسط R'
                  value={String(journalStats.avgRMultiple)}
                  color={journalStats.avgRMultiple > 0 ? T.green : T.red}
                  icon={BarChart2}
                />
                <StatCard
                  label='شارب المقدر'
                  value={String(journalStats.sharpeEstimate)}
                  color={T.purple} icon={Award}
                />
                <StatCard
                  label='أقصى تراجع'
                  value={String(journalStats.maxDrawdown)}
                  color={T.red} icon={TrendingDown}
                />
                <StatCard
                  label='متوسط R:R'
                  value={`1:${journalStats.avgRR.toFixed(1)}`}
                  color={T.cyan} icon={Target}
                />
              </div>

              {/* ── Charts Row: Win Rate Over Time + Weekly P&L ── */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                {/* Cumulative P&L Curve from Journal */}
                <div style={{
                  flex: '1 1 400px',
                  background: T.card, border: `0.5px solid ${T.border}`,
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    fontSize: 12, color: T.text, marginBottom: 8,
                  }}>منحنى الربح التراكمي (سجل التداول)</div>
                  {journalStats.weeklyBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={journalStats.weeklyBreakdown}>
                        <defs>
                          <linearGradient id="jPnlGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={T.green} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={T.green} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip
                          contentStyle={{ background: T.bg2, border: `0.5px solid ${T.border2}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                          formatter={(val: any, name: string) => {
                            if (name === 'cumulativePnL') return [`$${Number(val).toFixed(2)}`, 'الربح التراكمي']
                            return [val, name]
                          }}
                        />
                        <Area type="monotone" dataKey="cumulativePnL" stroke={T.green} fill="url(#jPnlGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد بيانات أسبوعية بعد</span>
                    </div>
                  )}
                </div>

                {/* Weekly Win Rate Bar Chart */}
                <div style={{
                  flex: '1 1 400px',
                  background: T.card, border: `0.5px solid ${T.border}`,
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    fontSize: 12, color: T.text, marginBottom: 8,
                  }}>نسبة النجاح الأسبوعية</div>
                  {journalStats.weeklyBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={journalStats.weeklyBreakdown}>
                        <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: T.text2 }} axisLine={false} tickLine={false} width={40} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ background: T.bg2, border: `0.5px solid ${T.border2}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                          formatter={(val: any) => [`${Number(val).toFixed(1)}%`, 'نسبة النجاح']}
                        />
                        <Bar dataKey={(d: any) => Math.round(d.winRate * 100)} radius={[4, 4, 0, 0]}>
                          {journalStats.weeklyBreakdown.map((w, i) => (
                            <Cell key={w.week + '-' + i} fill={w.winRate >= 0.5 ? T.green : T.red} opacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد بيانات أسبوعية بعد</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Direction & Source Breakdown ── */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                {/* Direction Breakdown */}
                <div style={{
                  flex: '1 1 300px',
                  background: T.card, border: `0.5px solid ${T.border}`,
                  borderRadius: 10, padding: '14px',
                }}>
                  <div style={{
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    fontSize: 12, color: T.text, marginBottom: 10,
                  }}>الأداء حسب الاتجاه</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Bullish */}
                    <div style={{ padding: '10px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.green}22` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 700, color: T.green }}>▲ شراء (صاعد)</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: journalStats.byDirection.bullish.winRate >= 0.5 ? T.green : T.red }}>
                          {Math.round(journalStats.byDirection.bullish.winRate * 100)}%
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: `${T.green}15`, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: T.green, width: `${journalStats.byDirection.bullish.winRate * 100}%`, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9 }}>
                        <span style={{ fontFamily: "'Cairo', sans-serif", color: T.text3 }}>{journalStats.byDirection.bullish.trades} صفقة</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: journalStats.byDirection.bullish.pnl >= 0 ? T.green : T.red }}>{journalStats.byDirection.bullish.pnl >= 0 ? '+' : ''}{journalStats.byDirection.bullish.pnl}</span>
                      </div>
                    </div>
                    {/* Bearish */}
                    <div style={{ padding: '10px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.red}22` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 700, color: T.red }}>▼ بيع (هابط)</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800, color: journalStats.byDirection.bearish.winRate >= 0.5 ? T.green : T.red }}>
                          {Math.round(journalStats.byDirection.bearish.winRate * 100)}%
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: `${T.red}15`, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: T.red, width: `${journalStats.byDirection.bearish.winRate * 100}%`, transition: 'width 0.3s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9 }}>
                        <span style={{ fontFamily: "'Cairo', sans-serif", color: T.text3 }}>{journalStats.byDirection.bearish.trades} صفقة</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: journalStats.byDirection.bearish.pnl >= 0 ? T.green : T.red }}>{journalStats.byDirection.bearish.pnl >= 0 ? '+' : ''}{journalStats.byDirection.bearish.pnl}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signal Source Breakdown */}
                <div style={{
                  flex: '1 1 300px',
                  background: T.card, border: `0.5px solid ${T.border}`,
                  borderRadius: 10, padding: '14px',
                }}>
                  <div style={{
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    fontSize: 12, color: T.text, marginBottom: 10,
                  }}>أفضل مصادر الإشارة</div>
                  {Object.entries(journalStats.bySource).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(journalStats.bySource)
                        .sort(([, a], [, b]) => b.winRate - a.winRate)
                        .slice(0, 8)
                        .map(([source, data]) => (
                          <div key={source} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 8px', borderRadius: 6,
                            background: T.bg, border: `0.5px solid ${data.winRate >= 0.5 ? T.green : T.red}18`,
                          }}>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                              color: data.winRate >= 0.5 ? T.green : T.red, minWidth: 40,
                            }}>{Math.round(data.winRate * 100)}%</span>
                            <span style={{ flex: 1, fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source}</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text3 }}>{data.trades}</span>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                              color: data.pnl >= 0 ? T.green : T.red,
                            }}>{data.pnl >= 0 ? '+' : ''}{Math.round(data.pnl * 100) / 100}</span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div style={{ padding: 20, textAlign: 'center' }}>
                      <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد بيانات مصادر بعد</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Boost Impact Section ── */}
              {journalStats.boostTradesCount > 0 && (
                <div style={{
                  background: T.card, border: `0.5px solid ${T.amber}22`,
                  borderRadius: 10, padding: '14px', marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 3, height: 16, borderRadius: 2, background: T.amber }} />
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 12, color: T.text }}>
                      تأثير المحركات الثورية
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 140px', padding: '10px', background: T.bg, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.amber, marginBottom: 4 }}>مع التعزيز الثوري</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 800, color: journalStats.boostTradesWinRate >= 0.5 ? T.green : T.red }}>
                        {Math.round(journalStats.boostTradesWinRate * 100)}%
                      </div>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>{journalStats.boostTradesCount} صفقة</div>
                    </div>
                    <div style={{ flex: '1 1 140px', padding: '10px', background: T.bg, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text2, marginBottom: 4 }}>بدون تعزيز</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 800, color: journalStats.noBoostTradesWinRate >= 0.5 ? T.green : T.red }}>
                        {Math.round(journalStats.noBoostTradesWinRate * 100)}%
                      </div>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>{journalStats.noBoostTradesCount} صفقة</div>
                    </div>
                    <div style={{ flex: '1 1 140px', padding: '10px', background: T.bg, borderRadius: 8, textAlign: 'center', border: `0.5px solid ${journalStats.boostLift >= 1 ? T.green : T.red}22` }}>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text2, marginBottom: 4 }}>التحسن</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 800, color: journalStats.boostLift >= 1 ? T.green : T.red }}>
                        {journalStats.boostLift > 0 ? `${journalStats.boostLift >= 1 ? '+' : ''}${Math.round((journalStats.boostLift - 1) * 100)}%` : '—'}
                      </div>
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>تحسن التعزيز</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Regime Performance ── */}
              {Object.keys(journalStats.byRegime).length > 0 && (
                <div style={{
                  background: T.card, border: `0.5px solid ${T.border}`,
                  borderRadius: 10, padding: '14px', marginBottom: 12,
                }}>
                  <div style={{
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    fontSize: 12, color: T.text, marginBottom: 10,
                  }}>الأداء حسب نظام السوق</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(journalStats.byRegime).map(([regime, data]) => (
                      <div key={regime} style={{
                        flex: '1 1 120px', padding: '10px', background: T.bg, borderRadius: 8,
                        border: `0.5px solid ${data.winRate >= 0.5 ? T.green : T.red}18`,
                        textAlign: 'center',
                      }}>
                        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, fontWeight: 700, color: T.text, marginBottom: 4 }}>{regime}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 800, color: data.winRate >= 0.5 ? T.green : T.red }}>
                          {Math.round(data.winRate * 100)}%
                        </div>
                        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>{data.trades} صفقة · {data.wins} رابح</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Recent Journal Entries ── */}
              <div style={{
                background: T.card, border: `0.5px solid ${T.border}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  padding: '8px 14px', gap: 8,
                  borderBottom: `0.5px solid ${T.border}`,
                  background: `linear-gradient(90deg, ${T.amber}0a, transparent)`,
                }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: T.amber }} />
                  <span style={{
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    fontSize: 12, color: T.text, flex: 1,
                  }}>آخر اقتراحات التداول</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text3 }}>
                    {journalEntries.length} سجل
                  </span>
                </div>

                {journalEntries.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد سجلات</span>
                  </div>
                ) : isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
                    {journalEntries.slice(0, 15).map((entry) => {
                      const isWin = entry.realizedPnL > 0
                      const isResolved = ['hit_tp1','hit_tp2','hit_tp3','hit_sl','trail_sl','breakeven','expired','closed'].includes(entry.status)
                      return (
                        <div key={entry.id} style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: `0.5px solid ${isResolved ? (isWin ? T.green : T.red) : T.border}22`,
                          borderRadius: 8, padding: '8px 10px',
                          display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text }}>{entry.symbol}</span>
                              <span style={{
                                padding: '1px 5px', borderRadius: 3,
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 700,
                                background: entry.direction === 'bullish' ? `${T.green}18` : `${T.red}18`,
                                color: entry.direction === 'bullish' ? T.green : T.red,
                              }}>{entry.direction === 'bullish' ? '▲ شراء' : '▼ بيع'}</span>
                            </div>
                            {isResolved ? (
                              <span style={{
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
                                color: isWin ? T.green : T.red,
                              }}>{isWin ? '+' : ''}{Math.round(entry.realizedPnL * 100) / 100}</span>
                            ) : (
                              <span style={{
                                padding: '1px 5px', borderRadius: 3,
                                fontFamily: "'Cairo', sans-serif", fontSize: 8,
                                background: `${T.amber}14`, color: T.amber,
                              }}>معلق</span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, fontSize: 9 }}>
                            <div><span style={{ color: T.text3 }}>دخول: </span><span style={{ color: T.text2 }}>{entry.entryPrice}</span></div>
                            <div><span style={{ color: T.text3 }}>SL: </span><span style={{ color: T.red }}>{entry.stopLoss}</span></div>
                            <div><span style={{ color: T.text3 }}>R:R: </span><span style={{ color: T.text2 }}>1:{entry.rrRatio}</span></div>
                          </div>
                          <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8, color: T.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.date} · {entry.regime} · ثقة: {Math.round(entry.confidence * 100)}%
                            {entry.boostFactorsActive.length > 0 && <span style={{ color: T.amber }}> · +{entry.boostFactorsActive.length} تعزيز</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ minWidth: 900 }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 55px 70px 70px 60px 55px 55px 70px 55px 70px 80px 60px',
                        padding: '5px 14px', gap: 0,
                        borderBottom: `0.5px solid ${T.border}`,
                      }}>
                        {['التاريخ','الاتجاه','الدخول','SL','TP1','R:R','ثقة','النتيجة','R','الربح','الإشارات','التعزيز'].map((h) => (
                          <div key={h} style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3, textAlign: 'center' }}>{h}</div>
                        ))}
                      </div>
                      {journalEntries.slice(0, 25).map((entry, i) => {
                        const isWin = entry.realizedPnL > 0
                        const isResolved = ['hit_tp1','hit_tp2','hit_tp3','hit_sl','trail_sl','breakeven','expired','closed'].includes(entry.status)
                        const statusLabel = entry.status === 'hit_tp1' ? 'TP1' : entry.status === 'hit_tp2' ? 'TP2' : entry.status === 'hit_tp3' ? 'TP3' : entry.status === 'hit_sl' ? 'SL' : entry.status === 'trail_sl' ? 'Trail' : entry.status === 'breakeven' ? 'BE' : isResolved ? 'مغلق' : 'معلق'
                        return (
                          <div key={entry.id} style={{
                            display: 'grid',
                            gridTemplateColumns: '80px 55px 70px 70px 60px 55px 55px 70px 55px 70px 80px 60px',
                            padding: '6px 14px', gap: 0,
                            borderBottom: i < Math.min(journalEntries.length, 25) - 1 ? `0.5px solid ${T.border}` : 'none',
                            alignItems: 'center',
                            background: i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent',
                          }}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text2, textAlign: 'center' }}>{entry.date}</div>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{
                                padding: '1px 5px', borderRadius: 3,
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 700,
                                background: entry.direction === 'bullish' ? `${T.green}18` : `${T.red}18`,
                                color: entry.direction === 'bullish' ? T.green : T.red,
                              }}>{entry.direction === 'bullish' ? '▲' : '▼'}</span>
                            </div>
                            <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text2 }}>{entry.entryPrice}</div>
                            <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.red }}>{entry.stopLoss}</div>
                            <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.green }}>{entry.takeProfits[0] || '—'}</div>
                            <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text2 }}>1:{entry.rrRatio}</div>
                            <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text2 }}>{Math.round(entry.confidence * 100)}%</div>
                            <div style={{ textAlign: 'center' }}>
                              <span style={{
                                padding: '1px 5px', borderRadius: 3,
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 700,
                                background: !isResolved ? `${T.amber}14` : isWin ? `${T.green}18` : `${T.red}18`,
                                color: !isResolved ? T.amber : isWin ? T.green : T.red,
                              }}>{statusLabel}</span>
                            </div>
                            <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: entry.rMultiple > 0 ? T.green : entry.rMultiple < 0 ? T.red : T.text2 }}>{entry.rMultiple > 0 ? '+' : ''}{entry.rMultiple}R</div>
                            <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, color: isWin ? T.green : !isResolved ? T.text3 : T.red }}>{isResolved ? (isWin ? '+' : '') + (Math.round(entry.realizedPnL * 100) / 100) : '—'}</div>
                            <div style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.agreeingSignals.slice(0, 2).map(s => s.source).join(', ')}
                              {entry.agreeingSignals.length > 2 && <span style={{ color: T.text3, fontSize: 8 }}> +{entry.agreeingSignals.length - 2}</span>}
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              {entry.boostFactorsActive.length > 0 ? (
                                <span style={{
                                  padding: '1px 4px', borderRadius: 3,
                                  fontFamily: "'JetBrains Mono', monospace", fontSize: 7, fontWeight: 700,
                                  background: `${T.amber}14`, color: T.amber,
                                }}>+{entry.boostFactorsActive.length}</span>
                              ) : (
                                <span style={{ color: T.text3, fontSize: 8 }}>—</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Consecutive Stats ── */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <div style={{
                  flex: 1, padding: '10px 14px', background: T.card,
                  border: `0.5px solid ${T.green}22`, borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <TrendingUp size={16} color={T.green} />
                  <div>
                    <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>أطول سلسلة رابحة</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: T.green }}>{journalStats.maxConsecutiveWins}</div>
                  </div>
                </div>
                <div style={{
                  flex: 1, padding: '10px 14px', background: T.card,
                  border: `0.5px solid ${T.red}22`, borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <TrendingDown size={16} color={T.red} />
                  <div>
                    <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>أطول سلسلة خاسرة</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: T.red }}>{journalStats.maxConsecutiveLosses}</div>
                  </div>
                </div>
                <div style={{
                  flex: 1, padding: '10px 14px', background: T.card,
                  border: `0.5px solid ${T.blue}22`, borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Clock size={16} color={T.blue} />
                  <div>
                    <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>متوسط مدة الصفقة</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: T.cyan }}>
                      {journalStats.avgDurationMinutes >= 60
                        ? `${Math.floor(journalStats.avgDurationMinutes / 60)}h ${Math.round(journalStats.avgDurationMinutes % 60)}m`
                        : `${Math.round(journalStats.avgDurationMinutes)}m`
                      }
                    </div>
                  </div>
                </div>
                <div style={{
                  flex: 1, padding: '10px 14px', background: T.card,
                  border: `0.5px solid ${T.purple}22`, borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Activity size={16} color={T.purple} />
                  <div>
                    <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>صفقات/يوم</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: T.purple }}>{journalStats.tradesPerDay}</div>
                  </div>
                </div>
              </div>

              {/* ── Investor Notice ── */}
              <div style={{
                background: `${T.green}08`, border: `0.5px solid ${T.green}22`,
                borderRadius: 10, padding: '12px 16px', marginTop: 12,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <Award size={14} style={{ color: T.green, marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 2 }}>
                    دليل أداء النظام
                  </div>
                  <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3, lineHeight: 1.7 }}>
                    هذه البيانات تُسجّل تلقائياً من نظام التداول الآلي على بيانات حية.
                    استخدم زر "تقرير PDF للمستثمرين" لتصدير تقرير احترافي.
                    <br />
                    <span style={{ color: T.amber }}>تنبيه:</span> النتائج السابقة لا تضمن النتائج المستقبلية. هذه بيانات تداول ورقي على أسعار حية.
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: المُدرّب الذكي                            */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'coach' && (
        <AICoachPanel />
      )}
    </div>
  )
}
