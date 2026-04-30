'use client'

import { useMemo, useState } from 'react'
import { usePaperTradesStore, type ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import {
  TrendingUp, TrendingDown, Trophy, Target, BarChart3,
  Calendar, RefreshCw, Trash2, ChevronDown, ChevronUp
} from 'lucide-react'
import dynamic from 'next/dynamic'

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false })
const Area     = dynamic(() => import('recharts').then(m => m.Area),      { ssr: false })
const XAxis    = dynamic(() => import('recharts').then(m => m.XAxis),     { ssr: false })
const YAxis    = dynamic(() => import('recharts').then(m => m.YAxis),     { ssr: false })
const Tooltip  = dynamic(() => import('recharts').then(m => m.Tooltip),   { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

const T = {
  bg:     '#0B0E14',
  card:   '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  cyan:   '#00D4FF',
  green:  '#00FFA3',
  red:    '#FF4757',
  amber:  '#FFB800',
  purple: '#B388FF',
  text:   '#F0F2F5',
  text2:  '#8B92A8',
  mono:   "'JetBrains Mono', monospace",
  ar:     "'Cairo', sans-serif",
}

function fmt(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2)
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

function StatCard({
  label, value, sub, color, icon: Icon
}: {
  label: string; value: string; sub?: string; color: string; icon: any
}) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}12, rgba(26,29,41,0.8))`,
      border: `1px solid ${color}25`,
      borderRadius: 14, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: T.text2, fontFamily: T.ar, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.mono, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: T.text2, fontFamily: T.ar, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function PnLPage() {
  const closedTrades = usePaperTradesStore(s => s.closedTrades)
  const clearClosedTrades = usePaperTradesStore(s => s.clearClosedTrades)
  const [filter, setFilter] = useState<'all' | 'bot' | 'manual'>('all')
  const [sort, setSort] = useState<'date' | 'pnl'>('date')
  const [asc, setAsc] = useState(false)

  const filtered = useMemo(() => {
    let t = filter === 'all' ? closedTrades : closedTrades.filter(x => x.source === filter)
    return [...t].sort((a, b) => {
      if (sort === 'date') return asc ? a.closeTime - b.closeTime : b.closeTime - a.closeTime
      return asc ? a.realizedPnl - b.realizedPnl : b.realizedPnl - a.realizedPnl
    })
  }, [closedTrades, filter, sort, asc])

  // Stats
  const stats = useMemo(() => {
    const all = filter === 'all' ? closedTrades : closedTrades.filter(x => x.source === filter)
    if (all.length === 0) return null
    const wins = all.filter(x => x.realizedPnl >= 0)
    const losses = all.filter(x => x.realizedPnl < 0)
    const totalPnl = all.reduce((s, x) => s + x.realizedPnl, 0)
    const winRate = all.length > 0 ? (wins.length / all.length) * 100 : 0
    const avgWin = wins.length > 0 ? wins.reduce((s, x) => s + x.realizedPnl, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, x) => s + x.realizedPnl, 0) / losses.length) : 0
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0

    // Max drawdown
    let peak = 0, equity = 0, maxDD = 0
    for (const t of [...all].sort((a, b) => a.closeTime - b.closeTime)) {
      equity += t.realizedPnl
      if (equity > peak) peak = equity
      const dd = peak - equity
      if (dd > maxDD) maxDD = dd
    }

    return { total: all.length, wins: wins.length, losses: losses.length, totalPnl, winRate, avgWin, avgLoss, profitFactor, maxDD }
  }, [closedTrades, filter])

  // Equity curve
  const equityCurve = useMemo(() => {
    const all = filter === 'all' ? closedTrades : closedTrades.filter(x => x.source === filter)
    const sorted = [...all].sort((a, b) => a.closeTime - b.closeTime)
    let equity = 0
    return sorted.map((t, i) => {
      equity += t.realizedPnl
      return { i: i + 1, equity: parseFloat(equity.toFixed(2)), date: fmtDate(t.closeTime) }
    })
  }, [closedTrades, filter])

  const hasData = closedTrades.length > 0

  return (
    <div style={{
      minHeight: 'calc(100dvh - 108px)',
      background: T.bg,
      padding: '20px 24px',
      direction: 'rtl',
      fontFamily: T.ar,
      color: T.text,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: T.text }}>
            📈 لوحة الأداء التاريخي
          </h1>
          <p style={{ fontSize: 12, color: T.text2, marginTop: 4 }}>
            تحليل صفقاتك المغلقة • Paper Trading
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Filter */}
          {(['all', 'bot', 'manual'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: 8, border: `1px solid ${filter === f ? T.cyan + '40' : T.border}`,
              background: filter === f ? `${T.cyan}12` : 'rgba(255,255,255,0.03)',
              color: filter === f ? T.cyan : T.text2,
              fontFamily: T.ar, fontSize: 12, fontWeight: filter === f ? 700 : 500, cursor: 'pointer',
            }}>
              {f === 'all' ? 'الكل' : f === 'bot' ? '🤖 البوت' : '✋ يدوي'}
            </button>
          ))}
          {hasData && (
            <button onClick={() => { if (confirm('هل تريد حذف كل سجل الصفقات؟')) clearClosedTrades() }} style={{
              padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.red}30`,
              background: `${T.red}08`, color: T.red, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Trash2 size={13} /> مسح
            </button>
          )}
        </div>
      </div>

      {!hasData ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: 400, gap: 16, color: T.text2,
        }}>
          <BarChart3 size={48} color={T.text2} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>لا توجد صفقات مغلقة بعد</div>
          <div style={{ fontSize: 12 }}>فعّل البوت أو نفّذ صفقات يدوية لبدء التتبع</div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <StatCard label="إجمالي الربح/الخسارة" value={`${fmt(stats.totalPnl)}$`} color={stats.totalPnl >= 0 ? T.green : T.red} icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown} sub={`${stats.total} صفقة`} />
              <StatCard label="نسبة الفوز" value={`${stats.winRate.toFixed(1)}%`} color={stats.winRate >= 50 ? T.green : T.amber} icon={Trophy} sub={`${stats.wins} ربح / ${stats.losses} خسارة`} />
              <StatCard label="معامل الربح" value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'} color={stats.profitFactor >= 1.5 ? T.green : stats.profitFactor >= 1 ? T.amber : T.red} icon={Target} sub="Profit Factor" />
              <StatCard label="أقصى انسحاب" value={`${stats.maxDD.toFixed(2)}$`} color={T.red} icon={TrendingDown} sub="Max Drawdown" />
              <StatCard label="متوسط الربح" value={`+${stats.avgWin.toFixed(2)}$`} color={T.green} icon={TrendingUp} sub="Avg Win" />
              <StatCard label="متوسط الخسارة" value={`-${stats.avgLoss.toFixed(2)}$`} color={T.red} icon={TrendingDown} sub="Avg Loss" />
            </div>
          )}

          {/* Equity Curve */}
          {equityCurve.length > 1 && (
            <div style={{
              background: 'rgba(26,29,41,0.6)', borderRadius: 14, border: `1px solid ${T.border}`,
              padding: '16px 20px', marginBottom: 24,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: T.text2 }}>
                📊 منحنى رأس المال (Equity Curve)
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={T.cyan} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={T.cyan} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: T.text2, fontSize: 9, fontFamily: T.ar }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: T.text2, fontSize: 9, fontFamily: T.mono }} tickLine={false} axisLine={false} width={55} tickFormatter={v => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.ar, fontSize: 11 }}
                      formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'رأس المال']}
                    />
                    <Area type="monotone" dataKey="equity" stroke={T.cyan} strokeWidth={2} fill="url(#eqGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Trade Table */}
          <div style={{
            background: 'rgba(26,29,41,0.6)', borderRadius: 14, border: `1px solid ${T.border}`,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 70px 80px 90px 90px 90px 100px',
              padding: '10px 16px',
              borderBottom: `1px solid ${T.border}`,
              background: 'rgba(0,212,255,0.04)',
            }}>
              {[
                { label: 'الزوج', key: null },
                { label: 'الاتجاه', key: null },
                { label: 'الكمية', key: null },
                { label: 'الدخول', key: null },
                { label: 'الخروج', key: null },
                { label: 'P&L', key: 'pnl' },
                { label: 'التاريخ', key: 'date' },
              ].map(({ label, key }) => (
                <div key={label} onClick={() => {
                  if (!key) return
                  if (sort === key) setAsc(!asc)
                  else { setSort(key as any); setAsc(false) }
                }} style={{
                  fontSize: 10, fontWeight: 700, color: T.text2,
                  cursor: key ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: 4,
                  userSelect: 'none',
                }}>
                  {label}
                  {sort === key && (asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                </div>
              ))}
            </div>

            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {filtered.map((t, i) => {
                const isWin = t.realizedPnl >= 0
                const color = isWin ? T.green : T.red
                return (
                  <div key={t.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 80px 90px 90px 90px 100px',
                    padding: '10px 16px',
                    borderBottom: `1px solid ${T.border}`,
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,212,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, fontFamily: T.mono, color: T.text }}>
                      {t.symbol}
                      <span style={{ fontSize: 9, marginRight: 6, padding: '1px 5px', borderRadius: 3, background: t.source === 'bot' ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.06)', color: t.source === 'bot' ? T.cyan : T.text2 }}>
                        {t.source === 'bot' ? '🤖' : '✋'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: t.side === 'long' ? `${T.green}18` : `${T.red}18`, color: t.side === 'long' ? T.green : T.red, fontWeight: 700 }}>
                        {t.side === 'long' ? '↑ شراء' : '↓ بيع'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.text2 }}>{t.qty.toFixed(4)}</div>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.text }}>${t.entryPrice.toFixed(2)}</div>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.text }}>${t.exitPrice.toFixed(2)}</div>
                    <div style={{ fontSize: 12, fontFamily: T.mono, fontWeight: 800, color }}>
                      {fmt(t.realizedPnl)}$
                    </div>
                    <div style={{ fontSize: 10, color: T.text2 }}>
                      {fmtDate(t.closeTime)}<br />
                      <span style={{ fontSize: 9 }}>{fmtTime(t.closeTime)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
