'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { SkeletonRow } from '@/components/mobile/Skeleton'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useRouter } from 'next/navigation'
import { Search, Flame, TrendingUp, TrendingDown, Star, ArrowUpDown, ChevronDown } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Markets Page with Sparklines
   Enhanced with mini charts, favorites, sorting & filters
   ═══════════════════════════════════════════════════════════════ */

const TABS = [
  { key: 'crypto', label: 'كريبتو' },
  { key: 'forex', label: 'فوركس' },
  { key: 'commodities', label: 'سلع' },
]

const FILTER_OPTIONS = [
  { key: 'all', label: 'الكل' },
  { key: 'gainers', label: 'صاعد' },
  { key: 'losers', label: 'هابط' },
]

const SORT_OPTIONS = [
  { key: 'default', label: 'افتراضي' },
  { key: 'change', label: 'التغير %' },
  { key: 'volume', label: 'الحجم' },
  { key: 'price', label: 'السعر' },
]

const SYMBOL_MAP: Record<string, string[]> = {
  crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'ADA/USD', 'DOGE/USD'],
  forex: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF'],
  commodities: ['XAU/USD'],
}

// ── Color map for symbol icons ──
const SYMBOL_COLORS: Record<string, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', XRP: '#23292F',
  BNB: '#F3BA2F', ADA: '#0033AD', DOGE: '#C2A633',
  EUR: '#003399', GBP: '#C8102E', JPY: '#BC002D',
  AUD: '#00008B', CHF: '#D52B1E', XAU: '#d4af37',
}

// ── Sparkline Data Generation ──
function generateSparkline(price: number, changePercent: number, points = 24): number[] {
  // Generate realistic price points based on current price and change %
  const startPrice = price / (1 + changePercent / 100)
  const data: number[] = []
  const volatility = Math.abs(changePercent) / 100 * price * 0.3

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1)
    // Linear interpolation from start to current with some noise
    const base = startPrice + (price - startPrice) * progress
    const noise = (Math.sin(i * 1.8 + price * 0.001) * 0.4 + Math.cos(i * 2.3 + price * 0.002) * 0.3) * volatility
    // Add a slight curve to make it look more natural
    const curve = Math.sin(progress * Math.PI) * volatility * 0.15 * (changePercent >= 0 ? 1 : -1)
    data.push(Math.max(base + noise + curve, 0))
  }
  // Last point should match current price exactly
  data[data.length - 1] = price
  return data
}

// ── SVG Sparkline Component ──
function Sparkline({ data, color, width = 60, height = 28 }: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const padding = 2

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding
    const y = height - padding - ((val - min) / range) * (height - padding * 2)
    return { x, y }
  })

  // Build smooth path using catmull-rom to bezier approximation
  let pathD = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  // Gradient fill path
  const fillPathD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`

  const gradientId = `spark-grad-${color.replace('#', '')}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPathD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Format helpers ──
function formatPrice(price: number): string {
  if (price > 100) return price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return price.toFixed(price < 10 ? 4 : 2)
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B'
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M'
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K'
  return vol.toFixed(0)
}

