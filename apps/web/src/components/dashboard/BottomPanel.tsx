'use client'

import { useState, useEffect } from 'react'
import { useDashboardStore } from '@/lib/dashboard-store'

interface Position {
  id: string
  symbol: string
  side: string
  quantity: number
  entryPrice: number
  currentPrice: number | null
  unrealizedPnl: number | null
  stopLoss: number | null
  takeProfit: number | null
}

interface PortfolioSummary {
  totalPositions: number
  totalValue: number
  unrealizedPnl: number
  realizedPnl: number
}

export default function BottomPanel() {
  const { selectedPair } = useDashboardStore()
  const [positions, setPositions] = useState<Position[]>([])
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)

  // Fetch positions
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await fetch('/api/trading/positions')
        const data = await res.json()
        if (data.data) {
          setPositions(data.data)
        }
      } catch {
        // Use demo data
      }
    }
    fetchPositions()
    const iv = setInterval(fetchPositions, 10000)
    return () => clearInterval(iv)
  }, [])

  // Fetch summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/trading/positions/summary')
        const data = await res.json()
        if (data.data) {
          setSummary(data.data)
        }
      } catch {
        // Use demo data
      }
    }
    fetchSummary()
    const iv = setInterval(fetchSummary, 10000)
    return () => clearInterval(iv)
  }, [])

  // Demo positions if none loaded
  const displayPositions = positions.length > 0 ? positions : [
    { id: '1', symbol: 'BTC/USD', side: 'BUY', quantity: 0.05, entryPrice: 67200, currentPrice: 67450, unrealizedPnl: 12.5, stopLoss: null, takeProfit: null },
    { id: '2', symbol: 'ETH/USD', side: 'SELL', quantity: 1.2, entryPrice: 3520, currentPrice: 3485, unrealizedPnl: 42.0, stopLoss: null, takeProfit: null },
    { id: '3', symbol: 'SOL/USD', side: 'BUY', quantity: 10, entryPrice: 145, currentPrice: 142.5, unrealizedPnl: -25.0, stopLoss: null, takeProfit: null },
  ]

  return (
    <div
      className="flex shrink-0 overflow-hidden"
      style={{
        height: 140,
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* Open Positions Table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-1.5 shrink-0"
          style={{
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text2)',
            }}
          >
            الصفقات المفتوحة
          </span>
          <span
            className="price"
            style={{ fontSize: '9px', color: 'var(--text3)' }}
            dir="ltr"
          >
            {displayPositions.length}
          </span>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
            }}
          >
            <thead>
              <tr style={{ color: 'var(--text3)' }}>
                <th className="px-2 py-1 text-right font-medium">الزوج</th>
                <th className="px-2 py-1 text-right font-medium">الاتجاه</th>
                <th className="px-2 py-1 text-right font-medium" dir="ltr">الحجم</th>
                <th className="px-2 py-1 text-right font-medium" dir="ltr">الدخول</th>
                <th className="px-2 py-1 text-right font-medium" dir="ltr">الحالي</th>
                <th className="px-2 py-1 text-right font-medium" dir="ltr">الرافعة</th>
                <th className="px-2 py-1 text-right font-medium" dir="ltr">P&L</th>
              </tr>
            </thead>
            <tbody>
              {displayPositions.map((pos) => {
                const pnl = pos.unrealizedPnl ?? 0
                const isPositive = pnl >= 0
                const currentP = pos.currentPrice ?? pos.entryPrice
                const pnlPercent = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.quantity)) * 100 : 0
                return (
                  <tr
                    key={pos.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                    className="hover:bg-[var(--bg3)]"
                  >
                    <td className="px-2 py-1" style={{ fontWeight: 600 }} dir="ltr">{pos.symbol}</td>
                    <td className="px-2 py-1">
                      <span
                        style={{
                          color: pos.side === 'BUY' ? 'var(--green)' : 'var(--red)',
                          fontWeight: 700,
                        }}
                      >
                        {pos.side === 'BUY' ? 'شراء' : 'بيع'}
                      </span>
                    </td>
                    <td className="px-2 py-1" dir="ltr">{pos.quantity}</td>
                    <td className="px-2 py-1" dir="ltr">{pos.entryPrice.toFixed(2)}</td>
                    <td className="px-2 py-1" dir="ltr">{currentP.toFixed(2)}</td>
                    <td className="px-2 py-1" dir="ltr">1x</td>
                    <td
                      className="px-2 py-1 price"
                      style={{
                        color: isPositive ? 'var(--green)' : 'var(--red)',
                        fontWeight: 700,
                      }}
                      dir="ltr"
                    >
                      {isPositive ? '+' : ''}{pnl.toFixed(2)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(2)}%)
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--border)' }} />

      {/* Signals Summary */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: 200, background: 'var(--bg)' }}
      >
        <div
          className="px-3 py-1.5 shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text2)',
            }}
          >
            ملخص الإشارات
          </span>
        </div>
        <div className="flex-1 p-2 overflow-y-auto custom-scrollbar">
          {[
            { label: 'إشارات شراء', count: 3, color: 'var(--green)' },
            { label: 'إشارات بيع', count: 1, color: 'var(--red)' },
            { label: 'متوسط الثقة', count: 72, color: 'var(--amber)', suffix: '%' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-1"
            >
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '9px',
                  color: 'var(--text3)',
                }}
              >
                {item.label}
              </span>
              <span
                className="price"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: item.color,
                }}
                dir="ltr"
              >
                {item.count}{item.suffix ?? ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--border)' }} />

      {/* Portfolio Summary */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: 220, background: 'var(--bg)' }}
      >
        <div
          className="px-3 py-1.5 shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text2)',
            }}
          >
            ملخص المحفظة
          </span>
        </div>
        <div className="flex-1 p-2 overflow-y-auto custom-scrollbar">
          {[
            {
              label: 'القيمة الإجمالية',
              value: summary?.totalValue?.toFixed(2) ?? '0.00',
              color: 'var(--text)',
              prefix: '$',
            },
            {
              label: 'أرباح غير محققة',
              value: summary?.unrealizedPnl != null ? (summary.unrealizedPnl >= 0 ? '+' : '') + summary.unrealizedPnl.toFixed(2) : '0.00',
              color: (summary?.unrealizedPnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)',
              prefix: '$',
            },
            {
              label: 'أرباح محققة',
              value: summary?.realizedPnl != null ? (summary.realizedPnl >= 0 ? '+' : '') + summary.realizedPnl.toFixed(2) : '0.00',
              color: (summary?.realizedPnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)',
              prefix: '$',
            },
            {
              label: 'عدد الصفقات',
              value: summary?.totalPositions?.toString() ?? '0',
              color: 'var(--blue)',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-1"
            >
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '9px',
                  color: 'var(--text3)',
                }}
              >
                {item.label}
              </span>
              <span
                className="price"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: item.color,
                }}
                dir="ltr"
              >
                {item.prefix ?? ''}{item.value}{item.suffix ?? ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
