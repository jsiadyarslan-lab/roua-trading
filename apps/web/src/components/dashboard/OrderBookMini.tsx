'use client'

import { useState, useEffect } from 'react'
import { Activity } from 'lucide-react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.12)',
  blue:    '#0A84FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

interface OrderRow {
  price: number
  size: number
  total: number
}

// Generate realistic looking depth data
const genOrderData = (basePrice: number, isAsk: boolean): OrderRow[] => {
  let currentTotal = 0;
  return Array.from({ length: 6 }).map((_, i) => {
    // Asks go up in price from center, Bids go down
    const pGap = (Math.random() * 2) + 0.5
    const price = isAsk ? basePrice + (i * pGap) + pGap : basePrice - (i * pGap) - pGap
    const size = parseFloat((Math.random() * 2.5 + 0.1).toFixed(2))
    currentTotal += size
    return { price, size, total: currentTotal }
  })
}

export function OrderBookMini() {
  const [asks, setAsks] = useState<OrderRow[]>([])
  const [bids, setBids] = useState<OrderRow[]>([])
  const [currentPrice, setCurrentPrice] = useState(64250.50)

  useEffect(() => {
    const initAsks = genOrderData(64250.50, true).reverse() // High price top, low price closer to center
    const initBids = genOrderData(64250.50, false)          // High price center, low price bottom
    setAsks(initAsks)
    setBids(initBids)

    // Simulate live ticking
    const interval = setInterval(() => {
      setCurrentPrice(prev => prev + (Math.random() > 0.5 ? 1.5 : -1.5))
      setAsks(genOrderData(64250.50, true).reverse())
      setBids(genOrderData(64250.50, false))
    }, 1500)
    
    return () => clearInterval(interval)
  }, [])

  const maxTotal = Math.max(
    (asks.length ? asks[0].total : 1), 
    (bids.length ? bids[bids.length - 1].total : 1)
  )

  const Row = ({ row, type }: { row: OrderRow, type: 'ask' | 'bid' }) => {
    const color = type === 'ask' ? T.red : T.green
    const widthPct = Math.min((row.total / (maxTotal || 1)) * 100, 100)
    
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '2px 8px', position: 'relative', fontSize: 10, cursor: 'pointer'
      }}
      onMouseEnter={e => e.currentTarget.style.background = T.bg2}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Depth Bar Background */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: `${widthPct}%`, background: `${color}15`, zIndex: 0,
          transition: 'width 0.3s ease'
        }} />
        
        <span style={{ color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", zIndex: 1 }}>
          {row.price.toFixed(2)}
        </span>
        <span style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace", zIndex: 1 }}>
          {row.size.toFixed(2)}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: T.bg, padding: '4px 0', overflow: 'hidden'
    }}>
      
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '0 8px 6px',
        borderBottom: `0.5px solid ${T.border}`, marginBottom: 4,
        fontSize: 9, color: T.text3, fontWeight: 700
      }}>
        <span>السعر (USD)</span>
        <span>الكمية (BTC)</span>
      </div>

      {/* Asks (Sellers) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {asks.map((ask, i) => <Row key={`ask-${i}`} row={ask} type="ask" />)}
      </div>

      {/* Spread / Current Price */}
      <div style={{
        margin: '4px 0', padding: '4px 8px', background: `${T.bg2}`, border: `0.5px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, fontWeight: 800, color: currentPrice > 64250 ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace"
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
           <Activity size={12} color={currentPrice > 64250 ? T.green : T.red} />
           {currentPrice.toFixed(2)}
        </div>
        <span style={{ fontSize: 9, color: T.text3, textDecoration: 'underline decoration-dotted' }}>SPREAD: 0.5</span>
      </div>

      {/* Bids (Buyers) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bids.map((bid, i) => <Row key={`bid-${i}`} row={bid} type="bid" />)}
      </div>

    </div>
  )
}
