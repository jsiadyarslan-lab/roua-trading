'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })

const PAIRS = ['BTC/USD', 'ETH/USD', 'GOLD', 'EUR/USD', 'GBP/USD', 'SOL/USD']
const TIMEFRAMES_DISPLAY = ['1m', '5m', '15m', '1h', '4h', '1D']

export default function MobileChartPage() {
  const router = useRouter()
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)

  const quoteKey = Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  )
  const livePrice = quoteKey ? Number(quotes[quoteKey]?.price) : null
  const priceChange = quoteKey ? Number(quotes[quoteKey]?.changePercent ?? 0) : 0
  const isUp = priceChange >= 0

  return (
    <div style={{ height: 'calc(100dvh - 80px)', background: '#000000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        paddingTop: 52,
        padding: '52px 12px 8px',
        background: '#1C1C1E',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
        zIndex: 20,
      }}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()} style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.07)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ArrowRight size={18} color="#F0F2F5" />
          </button>

          {/* Pair Tabs */}
          <div style={{ overflowX: 'auto', flex: 1 }} className="scrollbar-hide">
            <div style={{ display: 'flex', gap: 6, width: 'max-content', direction: 'ltr' }}>
              {PAIRS.map(p => (
                <button key={p} onClick={() => setSelectedSymbol(p)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    background: selectedSymbol === p
                      ? '#00D4FF'
                      : 'rgba(255,255,255,0.06)',
                    color: selectedSymbol === p ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: 11, fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                    boxShadow: selectedSymbol === p ? '0 4px 12px rgba(0,212,255,0.4)' : 'none',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Price Row */}
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-2">
            <span style={{
              fontSize: 24, fontWeight: 900, color: '#FFFFFF',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {livePrice ? livePrice.toLocaleString('en', { minimumFractionDigits: livePrice < 10 ? 4 : 2 }) : '—'}
            </span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8,
              background: isUp ? 'rgba(50,215,75,0.15)' : 'rgba(255,69,58,0.15)',
            }}>
              {isUp ? <TrendingUp size={12} color="#32D74B" strokeWidth={3} /> : <TrendingDown size={12} color="#FF453A" strokeWidth={3} />}
              <span style={{
                fontSize: 12, fontWeight: 800,
                color: isUp ? '#32D74B' : '#FF453A',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Timeframe */}
          <div style={{ display: 'flex', gap: 4 }}>
            {TIMEFRAMES_DISPLAY.map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                style={{
                  padding: '4px 8px', borderRadius: 6, border: 'none',
                  background: timeframe === tf ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: timeframe === tf ? '#00D4FF' : 'rgba(255,255,255,0.4)',
                  fontSize: 11, fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chart — full area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <RouaChart
          currentPrice={livePrice}
          mobile={true}
          compact={false}
        />

        {/* ── Floating Buy/Sell Buttons ── */}
        <div style={{
          position: 'absolute', bottom: 16, left: 12, right: 12,
          display: 'flex', gap: 10, zIndex: 30,
          pointerEvents: 'auto',
        }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            style={{
              flex: 1, height: 50, borderRadius: 16,
              background: '#32D74B',
              border: 'none', cursor: 'pointer',
              fontSize: 16, fontWeight: 800, color: '#000000',
              fontFamily: "'Cairo', sans-serif",
              boxShadow: '0 8px 24px rgba(50,215,75,0.3)',
            }}
          >
            شراء ↑
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            style={{
              flex: 1, height: 50, borderRadius: 16,
              background: '#FF453A',
              border: 'none', cursor: 'pointer',
              fontSize: 16, fontWeight: 800, color: '#FFFFFF',
              fontFamily: "'Cairo', sans-serif",
              boxShadow: '0 8px 24px rgba(255,69,58,0.3)',
            }}
          >
            بيع ↓
          </motion.button>
        </div>
      </div>
    </div>
  )
}
