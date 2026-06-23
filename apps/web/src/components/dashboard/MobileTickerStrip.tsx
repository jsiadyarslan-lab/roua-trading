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

  return (
    <button key={symbol} type="button"
      onClick={() => onSelect(symbol)}
      style={{
        display:'flex', alignItems:'center', gap:5,
        padding:'3px 9px', borderRadius:7, flexShrink:0, cursor:'pointer',
        border: isActive ? '1px solid rgba(0,212,255,0.35)' : '1px solid transparent',
        background: isActive ? 'rgba(0,212,255,0.07)' : 'transparent',
      }}>
      <div style={{ display:'flex', flexDirection:'column', gap:0, alignItems:'flex-start' }}>
        <span style={{ fontSize:8, color:'rgba(130,150,175,0.65)', fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>
          {symbol.split('/')[0]}
        </span>
        <span style={{ fontSize:10, fontWeight:800, color:'rgba(230,235,245,0.9)', fontFamily:"'JetBrains Mono',monospace", lineHeight:1.3 }}>
          {price}
        </span>
        <span style={{ fontSize:9, fontWeight:700, color: isUp?'#00FFA3':'#FF4757', fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>
          {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
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
