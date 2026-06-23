'use client'

import { useMarketStore, type QuoteData } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { fmtPriceLocale } from '@/lib/price-format'

const TICKER_SYMBOLS = ['BTC/USD','ETH/USD','EUR/USD','GBP/USD','USD/JPY','XAU/USD','SOL/USD']

/**
 * V429: Mobile ticker strip — extracted from dashboard/page.tsx
 *
 * PROBLEM: The ticker was inline in dashboard/page.tsx (2521 lines).
 * Every setQuote() triggered a re-render of the ENTIRE dashboard page.
 * React's reconciliation for 2521 lines was too slow to show price
 * updates in real-time — only the charted symbol updated (because
 * RouaChart updates canvas directly, bypassing React).
 *
 * FIX: Extract ticker into a separate component that only subscribes
 * to useMarketStore. React re-renders ONLY this small component (7 buttons)
 * when quotes update — not the entire dashboard.
 *
 * This component replaces the inline ticker at dashboard/page.tsx line 1607.
 */

interface MobileTickerStripProps {
  onSelectSymbol: (sym: string) => void
}

export function MobileTickerStrip({ onSelectSymbol }: MobileTickerStripProps) {
  const quotes = useMarketStore(state => state.quotes)
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)

  return (
    <div className="m2-ticker">
      {TICKER_SYMBOLS.map(sym => {
        const q: QuoteData | undefined = quotes[sym]
        const chgPct = q?.changePercent ?? 0
        const isUp = chgPct >= 0
        const active = sym === selectedSymbol
        const price = q?.price && q.price > 0 ? fmtPriceLocale(q.price, sym) : '—'
        return (
          <button key={sym} type="button"
            onClick={() => onSelectSymbol(sym)}
            style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'3px 9px', borderRadius:7, flexShrink:0, cursor:'pointer',
              border: active ? '1px solid rgba(0,212,255,0.35)' : '1px solid transparent',
              background: active ? 'rgba(0,212,255,0.07)' : 'transparent',
            }}>
            <div style={{ display:'flex', flexDirection:'column', gap:0, alignItems:'flex-start' }}>
              <span style={{ fontSize:8, color:'rgba(130,150,175,0.65)', fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>
                {sym.split('/')[0]}
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
      })}
    </div>
  )
}
