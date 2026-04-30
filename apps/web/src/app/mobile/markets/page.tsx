'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, TrendingDown } from 'lucide-react'
import { useRouter } from 'next/navigation'

const TABS = ['الكل', 'كريبتو', 'فوركس', 'أسهم', 'سلع']

const ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', price: 69420, change: 2.4, spark: [60,65,62,70,68,75,80,74,82,85], cat: 'كريبتو' },
  { symbol: 'ETH', name: 'Ethereum', price: 3185, change: 4.8, spark: [50,55,52,60,58,65,70,64,72,75], cat: 'كريبتو' },
  { symbol: 'SOL', name: 'Solana', price: 178, change: 6.2, spark: [40,45,43,50,48,55,60,54,62,65], cat: 'كريبتو' },
  { symbol: 'BNB', name: 'BNB', price: 612, change: 3.1, spark: [70,72,68,74,76,80,78,82,85,84], cat: 'كريبتو' },
  { symbol: 'EUR', name: 'EUR/USD', price: 1.0852, change: -0.12, spark: [85,83,87,84,82,86,81,83,80,79], cat: 'فوركس' },
  { symbol: 'GBP', name: 'GBP/USD', price: 1.274, change: -0.3, spark: [90,88,85,86,84,82,83,81,80,78], cat: 'فوركس' },
  { symbol: 'USD', name: 'USD/JPY', price: 154.8, change: 0.45, spark: [78,79,80,81,82,83,84,85,86,87], cat: 'فوركس' },
  { symbol: 'AAPL', name: 'Apple', price: 189.5, change: -1.2, spark: [85,84,82,83,80,79,81,78,77,76], cat: 'أسهم' },
  { symbol: 'NVDA', name: 'Nvidia', price: 875.2, change: -3.4, spark: [95,90,88,86,83,80,78,75,73,70], cat: 'أسهم' },
  { symbol: 'GOLD', name: 'Gold', price: 2345, change: 1.2, spark: [70,72,74,73,76,78,79,82,81,84], cat: 'سلع' },
  { symbol: 'OIL', name: 'Crude Oil', price: 82.4, change: -0.8, spark: [80,78,76,75,73,74,72,71,70,69], cat: 'سلع' },
]

function MiniSparkline({ data, positive }: { data: number[], positive: boolean }) {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const w = 60, h = 24
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
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

  const filtered = ASSETS.filter(a => {
    const matchCat = activeTab === 'الكل' || a.cat === activeTab
    const matchQ = !query || a.symbol.toLowerCase().includes(query.toLowerCase()) || a.name.toLowerCase().includes(query.toLowerCase())
    return matchCat && matchQ
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl' }}>

      {/* ── Header ── */}
      <div style={{ padding: '52px 16px 12px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", marginBottom: 12 }}>
          الأسواق
        </h1>
        {/* Search Bar */}
        <div className="flex items-center gap-2" style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '10px 14px',
        }}>
          <Search size={16} color="rgba(255,255,255,0.3)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن رمز أو أصل..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#F0F2F5', fontSize: 13, fontFamily: "'Cairo', sans-serif",
            }}
          />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ overflowX: 'auto', paddingBottom: 2 }} className="scrollbar-hide">
        <div style={{ display: 'flex', gap: 6, padding: '4px 16px', width: 'max-content' }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '7px 16px', borderRadius: 10, border: 'none',
                background: activeTab === tab ? '#059669' : 'rgba(255,255,255,0.06)',
                color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: 12, fontWeight: activeTab === tab ? 700 : 400,
                fontFamily: "'Cairo', sans-serif",
                transition: 'all 0.2s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Asset List Header ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '10px 16px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif" }}>الأصل</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif", textAlign: 'center', width: 64 }}>24 ساعة</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif", textAlign: 'left', minWidth: 80 }}>السعر</span>
      </div>

      {/* ── Asset Rows ── */}
      <div>
        {filtered.map((asset, i) => {
          const pos = asset.change >= 0
          return (
            <motion.button
              key={asset.symbol}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.98, backgroundColor: 'rgba(255,255,255,0.06)' }}
              onClick={() => router.push('/mobile/chart')}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                gap: 8, padding: '12px 16px', width: '100%',
                background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                alignItems: 'center', cursor: 'pointer',
              }}
            >
              {/* Asset Info */}
              <div className="flex items-center gap-3" style={{ textAlign: 'right' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: `${pos ? 'rgba(0,255,163' : 'rgba(255,71,87'}, 0.12)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: pos ? '#00FFA3' : '#FF4757',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {asset.symbol.slice(0, 2)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
                    {asset.symbol}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif" }}>
                    {asset.name}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <MiniSparkline data={asset.spark} positive={pos} />

              {/* Price + Change */}
              <div style={{ textAlign: 'left', minWidth: 80 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
                  {asset.price < 10 ? asset.price.toFixed(4) : asset.price.toLocaleString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                  {pos ? <TrendingUp size={10} color="#00FFA3" /> : <TrendingDown size={10} color="#FF4757" />}
                  <span style={{ fontSize: 11, fontWeight: 700, color: pos ? '#00FFA3' : '#FF4757', fontFamily: "'JetBrains Mono', monospace" }}>
                    {pos ? '+' : ''}{asset.change}%
                  </span>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Bottom spacing */}
      <div style={{ height: 24 }} />
    </div>
  )
}
