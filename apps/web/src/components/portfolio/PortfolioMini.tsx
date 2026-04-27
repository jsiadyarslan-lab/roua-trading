'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Zap, XCircle, Plus, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react'
import { formatFreshness, getStatusLabel, getStatusTone, type DataStatus } from '@/lib/dashboard-live'

const T = {
  bg:     '#04050C',
  card:   '#08090F',
  blue:   '#0A84FF',
  cyan:   '#00C8FF',
  green:  '#00FFC6',
  red:    '#FF4D4D',
  amber:  '#FFB800',
  purple: '#B388FF',
  text:   '#E6EBF5',
  text2:  '#8090A8',
  text3:  '#A0AFC3',
  border: 'rgba(10,132,255,0.12)',
}

/* ── Default Real Data State ── */
const DEFAULT: PortfolioSummary = {
  balance:       0,
  totalPnl:      0,
  pnlPercent:    0,
  totalPositions: 0,
  winRate:       0,  // Requires trade history analysis (future)
  margin:        0,
  totalProfit:   0,
  totalLoss:     0,
  winCount:      0,
  lossCount:     0,
  totalTrades:   0,
  sharpe:        null,
}

interface PortfolioSummary {
  balance: number
  totalPnl: number
  pnlPercent: number
  totalPositions: number
  winRate: number
  margin: number
  totalProfit: number
  totalLoss: number
  winCount: number
  lossCount: number
  totalTrades: number
  sharpe: number | null
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'

export function usePortfolioSummary() {
  // نستخدم usePositionsStore مباشرة للحصول على P&L لحظي
  // (المراكز تتحدث بالأسعار المباشرة عبر GlobalLogicEngine)
  const positions = usePositionsStore(s => s.positions)
  const account = usePositionsStore(s => s.account)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const paperTrades = usePaperTradesStore(s => s.trades)
  const [loading, setLoading] = useState(true)

  // جلب البيانات أول مرة ودوريًا
  useEffect(() => {
    fetchAccount()
    fetchPositions()
    setLoading(false)
    const iv = setInterval(() => {
      fetchAccount()
      fetchPositions()
    }, 10000)
    return () => clearInterval(iv)
  }, [fetchAccount, fetchPositions])

  // حساب P&L لحظي من المراكز (التي تتحدث بالأسعار المباشرة)
  const data = (() => {
    const balance = Number(account?.equity) || 0
    const margin = balance - (Number(account?.cash) || 0)

    let totalPnl = 0, totalPositions = 0, pnlPercent = 0
    let totalProfit = 0, totalLoss = 0
    let win = 0, loss = 0

    // مراكز Alpaca الحقيقية (P&L محدث لحظيًا من الأسعار المباشرة)
    totalPositions += positions.length
    positions.forEach(p => {
      totalPnl += p.unrealizedPnl || 0
      if (p.unrealizedPnl >= 0) {
        totalProfit += p.unrealizedPnl
        win++
      } else {
        totalLoss += Math.abs(p.unrealizedPnl)
        loss++
      }
    })

    // الصفقات الورقية (تتحدث لحظيًا أيضًا)
    totalPositions += paperTrades.length
    paperTrades.forEach(pt => {
      totalPnl += pt.unrealizedPnl
      if (pt.unrealizedPnl >= 0) {
        totalProfit += pt.unrealizedPnl
        win++
      } else {
        totalLoss += Math.abs(pt.unrealizedPnl)
        loss++
      }
    })

    if (balance > 0) pnlPercent = (totalPnl / (balance - totalPnl)) * 100

    return {
      balance,
      margin,
      totalPnl,
      totalPositions,
      pnlPercent,
      totalProfit,
      totalLoss,
      winCount: win,
      lossCount: loss,
      totalTrades: win + loss,
      winRate: (win + loss) > 0 ? (win / (win + loss)) * 100 : 0,
      sharpe: null as number | null,
    }
  })()

  return { data, loading }
}

/* ══ Sparkline Component ══ */
function BalanceSparkline({ balance, height = 32 }: { balance: number; height?: number }) {
  const historyRef = useRef<number[]>([])
  const maxPoints = 30

  useEffect(() => {
    historyRef.current = [...historyRef.current.slice(-(maxPoints - 1)), balance]
  }, [balance])

  const pts = historyRef.current
  if (pts.length < 2) return null

  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const range = max - min || 1
  const w = 100
  const h = height
  const step = w / (pts.length - 1)

  const coords = pts.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
  const pathD = `M${coords.join(' L')}`
  const areaD = `${pathD} L${(pts.length - 1) * step},${h} L0,${h} Z`
  const lastPnl = pts[pts.length - 1] - pts[0]
  const color = lastPnl >= 0 ? T.green : T.red

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#sparkGrad)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]} r="2" fill={color} />
    </svg>
  )
}

