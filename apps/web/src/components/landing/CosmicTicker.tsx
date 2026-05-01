'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'

// ── Types ──
interface TickerItem {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

// ── Static fallback data ──
const PLACEHOLDER_DATA: TickerItem[] = [
  { symbol: 'BTC/USDT', name: 'BTC/USDT', price: 95000, change: 1200, changePercent: 1.28 },
  { symbol: 'ETH/USDT', name: 'ETH/USDT', price: 1800, change: -15.4, changePercent: -0.85 },
  { symbol: 'XAU/USD', name: 'XAU/USD', price: 3350, change: 22.5, changePercent: 0.68 },
  { symbol: 'EUR/USD', name: 'EUR/USD', price: 1.085, change: 0.002, changePercent: 0.18 },
  { symbol: 'AAPL', name: 'AAPL', price: 205, change: 3.2, changePercent: 1.59 },
  { symbol: 'SOL/USDT', name: 'SOL/USDT', price: 150, change: -2.8, changePercent: -1.83 },
  { symbol: 'GBP/USD', name: 'GBP/USD', price: 1.272, change: 0.001, changePercent: 0.08 },
  { symbol: 'NVDA', name: 'NVDA', price: 110, change: 4.5, changePercent: 4.27 },
]

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'XAU/USD', 'EUR/USD', 'AAPL', 'SOL/USDT', 'GBP/USD', 'NVDA']

// ── Format price based on magnitude ──
function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(2)
  return price.toFixed(4)
}

// ── Format change percent ──
function formatChangePercent(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

// ── Single ticker entry ──
function TickerEntry({ item }: { item: TickerItem }) {
  const isPositive = item.changePercent >= 0

  return (
    <div className="flex shrink-0 items-center gap-3 px-5 py-1.5" dir="ltr">
      {/* Symbol name */}
      <span className="whitespace-nowrap text-sm font-semibold text-white/90">{item.symbol}</span>

      {/* Divider dot */}
      <span className="h-1 w-1 rounded-full bg-white/20" />

      {/* Price */}
      <span className="whitespace-nowrap text-sm font-medium text-white/70">{formatPrice(item.price)}</span>

      {/* Change percentage */}
      <span
        className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold ${
          isPositive
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-red-500/15 text-red-400'
        }`}
      >
        {formatChangePercent(item.changePercent)}
      </span>
    </div>
  )
}

export default function CosmicTicker() {
  const [tickerData, setTickerData] = useState<TickerItem[]>(PLACEHOLDER_DATA)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch a single quote ──
  const fetchQuote = useCallback(async (symbol: string): Promise<TickerItem | null> => {
    try {
      // Convert symbol for API path: BTC/USDT → BTC/USDT (URL-encoded slash)
      const encoded = encodeURIComponent(symbol)
      const res = await fetch(`/api/exchange/quote/${encoded}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) return null

      const json = await res.json()
      if (!json.success || !json.data) return null

      const d = json.data
      return {
        symbol,
        name: d.name || symbol,
        price: parseFloat(String(d.price)) || 0,
        change: parseFloat(String(d.change)) || 0,
        changePercent: parseFloat(String(d.changePercent)) || 0,
      }
    } catch {
      return null
    }
  }, [])

  // ── Fetch all quotes ──
  const fetchAllQuotes = useCallback(async () => {
    const results = await Promise.allSettled(
      SYMBOLS.map((symbol) => fetchQuote(symbol))
    )

    const items: TickerItem[] = []
    let hasAnyRealData = false

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value && result.value.price > 0) {
        items.push(result.value)
        hasAnyRealData = true
      } else {
        // Fallback to placeholder for this symbol
        items.push(PLACEHOLDER_DATA[index])
      }
    })

    setTickerData(hasAnyRealData ? items : PLACEHOLDER_DATA)
  }, [fetchQuote])

  // ── Initial fetch + 30s refresh ──
  useEffect(() => {
    // Defer initial fetch to avoid synchronous setState in effect body
    const initialRaf = requestAnimationFrame(() => {
      fetchAllQuotes()
    })

    intervalRef.current = setInterval(() => {
      fetchAllQuotes()
    }, 30_000)

    return () => {
      cancelAnimationFrame(initialRaf)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchAllQuotes])

  // ── Duplicate items for seamless infinite scroll ──
  // We repeat the list 4 times to ensure no gap is visible
  const duplicated = [...tickerData, ...tickerData, ...tickerData, ...tickerData]

  // ── Animation duration based on item count ──
  const duration = tickerData.length * 5 // ~5 seconds per item

  return (
    <div
      className="relative z-50 w-full overflow-hidden backdrop-blur-md bg-black/50 border-b border-white/5"
      dir="ltr"
    >
      {/* Left fade mask */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-20 bg-gradient-to-r from-black/60 to-transparent" />
      {/* Right fade mask */}
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-20 bg-gradient-to-l from-black/60 to-transparent" />

      <motion.div
        className="flex"
        initial={{ x: 0 }}
        animate={{ x: `-${100 / 4}%` }}
        transition={{
          x: {
            duration,
            repeat: Infinity,
            ease: 'linear',
            repeatType: 'loop',
          },
        }}
      >
        {duplicated.map((item, index) => (
          <TickerEntry
            key={`${item.symbol}-${index}`}
            item={item}
          />
        ))}
      </motion.div>
    </div>
  )
}
