'use client'

import { useState } from 'react'
import { useMarketQuotes } from '@/hooks/useMarketData'
import { TrendingUp, TrendingDown } from 'lucide-react'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  border:  'rgba(255, 255, 255, 0.06)',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
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
      background: T.bg, overflow: 'hidden'
    }}>
      
      {/* Tabs */}
      <div style={{
        display: 'flex', padding: '6px 12px', gap: 8, background: T.bg2,
        borderBottom: `1px solid ${T.border}`
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
                borderBottom: `2px solid ${isActive ? T.accent : 'transparent'}`,
                padding: '4px 0',
                color: isActive ? T.text : T.text2,
                fontSize: 10, fontWeight: isActive ? 800 : 500, cursor: 'pointer',
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
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {symbols.map((sym) => {
            const q = quotes.get(sym)
            const changePct = q?.changePercent ?? 0
            const price = q?.price ?? null
            const isUp = changePct >= 0
            const color = isUp ? T.success : T.danger

            return (
              <div
                key={sym}
                style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  height: 96, padding: '12px 14px', borderRadius: 12,
                  background: T.bg2, border: `1px solid ${T.border}`,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer', position: 'relative', overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'translateY(-4px)'
                  el.style.borderColor = T.accent
                  el.style.boxShadow = `0 4px 20px rgba(0, 229, 255, 0.15)`
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'translateY(0)'
                  el.style.borderColor = T.border
                  el.style.boxShadow = 'none'
                }}
              >
                {/* Pair & Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{sym}</span>
                    <span style={{ fontSize: 9, color: T.text2, fontFamily: "'Inter', sans-serif" }}>Asset Pair</span>
                  </div>
                  {q && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
                      borderRadius: 20, background: `${color}15`, border: `1px solid ${color}30`,
                      color: color, fontSize: 10, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                  )}
                </div>

                {/* Price & Sparkline Placeholder */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.03em' }}>
                    {price === null
                      ? <span style={{ color: T.text3, fontSize: 11 }}>Loading...</span>
                      : price > 1000
                        ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : price.toFixed(price > 10 ? 4 : 6)
                    }
                  </div>
                  
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
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
