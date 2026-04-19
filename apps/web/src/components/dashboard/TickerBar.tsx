'use client'

import { useRef, useState } from 'react'

interface TickItem {
  symbol: string
  price: string
  change: string
  changePercent: string
  isPositive: boolean
}

const defaultTicks: TickItem[] = [
  { symbol: 'EUR/USD', price: '1.17670', change: '+7.72%', changePercent: '+0.07', isPositive: true },
  { symbol: 'GBP/USD', price: '1.32450', change: '+0.34%', changePercent: '+0.004', isPositive: true },
  { symbol: 'BTC/USD', price: '67,234', change: '+2.41%', changePercent: '+1582', isPositive: true },
  { symbol: 'XAU/USD', price: '2,341.50', change: '-0.34%', changePercent: '-8.00', isPositive: false },
  { symbol: 'SPX500', price: '5,234.80', change: '+0.56%', changePercent: '+29.10', isPositive: true },
  { symbol: 'NAS100', price: '18,567', change: '+0.89%', changePercent: '+164.00', isPositive: true },
  { symbol: 'USD/JPY', price: '154.32', change: '-0.12%', changePercent: '-0.19', isPositive: false },
]

export default function TickerBar() {
  const tickerRef = useRef<HTMLDivElement>(null)
  const [ticks] = useState<TickItem[]>(defaultTicks)

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
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '28px', zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(90deg, var(--bg-ticker), transparent)' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '28px', zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(-90deg, var(--bg-ticker), transparent)' }} />
        
        <div ref={tickerRef} style={{ display: 'inline-flex', alignItems: 'center', height: '100%', whiteSpace: 'nowrap', willChange: 'transform', animationName: 'ql-ticker', animationDuration: '72s', animationTimingFunction: 'linear', animationIterationCount: 'infinite', animationPlayState: 'running' }}>
          {ticks.map((tick, i) => renderTick(tick, i))}
          {ticks.map((tick, i) => renderTick(tick, i + ticks.length))}
        </div>
      </div>
    </div>
  )
}
