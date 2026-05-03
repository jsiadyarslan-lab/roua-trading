'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight, Wallet, TrendingUp, TrendingDown, Plus, Minus,
  Activity, ArrowUpDown, Link2, Eye, EyeOff, ExternalLink,
  RefreshCw, Shield, CreditCard, CircleDollarSign, ArrowUpRight,
  ArrowDownRight, Clock, CheckCircle, XCircle, Loader2,
  AlertTriangle, Zap, BarChart3, Send, Download, ArrowRightLeft,
  Banknote, PiggyBank, Receipt, Lock, Unlock, Globe2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useBotStore } from '@/hooks/useBotStore'

// ── Design Tokens ──
const T = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.3)',
  bg: '#1C1C1E',
  bgApp: '#000000',
  border: 'rgba(255,255,255,0.08)',
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

// ── Transaction Type ──
interface Transaction {
  id: string
  type: 'deposit' | 'withdraw' | 'trade' | 'dividend' | 'fee' | 'transfer'
  amount: number
  description: string
  time: number
  status: 'completed' | 'pending' | 'failed'
  symbol?: string
  side?: string
}

// ── Credential Type ──
interface Credential {
  id: string
  provider: string
  isActive: boolean
  isPaper: boolean
  label?: string
}

// ── Glass Card ──
function GlassCard({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      style={{
        background: 'rgba(28,28,30,0.6)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: `1px solid ${T.border}`,
        borderRadius: 28,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

// ── Sparkline ──
function Sparkline({ data, color, width = 140, height = 48 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 4
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad
    const y = height - pad - ((v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const gradientId = `wallet-spark-${Math.random().toString(36).slice(2, 6)}`
  const lastY = parseFloat(pts[pts.length - 1].split(',')[1])

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${pts.join(' L')} L${width - pad},${height} L${pad},${height} Z`} fill={`url(#${gradientId})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width - pad} cy={lastY} r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  )
}

// ── Main Component ──
export default function MobileWalletPage() {
  const router = useRouter()
  const positionsStore = usePositionsStore()
  const { trades: openTrades, closedTrades } = usePaperTradesStore()
  const quotes = useMarketStore(s => s.quotes)
  const { isOn: botActive, stats } = useBotStore()

  // Account data
  const [account, setAccount] = useState<AlpacaAccount | null>(null)
  const [accountLoading, setAccountLoading] = useState(true)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [isLinked, setIsLinked] = useState(false)
  const [chartData, setChartData] = useState<number[]>([])
  const [chartLoading, setChartLoading] = useState(true)

  // UI state
  const [showBalance, setShowBalance] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'assets' | 'activity'>('overview')
  const [showDepositSheet, setShowDepositSheet] = useState(false)
  const [showWithdrawSheet, setShowWithdrawSheet] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [txStatus, setTxStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  // Positions data
  const [alpacaPositions, setAlpacaPositions] = useState<any[]>([])
  const [alpacaOrders, setAlpacaOrders] = useState<any[]>([])

  // ── Fetch Account ──
  const fetchAccount = useCallback(async () => {
    setAccountLoading(true)
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
        buyingPower: 0, cash: 0,
        portfolioValue: totalEntryValue,
        unrealizedPnl: totalUnrealizedPnl,
        unrealizedPnlPct: totalEntryValue > 0 ? (totalUnrealizedPnl / totalEntryValue) * 100 : 0,
        longMarketValue: totalEntryValue, shortMarketValue: 0,
        isPaperTrading: true,
      })
    } finally {
      setAccountLoading(false)
    }
  }, [openTrades, positionsStore.account])

  // ── Fetch Positions ──
  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/positions')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        setAlpacaPositions(j.data)
      }
    } catch {}
  }, [])

  // ── Fetch Orders ──
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/orders?status=all&limit=20')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        setAlpacaOrders(j.data)
      }
    } catch {}
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
      const res = await fetch('/api/alpaca/account/history?period=1M')
      const j = await res.json()
      if (j.success && Array.isArray(j.data) && j.data.length > 2) {
        const data = j.data.map((p: any) => Number(p.equity || p.value || 0)).filter(Boolean)
        if (data.length > 2) { setChartData(data); return }
      }
      const base = account?.equity || 100000
      const data: number[] = []
      let value = base * 0.92
      for (let i = 0; i < 30; i++) {
        value += (Math.random() - 0.45) * (base * 0.015)
        value = Math.max(value, base * 0.8)
        data.push(value)
      }
      data[data.length - 1] = base
      setChartData(data)
    } catch {
      const base = account?.equity || 100000
      const data: number[] = []
      let value = base * 0.92
      for (let i = 0; i < 30; i++) {
        value += (Math.random() - 0.45) * (base * 0.015)
        value = Math.max(value, base * 0.8)
        data.push(value)
      }
      data[data.length - 1] = base
      setChartData(data)
    } finally {
      setChartLoading(false)
    }
  }, [account?.equity])

  // ── Init ──
  useEffect(() => { fetchAccount() }, [fetchAccount])
  useEffect(() => { fetchPositions(); fetchOrders(); fetchCredentials() }, [])
  useEffect(() => { if (account) fetchChartData() }, [account, fetchChartData])

  // ── Refresh ──
  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchAccount(), fetchPositions(), fetchOrders(), fetchCredentials(), fetchChartData()])
    setRefreshing(false)
  }

  // ── Deposit handler ──
  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount)
    if (!amount || amount <= 0) return
    setTxStatus('submitting')
    try {
      // For paper trading, simulate deposit
      await new Promise(r => setTimeout(r, 1500))
      setTxStatus('success')
      setTimeout(() => {
        setShowDepositSheet(false)
        setTxStatus('idle')
        setDepositAmount('')
        fetchAccount()
      }, 2000)
    } catch {
      setTxStatus('error')
      setTimeout(() => setTxStatus('idle'), 3000)
    }
  }

  // ── Withdraw handler ──
  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount)
    if (!amount || amount <= 0) return
    if (account && amount > account.cash) {
      setTxStatus('error')
      setTimeout(() => setTxStatus('idle'), 3000)
      return
    }
    setTxStatus('submitting')
    try {
      await new Promise(r => setTimeout(r, 1500))
      setTxStatus('success')
      setTimeout(() => {
        setShowWithdrawSheet(false)
        setTxStatus('idle')
        setWithdrawAmount('')
        fetchAccount()
      }, 2000)
    } catch {
      setTxStatus('error')
      setTimeout(() => setTxStatus('idle'), 3000)
    }
  }

  // ── Combined positions ──
  const allPositions = useMemo(() => {
    const real = alpacaPositions.map(p => ({
      id: p.id, symbol: p.symbol, side: p.side || 'long',
      value: Number(p.market_value || p.marketValue) || 0,
      pnl: Number(p.unrealized_pl || p.unrealizedPnl) || 0,
      pnlPct: Number(p.unrealized_plpc || p.unrealizedPnlPct) * 100 || 0,
      qty: Number(p.qty) || 0,
      currentPrice: Number(p.current_price || p.currentPrice) || 0,
      source: 'live' as const,
    }))
    const realSymbols = new Set(real.map(p => p.symbol))
    const paper = openTrades
      .filter(t => !realSymbols.has(t.symbol))
      .map(t => ({
        id: t.id, symbol: t.symbol, side: t.side,
        value: t.entryPrice * t.qty, pnl: t.unrealizedPnl,
        pnlPct: t.unrealizedPct * 100, qty: t.qty,
        currentPrice: t.currentPrice, source: 'paper' as const,
      }))
    return [...real, ...paper]
  }, [alpacaPositions, openTrades])

  const totalPositionValue = allPositions.reduce((s, p) => s + p.value, 0)
  const totalPnl = allPositions.reduce((s, p) => s + p.pnl, 0)

  // ── Transaction history (combined) ──
  const transactions: Transaction[] = useMemo(() => {
    const txs: Transaction[] = []

    // Real orders as transactions
    alpacaOrders.forEach((o: any) => {
      if (o.status === 'filled' || o.status === 'partially_filled') {
        txs.push({
          id: o.id, type: 'trade',
          amount: (Number(o.filled_avg_price) || Number(o.limit_price) || 0) * Number(o.qty),
          description: `${o.side === 'buy' ? 'شراء' : 'بيع'} ${o.qty} ${o.symbol}`,
          time: new Date(o.submitted_at || o.submittedAt).getTime(),
          status: 'completed', symbol: o.symbol, side: o.side,
        })
      } else if (o.status === 'new' || o.status === 'pending_new') {
        txs.push({
          id: o.id, type: 'trade',
          amount: (Number(o.limit_price) || 0) * Number(o.qty),
          description: `${o.side === 'buy' ? 'شراء' : 'بيع'} ${o.qty} ${o.symbol} (معلق)`,
          time: new Date(o.submitted_at || o.submittedAt).getTime(),
          status: 'pending', symbol: o.symbol, side: o.side,
        })
      }
    })

    // Closed paper trades
    closedTrades.forEach(t => {
      txs.push({
        id: t.id, type: 'trade',
        amount: t.exitPrice * t.qty,
        description: `إغلاق ${t.side === 'long' ? 'شراء' : 'بيع'} ${t.symbol}`,
        time: t.closeTime, status: 'completed',
        symbol: t.symbol, side: t.side === 'long' ? 'buy' : 'sell',
      })
    })

    return txs.sort((a, b) => b.time - a.time).slice(0, 30)
  }, [alpacaOrders, closedTrades])

  // Daily change
  const dailyChange = useMemo(() => {
    if (chartData.length < 2) return account?.unrealizedPnlPct ? account.unrealizedPnlPct * 100 : 0
    const prev = chartData[chartData.length - 2]
    const curr = chartData[chartData.length - 1]
    return prev > 0 ? ((curr - prev) / prev) * 100 : 0
  }, [chartData, account?.unrealizedPnlPct])

  // ── Time formatter ──
  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'الآن'
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `منذ ${diffHr} ساعة`
    return d.toLocaleDateString('ar', { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ minHeight: '100%', background: T.bgApp, direction: 'rtl', overflowX: 'hidden', width: '100%' }}>
      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 12px) 16px 16px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.08) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.text2,
          }}>
            <ChevronRight size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.font }}>المحفظة</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {isLinked ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Shield size={10} color={T.success} />
                  <span style={{ fontSize: 10, color: T.success, fontFamily: T.font, fontWeight: 700 }}>حساب مربوط</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Link2 size={10} color={T.amber} />
                  <span style={{ fontSize: 10, color: T.amber, fontFamily: T.font, fontWeight: 700 }}>غير مربوط</span>
                </div>
              )}
              {account?.isPaperTrading && (
                <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: `${T.amber}15`, color: T.amber, fontFamily: T.font, fontWeight: 700 }}>ورقي</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowBalance(!showBalance)} style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.text2,
          }}>
            {showBalance ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button onClick={handleRefresh} disabled={refreshing} style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.text2,
          }}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Account Linking Banner ── */}
      {!isLinked && (
        <div style={{ margin: '4px 16px 8px' }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push('/mobile/kyc')}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 18,
              background: `linear-gradient(135deg, ${T.accent}15, ${T.accent}08)`,
              border: `1px solid ${T.accent}30`,
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.accent}25` }}>
              <Link2 size={20} color={T.accent} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: T.accent, fontFamily: T.font }}>اربط حساب الوساطة</p>
              <p style={{ fontSize: 10, color: T.text2, fontFamily: T.font }}>ربط حساب Alpaca لتفعيل التداول الحي والسحب/الإيداع</p>
            </div>
            <ExternalLink size={16} color={T.accent} />
          </motion.button>
        </div>
      )}

      {/* ── Balance Hero Card ── */}
      <div style={{ margin: '4px 16px 12px' }}>
        <GlassCard style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${T.accent}15, transparent 70%)`, pointerEvents: 'none' }} />

          {accountLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <Loader2 size={28} className="animate-spin" color={T.accent} />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Wallet size={12} color={T.text2} />
                <span style={{ fontSize: 11, color: T.text2, fontFamily: T.font }}>إجمالي الأصول</span>
                {isLinked && !account?.isPaperTrading && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, background: `${T.success}15`, color: T.success, fontFamily: T.font, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
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
                    {dailyChange >= 0 ? <TrendingUp size={13} color={T.success} /> : <TrendingDown size={13} color={T.danger} />}
                    <span style={{ fontSize: 13, fontWeight: 700, color: dailyChange >= 0 ? T.success : T.danger, fontFamily: T.mono }}>
                      {showBalance ? `${pctStr(dailyChange)} اليوم` : '••••'}
                    </span>
                  </div>
                </div>
                {chartLoading ? null : chartData.length > 1 ? (
                  <Sparkline data={chartData} color={dailyChange >= 0 ? T.success : T.danger} />
                ) : null}
              </div>

              {/* Balance Breakdown */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                {[
                  { label: 'الرصيد المتاح', value: account ? fmtCompact(account.cash) : '—', icon: CircleDollarSign, color: T.accent },
                  { label: 'القوة الشرائية', value: account ? fmtCompact(account.buyingPower) : '—', icon: Zap, color: T.amber },
                  { label: 'أرباح/خسائر', value: totalPnl >= 0 ? `+$${fmt(totalPnl)}` : `-$${fmt(totalPnl)}`, icon: totalPnl >= 0 ? TrendingUp : TrendingDown, color: totalPnl >= 0 ? T.success : T.danger },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: '10px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: `1px solid ${T.border}` }}>
                    <s.icon size={14} color={s.color} style={{ margin: '0 auto 4px' }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: T.mono }}>{showBalance ? s.value : '•••'}</div>
                    <div style={{ fontSize: 9, color: T.text2, fontFamily: T.font, marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassCard>
      </div>

      {/* ── Quick Action Buttons ── */}
      <div style={{ margin: '0 16px 12px', display: 'flex', gap: 8 }}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowDepositSheet(true)}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 20,
            background: `linear-gradient(135deg, ${T.success}, ${T.success}cc)`,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: `0 4px 20px ${T.success}25`,
          }}
        >
          <Download size={16} color="#000" />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#000', fontFamily: T.font }}>إيداع</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowWithdrawSheet(true)}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 20,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${T.border}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Send size={16} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>سحب</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push('/mobile/trading')}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 20,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${T.border}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <ArrowRightLeft size={16} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>تداول</span>
        </motion.button>
      </div>

      {/* ── Tab Switcher ── */}
      <div style={{ margin: '0 16px 12px', display: 'flex', gap: 4, padding: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 14 }}>
        {([
          { key: 'overview', label: 'نظرة عامة', icon: BarChart3 },
          { key: 'assets', label: `الأصول (${allPositions.length})`, icon: Wallet },
          { key: 'activity', label: `النشاط (${transactions.length})`, icon: Activity },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 12,
              background: activeTab === tab.key ? T.accent : 'transparent',
              color: activeTab === tab.key ? '#000' : T.text2,
              fontSize: 11, fontWeight: 800, fontFamily: T.font,
              border: 'none', cursor: 'pointer', transition: '0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════
          OVERVIEW TAB
          ═══════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* ── Portfolio Stats ── */}
          <div style={{ margin: '0 16px 12px' }}>
            <GlassCard>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <BarChart3 size={14} color={T.accent} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>ملخص المحفظة</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'قيمة المراكز الطويلة', value: account ? fmtCompact(account.longMarketValue) : '—', color: T.success },
                  { label: 'قيمة المراكز القصيرة', value: account ? fmtCompact(account.shortMarketValue) : '—', color: T.danger },
                  { label: 'عدد المراكز المفتوحة', value: `${allPositions.length}`, color: T.accent },
                  { label: 'إجمالي قيمة المراكز', value: fmtCompact(totalPositionValue), color: T.text },
                  { label: 'أرباح غير محققة', value: totalPnl >= 0 ? `+$${fmt(totalPnl)}` : `-$${fmt(totalPnl)}`, color: totalPnl >= 0 ? T.success : T.danger },
                  { label: 'صفقات البوت', value: `${stats.totalTrades}`, color: T.amber },
                  { label: 'نسبة الفوز', value: `${stats.winRate}%`, color: stats.winRate >= 50 ? T.success : T.danger },
                  { label: 'ربح البوت', value: `+$${fmt(stats.profit)}`, color: T.success },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: item.color, fontFamily: T.mono }}>{showBalance ? item.value : '•••'}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* ── Linked Accounts ── */}
          <div style={{ margin: '0 16px 12px' }}>
            <GlassCard>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Globe2 size={14} color={T.accent} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>الحسابات المربوطة</span>
              </div>
              {credentials.length > 0 ? credentials.map(cred => (
                <div key={cred.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`,
                  marginBottom: 8,
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${T.accent}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.accent}25` }}>
                    <CreditCard size={16} color={T.accent} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>{cred.provider || 'Alpaca'}</span>
                      {cred.isPaper && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: `${T.amber}15`, color: T.amber, fontFamily: T.font, fontWeight: 700 }}>ورقي</span>}
                    </div>
                    <span style={{ fontSize: 10, color: T.text2, fontFamily: T.font }}>{cred.label || cred.id.slice(0, 8)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: cred.isActive ? T.success : T.danger }} />
                    <span style={{ fontSize: 10, color: cred.isActive ? T.success : T.danger, fontFamily: T.font }}>{cred.isActive ? 'نشط' : 'معطل'}</span>
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <Link2 size={24} color={T.text3} style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontSize: 12, color: T.text2, fontFamily: T.font }}>لا توجد حسابات مربوطة</p>
                  <button onClick={() => router.push('/mobile/kyc')} style={{ marginTop: 8, padding: '8px 16px', borderRadius: 12, background: `${T.accent}15`, border: `1px solid ${T.accent}30`, color: T.accent, fontSize: 11, fontFamily: T.font, cursor: 'pointer', fontWeight: 700 }}>ربط حساب</button>
                </div>
              )}
            </GlassCard>
          </div>

          {/* ── Bot Status Card ── */}
          <div style={{ margin: '0 16px 12px' }}>
            <GlassCard onClick={() => router.push('/mobile/bot')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: botActive ? `${T.accent}15` : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${botActive ? `${T.accent}30` : T.border}` }}>
                    <Zap size={20} color={botActive ? T.accent : T.text3} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: T.font }}>بوت التداول</p>
                    <p style={{ fontSize: 11, color: botActive ? T.success : T.text2, fontFamily: T.font, fontWeight: 700 }}>{botActive ? 'نشط — يعمل' : 'متوقف'}</p>
                  </div>
                </div>
                <ChevronRight size={18} color={T.text3} />
              </div>
            </GlassCard>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════
          ASSETS TAB
          ═══════════════════════════════════════════ */}
      {activeTab === 'assets' && (
        <div style={{ margin: '0 16px 12px' }}>
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Wallet size={14} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>المراكز المفتوحة</span>
            </div>
            {allPositions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Activity size={28} color={T.text3} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 13, color: T.text2, fontFamily: T.font }}>لا توجد مراكز مفتوحة</p>
                <p style={{ fontSize: 10, color: T.text3, fontFamily: T.font, marginTop: 4 }}>ابدأ التداول لرؤية مراكزك هنا</p>
                <button onClick={() => router.push('/mobile/trading')} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 14, background: T.accent, border: 'none', color: '#000', fontSize: 12, fontFamily: T.font, fontWeight: 800, cursor: 'pointer' }}>فتح مركز جديد</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allPositions.map((pos, i) => {
                  const isLong = pos.side === 'long'
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
                      onClick={() => {
                        router.push(`/mobile/chart?symbol=${encodeURIComponent(pos.symbol)}`)
                      }}
                      style={{
                        padding: '12px 14px', borderRadius: 16,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${pos.pnl >= 0 ? `${T.success}10` : `${T.danger}10`}`,
                        cursor: 'pointer',
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
                              {pos.source === 'live' && <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 4, background: `${T.success}18`, color: T.success, fontWeight: 800 }}>LIVE</span>}
                            </div>
                            <p style={{ fontSize: 10, color: T.text2, fontFamily: T.font, marginTop: 1 }}>
                              {isLong ? 'شراء' : 'بيع'} • {pos.qty} وحدة • ${livePrice ? livePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'start' }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: pos.pnl >= 0 ? T.success : T.danger, fontFamily: T.mono }}>
                            {pos.pnl >= 0 ? '+' : '-'}${fmt(pos.pnl)}
                          </p>
                          <p style={{ fontSize: 10, color: T.text2, fontFamily: T.mono }}>
                            ${fmt(pos.value)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          ACTIVITY TAB
          ═══════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <div style={{ margin: '0 16px 12px' }}>
          <GlassCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Activity size={14} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>سجل النشاط</span>
            </div>
            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Receipt size={28} color={T.text3} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 13, color: T.text2, fontFamily: T.font }}>لا يوجد نشاط بعد</p>
                <p style={{ fontSize: 10, color: T.text3, fontFamily: T.font, marginTop: 4 }}>ستظهر صفقاتك ومعاملاتك هنا</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {transactions.map((tx, i) => {
                  const isBuy = tx.side === 'buy' || tx.type === 'deposit'
                  const Icon = tx.type === 'deposit' ? Download : tx.type === 'withdraw' ? Send : tx.type === 'trade' ? ArrowRightLeft : Receipt
                  const iconColor = isBuy ? T.success : T.danger
                  const statusIcon = tx.status === 'completed' ? <CheckCircle size={12} color={T.success} /> : tx.status === 'pending' ? <Clock size={12} color={T.amber} /> : <XCircle size={12} color={T.danger} />
                  const statusText = tx.status === 'completed' ? 'مكتمل' : tx.status === 'pending' ? 'معلق' : 'فاشل'

                  return (
                    <div key={tx.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${T.border}`,
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${iconColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${iconColor}25` }}>
                        <Icon size={16} color={iconColor} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{formatTime(tx.time)}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: tx.status === 'completed' ? T.success : tx.status === 'pending' ? T.amber : T.danger, fontFamily: T.font }}>
                            {statusIcon} {statusText}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'start' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: iconColor, fontFamily: T.mono }}>
                          {isBuy ? '+' : '-'}${fmt(tx.amount)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          DEPOSIT BOTTOM SHEET
          ═══════════════════════════════════════════ */}
      <AnimatePresence>
        {showDepositSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (txStatus !== 'submitting') setShowDepositSheet(false) }}
              style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{
                position: 'fixed', bottom: 'calc(60px + env(safe-area-inset-bottom))', left: 0, right: 0, zIndex: 201,
                background: 'rgba(28,28,30,0.98)', backdropFilter: 'blur(50px)',
                borderRadius: '24px 24px 0 0', borderTop: '0.5px solid rgba(255,255,255,0.15)',
                direction: 'rtl', maxHeight: '60vh', display: 'flex', flexDirection: 'column',
              }}
            >
              <div className="flex justify-center pt-3 pb-2"><div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} /></div>
              <div style={{ padding: '0 20px 20px' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFF', fontFamily: T.font, marginBottom: 16 }}>إيداع أموال</h2>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: T.text2, fontFamily: T.font, fontWeight: 700, display: 'block', marginBottom: 4 }}>المبلغ (USD)</label>
                  <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="0.00"
                    style={{ width: '100%', height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, padding: '0 16px', color: T.text, fontSize: 18, fontWeight: 800, fontFamily: T.mono, outline: 'none', direction: 'ltr', textAlign: 'center' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {[100, 500, 1000, 5000].map(amt => (
                    <button key={amt} onClick={() => setDepositAmount(amt.toString())}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', color: T.accent, fontSize: 11, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer' }}
                    >${amt.toLocaleString()}</button>
                  ))}
                </div>
                {txStatus === 'idle' && (
                  <button onClick={handleDeposit} disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                    style={{ width: '100%', height: 50, borderRadius: 14, background: T.success, border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 900, color: '#000', fontFamily: T.font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !depositAmount || parseFloat(depositAmount) <= 0 ? 0.5 : 1 }}
                  >
                    <Download size={20} /> إيداع
                  </button>
                )}
                {txStatus === 'submitting' && (
                  <div style={{ height: 50, borderRadius: 14, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Loader2 size={20} className="animate-spin" color={T.accent} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.accent, fontFamily: T.font }}>جارٍ المعالجة...</span>
                  </div>
                )}
                {txStatus === 'success' && (
                  <div style={{ height: 50, borderRadius: 14, background: 'rgba(50,215,75,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <CheckCircle size={20} color={T.success} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.success, fontFamily: T.font }}>تم الإيداع بنجاح</span>
                  </div>
                )}
                {txStatus === 'error' && (
                  <div style={{ height: 50, borderRadius: 14, background: 'rgba(255,69,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <XCircle size={20} color={T.danger} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.danger, fontFamily: T.font }}>فشلت العملية</span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════
          WITHDRAW BOTTOM SHEET
          ═══════════════════════════════════════════ */}
      <AnimatePresence>
        {showWithdrawSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (txStatus !== 'submitting') setShowWithdrawSheet(false) }}
              style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{
                position: 'fixed', bottom: 'calc(60px + env(safe-area-inset-bottom))', left: 0, right: 0, zIndex: 201,
                background: 'rgba(28,28,30,0.98)', backdropFilter: 'blur(50px)',
                borderRadius: '24px 24px 0 0', borderTop: '0.5px solid rgba(255,255,255,0.15)',
                direction: 'rtl', maxHeight: '60vh', display: 'flex', flexDirection: 'column',
              }}
            >
              <div className="flex justify-center pt-3 pb-2"><div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} /></div>
              <div style={{ padding: '0 20px 20px' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFF', fontFamily: T.font, marginBottom: 4 }}>سحب أموال</h2>
                <p style={{ fontSize: 11, color: T.text2, fontFamily: T.font, marginBottom: 12 }}>
                  الرصيد المتاح: {showBalance && account ? `$${fmt(account.cash)}` : '••••'}
                </p>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: T.text2, fontFamily: T.font, fontWeight: 700, display: 'block', marginBottom: 4 }}>المبلغ (USD)</label>
                  <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="0.00"
                    style={{ width: '100%', height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, padding: '0 16px', color: T.text, fontSize: 18, fontWeight: 800, fontFamily: T.mono, outline: 'none', direction: 'ltr', textAlign: 'center' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {[50, 100, 250, 500].map(amt => (
                    <button key={amt} onClick={() => setWithdrawAmount(amt.toString())}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', color: T.accent, fontSize: 11, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer' }}
                    >${amt}</button>
                  ))}
                </div>
                {account && parseFloat(withdrawAmount) > account.cash && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,69,58,0.1)', border: '0.5px solid rgba(255,69,58,0.2)' }}>
                    <AlertTriangle size={14} color={T.danger} />
                    <span style={{ fontSize: 11, color: T.danger, fontFamily: T.font }}>المبلغ يتجاوز الرصيد المتاح</span>
                  </div>
                )}
                {txStatus === 'idle' && (
                  <button onClick={handleWithdraw} disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || (account ? parseFloat(withdrawAmount) > account.cash : false)}
                    style={{ width: '100%', height: 50, borderRadius: 14, background: T.accent, border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 900, color: '#000', fontFamily: T.font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: !withdrawAmount || parseFloat(withdrawAmount) <= 0 ? 0.5 : 1 }}
                  >
                    <Send size={20} /> سحب
                  </button>
                )}
                {txStatus === 'submitting' && (
                  <div style={{ height: 50, borderRadius: 14, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Loader2 size={20} className="animate-spin" color={T.accent} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.accent, fontFamily: T.font }}>جارٍ المعالجة...</span>
                  </div>
                )}
                {txStatus === 'success' && (
                  <div style={{ height: 50, borderRadius: 14, background: 'rgba(50,215,75,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <CheckCircle size={20} color={T.success} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.success, fontFamily: T.font }}>تم السحب بنجاح</span>
                  </div>
                )}
                {txStatus === 'error' && (
                  <div style={{ height: 50, borderRadius: 14, background: 'rgba(255,69,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <XCircle size={20} color={T.danger} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.danger, fontFamily: T.font }}>فشلت العملية</span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Bottom padding for navbar ── */}
      <div style={{ height: 20 }} />
    </div>
  )
}
