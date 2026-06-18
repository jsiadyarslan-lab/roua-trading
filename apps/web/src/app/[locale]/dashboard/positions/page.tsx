'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from '@/i18n/navigation'
import { motion } from 'framer-motion'
import {
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  XCircle,
  RefreshCw,
  Briefcase,
  Activity,
  Target,
  Shield,
  Edit3,
  BarChart3,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import SubPageLayout from '@/components/dashboard/SubPageLayout'
import { fetchPositionsUnified, fetchSummaryUnified, closePositionUnified } from '@/lib/api-fetch'
import { usePositionsStore } from '@/hooks/usePositionsStore'

import { getDirection } from '@/lib/i18n-utils';
import { useLocale } from 'next-intl';
// ── Types ──
interface Position {
  id: string
  dbId?: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  exchange: string
  stopLoss?: number
  takeProfit?: number
  openedAt: string
  source?: string
  /** Trade source from DB: smart_executor, agent, auto_paper, user_manual */
  tradeSource?: string
  /** V192: Credential ID this position belongs to — for filtering by active account */
  credentialId?: string
}

interface PositionSummary {
  totalPositions: number
  totalValue: number
  unrealizedPnl: number
  realizedPnl: number
}

const EXCHANGES = ['الكل', 'binance', 'kucoin', 'bybit', 'okx', 'gate']
const SYMBOLS = ['الكل', 'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT']

// ── Source Label Mapping ──
function getSourceBadge(source?: string | null, tradeSource?: string | null) {
  // Use tradeSource (from DB) first, then fallback to source (data source)
  const effectiveSource = tradeSource || source
  if (!effectiveSource || effectiveSource === 'user_manual' || effectiveSource === 'nestjs' || effectiveSource === 'alpaca') return null
  const map: Record<string, { label: string; bg: string; color: string; border: string; icon: string }> = {
    smart_executor: {
      label: 'المنفذ',
      bg: 'rgba(0,212,255,0.12)',
      color: '#00D4FF',
      border: 'rgba(0,212,255,0.25)',
      icon: '\u2694\uFE0F',
    },
    agent: {
      label: 'الوكيل',
      bg: 'rgba(162,89,255,0.12)',
      color: '#A259FF',
      border: 'rgba(162,89,255,0.25)',
      icon: '\uD83E\uDD16',
    },
    auto_paper: {
      label: 'ورقي',
      bg: 'rgba(255,184,0,0.12)',
      color: '#FFB800',
      border: 'rgba(255,184,0,0.25)',
      icon: '\uD83D\uDCDD',
    },
    mt5_sync: {
      label: 'MT5',
      bg: 'rgba(16,185,129,0.12)',
      color: '#10B981',
      border: 'rgba(16,185,129,0.25)',
      icon: '\uD83D\uDCF1',
    },
    reconciliation: {
      label: 'تسوية',
      bg: 'rgba(48,209,88,0.12)',
      color: '#30D158',
      border: 'rgba(48,209,88,0.25)',
      icon: '\uD83D\uDD04',
    },
  }
  return map[effectiveSource] || null
}

// ── Stat Card Component ──
function StatCard({ icon, label, value, subValue, color, gradientFrom, gradientTo }: {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  color: string
  gradientFrom: string
  gradientTo: string
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '14px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: '50px', height: '50px', background: gradientFrom, filter: 'blur(32px)', opacity: 0.15, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          width: '26px', height: '26px', borderRadius: '7px',
          background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar), Inter, sans-serif' }}>{label}</span>
      </div>
      <div dir="ltr" style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)', color, letterSpacing: '-0.02em' }}>{value}</div>
      {subValue && <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginTop: '3px' }}>{subValue}</div>}
    </div>
  )
}

