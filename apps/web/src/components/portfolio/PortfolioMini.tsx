'use client'

import { useState, useEffect } from 'react'
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
  const cardGap = compact ? 6 : 8
  const pad = compact ? '10px 12px' : '8px 10px'
  const balanceSize = compact ? 16 : 18
  const statusTone = getStatusTone(dataStatus)

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: pad,
      display: 'flex', flexDirection: 'column', gap: cardGap,
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
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
