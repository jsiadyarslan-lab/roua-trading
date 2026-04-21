'use client'

import { useState } from 'react'
import { Activity } from 'lucide-react'
import { useSingleQuote } from '@/hooks/useMarketData'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  border:  'rgba(10,132,255,0.12)',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD']

interface OrderRow {
  price: number
  size:  number
  total: number
}

// Build realistic depth levels from real price + spread range (high/low)
function buildDepth(
  basePrice: number,
  rangeHalf: number,
  levels: number,
  direction: 'ask' | 'bid'
): OrderRow[] {
  const step = rangeHalf / levels
  let cumTotal = 0
  return Array.from({ length: levels }).map((_, i) => {
    const offset = step * (i + 1) * (0.8 + Math.random() * 0.4)
    const price  = direction === 'ask'
      ? basePrice + offset
      : basePrice - offset
    const size   = parseFloat((Math.random() * 2.5 + 0.1).toFixed(3))
    cumTotal    += size
    return { price, size, total: cumTotal }
  })
}

export function OrderBookMini() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USD')
  const { quote } = useSingleQuote(selectedSymbol, 5000)

  // Build depth from real price + real high/low range
  const basePrice = quote?.price ?? 0
  const rangeHalf = quote
    ? ((quote.high - quote.low) / 2) || basePrice * 0.001
    : 0

  const asks = basePrice > 0
    ? buildDepth(basePrice, rangeHalf, 6, 'ask').reverse()
    : []
  const bids = basePrice > 0
    ? buildDepth(basePrice, rangeHalf, 6, 'bid')
    : []

  const maxTotal = Math.max(asks[0]?.total ?? 1, bids[bids.length - 1]?.total ?? 1)

  const Row = ({ row, type }: { row: OrderRow; type: 'ask' | 'bid' }) => {
    const color = type === 'ask' ? T.red : T.green
    const widthPct = Math.min((row.total / maxTotal) * 100, 100)
    return (
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '2px 8px', position: 'relative', fontSize: 10, cursor: 'pointer'
        }}
        onMouseEnter={e => e.currentTarget.style.background = T.bg2}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: `${widthPct}%`, background: `${color}15`, zIndex: 0,
          transition: 'width 0.4s ease'
        }} />
        <span style={{ color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", zIndex: 1 }}>
          {row.price > 100 ? row.price.toFixed(2) : row.price.toFixed(5)}
        </span>
        <span style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace", zIndex: 1 }}>
          {row.size.toFixed(3)}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: T.bg, overflow: 'hidden'
    }}>
      {/* Symbol selector */}
      <div style={{
        display: 'flex', gap: 4, padding: '4px 6px',
        borderBottom: `0.5px solid ${T.border}`, background: T.bg2
      }}>
        {SYMBOLS.map(s => {
          const active = s === selectedSymbol
          return (
            <button
              key={s}
              onClick={() => setSelectedSymbol(s)}
              style={{
                flex: 1, padding: '3px 4px', borderRadius: 4, cursor: 'pointer',
                background: active ? `${T.green}15` : 'transparent',
                border: `0.5px solid ${active ? T.green + '40' : 'transparent'}`,
                color: active ? T.green : T.text3, fontSize: 8, fontWeight: active ? 800 : 500,
                fontFamily: "'JetBrains Mono', monospace", transition: '0.2s'
              }}
            >
              {s.replace('/USD', '')}
            </button>
          )
        })}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '4px 8px',
        borderBottom: `0.5px solid ${T.border}`,
        fontSize: 8.5, color: T.text3, fontWeight: 700
      }}>
        <span>السعر</span>
        <span>الكمية</span>
      </div>

      {basePrice === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text2, fontSize: 10 }}>
          جارٍ تحميل العمق...
        </div>
      ) : (
        <>
          {/* Asks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 4 }}>
            {asks.map((ask, i) => <Row key={`ask-${i}`} row={ask} type="ask" />)}
          </div>

          {/* Mid price */}
          <div style={{
            margin: '4px 0', padding: '4px 8px',
            background: T.bg2, border: `0.5px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, fontWeight: 800,
            color: (quote?.changePercent ?? 0) >= 0 ? T.green : T.red,
            fontFamily: "'JetBrains Mono', monospace"
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={12} color={(quote?.changePercent ?? 0) >= 0 ? T.green : T.red} />
              {basePrice > 100 ? basePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : basePrice.toFixed(5)}
            </div>
            <span style={{ fontSize: 9, color: (quote?.changePercent ?? 0) >= 0 ? T.green : T.red, fontWeight: 700 }}>
              {(quote?.changePercent ?? 0) >= 0 ? '+' : ''}{(quote?.changePercent ?? 0).toFixed(2)}%
            </span>
          </div>

          {/* Bids */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {bids.map((bid, i) => <Row key={`bid-${i}`} row={bid} type="bid" />)}
          </div>
        </>
      )}
    </div>
  )
}
