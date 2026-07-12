'use client'

import { useMarketStore, type QuoteData } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { fmtPriceLocale } from '@/lib/price-format'
import { useRef, useState, useEffect } from 'react'

const TICKER_SYMBOLS = ['BTC/USD','ETH/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD','SOL/USD']

interface SymbolButtonProps {
  symbol: string
  isActive: boolean
  onSelect: (sym: string) => void
}

function SymbolButton({ symbol, isActive, onSelect }: SymbolButtonProps) {
  const quote = useMarketStore(state => state.quotes[symbol])

  // V522: Track previous price to determine tick direction (up/down)
  // Color changes with EVERY tick, not just changePercent
  const prevPriceRef = useRef<number>(0)
  const [tickDir, setTickDir] = useState<'up' | 'down' | 'flat'>('flat')

  useEffect(() => {
    if (!quote?.price || quote.price <= 0) return
    const prev = prevPriceRef.current
    if (prev > 0) {
      if (quote.price > prev) setTickDir('up')
      else if (quote.price < prev) setTickDir('down')
      // 'flat' stays if price unchanged
    }
    prevPriceRef.current = quote.price
    // Reset to 'flat' after 600ms so color returns to neutral when no new ticks
    const timer = setTimeout(() => setTickDir('flat'), 600)
    return () => clearTimeout(timer)
  }, [quote?.price])

  const chgPct = quote?.changePercent ?? 0
  const isUp = chgPct >= 0
  const price = quote?.price && quote.price > 0 ? fmtPriceLocale(quote.price, symbol) : '—'

  // V522: Tick direction determines the vivid color
  // up: bright green, down: bright red, flat: neutral based on 24h change
  const tickColor = tickDir === 'up' ? '#00FFA3'
                  : tickDir === 'down' ? '#FF3355'
                  : (isUp ? '#00FFA3' : '#FF3355')
  // Background intensity based on tick direction
  const tickBg = tickDir === 'up' ? 'rgba(0,255,136,0.18)'
               : tickDir === 'down' ? 'rgba(255,51,85,0.18)'
               : (isUp ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,85,0.06)')
  const tickBorder = tickDir === 'up' ? '1px solid rgba(0,255,136,0.4)'
                   : tickDir === 'down' ? '1px solid rgba(255,51,85,0.4)'
                   : `1px solid ${isUp ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,85,0.15)'}`

  // Active selection overrides with cyan tint
  const buttonBg = isActive ? 'rgba(0,212,255,0.15)' : tickBg
  const buttonBorder = isActive ? '1px solid rgba(0,212,255,0.5)' : tickBorder

  const pctBg = isUp ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,85,0.12)'

  return (
    <button key={symbol} type="button"
      onClick={() => onSelect(symbol)}
      style={{
        display:'flex', alignItems:'center', gap:6,
        padding:'4px 10px', borderRadius: 'var(--radius-md)', flexShrink:0, cursor:'pointer',
        border: buttonBorder,
        background: buttonBg,
        transition: 'background 0.15s, border-color 0.15s',
      }}>
      <div style={{ display:'flex', flexDirection:'column', gap:1, alignItems:'flex-start' }}>
        <span style={{ fontSize: 11, fontWeight:800, color: tickColor, fontFamily: "var(--font-mono)", lineHeight:1, letterSpacing:'0.05em', transition: 'color 0.15s' }}>
          {symbol.split('/')[0]}
        </span>
        <span style={{ fontSize: 11, fontWeight:800, color: tickColor, fontFamily: "var(--font-mono)", lineHeight:1.2, textShadow: tickDir !== 'flat' ? `0 0 6px ${tickDir === 'up' ? 'rgba(0,255,136,0.6)' : 'rgba(255,51,85,0.6)'}` : 'none', transition: 'color 0.15s' }}>
          {price}
        </span>
        <span style={{ fontSize: 11, fontWeight:700, color: isUp ? '#00FFA3' : '#FF3355', fontFamily: "var(--font-mono)", lineHeight:1, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: pctBg }}>
          {isUp ? '▲' : '▼'} {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
        </span>
      </div>
    </button>
  )
}

interface MobileTickerStripProps {
  onSelectSymbol: (sym: string) => void
}

export function MobileTickerStrip({ onSelectSymbol }: MobileTickerStripProps) {
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)

  return (
    <div className="m2-ticker">
      {TICKER_SYMBOLS.map(sym => (
        <SymbolButton
          key={sym}
          symbol={sym}
          isActive={sym === selectedSymbol}
          onSelect={onSelectSymbol}
        />
      ))}
    </div>
  )
}
