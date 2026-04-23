'use client'

import { useState, useRef, useEffect } from 'react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'

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
  const globalQuotes = useMarketStore(state => state.quotes)
  const quotes = new Map(ALL_SYMBOLS.map(s => globalQuotes[s] ? [s, globalQuotes[s]] : [s, null]).filter(([,v]) => v !== null) as [string, any][])
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({})
  const fetchedRef = useRef<Set<string>>(new Set())

  // Fetch real sparklines for current tab's symbols
  useEffect(() => {
    const symbols = SYMBOLS_BY_TAB[activeTab]
    const toFetch = symbols.filter(s => !fetchedRef.current.has(s))
    if (toFetch.length === 0) return

    Promise.allSettled(
      toFetch.map(sym =>
        fetch(`/api/exchange/history/${encodeURIComponent(sym)}?interval=1h`)
          .then(r => r.json())
          .then(data => {
            if (data.success && Array.isArray(data.data) && data.data.length > 0) {
              const closes: number[] = data.data
                .slice(-12)
                .map((c: any) => c.close)
                .filter((v: any) => typeof v === 'number' && !isNaN(v))
              if (closes.length >= 4) {
                fetchedRef.current.add(sym)
                setSparklineData(prev => ({ ...prev, [sym]: closes }))
              }
            }
          })
          .catch(() => {})
      )
    )
  }, [activeTab])

  const symbols = SYMBOLS_BY_TAB[activeTab]

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', overflow: 'hidden'
    }}>
      <style>{`
        @keyframes dash-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .skeleton {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          animation: dash-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

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
      <div className="custom-scrollbar no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
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
                onClick={() => setSelectedSymbol(sym)}
                className="card"
                style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  height: 96, padding: '14px 16px',
                  background: sym === selectedSymbol ? 'rgba(0, 229, 255, 0.05)' : 'var(--surface)',
                  borderColor: sym === selectedSymbol ? 'var(--accent)' : 'var(--card-border)',
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
                  {q ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
                      borderRadius: 20, background: isUp ? 'rgba(0,200,83,0.1)' : 'rgba(255,59,48,0.1)',
                      border: `1px solid ${color}30`,
                      color: color, fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)'
                    }}>
                      {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                  ) : (
                    <div className="skeleton" style={{ width: 45, height: 20, borderRadius: 20 }} />
                  )}
                </div>

                {/* Price & Sparkline */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                  {price === null ? (
                    <div className="skeleton" style={{ width: 80, height: 22 }} />
                  ) : (
                    <PriceDisplay price={price} isUp={isUp} />
                  )}
                  
                  {/* Real Data Sparkline */}
                  <div style={{ width: 80, height: 30, opacity: 0.85, alignSelf: 'flex-end', marginBottom: -4 }}>
                    {q ? (() => {
                      const rawPoints = sparklineData[sym]
                      const hasReal = rawPoints && rawPoints.length >= 4

                      // Normalize to SVG viewBox
                      const points = hasReal ? rawPoints : (isUp
                        ? [25, 20, 22, 10, 15, 5]
                        : [5, 15, 10, 22, 20, 25])

                      const mn = Math.min(...points)
                      const mx = Math.max(...points)
                      const range = mx - mn || 1
                      const normalized = points.map(p => 28 - ((p - mn) / range) * 26)
                      const step = 100 / (normalized.length - 1)
                      const linePts = normalized.map((y, i) => `${i * step},${y}`).join(' L ')
                      const fillPts = `M 0,${normalized[0]} L ${linePts} L ${100},${normalized[normalized.length-1]} L 100,30 L 0,30 Z`
                      const linePath = `M 0,${normalized[0]} L ${linePts}`

                      return (
                        <svg viewBox="0 0 100 30" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                          <defs>
                            <linearGradient id={`grad-${sym}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <path d={fillPts} fill={`url(#grad-${sym})`} />
                          <path
                            d={linePath}
                            fill="none" stroke={color} strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round"
                          />
                          {/* Last price dot */}
                          <circle
                            cx={100} cy={normalized[normalized.length - 1]}
                            r={3} fill={color}
                            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                          />
                        </svg>
                      )
                    })() : (
                      <div className="skeleton" style={{ width: '100%', height: '100%', opacity: 0.5 }} />
                    )}
                  </div>
                </div>

                {/* Left Indicator bar */}
                <div style={{
                  position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 2.5,
                  background: q ? color : 'transparent', borderRadius: '0 4px 4px 0'
                }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
