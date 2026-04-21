'use client'

import { useState, useRef, useEffect } from 'react'
import { useMarketQuotes } from '@/hooks/useMarketData'
import { TrendingUp, TrendingDown } from 'lucide-react'

// Helper component to handle price pulse animation
function PriceDisplay({ price, isUp }: { price: number | null, isUp: boolean }) {
  const prevPrice = useRef<number | null>(price)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (price !== null && prevPrice.current !== null && price !== prevPrice.current) {
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 450)
      prevPrice.current = price
      return () => clearTimeout(timer)
    }
    if (prevPrice.current === null) prevPrice.current = price
  }, [price])

  if (price === null) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>Loading...</span>

  return (
    <div className={`price ${pulse ? 'price-pulse' : ''}`} style={{ 
      fontSize: 18, 
      color: pulse ? 'var(--accent)' : 'var(--foreground)',
      transition: 'color 0.3s'
    }}>
      {price > 1000
        ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : price.toFixed(price > 10 ? 4 : 6)
      }
    </div>
  )
}

const SYMBOLS_BY_TAB = {
  Crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD'],
  Forex:  ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AUD/USD', 'USD/CHF'],
  Stocks: ['AAPL',    'MSFT',    'NVDA',    'TSLA',    'AMZN',    'META'],
}

const ALL_SYMBOLS = [
  ...SYMBOLS_BY_TAB.Crypto,
  ...SYMBOLS_BY_TAB.Forex,
  ...SYMBOLS_BY_TAB.Stocks,
]

export function WatchlistMini() {
  const [activeTab, setActiveTab] = useState<'Crypto' | 'Forex' | 'Stocks'>('Crypto')
  const { quotes } = useMarketQuotes(ALL_SYMBOLS, 5000)

  const symbols = SYMBOLS_BY_TAB[activeTab]

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', overflow: 'hidden'
    }}>
      
      {/* Tabs */}
      <div style={{
        display: 'flex', padding: '6px 16px', gap: 12, background: 'var(--surface)',
        borderBottom: `1px solid var(--card-border)`
      }}>
        {(['Crypto', 'Forex', 'Stocks'] as const).map(tab => {
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: `2.5px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                padding: '6px 0',
                color: isActive ? 'var(--foreground)' : 'var(--muted)',
                fontSize: 11, fontWeight: isActive ? 800 : 500, cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif", transition: '0.2s',
                display: 'flex', alignItems: 'center'
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* List Body */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {symbols.map((sym) => {
            const q = quotes.get(sym)
            const changePct = q?.changePercent ?? 0
            const price = q?.price ?? null
            const isUp = changePct >= 0
            const color = isUp ? 'var(--success)' : 'var(--danger)'

            return (
              <div
                key={sym}
                className="card"
                style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  height: 96, padding: '14px 16px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer', position: 'relative', overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'translateY(-4px)'
                  el.style.borderColor = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'translateY(0)'
                  el.style.borderColor = 'var(--card-border)'
                }}
              >
                {/* Pair & Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--foreground)', fontFamily: 'var(--mono)' }}>{sym}</span>
                    <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>MARKET PAIR</span>
                  </div>
                  {q && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
                      borderRadius: 20, background: isUp ? 'rgba(0,200,83,0.1)' : 'rgba(255,59,48,0.1)',
                      border: `1px solid ${color}30`,
                      color: color, fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)'
                    }}>
                      {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                  )}
                </div>

                {/* Price & Sparkline Placeholder */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                  <PriceDisplay price={price} isUp={isUp} />
                  
                  {/* Subtle Sparkline Mockup */}
                  <div style={{ width: 80, height: 24, opacity: 0.6 }}>
                    <svg viewBox="0 0 100 30" style={{ width: '100%', height: '100%' }}>
                      <path 
                        d={isUp ? "M0 25 L20 20 L40 22 L60 10 L80 15 L100 5" : "M0 5 L20 15 L40 10 L60 22 L80 20 L100 25"} 
                        fill="none" 
                        stroke={color} 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />
                    </svg>
                  </div>
                </div>

                {/* Left Indicator bar */}
                <div style={{
                  position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 2.5,
                  background: color, borderRadius: '0 4px 4px 0'
                }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
