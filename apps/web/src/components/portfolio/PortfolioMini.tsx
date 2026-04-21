'use client'

import { useState, useEffect } from 'react'

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

/* ── Demo data for unauthenticated dev mode ── */
const DEMO: PortfolioSummary = {
  balance:       38725,
  totalPnl:      13259,
  pnlPercent:    4.6,
  totalPositions: 5,
  winRate:       65,
  margin:        149081,
  totalProfit:   5240,
  totalLoss:     1770,
  winCount:      104,
  lossCount:     48,
  totalTrades:   152,
  sharpe:        1.84,
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
  sharpe: number
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function usePortfolioSummary() {
  const [data, setData] = useState<PortfolioSummary>(DEMO)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [summaryRes, tradesRes] = await Promise.all([
          fetch('/api/trading/positions/summary'),
          fetch('/api/trading/trades'),
        ])

        if (summaryRes.ok) {
          const s = await summaryRes.json()
          if (s.success && s.data) {
            setData(prev => ({
              ...prev,
              totalPositions: s.data.totalPositions ?? prev.totalPositions,
              totalPnl:       (s.data.unrealizedPnl ?? 0) + (s.data.realizedPnl ?? 0),
              margin:         s.data.totalValue ?? prev.margin,
            }))
          }
        }
      } catch { /* keep demo */ } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { data, loading }
}

/* ══ Mini Portfolio Widget (for dashboard sidebar panel) ══ */
export function PortfolioMini() {
  const { data } = usePortfolioSummary()
  const pnlUp = data.totalPnl >= 0

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 8,
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* Balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{
            fontFamily: "'Cairo', sans-serif",
            fontSize: 9, color: T.text2,
          }}>الرصيد الكلي</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 18, fontWeight: 800, color: T.text,
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
            {pnlUp ? '+' : ''}{fmt(data.pnlPercent)}%
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
          {pnlUp ? '+' : ''}${fmt(data.totalPnl, 0)}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[
          { label: 'مراكز', value: data.totalPositions, color: T.cyan },
          { label: 'فوز%', value: `${data.winRate}%`, color: T.green },
          { label: 'Sharpe', value: data.sharpe.toFixed(2), color: T.amber },
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
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `0.5px solid ${T.border}`, paddingTop: 5,
      }}>
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>الهامش المستخدم</span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, color: T.amber,
        }}>${fmt(data.margin, 0)}</span>
      </div>
    </div>
  )
}
