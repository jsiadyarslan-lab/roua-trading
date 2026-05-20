'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { Header, Card, SkelLine } from '@/components/mobile/FluxComponents'
import { Search, TrendingUp, TrendingDown, Flame, Star, BarChart3 } from 'lucide-react'

/* ═══ Symbol Data ═══ */
interface SymbolInfo {
  symbol: string
  name: string
  category: 'crypto' | 'forex' | 'commodities'
  color: string
}

const SYMBOLS: SymbolInfo[] = [
  { symbol: 'BTC/USD', name: 'بيتكوين', category: 'crypto', color: '#F7931A' },
  { symbol: 'ETH/USD', name: 'إيثريوم', category: 'crypto', color: '#627EEA' },
  { symbol: 'SOL/USD', name: 'سولانا', category: 'crypto', color: '#9945FF' },
  { symbol: 'XRP/USD', name: 'ريبل', category: 'crypto', color: '#00AAE4' },
  { symbol: 'BNB/USD', name: 'بينانس', category: 'crypto', color: '#F3BA2F' },
  { symbol: 'ADA/USD', name: 'كاردانو', category: 'crypto', color: '#0033AD' },
  { symbol: 'DOGE/USD', name: 'دوج كوين', category: 'crypto', color: '#C2A633' },
  { symbol: 'AVAX/USD', name: 'أفالانش', category: 'crypto', color: '#E84142' },
  { symbol: 'DOT/USD', name: 'بولكادوت', category: 'crypto', color: '#E6007A' },
  { symbol: 'LINK/USD', name: 'تشين لينك', category: 'crypto', color: '#2A5ADA' },
  { symbol: 'EUR/USD', name: 'يورو/دولار', category: 'forex', color: '#003399' },
  { symbol: 'GBP/USD', name: 'جنيه/دولار', category: 'forex', color: '#C8102E' },
  { symbol: 'USD/JPY', name: 'دولار/ين', category: 'forex', color: '#BC002D' },
  { symbol: 'AUD/USD', name: 'أسترالي/دولار', category: 'forex', color: '#00008B' },
  { symbol: 'USD/CHF', name: 'دولار/فرنك', category: 'forex', color: '#D52B1E' },
  { symbol: 'USD/CAD', name: 'دولار/كندي', category: 'forex', color: '#FF0000' },
  { symbol: 'XAU/USD', name: 'الذهب', category: 'commodities', color: '#D4AF37' },
  { symbol: 'XAG/USD', name: 'الفضة', category: 'commodities', color: '#C0C0C0' },
]

type Category = 'all' | 'crypto' | 'forex' | 'commodities'

