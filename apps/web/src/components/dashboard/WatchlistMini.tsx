'use client'

import { useState } from 'react'
import { useMarketQuotes } from '@/hooks/useMarketData'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  border:  'rgba(10,132,255,0.12)',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
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
        display: 'flex', padding: '4px', gap: 4, background: T.bg2,
        borderBottom: `0.5px solid ${T.border}`
      }}>
        {(['Crypto', 'Forex', 'Stocks'] as const).map(tab => {
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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
          {symbols.map((sym) => {
            const q = quotes.get(sym)
            const changePct = q?.changePercent ?? 0
            const price = q?.price ?? null
            const isUp = changePct >= 0
            const color = isUp ? T.green : T.red

            return (
              <div
                key={sym}
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
                  <div style={{ width: 3, height: 12, borderRadius: 2, background: q ? color : T.text3 }} />
                  <span style={{ fontWeight: 800, color: T.text }}>{sym}</span>
                </div>

                {/* Price block */}
                <div style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: T.text }}>
                  {price === null
                    ? <span style={{ color: T.text3, fontSize: 8 }}>جارٍ التحميل</span>
                    : price > 1000
                      ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : price.toFixed(price > 10 ? 4 : 6)
                  }
                </div>

                {/* Change block */}
                <div style={{ flex: 0.8, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                  {q ? (
                    <div style={{
                      background: `${color}15`, color, padding: '2px 6px',
                      borderRadius: 4, fontSize: 9, fontWeight: 700, border: `0.5px solid ${color}30`
                    }}>
                      {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                  ) : (
                    <div style={{ color: T.text3, fontSize: 9 }}>—</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
