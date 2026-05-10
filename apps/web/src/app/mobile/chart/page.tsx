'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
    </div>
  )
})

export default function MobileChartPage() {
  const { selectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)

  // Get live price
  const quoteKey = (quotes && selectedSymbol) ? Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  ) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null

  const [chartFullscreen, setChartFullscreen] = useState(false)

  const toggleChartFullscreen = () => {
    setChartFullscreen(!chartFullscreen)
  }

  return (
    <div style={{
      height: 'calc(var(--app-height, 100dvh) - 56px)',
      background: '#0B0E14',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <RouaChart
          currentPrice={livePrice}
          isChartFullscreen={chartFullscreen}
          onToggleChartFullscreen={toggleChartFullscreen}
        />
      </div>
    </div>
  )
}
