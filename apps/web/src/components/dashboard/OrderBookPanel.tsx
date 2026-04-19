'use client'

import { useState, useMemo } from 'react'
import { BarChart3, ChevronDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useSingleQuote } from '@/hooks/useMarketData'
import { useDashboardStore } from '@/lib/dashboard-store'

interface OrderBookEntry {
  price: string
  amount: string
  total: string
  percent: number
}

// Generate order book levels around a real mid-price
function generateOrderBookLevels(midPrice: number, isPositive: boolean): { asks: OrderBookEntry[]; bids: OrderBookEntry[] } {
  if (!midPrice || midPrice === 0) {
    return { asks: [], bids: [] }
  }

  // Determine price step based on price magnitude
  let step: number
  if (midPrice > 50000) step = midPrice * 0.0002        // BTC-like: ~$10-15 steps
  else if (midPrice > 1000) step = midPrice * 0.0003     // Gold-like: ~$0.7 steps
  else if (midPrice > 100) step = midPrice * 0.0005      // Stock-like: ~$0.05 steps
  else step = midPrice * 0.0005                           // Forex-like: very small steps

  const asks: OrderBookEntry[] = []
  const bids: OrderBookEntry[] = []
  let askTotal = 0
  let bidTotal = 0

  for (let i = 0; i < 7; i++) {
    const askPrice = midPrice + step * (i + 1)
    const bidPrice = midPrice - step * (i + 1)

    // Random volume with slight bias toward closer levels
    const askVolume = (Math.random() * 3 + 0.5) * (1 - i * 0.08)
    const bidVolume = (Math.random() * 3 + 0.5) * (1 - i * 0.08)
    askTotal += askVolume
    bidTotal += bidVolume

    asks.push({
      price: askPrice.toFixed(midPrice < 10 ? 5 : 2),
      amount: `${askVolume.toFixed(1)}M`,
      total: `${askTotal.toFixed(1)}M`,
      percent: Math.round(30 + Math.random() * 65),
    })

    bids.push({
      price: bidPrice.toFixed(midPrice < 10 ? 5 : 2),
      amount: `${bidVolume.toFixed(1)}M`,
      total: `${bidTotal.toFixed(1)}M`,
      percent: Math.round(30 + Math.random() * 65),
    })
  }

  return { asks, bids }
}

export default function OrderBookPanel() {
  const [expanded, setExpanded] = useState(true)
  const { selectedPair } = useDashboardStore()
  const { quote } = useSingleQuote(selectedPair, 5000)

  const midPrice = quote?.price ?? 0
  const isPositive = quote ? quote.changePercent >= 0 : true

  // Generate order book from real price data
  const { asks, bids } = useMemo(
    () => generateOrderBookLevels(midPrice, isPositive),
    [midPrice, isPositive]
  )

  const spread = useMemo(() => {
    if (asks.length === 0 || bids.length === 0) return { value: '—', percent: '—' }
    const askPrice = parseFloat(asks[0].price)
    const bidPrice = parseFloat(bids[0].price)
    const diff = askPrice - bidPrice
    const pct = ((diff / midPrice) * 100).toFixed(4)
    return { value: diff.toFixed(midPrice < 10 ? 5 : 2), percent: `${pct}%` }
  }, [asks, bids, midPrice])

  // Calculate buy/sell pressure
  const totalAsk = asks.reduce((s, a) => s + a.percent, 0)
  const totalBid = bids.reduce((s, b) => s + b.percent, 0)
  const buyPressure = totalAsk + totalBid > 0 ? Math.round((totalBid / (totalAsk + totalBid)) * 100) : 50

  return (
    <div style={{
      borderRadius: '10px',
      overflow: 'hidden',
      flexShrink: 0,
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '7px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--profit), var(--accent))',
        }}>
          <BarChart3 size={11} stroke="#fff" strokeWidth={2.2} />
        </div>
        <span style={{
          flex: '1 1 0%',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.04em',
          fontFamily: 'var(--font-ar), Inter, sans-serif',
          textAlign: 'start',
          color: 'var(--text-main)',
        }}>دفتر الأوامر</span>
        {quote && (
          <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }} dir="ltr">
            {selectedPair} · {quote.source}
          </span>
        )}
        <div style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <ChevronDown size={12} stroke="var(--text-muted)" strokeWidth={2} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 10px 10px' }}>
          {/* Buy/Sell Pressure Bar */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowUpRight size={9} style={{ color: 'var(--profit)' }} />
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--profit)', fontFamily: 'var(--font-mono)' }} dir="ltr">{buyPressure}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--loss)', fontFamily: 'var(--font-mono)' }} dir="ltr">{100 - buyPressure}%</span>
                <ArrowDownRight size={9} style={{ color: 'var(--loss)' }} />
              </div>
            </div>
            <div style={{
              width: '100%',
              height: '3px',
              borderRadius: '2px',
              overflow: 'hidden',
              display: 'flex',
              direction: 'ltr',
            }}>
              <div style={{
                width: `${buyPressure}%`,
                height: '100%',
                background: 'var(--profit)',
                boxShadow: '0 0 6px var(--profit-bg)',
              }} />
              <div style={{
                width: `${100 - buyPressure}%`,
                height: '100%',
                background: 'var(--loss)',
                boxShadow: '0 0 6px var(--loss-bg)',
              }} />
            </div>
          </div>

          {/* Column Headers */}
          <div dir="ltr" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            padding: '3px 0',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '2px',
          }}>
            <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Price</span>
            <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'right' }}>Amount</span>
          </div>

          {/* Asks (Sells) - displayed in reverse so lowest ask is at bottom */}
          {asks.slice().reverse().map((ask, i) => (
            <div key={`ask-${i}`} dir="ltr" style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '2px 0',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,77,77,0.06)',
                width: `${ask.percent}%`,
                borderRadius: '2px',
                marginLeft: 'auto',
              }} />
              <span style={{
                fontSize: '9.5px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--loss)',
                position: 'relative',
              }}>{ask.price}</span>
              <span style={{
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                position: 'relative',
                textAlign: 'right',
              }}>{ask.amount}</span>
            </div>
          ))}

          {/* Spread / Mid Price */}
          <div style={{
            textAlign: 'center',
            padding: '5px 0',
            margin: '3px 0',
            background: 'var(--bg-input)',
            borderRadius: '5px',
            border: '1px solid var(--border-subtle)',
          }}>
            <div dir="ltr" style={{
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent)',
              textShadow: '0 0 6px rgba(10,132,255,0.4)',
            }}>{midPrice > 0 ? (midPrice < 10 ? midPrice.toFixed(5) : midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '—'}</div>
            <div style={{
              fontSize: '8px',
              color: 'var(--text-faint)',
              fontFamily: 'var(--font-mono)',
            }} dir="ltr">
              Spread: {spread.value} ({spread.percent})
            </div>
          </div>

          {/* Bids (Buys) */}
          {bids.map((bid, i) => (
            <div key={`bid-${i}`} dir="ltr" style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '2px 0',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,255,198,0.06)',
                width: `${bid.percent}%`,
                borderRadius: '2px',
                marginLeft: 'auto',
              }} />
              <span style={{
                fontSize: '9.5px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--profit)',
                position: 'relative',
              }}>{bid.price}</span>
              <span style={{
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                position: 'relative',
                textAlign: 'right',
              }}>{bid.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
