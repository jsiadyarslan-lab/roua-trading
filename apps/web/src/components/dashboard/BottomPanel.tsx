'use client'

import { useState, useEffect } from 'react'
import { useDashboardStore } from '@/lib/dashboard-store'

interface Position {
  id: string
  symbol: string
  side: string
  quantity: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  leverage: number
}

interface PortfolioSummary {
  totalValue: number
  totalPnl: number
  totalPnlPercent: number
  openPositions: number
  margin: number
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
    { id: '1', symbol: 'BTC/USD', side: 'LONG', quantity: 0.05, entryPrice: 67200, currentPrice: 67450, pnl: 12.5, pnlPercent: 0.37, leverage: 10 },
    { id: '2', symbol: 'ETH/USD', side: 'SHORT', quantity: 1.2, entryPrice: 3520, currentPrice: 3485, pnl: 42.0, pnlPercent: 0.99, leverage: 5 },
    { id: '3', symbol: 'SOL/USD', side: 'LONG', quantity: 10, entryPrice: 145, currentPrice: 142.5, pnl: -25.0, pnlPercent: -1.72, leverage: 3 },
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
                const isPositive = pos.pnl >= 0
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
                          color: pos.side === 'LONG' ? 'var(--green)' : 'var(--red)',
                          fontWeight: 700,
                        }}
                      >
                        {pos.side === 'LONG' ? 'شراء' : 'بيع'}
                      </span>
                    </td>
                    <td className="px-2 py-1" dir="ltr">{pos.quantity}</td>
                    <td className="px-2 py-1" dir="ltr">{pos.entryPrice.toFixed(2)}</td>
                    <td className="px-2 py-1" dir="ltr">{pos.currentPrice.toFixed(2)}</td>
                    <td className="px-2 py-1" dir="ltr">{pos.leverage}x</td>
                    <td
                      className="px-2 py-1 price"
                      style={{
                        color: isPositive ? 'var(--green)' : 'var(--red)',
                        fontWeight: 700,
                      }}
                      dir="ltr"
                    >
                      {isPositive ? '+' : ''}{pos.pnl.toFixed(2)} ({isPositive ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
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
              value: summary?.totalValue?.toFixed(2) ?? '12,450.00',
              color: 'var(--text)',
              prefix: '$',
            },
            {
              label: 'الربح/الخسارة',
              value: summary?.totalPnl?.toFixed(2) ?? '+245.50',
              color: 'var(--green)',
              prefix: '$',
            },
            {
              label: 'نسبة الربح',
              value: summary?.totalPnlPercent?.toFixed(2) ?? '+1.97',
              color: 'var(--green)',
              suffix: '%',
            },
            {
              label: 'الهامش المستخدم',
              value: summary?.margin?.toFixed(2) ?? '2,100.00',
              color: 'var(--amber)',
              prefix: '$',
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
