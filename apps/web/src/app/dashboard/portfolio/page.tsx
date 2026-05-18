'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useScopedStyle } from '@/hooks/useScopedStyle'

// Lazy-load AICoachPanel to avoid blocking initial render
// Uses error-safe dynamic import to prevent ReferenceError
const AICoachPanel = dynamic(
  () => import('@/components/portfolio/AICoachPanel').catch(() => ({
    default: () => (
      <div style={{ padding: 24, textAlign: 'center', background: T.card, borderRadius: 12 }}>
        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.red }}>
          تعذر تحميل المُدرّب الذكي. يرجى تحديث الصفحة.
        </div>
      </div>
    ),
  })),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>جاري تحميل المُدرّب الذكي...</div>
      </div>
    ),
  },
)

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, BarChart, Bar,
} from 'recharts'
import { TrendingUp, TrendingDown, Award, Target, BarChart2, X as XIcon, Shield, Activity, RefreshCw, Loader2, AlertTriangle, ChevronRight, Clock, History, Brain } from 'lucide-react'
import { usePaperTradesStore, ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import { fetchPositionsUnified, fetchSummaryUnified, closePositionUnified } from '@/lib/api-fetch'
import { fmtPriceLocale } from '@/lib/price-format'

/* ── Theme ── */
import { T } from '@/lib/unified-tokens'

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const formatPrice = (value: number, symbol?: string) => {
  if (value === 0) return '—'
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
function ApiErrorBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
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
      }}>إعادة المحاولة</button>
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
  const [tab, setTab] = useState<'positions' | 'performance' | 'risk' | 'coach'>('positions')
  const [positions, setPositions] = useState<Position[]>([])
  const [closedPositions, setClosedPositions] = useState<Position[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [summary, setSummary] = useState<PositionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const { closedTrades: closedPaperTrades } = usePaperTradesStore()

  // New states for P5 (Portfolio Optimization)
  const [searchQuery, setSearchQuery] = useState('')
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL')
  const [showPanicConfirm, setShowPanicConfirm] = useState(false)
  const [closingAll, setClosingAll] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

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
      const result = await fetchPositionsUnified()
      setPositions(result.positions as Position[])
      if (result.error) {
        setApiError(result.error)
      } else {
        setApiError(null)
      }
    } catch (e: unknown) {
      setApiError(`خطأ في الاتصال بخادم التداول: ${e instanceof Error ? e.message : 'غير معروف'}`)
    }
  }, [])

  const fetchClosedPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/positions/history?limit=100')
      if (res.ok) {
        const data = await res.json()
        setClosedPositions(Array.isArray(data) ? data : (data.data || data.positions || []))
      }
      // Don't override apiError from open positions fetch
    } catch (_e: unknown) {
      // Closed positions fetch failure is non-critical, but log a user-friendly message
      // Error handled silently — closed positions fetch is non-critical
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const result = await fetchSummaryUnified()
      if (result.summary) {
        setSummary(result.summary as PositionSummary)
      }
    } catch (_e: unknown) {
      // Error handled silently
    }
  }, [])

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/trades?limit=100')
      if (res.ok) {
        const data = await res.json()
        setTrades(Array.isArray(data) ? data : (data.data || data.trades || []))
      }
    } catch (_e: unknown) {
      // Error handled silently
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setApiError(null)
    await Promise.all([fetchPositions(), fetchClosedPositions(), fetchSummary(), fetchTrades()])
    setLoading(false)
  }, [fetchPositions, fetchClosedPositions, fetchSummary, fetchTrades])

  useEffect(() => { fetchAll() }, [fetchAll])

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
        setApiError(`فشل في إغلاق المركز: ${result.error || 'غير معروف'}`)
      }
    } catch (e: unknown) {
      setApiError(`خطأ في إغلاق المركز: ${e instanceof Error ? e.message : 'غير معروف'}`)
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
          setApiError(`فشل في إغلاق المركز ${pos.symbol}: ${result.error || 'غير معروف'}`)
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
      setApiError(`خطأ في إغلاق المراكز: ${e instanceof Error ? e.message : 'غير معروف'}`)
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
      const closedAt = p.closedAt ? new Date(p.closedAt).getTime() : 0
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
  const totalRealizedPnl = dateFilteredClosedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0) + dedupedPaperPnl
  // FIX V140: totalTradePnl now uses the same deduped logic
  const totalTradePnl = dateFilteredClosedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0) + dedupedPaperPnl
  // FIX V140: Win rate uses combined history (deduped), not separate arrays
  const winningCount = dateFilteredClosedPositions.filter(p => (p.realizedPnl || 0) > 0).length
    + dateFilteredPaperTrades.filter(p => (p.realizedPnl || 0) > 0 && !dateFilteredClosedPositions.some(cp => cp.symbol === p.symbol && Math.abs((cp.entryPrice || 0) - p.entryPrice) < 0.01)).length
  const losingCount = dateFilteredClosedPositions.filter(p => (p.realizedPnl || 0) < 0).length
    + dateFilteredPaperTrades.filter(p => (p.realizedPnl || 0) < 0 && !dateFilteredClosedPositions.some(cp => cp.symbol === p.symbol && Math.abs((cp.entryPrice || 0) - p.entryPrice) < 0.01)).length
  const totalTradeCount = dateFilteredClosedPositions.length + dateFilteredPaperTrades.filter(t => !dateFilteredClosedPositions.some(p => p.symbol === t.symbol && Math.abs((p.entryPrice || 0) - t.entryPrice) < 0.01)).length
  const winRate = totalTradeCount > 0 ? (winningCount / totalTradeCount) * 100 : 0

  // ── Performance chart data (daily P&L from trades + closed paper trades) ──
  const performanceData = (() => {
    const dailyMap: Record<string, { date: string; pnl: number; trades: number }> = {}
    trades.forEach(t => {
      const day = new Date(t.executedAt).toISOString().split('T')[0]
      if (!dailyMap[day]) dailyMap[day] = { date: day, pnl: 0, trades: 0 }
      dailyMap[day].pnl += (t.pnl || 0)
      dailyMap[day].trades++
    })
    closedPaperTrades.forEach(p => {
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
  const avgWin = winningCount > 0 ? totalRealizedPnl > 0 ? totalRealizedPnl / winningCount : 0 : 0
  const avgLoss = losingCount > 0 ? totalRealizedPnl < 0 ? Math.abs(totalRealizedPnl) / losingCount : 0 : 0
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
          : p.currentPrice
            ? Number(p.currentPrice)
            : undefined
      return {
        id: p.id, symbol: p.symbol, side: p.side,
        type: p.source === 'smart_executor' ? 'SMART' :
              p.source === 'agent' ? 'AGENT' :
              p.source === 'auto_paper' ? 'PAPER' : 'MANUAL',
        quantity: p.quantity, price: p.entryPrice, pnl: p.realizedPnl || 0,
        exitPrice: derivedExitPrice,
        fee: null, feeCurrency: null, executedAt: p.closedAt || p.openedAt,
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
      direction: 'rtl',
      fontFamily: "'Cairo', sans-serif",
    }}>
      {/* Scoped styles injected via useScopedStyle to avoid Next.js 16 "Node cannot be found" error */}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: T.blue }} />
        <h1 style={{
          fontFamily: "'Cairo', sans-serif", fontWeight: 900,
          fontSize: 18, color: T.text, margin: 0,
        }}>المحفظة</h1>
        <div style={{ flex: 1 }} />
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
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      {/* ── API Error Banner ── */}
      {apiError && <ApiErrorBanner error={apiError} onRetry={fetchAll} />}

      {/* ── Stats cards ── */}
      <div className="portfolio-stats-row" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatCard
          label="المراكز المفتوحة" value={String(positions.length)}
          color={T.cyan} icon={BarChart2}
          sub={`القيمة: $${fmt(summary?.totalValue || 0, 0)}`}
        />
        <StatCard
          label="أ.خ غير محققة" value={`${totalUnrealizedPnl > 0 ? '+' : totalUnrealizedPnl < 0 ? '-' : ''}$${fmt(Math.abs(totalUnrealizedPnl), 2)}`}
          color={totalUnrealizedPnl > 0 ? T.green : totalUnrealizedPnl < 0 ? T.red : T.text2}
          icon={totalUnrealizedPnl > 0 ? TrendingUp : totalUnrealizedPnl < 0 ? TrendingDown : BarChart2}
        />
        <StatCard
          label="أرباح محققة" value={`${totalRealizedPnl > 0 ? '+' : totalRealizedPnl < 0 ? '-' : ''}$${fmt(Math.abs(totalRealizedPnl), 2)}`}
          color={totalRealizedPnl > 0 ? T.green : totalRealizedPnl < 0 ? T.red : T.text2}
          icon={TrendingUp}
          sub={`${closedPositions.length} صفقة مغلقة`}
        />
        <StatCard
          label="نسبة الفوز" value={`${winRate.toFixed(1)}%`}
          sub={`من ${totalTradeCount} صفقة`}
          color={T.amber} icon={Target}
          note={winRate >= 60 ? 'ممتاز' : winRate >= 40 ? 'جيد' : undefined}
        />
        <StatCard
          label="Sharpe Ratio" value={sharpeRatio !== null ? sharpeRatio.toFixed(2) : '—'}
          color={T.purple} icon={Award}
        />
      </div>

      {/* ── Tabs ── */}
      <div className="portfolio-tabs-row" style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <TabButton label="الصفقات" icon={Activity} active={tab === 'positions'} onClick={() => setTab('positions')} count={positions.length + closedPositions.length + closedPaperTrades.length} />
        <TabButton label="الأداء" icon={TrendingUp} active={tab === 'performance'} onClick={() => setTab('performance')} />
        <TabButton label="المخاطر" icon={Shield} active={tab === 'risk'} onClick={() => setTab('risk')} />
        <TabButton label="المُدرّب الذكي" icon={Brain} active={tab === 'coach'} onClick={() => setTab('coach')} />
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
              }}>توزيع المراكز</div>
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
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد مراكز مفتوحة</span>
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
              }}>منحنى الأرباح المحققة</div>
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
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد بيانات أداء بعد</span>
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
              }}>الصفقات المفتوحة</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text3 }}>
                {positions.length} مركز
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
                <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3, marginTop: 8 }}>جاري التحميل...</p>
              </div>
            ) : positions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Activity size={28} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 8px' }} />
                <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3 }}>لا توجد صفقات مفتوحة حالياً</p>
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
                        }}>{pos.side === 'BUY' ? 'شراء ↑' : 'بيع ↓'}</span>
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
                      <div><span style={{ color: T.text3 }}>الكمية: </span><span style={{ color: T.text2 }}>{pos.quantity}</span></div>
                      <div><span style={{ color: T.text3 }}>دخول: </span><span style={{ color: T.text2 }}>{formatPrice(pos.entryPrice, pos.symbol)}</span></div>
                      <div><span style={{ color: T.text3 }}>حالي: </span><span style={{ color: T.text, fontWeight: 700 }}>{pos.currentPrice ? formatPrice(pos.currentPrice, pos.symbol) : '—'}</span></div>
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
                <div role="table" aria-label="الصفقات المفتوحة" style={{ minWidth: 800 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 70px 70px 90px 90px 80px 80px 80px 80px',
                  padding: '5px 14px', gap: 0,
                  borderBottom: `0.5px solid ${T.border}`,
                }}>
                  {['الزوج','اتجاه','حجم','سعر الدخول','السعر الحالي','SL','TP','P&L','إجراء'].map((h) => (
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
                      }}>{pos.side === 'BUY' ? 'شراء ↑' : 'بيع ↓'}</span>
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
                        {closing === pos.id ? '...' : 'إغلاق'}
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
              }}>الصفقات المغلقة</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text3 }}>
                {closedPositions.length + closedPaperTrades.length} صفقة
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
                  <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3 }}>لا توجد صفقات مغلقة مطابقة</p>
                  <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginTop: 4 }}>حاول تغيير إعدادات الفلترة أو ابدأ التداول</p>
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
                          {{ ALL: 'الكل', DAY: 'يومي', WEEK: 'أسبوعي', MONTH: 'شهري', YEAR: 'سنوي', CUSTOM: 'محدد' }[period]}
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
                      placeholder="بحث بالرمز..."
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
                      <option value="ALL">كل الاتجاهات</option>
                      <option value="BUY">شراء</option>
                      <option value="SELL">بيع</option>
                    </select>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as any)}
                      style={{
                        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                        padding: '4px 8px', color: T.text, fontSize: 11, fontFamily: "'Cairo', sans-serif", outline: 'none'
                      }}
                    >
                      <option value="ALL">كل النتائج</option>
                      <option value="WIN">رابحة</option>
                      <option value="LOSS">خاسرة</option>
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
                              }}>{pt.type === 'SMART' ? 'منفذ' : pt.type === 'AGENT' ? 'وكيل' : pt.type === 'PAPER' ? 'ورقي' : 'يدوي'}</span>
                              <span style={{
                                padding: '1px 6px', borderRadius: 4,
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                                background: pt.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                                color: pt.side === 'BUY' ? T.green : T.red,
                                border: `0.5px solid ${pt.side === 'BUY' ? T.green : T.red}44`,
                              }}>{pt.side === 'BUY' ? 'شراء' : 'بيع'}</span>
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
                            <div><span style={{ color: T.text3 }}>حجم: </span><span style={{ color: T.text2 }}>{pt.quantity}</span></div>
                            <div><span style={{ color: T.text3 }}>دخول: </span><span style={{ color: T.text2 }}>{formatPrice(pt.price, pt.symbol)}</span></div>
                            <div><span style={{ color: T.text3 }}>إغلاق: </span><span style={{ color: T.text2 }}>{pt.exitPrice ? formatPrice(pt.exitPrice, pt.symbol) : '—'}</span></div>
                            <div><span style={{ color: T.text3 }}>مدة: </span><span style={{ color: T.text2 }}>{formatDuration(pt.openedAt, pt.executedAt)}</span></div>
                            <div><span style={{ color: T.text3 }}>وقت: </span><span style={{ color: T.text2 }}>{pt.executedAt ? new Date(pt.executedAt).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <>
                  <div role="table" aria-label="الصفقات المغلقة" style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 70px 70px 80px 80px 80px 80px 70px 110px',
                    padding: '5px 14px', gap: 0,
                    borderBottom: `0.5px solid ${T.border}`,
                  }}>
                    {['الزوج','اتجاه','حجم','دخول','إغلاق','ر.خ محققة','الحالة','المدة','وقت الإغلاق'].map((h) => (
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
                        gridTemplateColumns: '100px 70px 70px 80px 80px 80px 80px 70px 110px',
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
                        }}>{pt.type === 'SMART' ? 'منفذ' : pt.type === 'AGENT' ? 'وكيل' : pt.type === 'PAPER' ? 'ورقي' : 'يدوي'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: 3,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                          background: pt.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                          color: pt.side === 'BUY' ? T.green : T.red,
                        }}>{pt.side === 'BUY' ? 'شراء' : 'بيع'}</span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{pt.quantity}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{formatPrice(pt.price, pt.symbol)}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>
                        {pt.exitPrice ? formatPrice(pt.exitPrice, pt.symbol) : '—'}
                      </div>
                      <div style={{
                        textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10, fontWeight: 700,
                        color: (pt.pnl || 0) > 0 ? T.green : (pt.pnl || 0) < 0 ? T.red : T.text2,
                      }}>
                        {(pt.pnl || 0) > 0 ? '+' : (pt.pnl || 0) < 0 ? '-' : ''}${fmt(Math.abs(pt.pnl || 0))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: 3,
                          fontFamily: "'Cairo', sans-serif", fontSize: 9, fontWeight: 700,
                          background: `${T.blue}18`, color: T.blue,
                        }}>مغلقة</span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text3 }}>
                        {formatDuration(pt.openedAt, pt.executedAt)}
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
            <StatCard label="إجمالي الصفقات" value={String(trades.length)} color={T.blue} icon={Activity} />
            <StatCard label="صفقات فائزة" value={String(winningCount)} color={T.green} icon={TrendingUp} sub={`${winRate.toFixed(1)}%`} />
            <StatCard label="صفقات خاسرة" value={String(losingCount)} color={T.red} icon={TrendingDown} />
            <StatCard label="متوسط الربح" value={`$${fmt(avgWin, 2)}`} color={T.green} icon={TrendingUp} />
            <StatCard label="متوسط الخسارة" value={`$${fmt(avgLoss, 2)}`} color={T.red} icon={TrendingDown} />
          </div>

          {/* Daily P&L Bar Chart */}
          <div style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 12,
          }}>
            <div style={{
              fontFamily: "'Cairo', sans-serif", fontWeight: 700,
              fontSize: 12, color: T.text, marginBottom: 8,
            }}>الربح/الخسارة اليومي</div>
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
                <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد بيانات أداء بعد — نفّذ صفقات لرؤية التحليل</span>
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
            }}>منحنى رأس المال التراكمي</div>
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
                <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>لا توجد بيانات أداء بعد</span>
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
            <StatCard label="معامل الربح" value={profitFactor >= 999 ? '999+' : profitFactor.toFixed(2)} color={T.green} icon={TrendingUp}
              note={profitFactor >= 2 ? 'ممتاز' : profitFactor >= 1.5 ? 'جيد' : profitFactor >= 1 ? 'مقبول' : 'خطر'} />
            <StatCard label="أقصى انخفاض" value={`$${fmt(maxDrawdown, 2)}`} color={T.red} icon={TrendingDown}
              note={maxDrawdown === 0 ? 'لا انخفاض' : undefined} />
            <StatCard label="Sharpe Ratio" value={sharpeRatio !== null ? sharpeRatio.toFixed(2) : '—'} color={T.purple} icon={Award}
              note={sharpeRatio !== null ? (sharpeRatio >= 2 ? 'ممتاز' : sharpeRatio >= 1 ? 'جيد' : 'ضعيف') : undefined} />
            <StatCard label="مخاطر مفتوحة" value={String(positions.length)} color={T.amber} icon={Shield}
              sub={`${positions.filter(p => !p.stopLoss).length} بدون وقف خسارة`} />
          </div>

          {/* Risk Breakdown */}
          <div style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 10, padding: '16px', marginBottom: 12,
          }}>
            <div style={{
              fontFamily: "'Cairo', sans-serif", fontWeight: 700,
              fontSize: 12, color: T.text, marginBottom: 12,
            }}>تحليل المخاطر التفصيلي</div>

            {/* Risk metrics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Win/Loss ratio */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>نسبة الفوز/الخسارة</div>
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
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.green }}>{winningCount} فوز</span>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.red }}>{losingCount} خسارة</span>
                </div>
              </div>

              {/* Avg win vs avg loss */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>متوسط الربح vs متوسط الخسارة</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>متوسط الربح</span>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: T.green }}>+${fmt(avgWin, 2)}</div>
                  </div>
                  <div style={{ textAlign: 'start' }}>
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>متوسط الخسارة</span>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: T.red }}>-${fmt(avgLoss, 2)}</div>
                  </div>
                </div>
              </div>

              {/* Open exposure */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>التعرض المفتوح</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: totalUnrealizedPnl > 0 ? T.green : totalUnrealizedPnl < 0 ? T.red : T.text2 }}>
                  {totalUnrealizedPnl > 0 ? '+' : totalUnrealizedPnl < 0 ? '-' : ''}${fmt(Math.abs(totalUnrealizedPnl), 2)}
                </div>
                <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>عبر {positions.length} مركز مفتوح</span>
              </div>

              {/* SL coverage */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${positions.some(p => !p.stopLoss) ? T.red + '44' : T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>تغطية وقف الخسارة</div>
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
                        ⚠️ تحذير: {positions.filter(p => !p.stopLoss).length} مركز بدون وقف خسارة!
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3 }}>لا توجد مراكز مفتوحة</span>
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
              <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 700, color: T.amber, marginBottom: 2 }}>تنبيه إدارة المخاطر</div>
              <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3, lineHeight: 1.6 }}>
                التداول ينطوي على مخاطر عالية. الأداء السابق لا يضمن النتائج المستقبلية.
                استخدم دائماً وقف الخسارة وإدارة حجم المركز المناسبة.
                رؤى لا تلمس أموالك أبداً — نتابع حساباتك المربوطة فقط من خلال مفاتيح API المشفرة.
              </div>
            </div>
          </div>
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
