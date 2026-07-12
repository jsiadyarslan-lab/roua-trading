'use client'

import { useState, useRef, useEffect } from 'react'
import { useMarketStore, type QuoteData } from '@/hooks/useMarketStore'
import { useShallow } from 'zustand/react/shallow'
import { Flame, TrendingUp, TrendingDown } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { formatFreshness, getDataStatus, getStatusLabel, getStatusTone } from '@/lib/dashboard-live'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl'
import T from '@/lib/unified-tokens'

// Helper component to handle price pulse animation
function PriceDisplay({ price, isUp }: { price: number | null, isUp: boolean }) {
  const tw = useTranslations('dashboard.watchlist')
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

  if (price === null) return <span style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>{tw('loading')}</span>

  return (
    <div className={`price ${pulse ? 'price-pulse' : ''}`} style={{ 
      fontSize: 'var(--text-lg)', 
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
  // V432: طابق الـ 12 زوج كريبتو المدعومة في backend (LAZIC_SUPPORTED_SYMBOLS)
  Crypto: [
    'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD', 'DOGE/USD',
    'DOT/USD', 'MATIC/USD', 'AVAX/USD', 'LINK/USD', 'UNI/USD',
  ],
  Forex:  [
    // Majors
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD',
    // Crosses
    'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/AUD', 'EUR/CAD', 'EUR/CHF',
    'GBP/AUD', 'GBP/CAD', 'GBP/CHF', 'AUD/JPY', 'AUD/CAD', 'AUD/CHF',
    'CAD/JPY', 'CHF/JPY', 'NZD/JPY',
  ],
  Metals: ['XAU/USD', 'XAG/USD'],
  Indices: ['US30/USD', 'NAS100/USD', 'SPX500/USD', 'GER30/USD', 'UK100/USD'],
  Energy: ['WTI/USD', 'BRENT/USD'],
  Stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META'],
}

const ALL_SYMBOLS = [
  ...SYMBOLS_BY_TAB.Crypto,
  ...SYMBOLS_BY_TAB.Forex,
  ...SYMBOLS_BY_TAB.Metals,
  ...SYMBOLS_BY_TAB.Indices,
  ...SYMBOLS_BY_TAB.Energy,
  ...SYMBOLS_BY_TAB.Stocks,
]

export function WatchlistMini({ selectedSymbol: selectedSymbolProp, onSelectSymbol }: { selectedSymbol?: string; onSelectSymbol?: (symbol: string) => void }) {
  useScopedStyle(`
        @keyframes dash-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .skeleton {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          animation: dash-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `)
  const [activeTab, setActiveTab] = useState<'Crypto' | 'Forex' | 'Metals' | 'Indices' | 'Energy' | 'Stocks'>('Crypto')
  // Only subscribe to quotes for watchlist symbols — prevents re-renders from unrelated symbol updates
  const globalQuotes = useMarketStore(
    useShallow((state) => {
      const result: Record<string, QuoteData> = {}
      for (const s of ALL_SYMBOLS) {
        if (state.quotes[s]) result[s] = state.quotes[s]
      }
      return result
    })
  )
  const quotes = new Map(ALL_SYMBOLS.map(s => globalQuotes[s] ? [s, globalQuotes[s]] : [s, null]).filter(([,v]) => v !== null) as [string, any][])
  const tw = useTranslations('dashboard.watchlist')
  const tc = useTranslations('common')
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({})
  const fetchedRef = useRef<Set<string>>(new Set())
  const activeSymbol = selectedSymbolProp ?? selectedSymbol

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
  const hotMover = symbols
    .map(sym => ({ sym, quote: quotes.get(sym) }))
    .filter(item => item.quote)
    .sort((a, b) => Math.abs((b.quote?.changePercent ?? 0)) - Math.abs((a.quote?.changePercent ?? 0)))[0]

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', overflow: 'hidden', fontFamily: "var(--font-ar)"
    }}>
      {/* V329: Compact tabs — scrollable, per-tab accent colors */}
      <div style={{
        display: 'flex', padding: '4px 8px', gap: 4, background: 'var(--surface)',
        borderBottom: `1px solid var(--card-border)`, overflowX: 'auto',
      }}>
        {(['Crypto', 'Forex', 'Metals', 'Indices', 'Energy', 'Stocks'] as const).map(tab => {
          const isActive = activeTab === tab
          const tabLabel: Record<string, string> = {
            Crypto: tw('crypto'), Forex: tw('forex'), Metals: tw('metals') ?? 'Metals',
            Indices: tw('indices') ?? 'Indices', Energy: tw('energy') ?? 'Energy',
            Stocks: tw('stocks'),
          }
          const tabColors: Record<string, string> = {
            Crypto: '#F59E0B', Forex: '#06B6D4', Metals: '#CD7F32',
            Indices: '#8B5CF6', Energy: T.profit, Stocks: '#EC4899',
          }
          const accent = tabColors[tab] || 'var(--accent)'
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                background: isActive ? `${accent}15` : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)', padding: '4px 8px',
                color: isActive ? accent : 'var(--muted)',
                fontSize: 'var(--text-xs)', fontWeight: isActive ? 800 : 500, cursor: 'pointer',
                fontFamily: "var(--font-ar)", transition: '0.2s',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
              {tabLabel[tab]}
            </button>
          )
        })}
      </div>

      {/* V329: Compact hot mover */}
      <div style={{
        margin: '6px 8px 0', borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)',
        padding: '4px 8px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Flame size={10} color="var(--warning)" />
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--foreground)' }}>{hotMover?.sym ?? '—'}</span>
          <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--mono)', color: (hotMover?.quote?.changePercent ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {hotMover?.quote ? `${hotMover.quote.changePercent >= 0 ? '+' : ''}${hotMover.quote.changePercent.toFixed(2)}%` : '—'}
          </span>
        </div>
      </div>

      {/* V329: Compact list — cards half the size (44px vs 96px) */}
      <div className="custom-scrollbar no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {symbols.map((sym) => {
            const q = quotes.get(sym)
            const changePct = q?.changePercent ?? 0
            const price = q?.price ?? null
            const isUp = changePct >= 0
            const color = isUp ? 'var(--success)' : 'var(--danger)'
            return (
              <div key={sym}
                onClick={() => onSelectSymbol ? onSelectSymbol(sym) : setSelectedSymbol(sym)}
                className="card"
                style={{
                  display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  height: 44, padding: '6px 10px',
                  background: sym === activeSymbol ? 'rgba(0, 212, 255, 0.05)' : 'var(--surface)',
                  borderColor: sym === activeSymbol ? 'var(--accent)' : 'var(--card-border)',
                  transition: 'border-color 0.2s ease', cursor: 'pointer',
                  position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = sym === activeSymbol ? 'var(--accent)' : 'var(--card-border)' }}
              >
                {/* Left color bar */}
                <div style={{ position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 2, background: q ? color : 'transparent', borderRadius: '0 4px 4px 0' }} />
                {/* Pair name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{sym}</span>
                </div>
                {/* Price + change */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {price !== null ? (
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--foreground)' }}>
                      {price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 1 }) : price >= 1 ? price.toFixed(3) : price.toFixed(5)}
                    </span>
                  ) : (
                    <div className="skeleton" style={{ width: 50, height: 14 }} />
                  )}
                  {q ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 2, padding: '1px 5px',
                      borderRadius: 'var(--radius-lg)', background: isUp ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)',
                      color, fontSize: 'var(--text-xs)', fontWeight: 800, fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
                    }}>
                      {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