// ── Favorites hook (localStorage) ──
function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem('roua-favorites')
      if (stored) setFavorites(new Set(JSON.parse(stored)))
    } catch { /* ignore */ }
  }, [])

  const toggle = useCallback((sym: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(sym)) next.delete(sym)
      else next.add(sym)
      try { localStorage.setItem('roua-favorites', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  return { favorites, toggle }
}

export default function MobileMarketsPage() {
  const quotes = useMarketStore(s => s.quotes)
  const router = useRouter()
  const { favorites, toggle } = useFavorites()

  const [tab, setTab] = useState('crypto')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('default')
  const [showSort, setShowSort] = useState(false)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  const symbols = SYMBOL_MAP[tab] || []

  // Check if we have ANY quote data yet (for loading skeleton)
  const hasQuotes = Object.keys(quotes).length > 0

  // Build enriched symbol list with quote data
  const enriched = useMemo(() => {
    return symbols.map(sym => {
      const q = quotes[sym]
      return {
        sym,
        price: q?.price ?? null,
        changePercent: q?.changePercent ?? 0,
        high: q?.high ?? null,
        low: q?.low ?? null,
        volume: q?.volume ?? 0,
        isFavorite: favorites.has(sym),
      }
    })
  }, [symbols, quotes, favorites])

  // Apply search filter
  const searched = useMemo(() =>
    enriched.filter(s => s.sym.toLowerCase().includes(search.toLowerCase())),
    [enriched, search]
  )

  // Apply gainers/losers filter
  const filtered = useMemo(() => {
    if (filter === 'gainers') return searched.filter(s => s.changePercent > 0)
    if (filter === 'losers') return searched.filter(s => s.changePercent < 0)
    return searched
  }, [searched, filter])

  // Apply favorites filter
  const favFiltered = useMemo(() => {
    if (showFavoritesOnly) return filtered.filter(s => s.isFavorite)
    return filtered
  }, [filtered, showFavoritesOnly])

  // Apply sorting
  const sorted = useMemo(() => {
    const arr = [...favFiltered]
    switch (sortBy) {
      case 'change':
        return arr.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      case 'volume':
        return arr.sort((a, b) => b.volume - a.volume)
      case 'price':
        return arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      default:
        return arr
    }
  }, [favFiltered, sortBy])

  // Hot mover
  const hotMover = useMemo(() =>
    enriched.filter(x => x.price !== null).sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0],
    [enriched]
  )

  const currentSortLabel = SORT_OPTIONS.find(o => o.key === sortBy)?.label ?? 'افتراضي'

  return (
    <div className="r-page">
      <PageHeader title="الأسواق" subtitle="الأسعار المباشرة" />

      {/* Search */}
      <div style={{ padding: '0 var(--space-lg)', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '8px 12px', border: '0.5px solid rgba(255,255,255,0.06)' }}>
          <Search size={16} color="#8B92A8" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." style={{ flex: 1, background: 'none', border: 'none', color: '#FFF', fontSize: 13, fontFamily: 'var(--font-cairo)', outline: 'none' }} />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="r-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`r-tabs__item ${tab === t.key ? 'r-tabs__item--active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Filter + Sort Row */}
      <div style={{ padding: '4px var(--space-lg) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {/* Gainers/Losers Filter */}
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-cairo)',
                fontWeight: filter === f.key ? 800 : 500,
                color: filter === f.key ? '#FFF' : 'rgba(255,255,255,0.4)',
                background: filter === f.key ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                border: filter === f.key ? '0.5px solid rgba(0,212,255,0.2)' : '0.5px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                transition: 'all var(--duration-fast) var(--ease-out)',
              }}
            >
              {f.label}
            </button>
          ))}
          {/* Favorites toggle */}
          <button
            onClick={() => setShowFavoritesOnly(v => !v)}
            style={{
              padding: '4px 8px',
              borderRadius: 8,
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-cairo)',
              fontWeight: showFavoritesOnly ? 800 : 500,
              color: showFavoritesOnly ? '#FFB800' : 'rgba(255,255,255,0.4)',
              background: showFavoritesOnly ? 'rgba(255,183,0,0.12)' : 'rgba(255,255,255,0.03)',
              border: showFavoritesOnly ? '0.5px solid rgba(255,183,0,0.2)' : '0.5px solid rgba(255,255,255,0.04)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast) var(--ease-out)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Star size={10} fill={showFavoritesOnly ? '#FFB800' : 'none'} />
          </button>
        </div>

        {/* Sort dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowSort(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 8,
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-cairo)',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.04)',
              cursor: 'pointer',
            }}
          >
            <ArrowUpDown size={10} />
            <span>{currentSortLabel}</span>
            <ChevronDown size={10} />
          </button>
          {showSort && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 20,
              marginTop: 4,
              background: '#1A1D29',
              border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 4,
              minWidth: 100,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              {SORT_OPTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => { setSortBy(s.key); setShowSort(false) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left' as const,
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-cairo)',
                    fontWeight: sortBy === s.key ? 800 : 500,
                    color: sortBy === s.key ? '#00D4FF' : 'rgba(255,255,255,0.6)',
                    background: sortBy === s.key ? 'rgba(0,212,255,0.08)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hot mover */}
      {hotMover && !showFavoritesOnly && (
        <div style={{ margin: '8px var(--space-lg) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 10, background: 'rgba(255,183,0,0.04)', border: '0.5px solid rgba(255,183,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame size={11} color="#FFB800" /><span style={{ fontSize: 9, fontWeight: 800, color: '#FFB800', fontFamily: 'var(--font-cairo)' }}>أكثر حركة</span></div>
          <span style={{ fontSize: 10, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{hotMover.sym} {hotMover.changePercent >= 0 ? '+' : ''}{hotMover.changePercent.toFixed(2)}%</span>
        </div>
      )}

      {/* Market list */}
      <div style={{ marginTop: 8 }}>
        {!hasQuotes ? (
          // Show skeleton rows while market data is loading
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={`skel-${i}`} />)
        ) : (
        sorted.map(item => {
          const { sym, price, changePercent, high, low, volume, isFavorite } = item
          const isUp = changePercent >= 0
          const color = isUp ? '#32D74B' : '#FF453A'
          const base = sym.split('/')[0]
          const iconColor = SYMBOL_COLORS[base] || '#627EEA'

          // Generate sparkline data
          const sparkData = price !== null
            ? generateSparkline(price, changePercent)
            : null

          return (
            <Card key={sym} onClick={() => router.push(`/mobile/chart?symbol=${sym}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Symbol icon */}
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: `${iconColor}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 900,
                  color: iconColor,
                  fontFamily: 'var(--font-mono)',
                  border: `0.5px solid ${iconColor}30`,
                  flexShrink: 0,
                }}>
                  {base.slice(0, 2)}
                </div>

                {/* Symbol name + high/low */}
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{sym}</div>
                  {high !== null && low !== null && (
                    <div style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                      H: {formatPrice(high)} <span style={{ margin: '0 2px', opacity: 0.4 }}>·</span> L: {formatPrice(low)}
                    </div>
                  )}
                  {volume > 0 && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                      Vol: {formatVolume(volume)}
                    </div>
                  )}
                </div>

                {/* Sparkline */}
                <div style={{ flexShrink: 0, marginRight: 4 }}>
                  {sparkData && <Sparkline data={sparkData} color={color} />}
                </div>

                {/* Price + change */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
                  {price !== null ? (
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                      {formatPrice(price)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>—</div>
                  )}
                  {price !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>
                        {isUp ? '+' : ''}{changePercent.toFixed(2)}%
                      </span>
                      {isUp ? <TrendingUp size={10} color={color} /> : <TrendingDown size={10} color={color} />}
                    </div>
                  )}
                </div>

                {/* Favorite star */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggle(sym) }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                  aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                >
                  <Star
                    size={14}
                    fill={isFavorite ? '#FFB800' : 'none'}
                    color={isFavorite ? '#FFB800' : 'rgba(255,255,255,0.15)'}
                    style={{ transition: 'all var(--duration-fast) var(--ease-out)' }}
                  />
                </button>
              </div>
            </Card>
          )
        })
        )}
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'var(--font-cairo)',
          fontSize: 13,
        }}>
          {showFavoritesOnly ? 'لا توجد مفضلات بعد' : 'لا توجد نتائج'}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
