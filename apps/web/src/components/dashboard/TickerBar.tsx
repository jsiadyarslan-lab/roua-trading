'use client'

import { useRef } from 'react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { fmtPriceLocale } from '@/lib/price-format'

const TICKER_SYMBOLS = ['EUR/USD', 'GBP/USD', 'BTC/USDT', 'XAU/USD', 'AAPL', 'TSLA', 'USD/JPY']

interface TickItem {
  symbol: string
  price: string
  change: string
  isPositive: boolean
}

export default function TickerBar() {
  const tickerRef = useRef<HTMLDivElement>(null)
  const globalQuotes = useMarketStore(state => state.quotes)
  const quotes = new Map(TICKER_SYMBOLS.map(s => globalQuotes[s] ? [s, globalQuotes[s]] : [s, null]).filter(([,v]) => v !== null) as [string, any][])

  // Convert quotes to tick items
  const ticks: TickItem[] = TICKER_SYMBOLS.map(symbol => {
    const quote = quotes.get(symbol)
    if (!quote) {
      return { symbol, price: '—', change: '0.00%', isPositive: true }
    }
    return {
      symbol,
      price: quote.price > 0 ? fmtPriceLocale(quote.price, symbol) : '—',
      change: `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`,
      isPositive: quote.changePercent >= 0,
    }
  })

  const renderTick = (tick: TickItem, idx: number) => (
    <div key={idx} className="tick-item" data-sym={tick.symbol} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '0 32px', flexShrink: 0, borderInlineEnd: '1px solid rgba(255,255,255,0.04)', direction: 'ltr' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', fontWeight: 700, color: 'rgba(160,175,195,0.65)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {tick.symbol}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 800, color: 'rgba(230,235,245,0.9)', letterSpacing: '0.04em' }}>
        {tick.price}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: tick.isPositive ? 'var(--profit)' : 'var(--loss)', textShadow: tick.isPositive ? '0 0 6px rgba(0,255,198,0.5)' : '0 0 6px rgba(255,77,77,0.5)' }}>
        {tick.isPositive ? '▲' : '▼'} {tick.change}
      </span>
    </div>
  )

  return (
    <div className="ticker-bar" style={{ gridArea: 'ticker' }}>
      <div style={{ width: '100%', height: '38px', overflow: 'hidden', background: 'var(--bg-ticker)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative', boxShadow: 'var(--shadow-sm)' }}>
        {/* Fade edges */}
        {/* RTL: fade edge on inline-start side */}
        <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: '28px', zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(270deg, transparent, var(--bg-ticker))' }} />
        {/* RTL: fade edge on inline-end side */}
        <div style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: '28px', zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(90deg, transparent, var(--bg-ticker))' }} />

        <div ref={tickerRef} style={{ display: 'inline-flex', alignItems: 'center', height: '100%', whiteSpace: 'nowrap', willChange: 'transform', animationName: 'ql-ticker', animationDuration: '72s', animationTimingFunction: 'linear', animationIterationCount: 'infinite', animationPlayState: 'running' }}>
          {ticks.map((tick, i) => renderTick(tick, i))}
          {ticks.map((tick, i) => renderTick(tick, i + ticks.length))}
        </div>
      </div>
    </div>
  )
}
