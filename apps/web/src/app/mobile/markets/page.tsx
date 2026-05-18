'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useMarketStore, binanceWS } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Search, TrendingUp, TrendingDown, Flame } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

type MarketTab = 'crypto' | 'forex' | 'commodities'

const TAB_LIST: { key: MarketTab; label: string }[] = [
  { key: 'crypto', label: 'كريبتو' },
  { key: 'forex', label: 'فوركس' },
  { key: 'commodities', label: 'سلع' },
]

const SYMBOLS_BY_TAB: Record<MarketTab, string[]> = {
  crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD', 'DOT/USD', 'LINK/USD'],
  forex: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'NZD/USD', 'USD/CAD', 'EUR/GBP'],
  commodities: ['XAU/USD', 'XAG/USD', 'WTI/USD', 'XNG/USD'],
}

export default function MobileMarketsPage() {
  const router = useRouter()
  const quotes = useMarketStore(s => s.quotes)
  const { setSelectedSymbol } = useSymbolStore()
  const [tab, setTab] = useState<MarketTab>('crypto')
  const [search, setSearch] = useState('')

  const symbols = SYMBOLS_BY_TAB[tab]

  const filtered = useMemo(() => {
    if (!search.trim()) return symbols
    return symbols.filter(s => s.toLowerCase().includes(search.toLowerCase()))
  }, [symbols, search])

  // Subscribe to market data for visible symbols
  useMemo(() => {
    symbols.forEach(s => binanceWS.subscribe(s))
    return () => symbols.forEach(s => binanceWS.unsubscribe(s))
  }, [symbols])

  const hotMover = useMemo(() => {
    return filtered
      .map(s => ({ s, q: quotes[s] }))
      .filter(x => x.q)
      .sort((a, b) => Math.abs(b.q!.changePercent) - Math.abs(a.q!.changePercent))[0]
  }, [quotes, filtered])

  const handleNavigate = (symbol: string) => {
    setSelectedSymbol(symbol)
    router.push(`/mobile/chart?symbol=${encodeURIComponent(symbol)}`)
  }

  const fmtPrice = (p: number) => {
    if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (p > 10) return p.toFixed(3)
    return p.toFixed(4)
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="الأسواق" subtitle="الأسعار المباشرة" />

      {/* Search */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}` }}>
          <Search size={16} color={C.text2} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن زوج..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 2 }}>
          {TAB_LIST.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '7px 0', borderRadius: 10,
              background: tab === t.key ? 'rgba(0,212,255,0.12)' : 'transparent',
              border: 'none', color: tab === t.key ? C.accent : C.text2,
              fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hot Mover */}
      {hotMover && (
        <div style={{ padding: '0 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 12, background: 'rgba(255,183,0,0.05)', border: '0.5px solid rgba(255,183,0,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flame size={14} color={C.amber} />
              <span style={{ fontSize: 10, fontWeight: 800, color: C.amber, fontFamily: "'Cairo', sans-serif" }}>أكثر حركة</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{hotMover.s}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: hotMover.q!.changePercent >= 0 ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                {hotMover.q!.changePercent >= 0 ? '+' : ''}{hotMover.q!.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Market List */}
      <div style={{ padding: '0 16px' }}>
        <IOSCard>
          <div style={{ maxHeight: 'calc(100dvh - 280px)', overflowY: 'auto' }} className="m-no-scroll">
            {filtered.map(sym => {
              const q = quotes[sym]
              const changePct = q?.changePercent ?? 0
              const price = q?.price ?? null
              const isUp = changePct >= 0
              const color = isUp ? C.success : C.danger

              return (
                <div key={sym} onClick={() => handleNavigate(sym)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                  borderBottom: `0.5px solid ${C.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: isUp ? 'rgba(0,255,163,0.08)' : 'rgba(255,71,87,0.08)',
                      border: `0.5px solid ${isUp ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isUp ? <TrendingUp size={16} color={C.success} /> : <TrendingDown size={16} color={C.danger} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{sym}</div>
                      <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
                        {tab === 'crypto' ? 'كريبتو' : tab === 'forex' ? 'فوركس' : 'سلع'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left', direction: 'ltr' }}>
                    {price !== null ? (
                      <div style={{ fontSize: 13, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPrice(price)}</div>
                    ) : (
                      <div style={{ fontSize: 13, color: C.text2 }}>—</div>
                    )}
                    {q && (
                      <div style={{ fontSize: 10, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
                        {isUp ? '+' : ''}{changePct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </IOSCard>
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
