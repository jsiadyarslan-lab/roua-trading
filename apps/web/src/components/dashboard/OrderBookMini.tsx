'use client'

import { useState, useMemo } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { useSingleQuote } from '@/hooks/useMarketData'
import { useSymbolStore } from '@/hooks/useSymbolStore'

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
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const { quote } = useSingleQuote(selectedSymbol, 5000)

  const basePrice = quote?.price ?? 0
  const rangeHalf = quote
    ? ((quote.high - quote.low) / 2) || basePrice * 0.001
    : 0

  // Memoize orderbook data to prevent excessive flashing
  const { asks, bids, maxTotal } = useMemo(() => {
    if (basePrice === 0) return { asks: [], bids: [], maxTotal: 1 }
    const a = buildDepth(basePrice, rangeHalf, 10, 'ask').reverse()
    const b = buildDepth(basePrice, rangeHalf, 10, 'bid')
    const m = Math.max(a[0]?.total ?? 1, b[b.length - 1]?.total ?? 1)
    return { asks: a, bids: b, maxTotal: m }
  }, [basePrice, rangeHalf])

  const isPositive = (quote?.changePercent ?? 0) >= 0

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', overflow: 'hidden', direction: 'rtl'
    }}>
      {/* Symbol Selection Tabs (Segmented Control style) */}
      <div style={{
        display: 'flex', padding: '6px 12px', gap: 10, background: 'var(--surface)',
        borderBottom: '1px solid var(--card-border)'
      }}>
        {['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD'].map(s => {
          const active = s === selectedSymbol
          return (
            <button
              key={s}
              onClick={() => setSelectedSymbol(s)}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${active ? 'var(--success)' : 'transparent'}`,
                padding: '4px 0',
                color: active ? 'var(--foreground)' : 'var(--muted)',
                fontSize: 10, fontWeight: active ? 800 : 500, cursor: 'pointer',
                fontFamily: 'var(--mono)', transition: '0.2s'
              }}
            >
              {s.split('/')[0]}
            </button>
          )
        })}
      </div>

      {/* Header Labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '8px 16px',
        fontSize: 9, color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        <span>السعر (PRICE)</span>
        <span>الكمية (SIZE)</span>
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {basePrice === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>
            يتم تحليل السيولة...
          </div>
        ) : (
          <>
            {/* ASKS (Sells) */}
            <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
              {asks.map((ask, i) => (
                <OrderRowUI key={`ask-${i}`} row={ask} type="ask" maxTotal={maxTotal} index={i} />
              ))}
            </div>

            {/* Mid Price Institutional Badge */}
            <div style={{
              margin: '4px 0', padding: '12px 16px',
              background: 'rgba(255,255,255,0.02)',
              borderTop: '1px solid var(--card-border)',
              borderBottom: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isPositive ? <ArrowUp size={18} color="var(--success)" /> : <ArrowDown size={18} color="var(--danger)" />}
                <span className="price" style={{ 
                  fontSize: 20, color: isPositive ? 'var(--success)' : 'var(--danger)',
                  letterSpacing: '-0.02em', fontWeight: 800
                }}>
                  {basePrice > 100 ? basePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : basePrice.toFixed(5)}
                </span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div className="number-data" style={{ fontSize: 11, color: isPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>
                  {isPositive ? '+' : ''}{(quote?.changePercent ?? 0).toFixed(2)}%
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-muted-safe)', fontWeight: 700 }}>LAST PRICE</div>
              </div>
            </div>

            {/* BIDS (Buys) */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {bids.map((bid, i) => (
                <OrderRowUI key={`bid-${i}`} row={bid} type="bid" maxTotal={maxTotal} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OrderRowUI({ row, type, maxTotal, index }: { row: OrderRow; type: 'ask' | 'bid'; maxTotal: number; index: number }) {
  const color = type === 'ask' ? 'var(--danger)' : 'var(--success)'
  const widthPct = Math.min((row.total / maxTotal) * 100, 100)
  const isEven = index % 2 === 0

  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 16px', position: 'relative', height: 26, cursor: 'pointer',
        background: isEven ? 'transparent' : 'rgba(255,255,255,0.015)',
        transition: 'background 0.2s'
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = isEven ? 'transparent' : 'rgba(255,255,255,0.015)'}
    >
      {/* Depth Visualization Gradient */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: `${widthPct}%`, 
        background: type === 'ask' 
          ? `linear-gradient(to left, rgba(255,59,48,0.12), transparent)` 
          : `linear-gradient(to left, rgba(0,200,83,0.12), transparent)`, 
        zIndex: 0,
        transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      }} />

      <span className="price" style={{ color, zIndex: 1, fontSize: 12 }}>
        {row.price > 100 ? row.price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : row.price.toFixed(5)}
      </span>
      <span className="number-data" style={{ color: 'var(--foreground)', fontWeight: 600, zIndex: 1, fontSize: 11 }}>
        {row.size.toFixed(3)}
      </span>
    </div>
  )
}
