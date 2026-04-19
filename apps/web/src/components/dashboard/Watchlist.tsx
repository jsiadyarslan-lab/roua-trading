'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { useDashboardStore } from '@/lib/dashboard-store'

interface WatchlistItem {
  symbol: string
  price: string
  change: number
  category: string
  sparkline: string
}

const defaultAssets: WatchlistItem[] = [
  { symbol: 'EUR/USD', price: '1.0847', change: 0.12, category: 'فوركس', sparkline: 'M0,15 L4,13 L8,14 L12,10 L16,12 L20,8 L24,9 L28,6' },
  { symbol: 'GBP/USD', price: '1.2734', change: -0.08, category: 'فوركس', sparkline: 'M0,8 L4,10 L8,9 L12,12 L16,11 L20,14 L24,13 L28,15' },
  { symbol: 'BTC/USD', price: '67,234', change: 2.41, category: 'كريبتو', sparkline: 'M0,18 L4,16 L8,14 L12,10 L16,8 L20,6 L24,4 L28,3' },
  { symbol: 'ETH/USD', price: '3,456', change: 1.87, category: 'كريبتو', sparkline: 'M0,16 L4,14 L8,12 L12,14 L16,10 L20,8 L24,6 L28,5' },
  { symbol: 'XAU/USD', price: '2,341', change: -0.34, category: 'معادن', sparkline: 'M0,8 L4,9 L8,7 L12,10 L16,12 L20,11 L24,13 L28,14' },
  { symbol: 'SPX500', price: '5,234', change: 0.56, category: 'مؤشرات', sparkline: 'M0,14 L4,12 L8,13 L12,10 L16,11 L20,9 L24,7 L28,6' },
  { symbol: 'NAS100', price: '18,567', change: 0.89, category: 'مؤشرات', sparkline: 'M0,16 L4,14 L8,12 L12,11 L16,9 L20,10 L24,7 L28,4' },
]

export default function Watchlist() {
  const { selectedPair, setSelectedPair } = useDashboardStore()
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['BTC/USD', 'XAU/USD']))

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(symbol)) {
        next.delete(symbol)
      } else {
        next.add(symbol)
      }
      return next
    })
  }

  const sortedAssets = useMemo(() => {
    return [...defaultAssets].sort((a, b) => {
      const aFav = favorites.has(a.symbol) ? 0 : 1
      const bFav = favorites.has(b.symbol) ? 0 : 1
      return aFav - bFav
    })
  }, [favorites])

  return (
    <div
      style={{ gridArea: 'watchlist' }}
      className="glass flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <Star size={16} style={{ color: 'var(--gold)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
            قائمة المراقبة
          </h2>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          {defaultAssets.length}
        </span>
      </div>

      {/* Asset list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sortedAssets.map((asset) => {
          const isSelected = selectedPair === asset.symbol
          const isPositive = asset.change >= 0
          const isFav = favorites.has(asset.symbol)

          return (
            <motion.div
              key={asset.symbol}
              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors"
              style={{
                background: isSelected ? 'var(--accent-bg)' : 'transparent',
                borderInlineStart: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              whileHover={{
                background: isSelected ? 'var(--accent-bg)' : 'var(--bg-card-hover)',
              }}
              onClick={() => setSelectedPair(asset.symbol)}
            >
              {/* Star / favorite */}
              <button
                className="shrink-0 p-0.5"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFavorite(asset.symbol)
                }}
              >
                <Star
                  size={12}
                  style={{
                    color: isFav ? 'var(--gold)' : 'var(--text-muted)',
                    fill: isFav ? 'var(--gold)' : 'transparent',
                  }}
                />
              </button>

              {/* Symbol info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}
                  >
                    {asset.symbol}
                  </span>
                  <span
                    className="text-[9px] px-1 py-0 rounded"
                    style={{ color: 'var(--text-muted)', background: 'var(--bg-input)' }}
                  >
                    {asset.category}
                  </span>
                </div>
                <span
                  className="price text-[11px]"
                  style={{ color: isPositive ? 'var(--profit)' : 'var(--loss)' }}
                >
                  {isPositive ? '+' : ''}{asset.change.toFixed(2)}%
                </span>
              </div>

              {/* Mini sparkline */}
              <svg width="28" height="18" className="shrink-0">
                <path
                  d={asset.sparkline}
                  fill="none"
                  stroke={isPositive ? 'var(--profit)' : 'var(--loss)'}
                  strokeWidth="1.5"
                />
              </svg>

              {/* Price */}
              <span
                className="price text-xs font-medium shrink-0"
                style={{ color: 'var(--text-main)' }}
              >
                {asset.price}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
