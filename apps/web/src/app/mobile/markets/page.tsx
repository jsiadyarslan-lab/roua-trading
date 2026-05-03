'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMarketStore, binanceWS } from '@/hooks/useMarketStore'

const TABS = ['الكل', 'كريبتو', 'فوركس', 'سلع']

// Assets we want to track
const TRACKED_ASSETS = [
  { symbol: 'BTC/USD', name: 'Bitcoin', cat: 'كريبتو' },
  { symbol: 'ETH/USD', name: 'Ethereum', cat: 'كريبتو' },
  { symbol: 'SOL/USD', name: 'Solana', cat: 'كريبتو' },
  { symbol: 'BNB/USD', name: 'BNB', cat: 'كريبتو' },
  { symbol: 'XRP/USD', name: 'XRP', cat: 'كريبتو' },
  { symbol: 'GOLD', name: 'Gold', cat: 'سلع' },
  { symbol: 'EUR/USD', name: 'EUR/USD', cat: 'فوركس' },
  { symbol: 'GBP/USD', name: 'GBP/USD', cat: 'فوركس' },
]

function MiniSparkline({ positive }: { positive: boolean }) {
  // Placeholder sparkline for real data
  const data = positive ? [10, 15, 12, 20, 18, 25] : [25, 20, 22, 15, 18, 10]
  const w = 50, h = 18
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / 30) * (h - 4) - 2}`)
  return (
    <svg width={w} height={h}>
      <polyline points={pts.join(' ')} fill="none" stroke={positive ? '#00FFA3' : '#FF4757'} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function MobileMarketsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('الكل')
  const [query, setQuery] = useState('')
  const quotes = useMarketStore(s => s.quotes)

  useEffect(() => {
    TRACKED_ASSETS.forEach(a => binanceWS.subscribe(a.symbol))
    return () => TRACKED_ASSETS.forEach(a => binanceWS.unsubscribe(a.symbol))
  }, [])

  const filtered = TRACKED_ASSETS.filter(a => {
    const matchCat = activeTab === 'الكل' || a.cat === activeTab
    const matchQ = !query || a.symbol.toLowerCase().includes(query.toLowerCase()) || a.name.toLowerCase().includes(query.toLowerCase())
    return matchCat && matchQ
  })

  return (
    <div style={{ minHeight: '100dvh', background: '#000000', direction: 'rtl', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 16px 12px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", marginBottom: 12 }}>
          الأسواق المباشرة
        </h1>
        {/* Search Bar */}
        <div className="flex items-center gap-2" style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '12px 16px',
        }}>
          <Search size={18} color="rgba(255,255,255,0.2)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن عملة أو معدن..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#F0F2F5', fontSize: 14, fontFamily: "'Cairo', sans-serif",
            }}
          />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ overflowX: 'auto', paddingBottom: 2 }} className="scrollbar-hide">
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px', width: 'max-content' }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 18px', borderRadius: 12, border: 'none',
                background: activeTab === tab ? '#00D4FF' : 'rgba(255,255,255,0.04)',
                color: activeTab === tab ? '#000' : 'rgba(255,255,255,0.4)',
                fontSize: 13, fontWeight: activeTab === tab ? 800 : 600,
                fontFamily: "'Cairo', sans-serif",
                transition: '0.2s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Asset Rows ── */}
      <div style={{ marginTop: 12 }}>
        {filtered.map((asset, i) => {
          const q = quotes[asset.symbol]
          const price = q ? q.price : 0
          const change = q ? q.changePercent : 0
          const pos = change >= 0

          return (
            <motion.button
              key={asset.symbol}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.98, backgroundColor: 'rgba(255,255,255,0.03)' }}
              onClick={() => router.push(`/mobile/chart?symbol=${asset.symbol}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px', width: '100%',
                background: 'transparent', border: 'none',
                borderBottom: '0.5px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: 'rgba(255,255,255,0.03)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: '#FFFFFF',
                  fontFamily: "'JetBrains Mono', monospace",
                  border: '0.5px solid rgba(255,255,255,0.1)'
                }}>
                  {asset.symbol.split('/')[0].slice(0, 2)}
                </div>
                <div style={{ textAlign: 'start' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
                    {asset.symbol}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif" }}>
                    {asset.name}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <MiniSparkline positive={pos} />
                <div style={{ textAlign: 'start', minWidth: 90 }}>
                  <div style={{ 
                    fontSize: 15, fontWeight: 800, color: '#F0F2F5', 
                    fontFamily: "'JetBrains Mono', monospace", 
                    fontVariantNumeric: 'tabular-nums' 
                  }}>
                    {price ? (price < 1 ? price.toFixed(4) : price.toLocaleString()) : '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                    <span style={{ 
                      fontSize: 11, fontWeight: 800, 
                      color: pos ? '#00FFA3' : '#FF4757', 
                      fontFamily: "'JetBrains Mono', monospace" 
                    }}>
                      {q ? `${pos ? '+' : ''}${change.toFixed(2)}%` : '0.00%'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
