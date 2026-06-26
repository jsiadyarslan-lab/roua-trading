'use client'

import { useMarketStore, type QuoteData } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { fmtPriceLocale } from '@/lib/price-format'

const TICKER_SYMBOLS = ['BTC/USD','ETH/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD','SOL/USD']

/**
 * V434: Mobile ticker strip — uses per-symbol subscriptions for real-time updates.
 *
 * PROBLEM: Subscribing to state.quotes (entire object) caused React to re-render
 * the component on EVERY setQuote call (24 symbols × 10/sec = 240 re-renders/sec).
 * React 18 concurrent rendering was batching/throttling these updates, causing
 * the ticker to appear frozen.
 *
 * FIX: Subscribe to each symbol individually using useMarketStore(selector).
 * Zustand only re-renders when that specific symbol's quote changes.
 * Each symbol button is a separate component with its own subscription.
 */

interface SymbolButtonProps {
  symbol: string
  isActive: boolean
  onSelect: (sym: string) => void
}

function SymbolButton({ symbol, isActive, onSelect }: SymbolButtonProps) {
  const quote = useMarketStore(state => state.quotes[symbol])

  const chgPct = quote?.changePercent ?? 0
  const isUp = chgPct >= 0
  const price = quote?.price && quote.price > 0 ? fmtPriceLocale(quote.price, symbol) : '—'

  // V521: Name + Price + Background all change color with price direction
  // Green: bright neon lime for up, Red: bright neon coral for down
  const priceColor = isUp ? '#00FF88' : '#FF3355'
  const pctBg = isUp ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,85,0.12)'
  // Background tint follows price direction
  const dirBg = isUp ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,85,0.08)'
  // Active state overrides with cyan tint (selection indicator)
  const buttonBg = isActive ? 'rgba(0,212,255,0.12)' : dirBg
  const buttonBorder = isActive ? '1px solid rgba(0,212,255,0.4)' : `1px solid ${isUp ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,85,0.2)'}`

  return (
    <button key={symbol} type="button"
      onClick={() => onSelect(symbol)}
      style={{
        display:'flex', alignItems:'center', gap:6,
        padding:'4px 10px', borderRadius:8, flexShrink:0, cursor:'pointer',
        border: buttonBorder,
        background: buttonBg,
      }}>
      <div style={{ display:'flex', flexDirection:'column', gap:1, alignItems:'flex-start' }}>
        <span style={{ fontSize:10, fontWeight:800, color: priceColor, fontFamily:"'JetBrains Mono',monospace", lineHeight:1, letterSpacing:'0.05em' }}>
          {symbol.split('/')[0]}
        </span>
        <span style={{ fontSize:11, fontWeight:800, color: priceColor, fontFamily:"'JetBrains Mono',monospace", lineHeight:1.2, textShadow: isUp ? '0 0 6px rgba(0,255,136,0.5)' : '0 0 6px rgba(255,51,85,0.5)' }}>
          {price}
        </span>
        <span style={{ fontSize:9, fontWeight:700, color: priceColor, fontFamily:"'JetBrains Mono',monospace", lineHeight:1, padding: '1px 5px', borderRadius: 4, background: pctBg }}>
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
