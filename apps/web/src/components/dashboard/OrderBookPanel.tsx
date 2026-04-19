'use client'

import { useState } from 'react'
import { BarChart3, ChevronDown } from 'lucide-react'

export default function OrderBookPanel() {
  const [expanded, setExpanded] = useState(true)

  const asks = [
    { price: '1.0852', amount: '2.4M' },
    { price: '1.0851', amount: '1.8M' },
    { price: '1.0850', amount: '3.2M' },
  ]
  const bids = [
    { price: '1.0849', amount: '2.1M' },
    { price: '1.0848', amount: '1.5M' },
    { price: '1.0847', amount: '2.8M' },
  ]

  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)', background: 'var(--bg-input)', transition: 'border-color 0.2s' }}>
      <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <BarChart3 size={10} stroke="rgba(140,155,175,0.5)" strokeWidth={2.2} />
        </div>
        <span style={{ flex: '1 1 0%', fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', fontFamily: 'var(--font-ar), Inter, sans-serif', textAlign: 'start', color: 'var(--text-muted)' }}>دفتر الأوامر</span>
        <div style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <ChevronDown size={10} stroke="rgba(100,115,130,0.4)" strokeWidth={2} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 8px 8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '5px' }}>
            {asks.map((ask, i) => (
              <div key={i} dir="ltr" style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,77,77,0.06)', width: `${30 + i * 15}%`, borderRadius: '2px' }} />
                <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--loss)', position: 'relative' }}>{ask.price}</span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', position: 'relative' }}>{ask.amount}</span>
              </div>
            ))}
            <div dir="ltr" style={{ textAlign: 'center', padding: '3px 0', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>
              Spread: 0.00003
            </div>
            {bids.map((bid, i) => (
              <div key={i} dir="ltr" style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,255,198,0.06)', width: `${30 + i * 15}%`, borderRadius: '2px' }} />
                <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--profit)', position: 'relative' }}>{bid.price}</span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', position: 'relative' }}>{bid.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