export default function PositionsPage() {
  const locale = useLocale();
  const dir = getDirection(locale);
  const router = useRouter()
  const { loading: authLoading } = useAuth()

  // V192: Use the shared positions store which respects activeCredentialId filtering
  const storePositions = usePositionsStore(s => s.activeCredentialId ? s.getActivePositions() : s.positions)
  const storeActiveCredentialId = usePositionsStore(s => s.activeCredentialId)
  const storeFetchPositions = usePositionsStore(s => s.fetchPositions)
  const storeAccount = usePositionsStore(s => s.account)
  const storeFetchAccount = usePositionsStore(s => s.fetchAccount)

  const [positions, setPositions] = useState<Position[]>([])
  const [summary, setSummary] = useState<PositionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiUnavailable, setApiUnavailable] = useState(false)
  const [filterExchange, setFilterExchange] = useState('الكل')
  const [filterSymbol, setFilterSymbol] = useState('الكل')
  const [closeDialog, setCloseDialog] = useState<Position | null>(null)
  const [editDialog, setEditDialog] = useState<Position | null>(null)
  const [closing, setClosing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [closeQuantity, setCloseQuantity] = useState('')
  const [closeError, setCloseError] = useState('')
  const [editStopLoss, setEditStopLoss] = useState('')
  const [editTakeProfit, setEditTakeProfit] = useState('')
  const [editError, setEditError] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const fetchPositions = useCallback(async () => {
    setLoading(true)
    try {
      // V192: Use the shared store which merges API + paper positions and filters by activeCredentialId
      await storeFetchPositions()
      const storeP = usePositionsStore.getState()
      const filteredPositions = storeP.activeCredentialId
        ? storeP.getActivePositions()
        : storeP.positions
      setPositions(filteredPositions.map((p: any) => ({
        id: p.id || p.dbId,
        dbId: p.dbId || p.id,
        symbol: p.symbol,
        side: p.side === 'long' ? 'BUY' : p.side === 'short' ? 'SELL' : p.side,
        quantity: Number(p.qty) || 0,
        entryPrice: Number(p.avgEntryPrice || p.entryPrice) || 0,
        currentPrice: Number(p.currentPrice) || 0,
        unrealizedPnl: Number(p.unrealizedPnl) || 0,
        exchange: p.exchange || '',
        stopLoss: Number(p.stopLoss || p.sl) || undefined,
        takeProfit: Number(p.takeProfit || p.tp) || undefined,
        openedAt: p.openedAt || '',
        source: p.source,
        tradeSource: p.tradeSource,
        credentialId: p.credentialId,
      })) as Position[])
      setApiUnavailable(false)
    } catch {
      // Fallback to direct API fetch if store fails
      try {
        const result = await fetchPositionsUnified()
        setPositions(result.positions as Position[])
        if (result.error) {
          setApiUnavailable(true)
        } else {
          setApiUnavailable(false)
        }
      } catch {
        setApiUnavailable(true)
      }
    } finally {
      setLoading(false)
    }
  }, [storeFetchPositions])

  // V192: Sync store positions when they change (e.g., when activeCredentialId changes)
  useEffect(() => {
    const storeP = usePositionsStore.getState()
    const filteredPositions = storeP.activeCredentialId
      ? storeP.getActivePositions()
      : storeP.positions
    if (filteredPositions.length > 0 || storeP.positions.length === 0) {
      setPositions(filteredPositions.map((p: any) => ({
        id: p.id || p.dbId,
        dbId: p.dbId || p.id,
        symbol: p.symbol,
        side: p.side === 'long' ? 'BUY' : p.side === 'short' ? 'SELL' : p.side,
        quantity: Number(p.qty) || 0,
        entryPrice: Number(p.avgEntryPrice || p.entryPrice) || 0,
        currentPrice: Number(p.currentPrice) || 0,
        unrealizedPnl: Number(p.unrealizedPnl) || 0,
        exchange: p.exchange || '',
        stopLoss: Number(p.stopLoss || p.sl) || undefined,
        takeProfit: Number(p.takeProfit || p.tp) || undefined,
        openedAt: p.openedAt || '',
        source: p.source,
        tradeSource: p.tradeSource,
        credentialId: p.credentialId,
      })) as Position[])
    }
  }, [storePositions, storeActiveCredentialId])

  // V210: Re-fetch positions when activeCredentialId changes (account switch)
  useEffect(() => {
    if (storeActiveCredentialId !== undefined) {
      // Trigger a re-fetch from the API with the new credentialId
      storeFetchPositions()
    }
  }, [storeActiveCredentialId, storeFetchPositions])

  const fetchSummary = useCallback(async () => {
    try {
      // V192: Use store account data as primary source (respects activeCredentialId)
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
    } catch { /* */ }
  }, [storeFetchAccount, positions.length])

  useEffect(() => {
    fetchPositions()
    fetchSummary()

    // Auto-refresh position data every 30 seconds
    const intervalId = setInterval(() => {
      fetchPositions()
      fetchSummary()
    }, 30000)

    return () => clearInterval(intervalId)
  }, [fetchPositions, fetchSummary])

  const openCloseDialog = (pos: Position) => {
    setCloseQuantity(pos.quantity.toString())
    setCloseError('')
    setCloseDialog(pos)
  }

  const handleClosePosition = async () => {
    if (!closeDialog) return
    setClosing(true)
    setCloseError('')
    const qty = closeQuantity ? parseFloat(closeQuantity) : closeDialog.quantity
    const isPartial = qty < closeDialog.quantity

    // V172: Optimistic UI update — remove position IMMEDIATELY for instant feedback.
    // Previously the UI waited for the full API response (~2-5s) before removing the row.
    // Now: remove immediately, restore if the API fails.
    const previousPositions = positions
    if (isPartial) {
      setPositions((prev) => prev.map((p) => p.id === closeDialog.id ? { ...p, quantity: p.quantity - qty } : p))
    } else {
      setPositions((prev) => prev.filter((p) => p.id !== closeDialog.id))
    }
    setCloseDialog(null) // Close dialog immediately

    try {
      const result = await closePositionUnified(closeDialog.id, isPartial ? qty : undefined, { dbId: closeDialog.dbId || closeDialog.id })
      if (result.success) {
        fetchSummary()
        usePositionsStore.getState().refreshAfterTrade()
      } else {
        // Restore position on failure
        setPositions(previousPositions)
        setCloseDialog(closeDialog)
        throw new Error(result.error || 'فشل في إغلاق المركز')
      }
    } catch (err: unknown) {
      // Restore position on network error
      setPositions(previousPositions)
      setCloseDialog(closeDialog)
      setCloseError(err instanceof Error ? err.message : String(err))
    } finally {
      setClosing(false)
    }
  }

  const openEditDialog = (pos: Position) => {
    setEditStopLoss(pos.stopLoss?.toString() || '')
    setEditTakeProfit(pos.takeProfit?.toString() || '')
    setEditError('')
    setEditDialog(pos)
  }

  const handleUpdateLevels = async () => {
    if (!editDialog) return
    setUpdating(true)
    setEditError('')
    try {
      const body: Record<string, unknown> = {}
      if (editStopLoss) body.stopLoss = parseFloat(editStopLoss)
      if (editTakeProfit) body.takeProfit = parseFloat(editTakeProfit)
      const res = await fetch(`/api/trading/positions/${editDialog.id}/levels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setPositions((prev) => prev.map((p) => p.id === editDialog.id ? { ...p, stopLoss: editStopLoss ? parseFloat(editStopLoss) : p.stopLoss, takeProfit: editTakeProfit ? parseFloat(editTakeProfit) : p.takeProfit } : p))
        setEditDialog(null)
      } else {
        const data = await res.json()
        throw new Error(data.error || 'فشل في تحديث المستويات')
      }
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdating(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)

  const formatPrice = (value: number) => {
    if (value >= 1000) return formatCurrency(value)
    if (value >= 1) return value.toFixed(2)
    return value.toFixed(6)
  }

  const filteredPositions = positions.filter((pos) => {
    if (filterExchange !== 'الكل' && pos.exchange !== filterExchange) return false
    if (filterSymbol !== 'الكل' && pos.symbol !== filterSymbol) return false
    return true
  })

  const totalUnrealizedPnl = filteredPositions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)' }} />
      </div>
    )
  }

  // ── Select-like filter button ──
  const FilterSelect = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>{label}:</span>
      <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-input)', borderRadius: '6px', padding: '2px' }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '9px',
              fontWeight: 600,
              fontFamily: opt === 'الكل' ? 'var(--font-ar)' : 'var(--font-mono)',
              cursor: 'pointer',
              border: 'none',
              background: value === opt ? 'var(--accent)' : 'transparent',
              color: value === opt ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <SubPageLayout
      title="المراكز المفتوحة"
      icon={<Briefcase size={14} color="#fff" />}
      iconBg="linear-gradient(135deg, #FFB800, #FF8C00)"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {apiUnavailable && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--border-warning)', padding: '3px 8px', borderRadius: '6px' }}>
              <AlertTriangle size={10} /> API غير متاح
            </span>
          )}
          <button
            onClick={() => { fetchPositions(); fetchSummary() }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}
          >
            <RefreshCw size={11} /> تحديث
          </button>
        </div>
      }
    >
      {/* Summary Bar — Single Row */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        marginBottom: '16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {/* المراكز */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderInlineEnd: '1px solid var(--border)' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #00FFC6, #00B894)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <BarChart3 size={13} stroke="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-ar)', marginBottom: 1 }}>المراكز</div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{summary?.totalPositions ?? positions.length}</div>
          </div>
        </div>

        {/* القيمة الإجمالية */}
        <div style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderInlineEnd: '1px solid var(--border)' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #FFB800, #FF8C00)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Briefcase size={13} stroke="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-ar)', marginBottom: 1 }}>القيمة الإجمالية</div>
            <div dir="ltr" style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{formatCurrency(summary?.totalValue ?? 0)}</div>
          </div>
        </div>

        {/* أ.خ غير محققة */}
        <div style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderInlineEnd: '1px solid var(--border)' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: (summary?.unrealizedPnl ?? totalUnrealizedPnl) >= 0
              ? 'linear-gradient(135deg, #00FFC6, #0A84FF)'
              : 'linear-gradient(135deg, #FF4D4D, #FF6B6B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Activity size={13} stroke="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-ar)', marginBottom: 1 }}>أ.خ غير محققة</div>
            <div dir="ltr" style={{
              fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)',
              color: (summary?.unrealizedPnl ?? totalUnrealizedPnl) > 0 ? 'var(--profit)' : (summary?.unrealizedPnl ?? totalUnrealizedPnl) < 0 ? 'var(--loss)' : 'var(--text-secondary)',
              letterSpacing: '-0.02em',
            }}>
              {(summary?.unrealizedPnl ?? totalUnrealizedPnl) > 0 ? '+' : (summary?.unrealizedPnl ?? totalUnrealizedPnl) < 0 ? '-' : ''}{formatCurrency(Math.abs(summary?.unrealizedPnl ?? totalUnrealizedPnl))}
            </div>
          </div>
        </div>

        {/* الأرباح المحققة */}
        <div style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: (summary?.realizedPnl ?? 0) >= 0
              ? 'linear-gradient(135deg, #A259FF, #7C3AED)'
              : 'linear-gradient(135deg, #FF4D4D, #FF6B6B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Target size={13} stroke="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-ar)', marginBottom: 1 }}>الأرباح المحققة</div>
            <div dir="ltr" style={{
              fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)',
              color: (summary?.realizedPnl ?? 0) > 0 ? 'var(--profit)' : (summary?.realizedPnl ?? 0) < 0 ? 'var(--loss)' : 'var(--text-secondary)',
              letterSpacing: '-0.02em',
            }}>
              {(summary?.realizedPnl ?? 0) > 0 ? '+' : (summary?.realizedPnl ?? 0) < 0 ? '-' : ''}{formatCurrency(Math.abs(summary?.realizedPnl ?? 0))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <FilterSelect label="البورصة" value={filterExchange} onChange={setFilterExchange} options={EXCHANGES} />
        <FilterSelect label="الزوج" value={filterSymbol} onChange={setFilterSymbol} options={SYMBOLS} />
      </div>

      {/* Positions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '7px', background: 'linear-gradient(135deg, #FFB800, #FF8C00)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Briefcase size={11} stroke="#fff" strokeWidth={2} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>المراكز</span>
              <span style={{ fontSize: '8px', fontWeight: 700, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '0px 5px', borderRadius: '6px' }}>{filteredPositions.length}</span>
            </div>
            {filteredPositions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>الإجمالي:</span>
                <span dir="ltr" style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: totalUnrealizedPnl > 0 ? 'var(--profit)' : totalUnrealizedPnl < 0 ? 'var(--loss)' : 'var(--text-secondary)' }}>
                  {totalUnrealizedPnl > 0 ? '+' : totalUnrealizedPnl < 0 ? '-' : ''}{formatCurrency(Math.abs(totalUnrealizedPnl))}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ minHeight: '200px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: 'var(--accent)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>جارٍ التحميل...</p>
              </div>
            ) : apiUnavailable ? (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <AlertTriangle size={36} style={{ color: 'var(--warning)', margin: '0 auto 12px', opacity: 0.4 }} />
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>محرك التداول غير متاح حالياً</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginTop: '4px' }}>تأكد من تشغيل خادم NestJS على المنفذ 3001</p>
              </div>
            ) : filteredPositions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', opacity: 0.4 }}>
                  <Briefcase size={22} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>لا توجد مراكز مفتوحة</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginTop: '4px' }}>
                  {positions.length > 0 ? 'لا توجد مراكز تطابق عوامل التصفية' : 'ابدأ بالتداول لرؤية المراكز هنا'}
                </p>
                {positions.length === 0 && (
                  <button onClick={() => router.push('/dashboard/trading')} style={{ marginTop: '16px', padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-ar)', cursor: 'pointer', boxShadow: 'var(--glow-accent)' }}>
                    <Activity size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '6px' }} />
                    الانتقال للتداول
                  </button>
                )}
              </div>
            ) : isMobile ? (
              /* Mobile Card View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px' }}>
                {filteredPositions.map((pos) => (
                  <div key={pos.id} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Header row: Symbol + Side + P&L */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: pos.side === 'BUY' ? 'linear-gradient(135deg, #00FFC6, #00B894)' : 'linear-gradient(135deg, #FF4D4D, #FF6B6B)',
                        }}>
                          {pos.side === 'BUY' ? <TrendingUp size={10} stroke="#fff" strokeWidth={2} /> : <TrendingDown size={10} stroke="#fff" strokeWidth={2} />}
                        </div>
                        <span dir="ltr" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{pos.symbol}</span>
                        <span style={{ fontSize: 8, fontWeight: 600, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{pos.exchange}</span>
                        {(() => { const badge = getSourceBadge(pos.source, pos.tradeSource); return badge ? <span style={{ fontSize: 8, fontWeight: 700, background: badge.bg, border: `1px solid ${badge.border}`, padding: '1px 5px', borderRadius: '4px', color: badge.color, fontFamily: 'var(--font-ar)' }}>{badge.icon} {badge.label}</span> : null })()}
                      </div>
                      <span dir="ltr" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: (pos.unrealizedPnl || 0) > 0 ? 'var(--profit)' : (pos.unrealizedPnl || 0) < 0 ? 'var(--loss)' : 'var(--text-secondary)' }}>
                        {(pos.unrealizedPnl || 0) > 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnl || 0)}
                      </span>
                    </div>
                    {/* Details grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10 }}>
                      <div><span style={{ color: 'var(--text-faint)' }}>الاتجاه: </span><span style={{ fontWeight: 800, color: pos.side === 'BUY' ? 'var(--profit)' : 'var(--loss)' }}>{pos.side === 'BUY' ? 'شراء' : 'بيع'}</span></div>
                      <div><span style={{ color: 'var(--text-faint)' }}>الكمية: </span><span dir="ltr" style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{pos.quantity}</span></div>
                      <div><span style={{ color: 'var(--text-faint)' }}>دخول: </span><span dir="ltr" style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatPrice(pos.entryPrice)}</span></div>
                      <div><span style={{ color: 'var(--text-faint)' }}>حالي: </span><span dir="ltr" style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{formatPrice(pos.currentPrice)}</span></div>
                      <div><span style={{ color: 'var(--text-faint)' }}>SL: </span><span dir="ltr" style={{ fontFamily: 'var(--font-mono)', color: pos.stopLoss ? 'var(--loss)' : 'var(--text-faint)' }}>{pos.stopLoss ? formatPrice(pos.stopLoss) : '—'}</span></div>
                      <div><span style={{ color: 'var(--text-faint)' }}>TP: </span><span dir="ltr" style={{ fontFamily: 'var(--font-mono)', color: pos.takeProfit ? 'var(--profit)' : 'var(--text-faint)' }}>{pos.takeProfit ? formatPrice(pos.takeProfit) : '—'}</span></div>
                    </div>
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEditDialog(pos)} aria-label="تعديل" style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-ar)', fontWeight: 600, minHeight: 36 }}>
                        <Edit3 size={11} /> تعديل
                      </button>
                      <button onClick={() => openCloseDialog(pos)} aria-label="إغلاق" style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-loss)', background: 'var(--loss-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--loss)', fontSize: 10, fontFamily: 'var(--font-ar)', fontWeight: 600, minHeight: 36 }}>
                        <XCircle size={11} /> إغلاق
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Desktop Table */
              <div className="custom-scrollbar scroll-touch" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <caption className="sr-only">جدول المراكز المفتوحة</caption>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['الزوج', 'البورصة', 'الاتجاه', 'المصدر', 'الكمية', 'سعر الدخول', 'السعر الحالي', 'ر/خ', 'وقف الخسارة', 'جني الأرباح', 'إجراءات'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', fontSize: '9px', fontWeight: 700, color: 'var(--text-faint)', fontFamily: 'var(--font-ar)', textAlign: 'right', background: 'rgba(0,0,0,0.06)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.map((pos) => (
                      <tr key={pos.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '26px', height: '26px', borderRadius: '7px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: pos.side === 'BUY' ? 'linear-gradient(135deg, #00FFC6, #00B894)' : 'linear-gradient(135deg, #FF4D4D, #FF6B6B)',
                            }}>
                              {pos.side === 'BUY' ? <TrendingUp size={11} stroke="#fff" strokeWidth={2} /> : <TrendingDown size={11} stroke="#fff" strokeWidth={2} />}
                            </div>
                            <span dir="ltr" style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{pos.symbol}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 600, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '2px 7px', borderRadius: '5px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{pos.exchange}</span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '5px', fontFamily: 'var(--font-ar)', background: pos.side === 'BUY' ? 'var(--profit-bg)' : 'var(--loss-bg)', color: pos.side === 'BUY' ? 'var(--profit)' : 'var(--loss)', border: `1px solid ${pos.side === 'BUY' ? 'var(--border-profit)' : 'var(--border-loss)'}` }}>
                            {pos.side === 'BUY' ? 'شراء' : 'بيع'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {(() => {
                            const badge = getSourceBadge(pos.source, pos.tradeSource)
                            return badge
                              ? <span style={{ fontSize: '8px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', fontFamily: 'var(--font-ar)', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap' }}>{badge.icon} {badge.label}</span>
                              : <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>يدوي</span>
                          })()}
                        </td>
                        <td dir="ltr" style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{pos.quantity}</td>
                        <td dir="ltr" style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatPrice(pos.entryPrice)}</td>
                        <td dir="ltr" style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{formatPrice(pos.currentPrice)}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span dir="ltr" style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: (pos.unrealizedPnl || 0) > 0 ? 'var(--profit)' : (pos.unrealizedPnl || 0) < 0 ? 'var(--loss)' : 'var(--text-secondary)' }}>
                            {(pos.unrealizedPnl || 0) > 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnl || 0)}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {pos.stopLoss
                            ? <span dir="ltr" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--loss)' }}>{formatPrice(pos.stopLoss)}</span>
                            : <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {pos.takeProfit
                            ? <span dir="ltr" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--profit)' }}>{formatPrice(pos.takeProfit)}</span>
                            : <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button onClick={() => openEditDialog(pos)} aria-label="تعديل مستويات المركز" style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                            >
                              <Edit3 size={11} style={{ color: 'inherit' }} />
                            </button>
                            <button onClick={() => openCloseDialog(pos)} aria-label="إغلاق المركز" style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-loss)'; e.currentTarget.style.color = 'var(--loss)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                            >
                              <XCircle size={11} style={{ color: 'inherit' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Disclaimer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px 16px', borderRadius: '8px', background: 'var(--warning-bg)', border: '1px solid var(--border-warning)', marginTop: '16px' }}>
        <AlertTriangle size={13} style={{ color: 'var(--warning)', marginTop: '1px', flexShrink: 0 }} />
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', lineHeight: '1.5' }}>إدارة المراكز تتطلب اتصالاً بخادم التداول. رؤى لا تلمس أموالك أبداً — نتابع حساباتك المربوطة فقط من خلال مفاتيح API المشفرة.</span>
      </div>

      {/* Close Position Dialog */}
      {closeDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setCloseDialog(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="close-dialog-title" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', maxWidth: '440px', width: '90%', boxShadow: 'var(--shadow-modal)' }} onClick={(e) => e.stopPropagation()} dir={dir}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <XCircle size={13} stroke="#fff" strokeWidth={2} />
              </div>
              <span id="close-dialog-title" style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-ar)', color: 'var(--text-main)' }}>تأكيد إغلاق المركز</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginBottom: '16px' }}>هل أنت متأكد من إغلاق مركز {closeDialog.symbol}؟ يمكنك إغلاق المركز بالكامل أو جزئياً.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: 'الاتجاه', value: closeDialog.side === 'BUY' ? 'شراء' : 'بيع', color: closeDialog.side === 'BUY' ? 'var(--profit)' : 'var(--loss)' },
                { label: 'الكمية', value: String(closeDialog.quantity), color: 'var(--text-main)' },
                { label: 'سعر الدخول', value: formatPrice(closeDialog.entryPrice), color: 'var(--text-main)' },
                { label: 'ر/خ غير محقق', value: formatCurrency(closeDialog.unrealizedPnl || 0), color: (closeDialog.unrealizedPnl || 0) > 0 ? 'var(--profit)' : (closeDialog.unrealizedPnl || 0) < 0 ? 'var(--loss)' : 'var(--text-secondary)' },
              ].map((item) => (
                <div key={item.label} style={{ padding: '8px 10px', borderRadius: '7px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>{item.label}</span>
                  <div dir="ltr" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.color, marginTop: '2px' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', display: 'block', marginBottom: '4px' }}>كمية الإغلاق (اتركها فارغة للإغلاق الكامل)</label>
              <input type="number" value={closeQuantity} onChange={(e) => setCloseQuantity(e.target.value)} placeholder={`الحد الأقصى: ${closeDialog.quantity}`} min={0} max={closeDialog.quantity} step={0.001} dir="ltr"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '11px', outline: 'none' }}
              />
              {closeQuantity && parseFloat(closeQuantity) < closeDialog.quantity && parseFloat(closeQuantity) > 0 && (
                <p style={{ fontSize: '9px', color: 'var(--warning)', fontFamily: 'var(--font-ar)', marginTop: '4px' }}>إغلاق جزئي — سيبقى {closeDialog.quantity - parseFloat(closeQuantity)} {closeDialog.symbol} مفتوحاً</p>
              )}
              {closeQuantity && parseFloat(closeQuantity) > closeDialog.quantity && (
                <p style={{ fontSize: '9px', color: 'var(--loss)', fontFamily: 'var(--font-ar)', marginTop: '4px' }}>الكمية تتجاوز المركز المتاح</p>
              )}
            </div>

            {closeError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '6px', background: 'var(--loss-bg)', border: '1px solid var(--border-loss)', marginBottom: '12px' }}>
                <AlertTriangle size={12} style={{ color: 'var(--loss)', flexShrink: 0 }} />
                <span style={{ fontSize: '10px', color: 'var(--loss)', fontFamily: 'var(--font-ar)' }}>{closeError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setCloseDialog(null)} aria-label="إلغاء إغلاق المركز" style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>إلغاء</button>
              <button onClick={handleClosePosition} disabled={closing || (closeQuantity ? parseFloat(closeQuantity) > closeDialog.quantity || parseFloat(closeQuantity) <= 0 : false)}
                style={{ flex: 1, padding: '8px', borderRadius: '7px', border: 'none', background: 'var(--loss)', color: '#fff', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-ar)', cursor: closing ? 'not-allowed' : 'pointer', opacity: closing ? 0.7 : 1 }}>
                {closing ? 'جارٍ التنفيذ...' : closeQuantity && parseFloat(closeQuantity) < closeDialog.quantity ? 'إغلاق جزئي' : 'إغلاق المركز'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit SL/TP Dialog */}
      {editDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setEditDialog(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%', boxShadow: 'var(--shadow-modal)' }} onClick={(e) => e.stopPropagation()} dir={dir}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #0A84FF, #5E5CE6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={13} stroke="#fff" strokeWidth={2} />
              </div>
              <span id="edit-dialog-title" style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-ar)', color: 'var(--text-main)' }}>تعديل مستويات الوقف والأرباح</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginBottom: '16px' }}>تحديث مستويات وقف الخسارة وجني الأرباح لمركز {editDialog.symbol}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--loss)', fontFamily: 'var(--font-ar)', display: 'block', marginBottom: '4px' }}>وقف الخسارة (Stop Loss)</label>
                <input type="number" value={editStopLoss} onChange={(e) => setEditStopLoss(e.target.value)} placeholder={editDialog.stopLoss ? formatPrice(editDialog.stopLoss) : 'أدخل سعر الوقف'} dir="ltr"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '11px', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--profit)', fontFamily: 'var(--font-ar)', display: 'block', marginBottom: '4px' }}>جني الأرباح (Take Profit)</label>
                <input type="number" value={editTakeProfit} onChange={(e) => setEditTakeProfit(e.target.value)} placeholder={editDialog.takeProfit ? formatPrice(editDialog.takeProfit) : 'أدخل سعر الجني'} dir="ltr"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '11px', outline: 'none' }}
                />
              </div>
            </div>

            {editError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '6px', background: 'var(--loss-bg)', border: '1px solid var(--border-loss)', marginBottom: '12px' }}>
                <AlertTriangle size={12} style={{ color: 'var(--loss)', flexShrink: 0 }} />
                <span style={{ fontSize: '10px', color: 'var(--loss)', fontFamily: 'var(--font-ar)' }}>{editError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditDialog(null)} aria-label="إلغاء تعديل المستويات" style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>إلغاء</button>
              <button onClick={handleUpdateLevels} disabled={updating}
                style={{ flex: 1, padding: '8px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-ar)', cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.7 : 1, boxShadow: 'var(--glow-accent)' }}>
                {updating ? 'جارٍ التحديث...' : 'تحديث'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SubPageLayout>
  )
}
