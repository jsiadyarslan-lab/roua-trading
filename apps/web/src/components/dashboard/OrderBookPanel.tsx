'use client'

import { useState, useMemo } from 'react'
import { BarChart3, ChevronDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useSingleQuote } from '@/hooks/useMarketData'
import { useDashboardStore } from '@/lib/dashboard-store'

interface OrderBookEntry {
  price: string
  amount: string
  percent: number
}

// Generate order book levels around a real mid price
function generateOrderBookLevels(midPrice: number, currency: string): { asks: OrderBookEntry[], bids: OrderBookEntry[], spread: string, spreadPercent: string } {
  if (!midPrice || midPrice === 0) {
    return { asks: [], bids: [], spread: '0', spreadPercent: '0%' }
  }

  // Determine tick size based on price magnitude
  const tickSize = midPrice > 1000 ? 1 : midPrice > 10 ? 0.01 : midPrice > 1 ? 0.0001 : 0.00001
  const decimals = midPrice > 1000 ? 2 : midPrice > 10 ? 2 : midPrice > 1 ? 4 : 6

  const asks: OrderBookEntry[] = []
  const bids: OrderBookEntry[] = []

  for (let i = 0; i < 7; i++) {
    const askPrice = midPrice + (i + 1) * tickSize * (1 + Math.random() * 0.5)
    const bidPrice = midPrice - (i + 1) * tickSize * (1 + Math.random() * 0.5)

    // Volume in a human-friendly format
    const formatAmount = (vol: number) => {
      if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`
      if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`
      return vol.toFixed(1)
    }

    asks.push({
      price: askPrice.toFixed(decimals),
      amount: formatAmount(100000 + Math.random() * 3000000),
      percent: Math.round(30 + Math.random() * 70),
    })

    bids.push({
      price: bidPrice.toFixed(decimals),
      amount: formatAmount(100000 + Math.random() * 3000000),
      percent: Math.round(30 + Math.random() * 70),
    })
  }

  const spread = (asks[0] && bids[0])
    ? (parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(decimals)
    : '0'
  const spreadPercentVal = midPrice > 0
    ? ((parseFloat(spread) / midPrice) * 100).toFixed(4)
    : '0'

  return { asks, bids, spread, spreadPercent: `${spreadPercentVal}%` }
}

export default function OrderBookPanel() {
  const [expanded, setExpanded] = useState(true)
  const { selectedPair } = useDashboardStore()
  const { quote } = useSingleQuote(selectedPair, 3000)

  const midPrice = quote?.price ?? 0
  const { asks, bids, spread, spreadPercent } = useMemo(
    () => generateOrderBookLevels(midPrice, quote?.currency ?? 'USD'),
    [midPrice, quote?.currency]
  )

  // Calculate buy/sell pressure
  const totalAsk = asks.reduce((s, a) => s + a.percent, 0)
  const totalBid = bids.reduce((s, b) => s + b.percent, 0)
  const buyPressure = (totalAsk + totalBid) > 0 ? Math.round((totalBid / (totalAsk + totalBid)) * 100) : 50

  const formatMidPrice = (price: number) => {
    if (price === 0) return '—'
    if (price > 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (price > 1) return price.toFixed(4)
    return price.toFixed(6)
  }

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
            }}>{formatMidPrice(midPrice)}</div>
            <div style={{
              fontSize: '8px',
              color: 'var(--text-faint)',
              fontFamily: 'var(--font-mono)',
            }} dir="ltr">
              Spread: {spread} ({spreadPercent})
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
