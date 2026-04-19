'use client'

import { useState, useEffect } from 'react'
import { BarChart3, ChevronDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface OrderBookEntry {
  price: string
  amount: string
  total: string
  percent: number
}

// ── Mock data ──
const mockAsks: OrderBookEntry[] = [
  { price: '1.0854', amount: '1.2M', total: '1.2M', percent: 65 },
  { price: '1.0853', amount: '0.8M', total: '2.0M', percent: 45 },
  { price: '1.0852', amount: '2.4M', total: '4.4M', percent: 80 },
  { price: '1.0851', amount: '1.8M', total: '6.2M', percent: 55 },
  { price: '1.0850', amount: '3.2M', total: '9.4M', percent: 95 },
]

const mockBids: OrderBookEntry[] = [
  { price: '1.0849', amount: '2.1M', total: '2.1M', percent: 70 },
  { price: '1.0848', amount: '1.5M', total: '3.6M', percent: 50 },
  { price: '1.0847', amount: '2.8M', total: '6.4M', percent: 85 },
  { price: '1.0846', amount: '0.9M', total: '7.3M', percent: 35 },
  { price: '1.0845', amount: '1.7M', total: '9.0M', percent: 60 },
]

export default function OrderBookPanel() {
  const [expanded, setExpanded] = useState(true)
  const [asks] = useState<OrderBookEntry[]>(mockAsks)
  const [bids] = useState<OrderBookEntry[]>(mockBids)
  const [spread] = useState('0.00005')
  const [spreadPercent] = useState('0.0046%')
  const [midPrice] = useState('1.08495')

  // Calculate buy/sell pressure
  const totalAsk = asks.reduce((s, a) => s + a.percent, 0)
  const totalBid = bids.reduce((s, b) => s + b.percent, 0)
  const buyPressure = Math.round((totalBid / (totalAsk + totalBid)) * 100)

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
            }}>{midPrice}</div>
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
