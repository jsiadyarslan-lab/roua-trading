'use client'

import { useState, useEffect } from 'react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.12)',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

interface WatchlistItem {
  symbol: string
  price: number
  changePct: number
  vol?: string
}

const DEMO_DATA: Record<string, WatchlistItem[]> = {
  Crypto: [
    { symbol: 'BTC/USD', price: 64230.50, changePct: -1.2 },
    { symbol: 'ETH/USD', price: 3450.75, changePct: 2.4 },
    { symbol: 'SOL/USD', price: 145.20, changePct: 5.1 },
    { symbol: 'XRP/USD', price: 0.61, changePct: -0.5 },
  ],
  Forex: [
    { symbol: 'EUR/USD', price: 1.0850, changePct: 0.12 },
    { symbol: 'GBP/USD', price: 1.2640, changePct: -0.3 },
    { symbol: 'USD/JPY', price: 151.20, changePct: 0.05 },
    { symbol: 'XAU/USD', price: 2340.50, changePct: 1.1 },
  ],
  Stocks: [
    { symbol: 'AAPL', price: 175.40, changePct: -0.8 },
    { symbol: 'MSFT', price: 410.20, changePct: 1.2 },
    { symbol: 'NVDA', price: 880.50, changePct: 3.5 },
    { symbol: 'TSLA', price: 178.60, changePct: -2.1 },
  ]
}

export function WatchlistMini() {
  const [activeTab, setActiveTab] = useState<'Crypto' | 'Forex' | 'Stocks'>('Crypto')
  const [data, setData] = useState<WatchlistItem[]>(DEMO_DATA.Crypto)

  useEffect(() => {
    setData(DEMO_DATA[activeTab])
  }, [activeTab])

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: T.bg, overflow: 'hidden'
    }}>
      
      {/* Tabs */}
      <div style={{
        display: 'flex', padding: '4px', gap: 4, background: T.bg2,
        borderBottom: `0.5px solid ${T.border}`
      }}>
        {['Crypto', 'Forex', 'Stocks'].map(tab => {
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              style={{
                flex: 1, padding: '4px', background: isActive ? `${T.cyan}15` : 'transparent',
                border: `0.5px solid ${isActive ? T.cyan + '40' : 'transparent'}`,
                borderRadius: 4, color: isActive ? T.cyan : T.text2,
                fontSize: 9, fontWeight: isActive ? 800 : 600, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", transition: '0.2s'
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* List Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '6px 12px 4px',
        fontSize: 8.5, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif"
      }}>
        <div style={{ flex: 1.2 }}>الزوج</div>
        <div style={{ flex: 1, textAlign: 'right' }}>السعر</div>
        <div style={{ flex: 0.8, textAlign: 'right' }}>التغير</div>
      </div>

      {/* List Body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {data.map((item, idx) => {
            const isUp = item.changePct >= 0
            const color = isUp ? T.green : T.red
            
            return (
              <div
                key={idx}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 12px', borderBottom: `0.5px solid ${T.border}`,
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = T.bg2}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Symbol block */}
                <div style={{ flex: 1.2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 3, height: 12, borderRadius: 2, background: color }} />
                  <span style={{ fontWeight: 800, color: T.text }}>{item.symbol}</span>
                </div>

                {/* Price block */}
                <div style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: T.text }}>
                  {item.price < 10 ? item.price.toFixed(4) : item.price.toFixed(2)}
                </div>

                {/* Change block */}
                <div style={{ flex: 0.8, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    background: `${color}15`, color: color, padding: '2px 6px',
                    borderRadius: 4, fontSize: 9, fontWeight: 700, border: `0.5px solid ${color}30`
                  }}>
                    {isUp ? '+' : ''}{item.changePct.toFixed(2)}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