/* ═══ Sparkline SVG ═══ */
function Sparkline({ changePercent, width = 60, height = 28 }: { changePercent: number; width?: number; height?: number }) {
  const pts = useMemo(() => {
    const points: string[] = []
    const dir = changePercent >= 0 ? 1 : -1
    for (let i = 0; i < 24; i++) {
      const x = (i / 23) * width
      const noise = Math.sin(i * 0.8) * 3 + Math.cos(i * 1.3) * 2
      const trend = dir * (i / 23) * 6
      const y = height / 2 - noise - trend
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return points
  }, [changePercent, width, height])

  const isUp = changePercent >= 0
  const color = isUp ? '#00FFA3' : '#FF4757'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`spark-${isUp ? 'up' : 'dn'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${pts.join(' ')} ${width},${height}`}
        fill={`url(#spark-${isUp ? 'up' : 'dn'})`}
      />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ═══ Markets Page ═══ */
export default function MarketsPage() {
  const router = useRouter()
  const quotes = useMarketStore(s => s.quotes)
  const { setSelectedSymbol } = useSymbolStore()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('roua-market-favs')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [showFavsOnly, setShowFavsOnly] = useState(false)

  const toggleFav = useCallback((sym: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(sym)) next.delete(sym)
      else next.add(sym)
      try { localStorage.setItem('roua-market-favs', JSON.stringify([...next])) } catch { /* */ }
      return next
    })
  }, [])

  const filteredSymbols = useMemo(() => {
    let list = SYMBOLS
    if (category !== 'all') list = list.filter(s => s.category === category)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s => s.symbol.toLowerCase().includes(q) || s.name.includes(search))
    }
    if (showFavsOnly) list = list.filter(s => favorites.has(s.symbol))
    return list
  }, [category, search, showFavsOnly, favorites])

  const hotMovers = useMemo(() => {
    return SYMBOLS
      .map(s => ({ ...s, change: quotes[s.symbol]?.changePercent ?? 0 }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 3)
  }, [quotes])

  const handleSelect = useCallback((sym: string) => {
    setSelectedSymbol(sym)
    router.push(`/mobile/chart?symbol=${sym}`)
  }, [setSelectedSymbol, router])

  const categoryTabs: { key: Category; label: string }[] = [
    { key: 'all', label: 'الكل' },
    { key: 'crypto', label: 'كريبتو' },
    { key: 'forex', label: 'فوركس' },
    { key: 'commodities', label: 'سلع' },
  ]

  const hasQuotes = Object.keys(quotes).length > 0

  return (
    <div className="f-page">
      <Header title="الأسواق" subtitle="أسعار مباشرة" />

      {/* Search Bar */}
      <div style={{ padding: '0 var(--s4)', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)' }}>
          <Search size={14} color="#8B92A8" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث عن زوج..."
            style={{ flex: 1, background: 'none', border: 'none', color: '#FFF', fontSize: 12, fontWeight: 700, fontFamily: 'var(--f-cairo)', direction: 'rtl' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ fontSize: 14, color: '#8B92A8' }}>✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 var(--s4)', marginBottom: 8 }}>
        <div className="f-tabs" style={{ flex: 1 }}>
          {categoryTabs.map(tab => (
            <button
              key={tab.key}
              className={`f-tabs__item ${category === tab.key ? 'f-tabs__item--active' : ''}`}
              onClick={() => setCategory(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowFavsOnly(!showFavsOnly)} style={{ width: 32, height: 32, borderRadius: 8, background: showFavsOnly ? 'rgba(255,183,0,0.1)' : 'rgba(255,255,255,0.04)', border: showFavsOnly ? '0.5px solid rgba(255,183,0,0.2)' : '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Star size={12} color={showFavsOnly ? '#FFB800' : '#8B92A8'} fill={showFavsOnly ? '#FFB800' : 'none'} />
        </button>
      </div>

      {/* Hot Movers */}
      {hotMovers.length > 0 && category === 'all' && !search && !showFavsOnly && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Flame size={12} color="#FFB800" />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#FFB800', fontFamily: 'var(--f-cairo)' }}>الأكثر حركة</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {hotMovers.map(mover => {
              const q = quotes[mover.symbol]
              const change = q?.changePercent ?? mover.change
              const isUp = change >= 0
              return (
                <button key={mover.symbol} onClick={() => handleSelect(mover.symbol)} style={{ flex: 1, padding: '8px', borderRadius: 10, background: `${mover.color}08`, border: `0.5px solid ${mover.color}15`, cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)', marginBottom: 2 }}>{mover.symbol.split('/')[0]}</div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>{isUp ? '+' : ''}{change.toFixed(2)}%</div>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* Market List */}
      {filteredSymbols.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <BarChart3 size={24} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>لا توجد نتائج</div>
          </div>
        </Card>
      ) : !hasQuotes ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SkelLine width={24} height={24} />
                  <SkelLine width={60} height={10} />
                </div>
                <SkelLine width={50} height={10} />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card noMargin>
          <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
            {filteredSymbols.map(info => {
              const q = quotes[info.symbol]
              const price = q?.price ?? null
              const change = q?.changePercent ?? 0
              const isUp = change >= 0
              const isFav = favorites.has(info.symbol)

              return (
                <div
                  key={info.symbol}
                  onClick={() => handleSelect(info.symbol)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    {/* Symbol Icon */}
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${info.color}15`, border: `0.5px solid ${info.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 8, fontWeight: 900, color: info.color, fontFamily: 'var(--f-mono)' }}>{info.symbol.split('/')[0].slice(0, 2)}</span>
                    </div>
                    {/* Symbol Info */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{info.symbol}</div>
                      <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{info.name}</div>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div style={{ margin: '0 8px' }}>
                    <Sparkline changePercent={change} />
                  </div>

                  {/* Price + Change */}
                  <div style={{ textAlign: 'left', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    {price !== null ? (
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>
                        {price > 100 ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(price < 10 ? 4 : 2)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</div>
                    )}
                    <div style={{ fontSize: 9, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                      {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                    </div>
                  </div>

                  {/* Favorite */}
                  <button onClick={e => { e.stopPropagation(); toggleFav(info.symbol) }} style={{ width: 24, height: 24, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 }}>
                    <Star size={10} color={isFav ? '#FFB800' : 'rgba(255,255,255,0.15)'} fill={isFav ? '#FFB800' : 'none'} />
                  </button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
