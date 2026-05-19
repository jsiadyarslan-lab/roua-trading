'use client'

import { useState, useMemo } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useRouter } from 'next/navigation'
import { Search, Flame, TrendingUp, TrendingDown } from 'lucide-react'

const TABS = [
  { key: 'crypto', label: 'كريبتو' },
  { key: 'forex', label: 'فوركس' },
  { key: 'commodities', label: 'سلع' },
]

const SYMBOL_MAP: Record<string, string[]> = {
  crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD', 'DOGE/USD'],
  forex: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF'],
  commodities: ['XAU/USD'],
}

export default function MobileMarketsPage() {
  const quotes = useMarketStore(s => s.quotes)
  const router = useRouter()
  const [tab, setTab] = useState('crypto')
  const [search, setSearch] = useState('')

  const symbols = SYMBOL_MAP[tab] || []
  const filtered = symbols.filter(s => s.toLowerCase().includes(search.toLowerCase()))

  const hotMover = useMemo(() =>
    symbols.map(s => ({ s, q: quotes[s] })).filter(x => x.q).sort((a, b) => Math.abs(b.q!.changePercent) - Math.abs(a.q!.changePercent))[0],
    [quotes, symbols]
  )

  return (
    <div className="m-page">
      <MobilePageHeader title="الأسواق" subtitle="الأسعار المباشرة" />

      {/* Search */}
      <div style={{ padding: '0 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '8px 12px', border: '0.5px solid rgba(255,255,255,0.06)' }}>
          <Search size={16} color="#8B92A8" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." style={{ flex: 1, background: 'none', border: 'none', color: '#FFF', fontSize: 13, fontFamily: "'Cairo', sans-serif", outline: 'none' }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: tab === t.key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: tab === t.key ? '#00D4FF' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>

      {/* Hot mover */}
      {hotMover && (
        <div style={{ margin: '0 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 10, background: 'rgba(255,183,0,0.04)', border: '0.5px solid rgba(255,183,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame size={11} color="#FFB800" /><span style={{ fontSize: 9, fontWeight: 800, color: '#FFB800', fontFamily: "'Cairo', sans-serif" }}>أكثر حركة</span></div>
          <span style={{ fontSize: 10, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{hotMover.s} {(hotMover.q?.changePercent ?? 0) >= 0 ? '+' : ''}{(hotMover.q?.changePercent ?? 0).toFixed(2)}%</span>
        </div>
      )}

      {/* Market list */}
      {filtered.map(sym => {
        const q = quotes[sym]
        const changePct = q?.changePercent ?? 0
        const price = q?.price ?? null
        const isUp = changePct >= 0
        const color = isUp ? '#32D74B' : '#FF453A'
        return (
          <IOSCard key={sym} onClick={() => router.push(`/mobile/chart?symbol=${sym}`)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace", border: '0.5px solid rgba(255,255,255,0.06)' }}>{sym.split('/')[0].slice(0, 2)}</div>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{sym}</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                {price !== null ? <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{price > 100 ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(price < 10 ? 4 : 2)}</div> : <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>—</div>}
                {q && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}><span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{isUp ? '+' : ''}{changePct.toFixed(2)}%</span>{isUp ? <TrendingUp size={10} color={color} /> : <TrendingDown size={10} color={color} />}</div>}
              </div>
            </div>
          </IOSCard>
        )
      })}
      <div style={{ height: 16 }} />
    </div>
  )
}
