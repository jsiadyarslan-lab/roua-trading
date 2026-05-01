'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Activity } from 'lucide-react'

interface TickerItem {
  symbol: string
  price: number
  change: number
  changePercent: number
}

const TICKER_SYMBOLS = [
  'BTC/USDT',
  'ETH/USD',
  'SOL/USD',
  'AAPL',
  'TSLA',
  'EUR/USD',
  'XAU/USD',
  'SPX',
  'BNB/USD',
  'NVDA',
]

const MOCK_TICKER: TickerItem[] = [
  { symbol: 'BTC/USDT', price: 67234.5, change: 1234.56, changePercent: 1.87 },
  { symbol: 'ETH/USD', price: 3521.8, change: 45.2, changePercent: 1.3 },
  { symbol: 'SOL/USD', price: 178.45, change: -3.2, changePercent: -1.76 },
  { symbol: 'AAPL', price: 189.84, change: 1.23, changePercent: 0.65 },
  { symbol: 'TSLA', price: 248.42, change: 5.67, changePercent: 2.33 },
  { symbol: 'EUR/USD', price: 1.0862, change: 0.0012, changePercent: 0.11 },
  { symbol: 'XAU/USD', price: 2345.6, change: 12.4, changePercent: 0.53 },
  { symbol: 'SPX', price: 5234.18, change: 28.5, changePercent: 0.55 },
  { symbol: 'BNB/USD', price: 612.3, change: -8.4, changePercent: -1.35 },
  { symbol: 'NVDA', price: 878.35, change: 15.7, changePercent: 1.82 },
]

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(2)
  return price.toFixed(4)
}

export default function DataPulseTicker() {
  const [tickerData, setTickerData] = useState<TickerItem[]>(MOCK_TICKER)
  const [isLive, setIsLive] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const positionRef = useRef(0)

  const fetchQuotes = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        TICKER_SYMBOLS.map((symbol) =>
          fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)
            .then((r) => r.json())
            .then((d) => d?.data)
        )
      )

      const items: TickerItem[] = results.map((result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          const d = result.value
          return {
            symbol: TICKER_SYMBOLS[i],
            price: d.price ?? MOCK_TICKER[i].price,
            change: d.change ?? 0,
            changePercent: d.changePercent ?? 0,
          }
        }
        return MOCK_TICKER[i]
      })

      setTickerData(items)
      setIsLive(true)
    } catch {
      setIsLive(false)
    }
  }, [])

  // Fetch on mount and every 10s
  useEffect(() => {
    fetchQuotes()
    const interval = setInterval(fetchQuotes, 10000)
    return () => clearInterval(interval)
  }, [fetchQuotes])

  // Infinite scroll animation
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return

    const contentWidth = scrollEl.scrollWidth / 2 // duplicated content
    const speed = 0.5 // pixels per frame

    const animate = () => {
      positionRef.current -= speed
      if (Math.abs(positionRef.current) >= contentWidth) {
        positionRef.current = 0
      }
      scrollEl.style.transform = `translateX(${positionRef.current}px)`
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [tickerData])

  // Duplicate items for seamless loop
  const displayItems = [...tickerData, ...tickerData]

  return (
    <div
      className="relative w-full overflow-hidden border-b"
      style={{
        background: 'rgba(5, 13, 26, 0.9)',
        borderColor: 'rgba(59, 130, 246, 0.15)',
      }}
    >
      {/* Left gradient mask */}
      <div
        className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, transparent, #050D1A)' }}
      />
      {/* Right gradient mask */}
      <div
        className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent, #050D1A)' }}
      />

      <div className="flex items-center h-10">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-4 shrink-0 border-l" style={{ borderColor: 'rgba(59, 130, 246, 0.15)' }}>
          <Activity className="w-3 h-3" style={{ color: '#3B82F6' }} />
          <span className="text-[10px] font-semibold tracking-wider" style={{ color: '#3B82F6', fontFamily: 'var(--font-brand)' }}>
            LIVE
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: isLive ? '#10B981' : '#EF4444' }}
          />
        </div>

        {/* Scrolling ticker */}
        <div className="flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            className="flex items-center gap-6 whitespace-nowrap"
            style={{ willChange: 'transform' }}
          >
            {displayItems.map((item, idx) => {
              const isPositive = item.changePercent >= 0
              const color = isPositive ? '#10B981' : '#EF4444'
              const arrow = isPositive ? '▲' : '▼'

              return (
                <div key={`${item.symbol}-${idx}`} className="flex items-center gap-2 px-2">
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: '#94A3B8', fontFamily: 'var(--font-mono)' }}
                  >
                    {item.symbol}
                  </span>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: '#E5E7EB', fontFamily: 'var(--font-mono)' }}
                  >
                    {formatPrice(item.price)}
                  </span>
                  <span
                    className="text-[10px] flex items-center gap-0.5"
                    style={{ color, fontFamily: 'var(--font-mono)' }}
                  >
                    {arrow} {Math.abs(item.changePercent).toFixed(2)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
