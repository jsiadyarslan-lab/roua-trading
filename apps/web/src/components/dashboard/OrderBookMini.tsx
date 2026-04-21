'use client'

import { useState } from 'react'
import { Activity, ArrowUp, ArrowDown } from 'lucide-react'
import { useSingleQuote } from '@/hooks/useMarketData'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  border:  'rgba(255, 255, 255, 0.05)',
  success: '#00C853',
  danger:  '#FF3B30',
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

  const basePrice = quote?.price ?? 0
  const rangeHalf = quote
    ? ((quote.high - quote.low) / 2) || basePrice * 0.001
    : 0

  const asks = basePrice > 0
    ? buildDepth(basePrice, rangeHalf, 10, 'ask').reverse()
    : []
  const bids = basePrice > 0
    ? buildDepth(basePrice, rangeHalf, 10, 'bid')
    : []

  const maxTotal = Math.max(asks[0]?.total ?? 1, bids[bids.length - 1]?.total ?? 1)

  const Row = ({ row, type }: { row: OrderRow; type: 'ask' | 'bid' }) => {
    const color = type === 'ask' ? T.danger : T.success
    const widthPct = Math.min((row.total / maxTotal) * 100, 100)
    return (
      <div
        className="orderbook-row"
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '2.5px 12px', position: 'relative', fontSize: 10.5, cursor: 'pointer',
          borderBottom: `1px solid rgba(255,255,255,0.01)`,
          transition: 'background 0.1s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: `${widthPct}%`, 
          background: `linear-gradient(to left, ${color}14, ${color}05)`, 
          zIndex: 0,
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        }} />
        <span style={{ color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", zIndex: 1 }}>
          {row.price > 100 ? row.price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : row.price.toFixed(5)}
        </span>
        <span style={{ color: T.text, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", zIndex: 1 }}>
          {row.size.toFixed(3)}
        </span>
      </div>
    )
  }

  const isPositive = (quote?.changePercent ?? 0) >= 0

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: T.bg, overflow: 'hidden', direction: 'rtl'
    }}>
      {/* Symbol Selector */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`, background: T.bg2
      }}>
        {SYMBOLS.map(s => {
          const active = s === selectedSymbol
          return (
            <button
              key={s}
              onClick={() => setSelectedSymbol(s)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? T.success : 'transparent'}`,
                padding: '2px 0',
                color: active ? T.text : T.text3,
                fontSize: 9, fontWeight: active ? 800 : 500, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", transition: '0.2s'
              }}
            >
              {s.split('/')[0]}
            </button>
          )
        })}
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '6px 12px',
        fontSize: 9, color: T.text2, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
        borderBottom: `1px solid ${T.border}`
      }}>
        <span>السعر (Price)</span>
        <span>الكمية (Size)</span>
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {basePrice === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 11 }}>
            يتم تحليل السيولة...
          </div>
        ) : (
          <>
            {/* Asks (Sell Side) */}
            <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
              {asks.map((ask, i) => <Row key={`ask-${i}`} row={ask} type="ask" />)}
            </div>

            {/* Middle Badge / Spread */}
            <div style={{
              margin: '8px 0', padding: '10px 12px',
              background: 'rgba(255,255,255,0.02)',
              borderTop: `1px solid ${T.border}`,
              borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(10px)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isPositive ? <ArrowUp size={16} color={T.success} /> : <ArrowDown size={16} color={T.danger} />}
                <span style={{ 
                  fontSize: 16, fontWeight: 900, 
                  color: isPositive ? T.success : T.danger,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '-0.02em'
                }}>
                  {basePrice > 100 ? basePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : basePrice.toFixed(5)}
                </span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 10, color: isPositive ? T.success : T.danger, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                  {isPositive ? '+' : ''}{(quote?.changePercent ?? 0).toFixed(2)}%
                </div>
                <div style={{ fontSize: 8, color: T.text3, fontWeight: 500 }}>MARKET PRICE</div>
              </div>
            </div>

            {/* Bids (Buy Side) */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {bids.map((bid, i) => <Row key={`bid-${i}`} row={bid} type="bid" />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
