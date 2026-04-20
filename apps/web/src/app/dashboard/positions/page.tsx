'use client'

import { useState, useEffect, useCallback, startTransition } from 'react'
import { useRouter } from 'next/navigation'
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

// ── Types ──
interface Position {
  id: string
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
}

interface PositionSummary {
  totalPositions: number
  totalValue: number
  unrealizedPnl: number
  realizedPnl: number
}

const EXCHANGES = ['الكل', 'binance', 'kucoin', 'bybit', 'okx', 'gate']
const SYMBOLS = ['الكل', 'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT']

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
  const router = useRouter()
  const { loading: authLoading } = useAuth()

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

  const fetchPositions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trading/positions')
      if (res.ok) {
        const data = await res.json()
        setPositions(data.data || data.positions || [])
      } else {
        setApiUnavailable(true)
      }
    } catch {
      setApiUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/positions/summary')
      if (res.ok) {
        const data = await res.json()
        setSummary(data.data || data.summary || null)
      }
    } catch { /* */ }
  }, [])

  useEffect(() => {
    startTransition(() => {
      fetchPositions()
      fetchSummary()
    })
  }, [])

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
    try {
      const body: Record<string, unknown> = { positionId: closeDialog.id }
      if (isPartial && qty > 0) body.quantity = qty
      const res = await fetch('/api/trading/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        if (isPartial) {
          setPositions((prev) => prev.map((p) => p.id === closeDialog.id ? { ...p, quantity: p.quantity - qty } : p))
        } else {
          setPositions((prev) => prev.filter((p) => p.id !== closeDialog.id))
        }
        fetchSummary()
        setCloseDialog(null)
      } else {
        const data = await res.json()
        throw new Error(data.error || 'فشل في إغلاق المركز')
      }
    } catch (err: any) {
      setCloseError(err.message)
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
    } catch (err: any) {
      setEditError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

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
      {/* Summary Cards */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <StatCard
          icon={<BarChart3 size={12} stroke="#fff" strokeWidth={2} />}
          label="إجمالي المراكز"
          value={String(summary?.totalPositions ?? positions.length)}
          gradientFrom="#00FFC6"
          gradientTo="#00B894"
          color="var(--text-main)"
        />
        <StatCard
          icon={<Briefcase size={12} stroke="#fff" strokeWidth={2} />}
          label="القيمة الإجمالية"
          value={formatCurrency(summary?.totalValue ?? 0)}
          gradientFrom="#FFB800"
          gradientTo="#FF8C00"
          color="var(--text-main)"
        />
        <StatCard
          icon={<Activity size={12} stroke="#fff" strokeWidth={2} />}
          label="أ.خ غير محققة"
          value={`${(summary?.unrealizedPnl ?? totalUnrealizedPnl) >= 0 ? '+' : ''}${formatCurrency(summary?.unrealizedPnl ?? totalUnrealizedPnl)}`}
          gradientFrom="#00FFC6"
          gradientTo="#0A84FF"
          color={(summary?.unrealizedPnl ?? totalUnrealizedPnl) >= 0 ? 'var(--profit)' : 'var(--loss)'}
        />
        <StatCard
          icon={<Target size={12} stroke="#fff" strokeWidth={2} />}
          label="الأرباح المحققة"
          value={`${(summary?.realizedPnl ?? 0) >= 0 ? '+' : ''}${formatCurrency(summary?.realizedPnl ?? 0)}`}
          gradientFrom="#A259FF"
          gradientTo="#7C3AED"
          color={(summary?.realizedPnl ?? 0) >= 0 ? 'var(--profit)' : 'var(--loss)'}
        />
      </motion.div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
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
                <span dir="ltr" style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: totalUnrealizedPnl >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                  {totalUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnl)}
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
            ) : (
              /* Desktop Table */
              <div className="custom-scrollbar" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['الزوج', 'البورصة', 'الاتجاه', 'الكمية', 'سعر الدخول', 'السعر الحالي', 'ر/خ', 'وقف الخسارة', 'جني الأرباح', 'إجراءات'].map(h => (
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
                        <td dir="ltr" style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{pos.quantity}</td>
                        <td dir="ltr" style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatPrice(pos.entryPrice)}</td>
                        <td dir="ltr" style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{formatPrice(pos.currentPrice)}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span dir="ltr" style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: (pos.unrealizedPnl || 0) >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                            {(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnl || 0)}
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
                            <button onClick={() => openEditDialog(pos)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                            >
                              <Edit3 size={11} style={{ color: 'inherit' }} />
                            </button>
                            <button onClick={() => openCloseDialog(pos)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
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
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', lineHeight: '1.5' }}>إدارة المراكز تتطلب اتصالاً بخادم التداول. رؤى لا تلمس أموالك أبداً — نحن ننفذ الأوامر فقط من خلال مفاتيح API المشفرة.</span>
      </div>

      {/* Close Position Dialog */}
      {closeDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setCloseDialog(null)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', maxWidth: '440px', width: '90%', boxShadow: 'var(--shadow-modal)' }} onClick={(e) => e.stopPropagation()} dir="rtl">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <XCircle size={13} stroke="#fff" strokeWidth={2} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-ar)', color: 'var(--text-main)' }}>تأكيد إغلاق المركز</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)', marginBottom: '16px' }}>هل أنت متأكد من إغلاق مركز {closeDialog.symbol}؟ يمكنك إغلاق المركز بالكامل أو جزئياً.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: 'الاتجاه', value: closeDialog.side === 'BUY' ? 'شراء' : 'بيع', color: closeDialog.side === 'BUY' ? 'var(--profit)' : 'var(--loss)' },
                { label: 'الكمية', value: String(closeDialog.quantity), color: 'var(--text-main)' },
                { label: 'سعر الدخول', value: formatPrice(closeDialog.entryPrice), color: 'var(--text-main)' },
                { label: 'ر/خ غير محقق', value: formatCurrency(closeDialog.unrealizedPnl || 0), color: (closeDialog.unrealizedPnl || 0) >= 0 ? 'var(--profit)' : 'var(--loss)' },
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
              <button onClick={() => setCloseDialog(null)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>إلغاء</button>
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
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%', boxShadow: 'var(--shadow-modal)' }} onClick={(e) => e.stopPropagation()} dir="rtl">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #0A84FF, #5E5CE6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={13} stroke="#fff" strokeWidth={2} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-ar)', color: 'var(--text-main)' }}>تعديل مستويات الوقف والأرباح</span>
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
              <button onClick={() => setEditDialog(null)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ar)', cursor: 'pointer' }}>إلغاء</button>
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
