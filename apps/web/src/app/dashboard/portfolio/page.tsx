'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, BarChart, Bar,
} from 'recharts'
import { TrendingUp, TrendingDown, Award, Target, BarChart2, X, Shield, Activity, RefreshCw, Loader2, AlertTriangle, ChevronRight, Clock, History } from 'lucide-react'

/* ── Theme ── */
const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(10,132,255,0.12)',
  border2: 'rgba(10,132,255,0.20)',
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const formatPrice = (value: number) => {
  if (value >= 1000) return `$${fmt(value, 2)}`
  if (value >= 1) return `$${fmt(value, 2)}`
  return `$${fmt(value, 6)}`
}

/* ── Types ── */
interface Position {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  realizedPnl?: number
  exchange: string
  stopLoss?: number
  takeProfit?: number
  status?: string
  openedAt: string
  closedAt?: string
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
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: active ? '#fff' : T.text3,
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
      background: '#0D1520', border: `0.5px solid ${T.blue}44`,
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

/* ── Main page ── */
export default function PortfolioPage() {
  const [tab, setTab] = useState<'positions' | 'performance' | 'risk'>('positions')
  const [positions, setPositions] = useState<Position[]>([])
  const [closedPositions, setClosedPositions] = useState<Position[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [summary, setSummary] = useState<PositionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/positions')
      if (res.ok) {
        const data = await res.json()
        setPositions(data.data || data.positions || [])
        setApiError(null)
      } else {
        const text = await res.text().catch(() => '')
        setApiError(`فشل في جلب المراكز المفتوحة (${res.status})${text ? ': ' + text.slice(0, 100) : ''}`)
      }
    } catch (e: any) {
      setApiError(`خطأ في الاتصال بخادم التداول: ${e.message || 'غير معروف'}`)
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
    } catch {
      // Closed positions fetch failure is non-critical
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

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/trades?limit=100')
      if (res.ok) {
        const data = await res.json()
        setTrades(Array.isArray(data) ? data : (data.data || data.trades || []))
      }
    } catch { /* */ }
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
      const res = await fetch('/api/trading/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: pos.id }),
      })
      if (res.ok) {
        setPositions(prev => prev.filter(p => p.id !== pos.id))
        fetchSummary()
        fetchClosedPositions()
        fetchTrades()
      } else {
        const data = await res.json().catch(() => ({}))
        setApiError(`فشل في إغلاق المركز: ${data.error || data.message || res.statusText}`)
      }
    } catch (e: any) {
      setApiError(`خطأ في إغلاق المركز: ${e.message || 'غير معروف'}`)
    }
    setClosing(null)
  }

  // ── Computed values ──
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
  const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0)
  const totalTradePnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const winningTrades = trades.filter(t => (t.pnl || 0) > 0)
  const losingTrades = trades.filter(t => (t.pnl || 0) < 0)
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0

  // ── Performance chart data (daily P&L from trades) ──
  const performanceData = (() => {
    const dailyMap: Record<string, { date: string; pnl: number; trades: number }> = {}
    trades.forEach(t => {
      const day = new Date(t.executedAt).toISOString().split('T')[0]
      if (!dailyMap[day]) dailyMap[day] = { date: day, pnl: 0, trades: 0 }
      dailyMap[day].pnl += (t.pnl || 0)
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
    const colors = ['#0A84FF', '#FFB800', '#F7931A', '#00FFC6', '#B388FF', '#FF4D4D', '#00C8FF']
    return Object.entries(symMap).map(([name, value], i) => ({
      name, value: Math.round((value / total) * 100), color: colors[i % colors.length],
    }))
  })()

  // ── Risk metrics ──
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + (t.pnl || 0), 0) / winningTrades.length : 0
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + (t.pnl || 0), 0) / losingTrades.length) : 0
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0
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

  return (
    <div style={{
      width: '100%', minHeight: 'calc(100vh - 100px)',
      background: T.bg, overflow: 'auto',
      padding: '12px 14px', boxSizing: 'border-box',
      direction: 'rtl',
      fontFamily: "'Cairo', sans-serif",
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #04050C; }
        ::-webkit-scrollbar-thumb { background: #0A84FF44; border-radius: 4px; }
      `}</style>

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatCard
          label="المراكز المفتوحة" value={String(positions.length)}
          color={T.cyan} icon={BarChart2}
          sub={`القيمة: $${fmt(summary?.totalValue || 0, 0)}`}
        />
        <StatCard
          label="أ.خ غير محققة" value={`${totalUnrealizedPnl >= 0 ? '+' : ''}$${fmt(Math.abs(totalUnrealizedPnl), 2)}`}
          color={totalUnrealizedPnl >= 0 ? T.green : T.red}
          icon={totalUnrealizedPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="أرباح محققة" value={`${totalRealizedPnl >= 0 ? '+' : ''}$${fmt(Math.abs(totalRealizedPnl), 2)}`}
          color={totalRealizedPnl >= 0 ? T.green : T.red}
          icon={TrendingUp}
          sub={`${closedPositions.length} صفقة مغلقة`}
        />
        <StatCard
          label="نسبة الفوز" value={`${winRate.toFixed(1)}%`}
          sub={`من ${trades.length} صفقة`}
          color={T.amber} icon={Target}
          note={winRate >= 60 ? 'ممتاز' : winRate >= 40 ? 'جيد' : undefined}
        />
        <StatCard
          label="Sharpe Ratio" value={sharpeRatio !== null ? sharpeRatio.toFixed(2) : '—'}
          color={T.purple} icon={Award}
        />
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <TabButton label="الصفقات" icon={Activity} active={tab === 'positions'} onClick={() => setTab('positions')} count={positions.length + closedPositions.length} />
        <TabButton label="الأداء" icon={TrendingUp} active={tab === 'performance'} onClick={() => setTab('performance')} />
        <TabButton label="المخاطر" icon={Shield} active={tab === 'risk'} onClick={() => setTab('risk')} />
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* TAB: الصفقات                                  */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'positions' && (
        <>
          {/* Charts row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {/* Distribution donut */}
            <div style={{
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
                        <Cell key={i} fill={entry.color} opacity={0.85} />
                      ))}
                    </Pie>
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val}%`, '']}
                      contentStyle={{ background: '#0D1520', border: `0.5px solid ${T.border2}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
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

          {/* ── Open Positions table ── */}
          <div style={{
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
                  color: totalUnrealizedPnl >= 0 ? T.green : T.red, fontWeight: 700,
                  marginRight: 8,
                }}>
                  P&L: {totalUnrealizedPnl >= 0 ? '+' : ''}${fmt(totalUnrealizedPnl, 2)}
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
            ) : (
              <>
                {/* Table head */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 70px 70px 90px 90px 80px 80px 80px 80px',
                  padding: '5px 14px', gap: 0,
                  borderBottom: `0.5px solid ${T.border}`,
                }}>
                  {['الزوج','اتجاه','حجم','سعر الدخول','السعر الحالي','SL','TP','P&L','إجراء'].map((h, i) => (
                    <div key={i} style={{
                      fontFamily: "'Cairo', sans-serif", fontSize: 9.5,
                      color: T.text3, textAlign: 'center',
                    }}>{h}</div>
                  ))}
                </div>
                {/* Rows */}
                {positions.map((pos, i) => (
                  <div key={pos.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 70px 70px 90px 90px 80px 80px 80px 80px',
                    padding: '7px 14px', gap: 0,
                    borderBottom: i < positions.length - 1 ? `0.5px solid ${T.border}` : 'none',
                    alignItems: 'center',
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent',
                  }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text }}>{pos.symbol}</div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700,
                        background: pos.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                        color: pos.side === 'BUY' ? T.green : T.red,
                        border: `0.5px solid ${pos.side === 'BUY' ? T.green : T.red}44`,
                      }}>{pos.side === 'BUY' ? 'شراء ↑' : 'بيع ↓'}</span>
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{pos.quantity}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{formatPrice(pos.entryPrice)}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: T.text }}>{pos.currentPrice ? formatPrice(pos.currentPrice) : '—'}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.red }}>{pos.stopLoss ? formatPrice(pos.stopLoss) : '—'}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.green }}>{pos.takeProfit ? formatPrice(pos.takeProfit) : '—'}</div>
                    <div style={{
                      textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11, fontWeight: 700,
                      color: (pos.unrealizedPnl || 0) >= 0 ? T.green : T.red,
                    }}>
                      {(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}${fmt(Math.abs(pos.unrealizedPnl || 0))}
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
                        <X size={9} />
                        {closing === pos.id ? '...' : 'إغلاق'}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ── Closed Positions ── */}
          <div style={{
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
                {closedPositions.length} صفقة
              </span>
              {totalRealizedPnl !== 0 && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: totalRealizedPnl >= 0 ? T.green : T.red, fontWeight: 700,
                  marginRight: 8,
                }}>
                  P&L: {totalRealizedPnl >= 0 ? '+' : ''}${fmt(Math.abs(totalRealizedPnl), 2)}
                </span>
              )}
              <ChevronRight size={14} style={{ color: T.text3, transform: showClosed ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
            </div>

            {showClosed && (
              closedPositions.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <History size={28} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 8px' }} />
                  <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3 }}>لا توجد صفقات مغلقة بعد</p>
                  <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginTop: 4 }}>الصفقات التي تُغلق ستظهر هنا</p>
                </div>
              ) : (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 70px 70px 90px 90px 90px 90px 120px',
                    padding: '5px 14px', gap: 0,
                    borderBottom: `0.5px solid ${T.border}`,
                  }}>
                    {['الزوج','اتجاه','حجم','سعر الدخول','سعر الإغلاق','ر.خ محققة','الحالة','وقت الإغلاق'].map((h, i) => (
                      <div key={i} style={{
                        fontFamily: "'Cairo', sans-serif", fontSize: 9.5,
                        color: T.text3, textAlign: 'center',
                      }}>{h}</div>
                    ))}
                  </div>
                  {closedPositions.map((pos, i) => (
                    <div key={pos.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 70px 70px 90px 90px 90px 90px 120px',
                      padding: '6px 14px', gap: 0,
                      borderBottom: i < closedPositions.length - 1 ? `0.5px solid ${T.border}` : 'none',
                      alignItems: 'center',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent',
                    }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: T.text }}>{pos.symbol}</div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: 3,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                          background: pos.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                          color: pos.side === 'BUY' ? T.green : T.red,
                        }}>{pos.side === 'BUY' ? 'شراء' : 'بيع'}</span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{pos.quantity}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{formatPrice(pos.entryPrice)}</div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{pos.currentPrice ? formatPrice(pos.currentPrice) : '—'}</div>
                      <div style={{
                        textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10, fontWeight: 700,
                        color: (pos.realizedPnl || 0) >= 0 ? T.green : T.red,
                      }}>
                        {(pos.realizedPnl || 0) >= 0 ? '+' : ''}${fmt(Math.abs(pos.realizedPnl || 0))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: 3,
                          fontFamily: "'Cairo', sans-serif", fontSize: 9, fontWeight: 700,
                          background: `${T.blue}18`, color: T.blue,
                        }}>مغلقة</span>
                      </div>
                      <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text3 }}>
                        {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                    </div>
                  ))}
                </>
              )
            )}
          </div>

          {/* ── Trade History ── */}
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
              <Clock size={13} style={{ color: T.text3 }} />
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                fontSize: 12, color: T.text, flex: 1,
              }}>سجل الصفقات المنفذة</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text3 }}>{trades.length} صفقة</span>
              {totalTradePnl !== 0 && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: totalTradePnl >= 0 ? T.green : T.red, fontWeight: 700,
                  marginRight: 8,
                }}>
                  P&L: {totalTradePnl >= 0 ? '+' : ''}${fmt(Math.abs(totalTradePnl), 2)}
                </span>
              )}
            </div>

            {trades.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Clock size={28} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 8px' }} />
                <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3 }}>لا توجد صفقات منفذة بعد</p>
                <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginTop: 4 }}>ابدأ التداول لرؤية سجل صفقاتك هنا</p>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 70px 70px 90px 90px 90px 120px',
                  padding: '5px 14px', gap: 0,
                  borderBottom: `0.5px solid ${T.border}`,
                }}>
                  {['الزوج','اتجاه','نوع','الكمية','السعر','ر/خ','الوقت'].map((h, i) => (
                    <div key={i} style={{
                      fontFamily: "'Cairo', sans-serif", fontSize: 9.5,
                      color: T.text3, textAlign: 'center',
                    }}>{h}</div>
                  ))}
                </div>
                {trades.slice(0, 50).map((trade, i) => (
                  <div key={trade.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 70px 70px 90px 90px 90px 120px',
                    padding: '6px 14px', gap: 0,
                    borderBottom: i < Math.min(trades.length, 50) - 1 ? `0.5px solid ${T.border}` : 'none',
                    alignItems: 'center',
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent',
                  }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: T.text }}>{trade.symbol}</div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{
                        padding: '1px 6px', borderRadius: 3,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                        background: trade.side === 'BUY' ? `${T.green}18` : `${T.red}18`,
                        color: trade.side === 'BUY' ? T.green : T.red,
                      }}>{trade.side === 'BUY' ? 'شراء' : 'بيع'}</span>
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>
                      {trade.type === 'ENTRY' ? 'دخول' : trade.type === 'EXIT' ? 'خروج' : 'خروج جزئي'}
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{trade.quantity}</div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2 }}>{formatPrice(trade.price)}</div>
                    <div style={{
                      textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10, fontWeight: 700,
                      color: (trade.pnl || 0) >= 0 ? T.green : (trade.pnl || 0) < 0 ? T.red : T.text3,
                    }}>
                      {trade.pnl !== null ? `${(trade.pnl) >= 0 ? '+' : ''}$${fmt(Math.abs(trade.pnl), 2)}` : '—'}
                    </div>
                    <div style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text3 }}>
                      {new Date(trade.executedAt).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
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
            <StatCard label="صفقات فائزة" value={String(winningTrades.length)} color={T.green} icon={TrendingUp} sub={`${winRate.toFixed(1)}%`} />
            <StatCard label="صفقات خاسرة" value={String(losingTrades.length)} color={T.red} icon={TrendingDown} />
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
                    contentStyle={{ background: '#0D1520', border: `0.5px solid ${T.border2}`, borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'P&L']}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {performanceData.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ? T.green : T.red} opacity={0.8} />
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
            <StatCard label="معامل الربح" value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)} color={T.green} icon={TrendingUp}
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
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.green }}>{winningTrades.length} فوز</span>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.red }}>{losingTrades.length} خسارة</span>
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
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>متوسط الخسارة</span>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: T.red }}>-${fmt(avgLoss, 2)}</div>
                  </div>
                </div>
              </div>

              {/* Open exposure */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>التعرض المفتوح</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: totalUnrealizedPnl >= 0 ? T.green : T.red }}>
                  {totalUnrealizedPnl >= 0 ? '+' : ''}${fmt(Math.abs(totalUnrealizedPnl), 2)}
                </div>
                <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.text3 }}>عبر {positions.length} مركز مفتوح</span>
              </div>

              {/* SL coverage */}
              <div style={{ padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text2, marginBottom: 6 }}>تغطية وقف الخسارة</div>
                {positions.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 6, borderRadius: 3, background: `${T.red}22`, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            background: positions.every(p => p.stopLoss) ? T.green : T.amber,
                            width: `${(positions.filter(p => p.stopLoss).length / positions.length) * 100}%`,
                            transition: 'width 0.3s',
                          }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: positions.every(p => p.stopLoss) ? T.green : T.amber }}>
                        {positions.filter(p => p.stopLoss).length}/{positions.length}
                      </span>
                    </div>
                    {!positions.every(p => p.stopLoss) && (
                      <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.amber, marginTop: 4, display: 'block' }}>
                        {positions.filter(p => !p.stopLoss).length} مركز بدون وقف خسارة
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
                رؤى لا تلمس أموالك أبداً — نحن ننفذ الأوامر فقط من خلال مفاتيح API المشفرة.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