/* ══ Positions Heatmap ══ */
function PositionsHeatmap({ totalPositions, winCount, lossCount, totalProfit, totalLoss, balance }: {
  totalPositions: number; winCount: number; lossCount: number
  totalProfit: number; totalLoss: number; balance: number
}) {
  if (totalPositions === 0 && winCount === 0 && lossCount === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif", fontWeight: 800 }}>خريطة الحرارة</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1', borderRadius: 3, background: `rgba(255,255,255,${0.02 + Math.random() * 0.03})` }} />
          ))}
        </div>
        <div style={{ fontSize: 7, color: T.text3, fontFamily: "'Cairo', sans-serif", textAlign: 'center' }}>لا توجد مراكز مفتوحة</div>
      </div>
    )
  }

  const blocks = [
    ...Array.from({ length: Math.min(winCount, 8) }).map(() => ({ color: T.green, opacity: 0.4 + Math.random() * 0.4 })),
    ...Array.from({ length: Math.min(lossCount, 8) }).map(() => ({ color: T.red, opacity: 0.4 + Math.random() * 0.4 })),
  ]
  while (blocks.length < 16) blocks.push({ color: 'rgba(255,255,255,0.04)', opacity: 1 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif", fontWeight: 800 }}>خريطة الحرارة</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: 2, background: T.green }} />
            <span style={{ fontSize: 6.5, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{winCount}R</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: 2, background: T.red }} />
            <span style={{ fontSize: 6.5, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{lossCount}R</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
        {blocks.map((b, i) => (
          <div key={i} style={{
            aspectRatio: '1',
            borderRadius: 3,
            background: b.color,
            opacity: b.opacity,
            transition: 'all 0.3s',
          }} />
        ))}
      </div>
    </div>
  )
}

/* ══ Quick Actions ══ */
function QuickActions({ onAction }: { onAction?: (action: string) => void }) {
  const actions = [
    { id: 'buy', label: 'شراء سريع', icon: TrendingUp, color: T.green },
    { id: 'sell', label: 'بيع سريع', icon: TrendingDown, color: T.red },
    { id: 'deposit', label: 'إيداع', icon: Plus, color: T.blue },
    { id: 'close-all', label: 'إغلاق الكل', icon: XCircle, color: T.amber },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif", fontWeight: 800 }}>إجراءات سريعة</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
        {actions.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onAction?.(a.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '5px 4px', borderRadius: 7,
                background: `${a.color}10`, border: `0.5px solid ${a.color}30`,
                cursor: 'pointer', transition: 'all 0.2s',
                fontFamily: "'Cairo', sans-serif", fontSize: 8, fontWeight: 700, color: a.color,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${a.color}22` }}
              onMouseLeave={e => { e.currentTarget.style.background = `${a.color}10` }}
            >
              <Icon size={10} />
              {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ══ Mini Portfolio Widget (for dashboard sidebar panel) ══ */
export function PortfolioMini({
  mobile = false,
  compact = false,
  dataStatus = 'disconnected',
  lastUpdatedAt = null,
  sourceLabel = 'في انتظار ربط API',
  selectedSymbol,
}: {
  mobile?: boolean
  compact?: boolean
  dataStatus?: DataStatus
  lastUpdatedAt?: string | number | null
  sourceLabel?: string
  selectedSymbol?: string
}) {
  const { data } = usePortfolioSummary()
  const pnlUp = data.totalPnl >= 0
  const cardGap = compact ? 4 : 6
  const pad = compact ? '8px 10px' : '8px 10px'
  const balanceSize = compact ? 14 : 16
  const statusTone = getStatusTone(dataStatus)

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: pad,
      display: 'flex', flexDirection: 'column', gap: cardGap,
      overflowY: 'auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
    }} className="custom-scrollbar">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        borderRadius: 10,
        padding: compact ? '6px 8px' : '7px 10px',
        border: `1px solid ${statusTone}28`,
        background: 'rgba(255,255,255,0.025)',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 8.5, color: T.text3, marginBottom: 3 }}>حالة الحساب</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 7px',
              borderRadius: 999,
              border: `1px solid ${statusTone}40`,
              background: `${statusTone}16`,
              color: statusTone,
              fontSize: 8.5,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusTone }} />
              {getStatusLabel(dataStatus)}
            </span>
            {selectedSymbol && <span style={{ fontSize: 9, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 8.5, color: T.text3 }}>{sourceLabel}</div>
          <div style={{ fontSize: 9, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{formatFreshness(lastUpdatedAt)}</div>
        </div>
      </div>

      {/* Balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{
            fontFamily: "'Cairo', sans-serif",
            fontSize: 9, color: T.text2,
          }}>الرصيد الكلي</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: balanceSize, fontWeight: 800, color: T.text,
            letterSpacing: '-0.02em',
          }}>${fmt(data.balance, 0)}</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', borderRadius: 12,
          background: `${pnlUp ? T.green : T.red}18`,
          border: `0.5px solid ${pnlUp ? T.green : T.red}44`,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, fontWeight: 700,
            color: pnlUp ? T.green : T.red,
          }}>
            {pnlUp ? '+' : '-'}{fmt(Math.abs(data.pnlPercent))}%
          </span>
        </div>
      </div>

      {/* P&L */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '5px 8px', borderRadius: 7,
        background: `${pnlUp ? T.green : T.red}0d`,
        border: `0.5px solid ${pnlUp ? T.green : T.red}22`,
      }}>
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9.5, color: T.text2 }}>P&L الإجمالي</span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, fontWeight: 700,
          color: pnlUp ? T.green : T.red,
        }}>
          {pnlUp ? '+' : '-'}${fmt(Math.abs(data.totalPnl), 0)}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[
          { label: 'مراكز', value: data.totalPositions, color: T.cyan },
          { label: 'فوز%', value: `${data.winRate}%`, color: T.green },
          { label: 'Exposure', value: `${Math.min(100, Math.abs(data.margin) > 0 && data.balance > 0 ? Math.round((Math.abs(data.margin) / data.balance) * 100) : 0)}%`, color: T.amber },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center',
            padding: '4px 2px', borderRadius: 6,
            background: `${stat.color}0d`,
            border: `0.5px solid ${stat.color}22`,
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700, color: stat.color,
            }}>{stat.value}</div>
            <div style={{
              fontFamily: "'Cairo', sans-serif",
              fontSize: 8, color: T.text3,
            }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Win rate bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>
            {data.winCount} فائزة
          </span>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>
            {data.lossCount} خاسرة
          </span>
        </div>
        <div style={{
          height: 5, borderRadius: 3,
          background: `${T.red}30`, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${data.winRate}%`,
            background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
            transition: 'width 0.8s ease',
          }} />
        </div>
      </div>

      {/* Balance Sparkline */}
      <BalanceSparkline balance={data.balance} height={28} />

      {/* Positions Heatmap */}
      <PositionsHeatmap
        totalPositions={data.totalPositions}
        winCount={data.winCount}
        lossCount={data.lossCount}
        totalProfit={data.totalProfit}
        totalLoss={data.totalLoss}
        balance={data.balance}
      />

      {/* Quick Actions */}
      <QuickActions onAction={(action) => {
        // Dispatch custom events for the dashboard to handle
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('roua-quick-action', { detail: { action } }))
        }
      }} />

      {/* Margin */}
      {!compact && <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `0.5px solid ${T.border}`, paddingTop: 5,
      }}>
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>الهامش المستخدم</span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, color: T.amber,
        }}>${fmt(data.margin, 0)}</span>
      </div>}
    </div>
  )
}
