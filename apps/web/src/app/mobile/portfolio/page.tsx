'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight, TrendingUp, TrendingDown, Filter, X,
  Plus, XCircle, Wallet, Activity, BarChart3, AlertTriangle,
  RefreshCw, ArrowUpDown, Link2, Eye, EyeOff, ExternalLink,
  Clock, CheckCircle, XCircle as XCircleIcon, Loader2, Shield,
  CreditCard, Zap, CircleDollarSign, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { usePaperTradesStore, type PaperTrade, type ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { ScopedStyle } from '@/components/ScopedStyle'

// ── Design Tokens ──
const T = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
  bgApp: '#000000',
  font: "'Cairo', sans-serif",
  mono: "'JetBrains Mono', monospace",
}

// ── Helpers ──
const fmt = (n: number) => Math.abs(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${fmt(n)}`
}
const pctStr = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

// ── Alpaca Account Type ──
interface AlpacaAccount {
  equity: number
  buyingPower: number
  cash: number
  portfolioValue: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  longMarketValue: number
  shortMarketValue: number
  isPaperTrading: boolean
  status?: string
  accountNumber?: string
  createdAt?: string
}

// ── Alpaca Position Type ──
interface AlpacaPosition {
  id: string
  symbol: string
  side: string
  qty: number
  avgEntryPrice: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  assetClass: string
}

// ── Alpaca Order Type ──
interface AlpacaOrder {
  id: string
  symbol: string
  side: string
  type: string
  qty: number
  filledAvgPrice: number | null
  limitPrice: number | null
  status: string
  submittedAt: string
  filledAt: string | null
}

// ── Credential Type ──
interface Credential {
  id: string
  provider: string
  isActive: boolean
  isPaper: boolean
  label?: string
}

// ── Sparkline Component ──
function Sparkline({ data, color, width = 140, height = 48 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 4
  const w = width
  const h = height
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 6)}`
  const lastY = parseFloat(pts[pts.length - 1].split(',')[1])

  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M${pts.join(' L')} L${w - pad},${h} L${pad},${h} Z`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={w - pad}
        cy={lastY}
        r="3"
        fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  )
}

// ── Risk Score Ring ──
function RiskScoreRing({ score }: { score: number }) {
  const r = 40
  const circ = 2 * Math.PI * r
  const dashLen = (score / 100) * circ
  const color = score < 35 ? T.success : score < 65 ? T.amber : T.danger
  const label = score < 35 ? 'منخفض' : score < 65 ? 'متوسط' : 'مرتفع'

  return (
    <div style={{ position: 'relative', width: r * 2 + 16, height: r * 2 + 16 }}>
      <svg width={r * 2 + 16} height={r * 2 + 16} viewBox={`0 0 ${r * 2 + 16} ${r * 2 + 16}`}>
        <circle
          cx={r + 8} cy={r + 8} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        <circle
          cx={r + 8} cy={r + 8} r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dashLen} ${circ}`}
          transform={`rotate(-90 ${r + 8} ${r + 8})`}
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.mono }}>{score}</span>
        <span style={{ fontSize: 9, color, fontFamily: T.font, fontWeight: 700 }}>{label}</span>
      </div>
    </div>
  )
}

// ── Glass Card ──
function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(28,28,30,0.6)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      border: `1px solid ${T.border}`,
      borderRadius: 28,
      padding: '18px 20px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Section Title ──
function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingInlineEnd: 4 }}>
      {Icon && <Icon size={14} color={T.accent} />}
      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>{children}</span>
    </div>
  )
}

// ── Skeleton Loader ──
function Skeleton({ w = '100%', h = 16, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  )
}

// ── Main Component ──
export default function MobilePortfolioPage() {
  const router = useRouter()
  const { trades: openTrades, closedTrades, clearAll } = usePaperTradesStore()
  const positionsStore = usePositionsStore()
  const quotes = useMarketStore(s => s.quotes)

  // Account data state
  const [account, setAccount] = useState<AlpacaAccount | null>(null)
  const [accountLoading, setAccountLoading] = useState(true)
  const [accountError, setAccountError] = useState<string | null>(null)

  // Real Alpaca positions
  const [alpacaPositions, setAlpacaPositions] = useState<AlpacaPosition[]>([])
  const [positionsLoading, setPositionsLoading] = useState(true)

  // Real Alpaca orders
  const [alpacaOrders, setAlpacaOrders] = useState<AlpacaOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)

  // Credentials / account linking
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [isLinked, setIsLinked] = useState(false)

  // Performance chart data
  const [chartData, setChartData] = useState<number[]>([])
  const [chartLoading, setChartLoading] = useState(true)

  // Filters
  const [filterSide, setFilterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL')
  const [showFilter, setShowFilter] = useState(false)
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions')

  // Refresh
  const [refreshing, setRefreshing] = useState(false)

  // Balance visibility
  const [showBalance, setShowBalance] = useState(true)

  // ── Fetch Account Data ──
  const fetchAccount = useCallback(async () => {
    setAccountLoading(true)
    setAccountError(null)
    try {
      const res = await fetch('/api/alpaca/account')
      const j = await res.json()
      if (j.success && j.data) {
        const acc = j.data
        setAccount({
          equity: Number(acc.equity) || 0,
          buyingPower: Number(acc.buying_power || acc.buyingPower) || 0,
          cash: Number(acc.cash) || 0,
          portfolioValue: Number(acc.portfolio_value || acc.portfolioValue) || 0,
          unrealizedPnl: Number(acc.unrealized_pl || acc.unrealizedPnl) || 0,
          unrealizedPnlPct: Number(acc.unrealized_plpc || acc.unrealizedPnlPct) || 0,
          longMarketValue: Number(acc.long_market_value || acc.longMarketValue) || 0,
          shortMarketValue: Number(acc.short_market_value || acc.shortMarketValue) || 0,
          isPaperTrading: acc.is_paper_trading ?? acc.isPaperTrading ?? true,
          status: acc.status,
          accountNumber: acc.account_number || acc.accountNumber,
          createdAt: acc.created_at || acc.createdAt,
        })
        setIsLinked(true)
      } else {
        // Fallback to positions store
        if (positionsStore.account) {
          const a = positionsStore.account as any
          setAccount({
            equity: Number(a.equity) || 0,
            buyingPower: Number(a.buying_power || a.buyingPower) || 0,
            cash: Number(a.cash) || 0,
            portfolioValue: Number(a.portfolio_value || a.portfolioValue) || 0,
            unrealizedPnl: Number(a.unrealized_pl || a.unrealizedPnl) || 0,
            unrealizedPnlPct: Number(a.unrealized_plpc || a.unrealizedPnlPct) || 0,
            longMarketValue: Number(a.long_market_value || a.longMarketValue) || 0,
            shortMarketValue: Number(a.short_market_value || a.shortMarketValue) || 0,
            isPaperTrading: a.is_paper_trading ?? a.isPaperTrading ?? true,
          })
        } else {
          // Compute from paper trades
          const totalUnrealizedPnl = openTrades.reduce((s, t) => s + t.unrealizedPnl, 0)
          const totalEntryValue = openTrades.reduce((s, t) => s + t.entryPrice * t.qty, 0)
          setAccount({
            equity: totalEntryValue + totalUnrealizedPnl,
            buyingPower: 0,
            cash: 0,
            portfolioValue: totalEntryValue,
            unrealizedPnl: totalUnrealizedPnl,
            unrealizedPnlPct: totalEntryValue > 0 ? (totalUnrealizedPnl / totalEntryValue) * 100 : 0,
            longMarketValue: totalEntryValue,
            shortMarketValue: 0,
            isPaperTrading: true,
          })
        }
      }
    } catch {
      const totalUnrealizedPnl = openTrades.reduce((s, t) => s + t.unrealizedPnl, 0)
      const totalEntryValue = openTrades.reduce((s, t) => s + t.entryPrice * t.qty, 0)
      setAccount({
        equity: totalEntryValue + totalUnrealizedPnl,
        buyingPower: 0,
        cash: 0,
        portfolioValue: totalEntryValue,
        unrealizedPnl: totalUnrealizedPnl,
        unrealizedPnlPct: totalEntryValue > 0 ? (totalUnrealizedPnl / totalEntryValue) * 100 : 0,
        longMarketValue: totalEntryValue,
        shortMarketValue: 0,
        isPaperTrading: true,
      })
      setAccountError('لا يمكن الاتصال بالخادم')
    } finally {
      setAccountLoading(false)
    }
  }, [openTrades, positionsStore.account])

  // ── Fetch Real Alpaca Positions ──
  const fetchPositions = useCallback(async () => {
    setPositionsLoading(true)
    try {
      const res = await fetch('/api/alpaca/positions')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        setAlpacaPositions(j.data.map((p: any) => ({
          id: p.id || p.asset_id,
          symbol: p.symbol,
          side: p.side || (Number(p.qty) > 0 ? 'long' : 'short'),
          qty: Number(p.qty) || 0,
          avgEntryPrice: Number(p.avg_entry_price || p.avgEntryPrice) || 0,
          currentPrice: Number(p.current_price || p.currentPrice) || 0,
          marketValue: Number(p.market_value || p.marketValue) || 0,
          unrealizedPnl: Number(p.unrealized_pl || p.unrealizedPnl) || 0,
          unrealizedPnlPct: Number(p.unrealized_plpc || p.unrealizedPnlPct) || 0,
          assetClass: p.asset_class || p.assetClass || 'us_equity',
        })))
      } else {
        setAlpacaPositions([])
      }
    } catch {
      setAlpacaPositions([])
    } finally {
      setPositionsLoading(false)
    }
  }, [])

  // ── Fetch Real Alpaca Orders ──
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch('/api/alpaca/orders?status=all&limit=20')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        setAlpacaOrders(j.data.map((o: any) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          type: o.type,
          qty: Number(o.qty) || 0,
          filledAvgPrice: o.filled_avg_price ? Number(o.filled_avg_price) : null,
          limitPrice: o.limit_price ? Number(o.limit_price) : null,
          status: o.status,
          submittedAt: o.submitted_at || o.submittedAt,
          filledAt: o.filled_at || o.filledAt,
        })))
      } else {
        setAlpacaOrders([])
      }
    } catch {
      setAlpacaOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  // ── Fetch Credentials ──
  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      const j = await res.json()
      const creds = j.data || j.credentials || []
      setCredentials(creds)
      setIsLinked(creds.length > 0 && creds.some((c: any) => c.isActive !== false))
    } catch {
      setCredentials([])
      setIsLinked(false)
    }
  }, [])

  // ── Fetch Chart Data ──
  const fetchChartData = useCallback(async () => {
    setChartLoading(true)
    try {
      // Try real portfolio history endpoint
      const res = await fetch('/api/alpaca/account/history?period=1M')
      const j = await res.json()
      if (j.success && Array.isArray(j.data) && j.data.length > 2) {
        const data = j.data.map((p: any) => Number(p.equity || p.value || 0)).filter(Boolean)
        if (data.length > 2) {
          setChartData(data)
          return
        }
      }
      // No real chart data available — show empty state instead of fake data
      setChartData([])
    } catch {
      // No real chart data available — show empty state instead of fake data
      setChartData([])
    } finally {
      setChartLoading(false)
    }
  }, [account?.equity])

  // ── Initialize all data ──
  useEffect(() => {
    fetchAccount()
  }, [fetchAccount])

  useEffect(() => {
    fetchPositions()
    fetchOrders()
    fetchCredentials()
  }, [])

  useEffect(() => {
    if (account) fetchChartData()
  }, [account, fetchChartData])

  // ── Pull to Refresh ──
  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchAccount(), fetchPositions(), fetchOrders(), fetchCredentials(), fetchChartData()])
    setRefreshing(false)
  }

  // ── Combined positions (Alpaca real + paper trades) ──
  const allPositions = useMemo(() => {
    const real = alpacaPositions.map(p => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      value: p.marketValue,
      pnl: p.unrealizedPnl,
      pnlPct: p.unrealizedPnlPct * 100,
      qty: p.qty,
      avgEntry: p.avgEntryPrice,
      currentPrice: p.currentPrice,
      source: 'live' as const,
    }))

    // Add paper trades that aren't duplicated with real positions
    const realSymbols = new Set(real.map(p => p.symbol))
    const paper = openTrades
      .filter(t => !realSymbols.has(t.symbol))
      .map(t => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        value: t.entryPrice * t.qty,
        pnl: t.unrealizedPnl,
        pnlPct: t.unrealizedPct * 100,
        qty: t.qty,
        avgEntry: t.entryPrice,
        currentPrice: t.currentPrice,
        source: 'paper' as const,
      }))

    return [...real, ...paper]
  }, [alpacaPositions, openTrades])

  const totalPositionValue = allPositions.reduce((s, p) => s + p.value, 0)

  // ── Combined order history (Alpaca real + closed paper trades) ──
  const allHistory = useMemo(() => {
    const realOrders = alpacaOrders
      .filter(o => o.status === 'filled' || o.status === 'partially_filled')
      .map(o => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side.toUpperCase() as 'BUY' | 'SELL',
        entryPrice: o.filledAvgPrice || o.limitPrice || 0,
        exitPrice: o.filledAvgPrice || 0,
        pnl: 0, // Realized P&L needs matching logic
        time: new Date(o.submittedAt).getTime(),
        source: 'live' as const,
        status: o.status,
        type: o.type,
      }))

    const paperTrades = closedTrades.map(t => ({
      id: t.id,
      symbol: t.symbol,
      side: (t.side === 'long' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      pnl: t.realizedPnl,
      time: t.closeTime,
      source: 'paper' as const,
      status: 'filled' as const,
      type: 'market' as const,
    }))

    return [...realOrders, ...paperTrades].sort((a, b) => b.time - a.time)
  }, [alpacaOrders, closedTrades])

  const filteredHistory = useMemo(() => {
    return allHistory.filter(t => {
      if (filterSide !== 'ALL' && t.side !== filterSide) return false
      if (filterResult === 'WIN' && t.pnl < 0) return false
      if (filterResult === 'LOSS' && t.pnl >= 0) return false
      return true
    })
  }, [allHistory, filterSide, filterResult])

  const totalPnl = useMemo(() => allHistory.reduce((s, t) => s + t.pnl, 0), [allHistory])
  const winCount = useMemo(() => allHistory.filter(t => t.pnl >= 0).length, [allHistory])
  const winRate = allHistory.length > 0 ? Math.round((winCount / allHistory.length) * 100) : 0

  // Risk score
  const riskScore = useMemo(() => {
    let score = 30
    score += Math.min(allPositions.length * 5, 25)
    if (winRate < 50) score += 15
    else if (winRate < 65) score += 5
    const unrealizedLoss = allPositions.filter(p => p.pnl < 0).reduce((s, p) => s + Math.abs(p.pnl), 0)
    if (unrealizedLoss > 500) score += 15
    // Concentration risk
    if (allPositions.length > 0) {
      const maxPosition = Math.max(...allPositions.map(p => p.value))
      if (totalPositionValue > 0 && maxPosition / totalPositionValue > 0.5) score += 10
    }
    return Math.min(score, 100)
  }, [allPositions, winRate, totalPositionValue])

  // Daily change
  const dailyChange = useMemo(() => {
    if (chartData.length < 2) return account?.unrealizedPnlPct ? account.unrealizedPnlPct * 100 : 0
    const prev = chartData[chartData.length - 2]
    const curr = chartData[chartData.length - 1]
    return prev > 0 ? ((curr - prev) / prev) * 100 : 0
  }, [chartData, account?.unrealizedPnlPct])

  // Close a single position
  const handleClosePosition = useCallback(async (symbol: string, qty: number) => {
    try {
      const res = await fetch('/api/alpaca/positions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, qty }),
      })
      const j = await res.json()
      if (j.success) {
        setTimeout(() => { fetchPositions(); fetchAccount() }, 1000)
      }
    } catch {}
  }, [fetchPositions, fetchAccount])

  return (
    <div style={{ minHeight: '100%', background: T.bgApp, direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
      {/* ── Global Keyframe ── */}
      <ScopedStyle>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</ScopedStyle>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 12px) 16px 16px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.08) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: T.text2,
            }}
          >
            <ChevronRight size={18} />
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.font }}>المحفظة</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowBalance(!showBalance)}
            style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: T.text2,
            }}
          >
            {showBalance ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: T.text2,
            }}
          >
            <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Account Linking Status ── */}
      {!isLinked && (
        <div style={{ margin: '4px 16px 8px' }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/mobile/kyc')}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 18,
              background: `linear-gradient(135deg, ${T.accent}15, ${T.accent}08)`,
              border: `1px solid ${T.accent}30`,
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: `${T.accent}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${T.accent}25`,
            }}>
              <Link2 size={20} color={T.accent} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: T.accent, fontFamily: T.font }}>اربط حساب الوساطة</p>
              <p style={{ fontSize: 10, color: T.text2, fontFamily: T.font }}>ربط حساب Alpaca لتفعيل التداول الحي</p>
            </div>
            <ExternalLink size={16} color={T.accent} />
          </motion.button>
        </div>
      )}

      {/* ── Total Balance Hero Card ── */}
      <div style={{ margin: '4px 16px 12px' }}>
        <GlassCard style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Subtle gradient accent */}
          <div style={{
            position: 'absolute', top: -30, right: -30,
            width: 120, height: 120, borderRadius: '50%',
            background: `radial-gradient(circle, ${T.accent}15, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          {accountLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton w="30%" h={12} />
              <Skeleton w="60%" h={32} />
              <Skeleton w="25%" h={14} />
            </div>
          ) : accountError && !account ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <AlertTriangle size={24} color={T.amber} style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: T.text2, fontFamily: T.font }}>{accountError}</p>
              <button
                onClick={fetchAccount}
                style={{
                  marginTop: 8, padding: '6px 16px', borderRadius: 10,
                  background: `${T.accent}15`, border: `1px solid ${T.accent}30`,
                  color: T.accent, fontSize: 11, fontFamily: T.font, cursor: 'pointer',
                }}
              >
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Wallet size={12} color={T.text2} />
                <span style={{ fontSize: 11, color: T.text2, fontFamily: T.font }}>
                  إجمالي الأصول
                </span>
                {account?.isPaperTrading && (
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 5,
                    background: `${T.amber}15`, color: T.amber,
                    fontFamily: T.font, fontWeight: 700,
                  }}>
                    ورقي
                  </span>
                )}
                {isLinked && !account?.isPaperTrading && (
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 5,
                    background: `${T.success}15`, color: T.success,
                    fontFamily: T.font, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <Shield size={8} /> مباشر
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 34, fontWeight: 800, color: T.text, fontFamily: T.mono, lineHeight: 1.1 }}>
                    {showBalance ? `$${account ? fmt(account.equity) : '0.00'}` : '••••••'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    {dailyChange >= 0 ? (
                      <TrendingUp size={13} color={T.success} />
                    ) : (
                      <TrendingDown size={13} color={T.danger} />
                    )}
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: dailyChange >= 0 ? T.success : T.danger,
                      fontFamily: T.mono,
                    }}>
                      {showBalance ? `${pctStr(dailyChange)} اليوم` : '••••'}
                    </span>
                  </div>
                </div>

                {chartLoading ? (
                  <Skeleton w={140} h={48} r={8} />
                ) : chartData.length > 1 ? (
                  <Sparkline data={chartData} color={dailyChange >= 0 ? T.success : T.danger} />
                ) : null}
              </div>

              {/* Stats Row */}
              <div style={{
                display: 'flex', gap: 8, marginTop: 16, paddingTop: 14,
                borderTop: `1px solid ${T.border}`,
              }}>
                {[
                  { label: 'القوة الشرائية', value: account ? fmtCompact(account.buyingPower) : '—', color: T.accent },
                  { label: 'ربح/خسارة', value: totalPnl >= 0 ? `+$${fmt(totalPnl)}` : `-$${fmt(totalPnl)}`, color: totalPnl >= 0 ? T.success : T.danger },
                  { label: 'نسبة الفوز', value: `${winRate}%`, color: T.amber },
                ].map((s, i) => (
                  <div key={i} style={{
                    flex: 1, textAlign: 'center', padding: '10px 6px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 14,
                    border: `1px solid ${T.border}`,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontFamily: T.mono }}>{showBalance ? s.value : '•••'}</div>
                    <div style={{ fontSize: 9, color: T.text2, fontFamily: T.font, marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassCard>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ margin: '0 16px 12px', display: 'flex', gap: 10 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/mobile/trading')}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 20,
            background: `linear-gradient(135deg, ${T.accent}, ${T.accent}cc)`,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: `0 4px 20px ${T.accent}25`,
          }}
        >
          <Plus size={16} color="#000" />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#000', fontFamily: T.font }}>فتح مركز</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/mobile/chart')}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 20,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${T.border}`,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <BarChart3 size={16} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>الشارت</span>
        </motion.button>
      </div>

      {/* ── Risk Score ── */}
      <div style={{ margin: '0 16px 12px' }}>
        <GlassCard>
          <SectionTitle icon={AlertTriangle}>تقييم المخاطر</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <RiskScoreRing score={riskScore} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, fontFamily: T.font, marginBottom: 6,
                color: riskScore < 35 ? T.success : riskScore < 65 ? T.amber : T.danger,
              }}>
                {riskScore < 35 ? 'مستوى آمن' : riskScore < 65 ? 'انتبه' : 'خطر مرتفع'}
              </div>
              <div style={{ fontSize: 10, color: T.text2, fontFamily: T.font, marginBottom: 6 }}>
                مراكز مفتوحة: {allPositions.length}
              </div>
              {allPositions.length > 0 && (
                <div style={{
                  padding: '8px 12px', borderRadius: 10,
                  background: `${T.amber}08`, border: `1px solid ${T.amber}15`,
                }}>
                  <span style={{ fontSize: 10, color: T.amber, fontFamily: T.font }}>
                    أكبر مركز: {[...allPositions].sort((a, b) => b.value - a.value)[0]?.symbol} ({(( [...allPositions].sort((a, b) => b.value - a.value)[0]?.value || 0) / (totalPositionValue || 1) * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ── Tab Switcher: Positions / History ── */}
      <div style={{ margin: '0 16px 12px', display: 'flex', gap: 6, padding: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 14 }}>
        {(['positions', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 12,
              background: activeTab === tab ? T.accent : 'transparent',
              color: activeTab === tab ? '#000' : T.text2,
              fontSize: 13, fontWeight: 800, fontFamily: T.font,
              border: 'none', cursor: 'pointer', transition: '0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {tab === 'positions' ? <Activity size={14} /> : <ArrowUpDown size={14} />}
            {tab === 'positions' ? `المراكز (${allPositions.length})` : `السجل (${allHistory.length})`}
          </button>
        ))}
      </div>

      {/* ── Positions Tab ── */}
      {activeTab === 'positions' && (
        <div style={{ margin: '0 16px 12px' }}>
          <GlassCard>
            <SectionTitle icon={BarChart3}>توزيع الأصول</SectionTitle>
            {positionsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map(i => <Skeleton key={i} h={60} r={16} />)}
              </div>
            ) : allPositions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Activity size={28} color={T.text2} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 12, color: T.text2, fontFamily: T.font }}>لا توجد مراكز مفتوحة</p>
                <p style={{ fontSize: 10, color: 'rgba(235,235,245,0.3)', fontFamily: T.font, marginTop: 4 }}>
                  افتح مركز جديد لبدء التداول
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {allPositions.map((pos, i) => {
                  const pctOfTotal = totalPositionValue > 0 ? (pos.value / totalPositionValue) * 100 : 0
                  const isLong = pos.side === 'long'
                  // Get live quote for real-time P&L
                  const quoteKey = Object.keys(quotes).find(k =>
                    k.toUpperCase().replace('/', '') === pos.symbol.toUpperCase().replace('/', '')
                  )
                  const livePrice = quoteKey ? quotes[quoteKey]?.price : pos.currentPrice

                  return (
                    <motion.div
                      key={`${pos.symbol}-${i}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      style={{
                        padding: '12px 14px', borderRadius: 16,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${pos.pnl >= 0 ? `${T.success}10` : `${T.danger}10`}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: isLong ? `${T.success}12` : `${T.danger}12`,
                            border: `1px solid ${isLong ? `${T.success}25` : `${T.danger}25`}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isLong ? <TrendingUp size={14} color={T.success} /> : <TrendingDown size={14} color={T.danger} />}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.mono }}>{pos.symbol}</p>
                              {pos.source === 'live' && (
                                <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 4, background: `${T.success}18`, color: T.success, fontWeight: 800 }}>LIVE</span>
                              )}
                            </div>
                            <p style={{ fontSize: 10, color: T.text2, fontFamily: T.font, marginTop: 1 }}>
                              {isLong ? 'شراء' : 'بيع'} • {pctOfTotal.toFixed(1)}% • {pos.qty} وحدة
                            </p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'start', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: pos.pnl >= 0 ? T.success : T.danger, fontFamily: T.mono }}>
                            {pos.pnl >= 0 ? '+' : '-'}${fmt(pos.pnl)}
                          </p>
                          <p style={{ fontSize: 10, color: T.text2, fontFamily: T.mono }}>
                            ${fmt(pos.value)}
                          </p>
                        </div>
                      </div>
                      {/* Allocation bar */}
                      <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${Math.min(pctOfTotal, 100)}%`,
                          background: pos.pnl >= 0 ? T.success : T.danger,
                          opacity: 0.6,
                        }} />
                      </div>
                      {/* Close position button */}
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleClosePosition(pos.symbol, pos.qty)}
                          style={{
                            padding: '4px 12px', borderRadius: 8,
                            background: `${T.danger}10`, border: `0.5px solid ${T.danger}20`,
                            color: T.danger, fontSize: 10, fontWeight: 700,
                            fontFamily: T.font, cursor: 'pointer',
                          }}
                        >
                          إغلاق المركز
                        </motion.button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </GlassCard>

          {/* Close All Button */}
          {allPositions.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={async () => {
                // Close all Alpaca positions
                try {
                  await fetch('/api/alpaca/positions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closeAll: true }) })
                } catch {}
                clearAll()
                setTimeout(() => { fetchPositions(); fetchAccount() }, 1000)
              }}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 18,
                background: `${T.danger}08`, border: `1px solid ${T.danger}15`,
                cursor: 'pointer', marginTop: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <XCircle size={16} color={T.danger} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.danger, fontFamily: T.font }}>
                إغلاق جميع المراكز
              </span>
            </motion.button>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {activeTab === 'history' && (
        <div style={{ margin: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <SectionTitle icon={ArrowUpDown}>
              سجل الصفقات {allHistory.length > 0 && `(${filteredHistory.length})`}
            </SectionTitle>
            <button
              onClick={() => setShowFilter(!showFilter)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 10,
                background: showFilter ? `${T.accent}18` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${showFilter ? `${T.accent}30` : T.border}`,
                color: showFilter ? T.accent : T.text2,
                cursor: 'pointer',
              }}
            >
              <Filter size={12} />
              <span style={{ fontSize: 11, fontFamily: T.font }}>فلترة</span>
            </button>
          </div>

          {/* Filter Bar */}
          <AnimatePresence>
            {showFilter && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden', marginBottom: 12 }}
              >
                <div style={{
                  padding: '14px', borderRadius: 18,
                  background: 'rgba(28,28,30,0.6)',
                  backdropFilter: 'blur(20px)',
                  border: `1px solid ${T.border}`,
                }}>
                  <p style={{ fontSize: 10, color: T.text2, fontFamily: T.font, marginBottom: 8 }}>نوع الصفقة</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {(['ALL', 'BUY', 'SELL'] as const).map(s => (
                      <button key={s} onClick={() => setFilterSide(s)}
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 10, border: 'none',
                          background: filterSide === s ? T.accent : 'rgba(255,255,255,0.05)',
                          color: filterSide === s ? '#000' : T.text2,
                          fontSize: 11, fontFamily: T.font,
                          fontWeight: filterSide === s ? 800 : 400,
                          cursor: 'pointer',
                        }}>
                        {s === 'ALL' ? 'الكل' : s === 'BUY' ? 'شراء' : 'بيع'}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: T.text2, fontFamily: T.font, marginBottom: 8 }}>النتيجة</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['ALL', 'WIN', 'LOSS'] as const).map(r => (
                      <button key={r} onClick={() => setFilterResult(r)}
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 10, border: 'none',
                          background: filterResult === r
                            ? (r === 'WIN' ? T.success : r === 'LOSS' ? T.danger : T.accent)
                            : 'rgba(255,255,255,0.05)',
                          color: filterResult === r ? '#000' : T.text2,
                          fontSize: 11, fontFamily: T.font,
                          fontWeight: filterResult === r ? 800 : 400,
                          cursor: 'pointer',
                        }}>
                        {r === 'ALL' ? 'الكل' : r === 'WIN' ? 'رابحة' : 'خاسرة'}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Order History List */}
          {ordersLoading && alpacaOrders.length === 0 ? (
            <GlassCard>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map(i => <Skeleton key={i} h={60} r={16} />)}
              </div>
            </GlassCard>
          ) : allHistory.length === 0 ? (
            <GlassCard>
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Activity size={32} color={T.text2} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                <p style={{ fontSize: 13, color: T.text2, fontFamily: T.font, fontWeight: 600 }}>لا يوجد سجل صفقات</p>
                <p style={{ fontSize: 11, color: 'rgba(235,235,245,0.3)', fontFamily: T.font, marginTop: 4 }}>
                  ستظهر صفقاتك المنفذة هنا
                </p>
              </div>
            </GlassCard>
          ) : filteredHistory.length === 0 ? (
            <GlassCard>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Filter size={24} color={T.text2} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 12, color: T.text2, fontFamily: T.font }}>لا توجد صفقات تطابق الفلتر</p>
              </div>
            </GlassCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
              {filteredHistory.map((trade, i) => {
                const date = new Date(trade.time)
                const timeStr = date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
                const timeClock = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

                return (
                  <motion.div
                    key={trade.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.025 }}
                    style={{
                      padding: '14px 16px', borderRadius: 18,
                      background: 'rgba(28,28,30,0.5)',
                      backdropFilter: 'blur(20px)',
                      border: `1px solid ${trade.pnl >= 0 ? `${T.success}10` : `${T.danger}10`}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10,
                          background: trade.side === 'BUY' ? `${T.success}12` : `${T.danger}12`,
                          border: `1px solid ${trade.side === 'BUY' ? `${T.success}25` : `${T.danger}25`}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {trade.side === 'BUY' ? <TrendingUp size={14} color={T.success} /> : <TrendingDown size={14} color={T.danger} />}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.mono }}>
                              {trade.symbol}
                            </span>
                            <span style={{
                              fontSize: 9, padding: '2px 6px', borderRadius: 5,
                              background: trade.side === 'BUY' ? `${T.success}15` : `${T.danger}15`,
                              color: trade.side === 'BUY' ? T.success : T.danger,
                              fontFamily: T.font, fontWeight: 700,
                            }}>
                              {trade.side === 'BUY' ? 'شراء' : 'بيع'}
                            </span>
                            {trade.source === 'live' && (
                              <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 4, background: `${T.success}18`, color: T.success, fontWeight: 800 }}>LIVE</span>
                            )}
                          </div>
                          <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, marginTop: 2 }}>
                            دخول ${fmt(trade.entryPrice)}{trade.exitPrice > 0 ? ` → خروج $${fmt(trade.exitPrice)}` : ''}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'start' }}>
                        {trade.pnl !== 0 ? (
                          <span style={{
                            fontSize: 15, fontWeight: 800,
                            color: trade.pnl >= 0 ? T.success : T.danger,
                            fontFamily: T.mono,
                          }}>
                            {trade.pnl >= 0 ? '+' : '-'}${fmt(trade.pnl)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: T.text2, fontFamily: T.font }}>
                            {trade.status === 'filled' ? 'منفذة' : trade.status}
                          </span>
                        )}
                        <div style={{ fontSize: 9, color: T.text2, fontFamily: T.font, marginTop: 2 }}>
                          {timeStr} • {timeClock}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Account Info Card ── */}
      {account && (
        <div style={{ margin: '12px 16px 0' }}>
          <GlassCard>
            <SectionTitle icon={CreditCard}>معلومات الحساب</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'رقم الحساب', value: account.accountNumber || '—', color: T.text },
                { label: 'نوع الحساب', value: account.isPaperTrading ? 'ورقي (تجريبي)' : 'حقيقي (مباشر)', color: account.isPaperTrading ? T.amber : T.success },
                { label: 'النقد المتاح', value: `$${fmt(account.cash)}`, color: T.accent },
                { label: 'قيمة الأسهم الطويلة', value: `$${fmt(account.longMarketValue)}`, color: T.success },
                { label: 'قيمة الأسهم القصيرة', value: `$${fmt(account.shortMarketValue)}`, color: T.danger },
                { label: 'الأرباح/الخسائر غير المحققة', value: `${account.unrealizedPnl >= 0 ? '+' : '-'}$${fmt(account.unrealizedPnl)}`, color: account.unrealizedPnl >= 0 ? T.success : T.danger },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 5 ? `0.5px solid ${T.border}` : 'none' }}>
                  <span style={{ fontSize: 11, color: T.text2, fontFamily: T.font }}>{item.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: item.color, fontFamily: T.mono }}>{showBalance ? item.value : '••••'}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
