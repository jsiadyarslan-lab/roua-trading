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
    <div style={{ height: '100dvh', background: '#0B0E14', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        paddingTop: 52,
        padding: '52px 12px 8px',
        background: 'rgba(11,14,20,0.95)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(42,49,60,0.8)',
        flexShrink: 0,
        zIndex: 20,
      }}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()} style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
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
                      ? 'linear-gradient(135deg, #059669, #00C853)'
                      : 'rgba(255,255,255,0.06)',
                    color: selectedSymbol === p ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontSize: 11, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                    boxShadow: selectedSymbol === p ? '0 2px 12px rgba(5,150,105,0.4)' : 'none',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Price Row */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-2">
            <span style={{
              fontSize: 24, fontWeight: 900, color: '#F0F2F5',
              fontFamily: "'JetBrains Mono', monospace",
              textShadow: isUp ? '0 0 12px rgba(0,255,163,0.3)' : '0 0 12px rgba(255,71,87,0.3)',
            }}>
              {livePrice ? livePrice.toLocaleString('en', { minimumFractionDigits: livePrice < 10 ? 4 : 2 }) : '—'}
            </span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8,
              background: isUp ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
              border: `1px solid ${isUp ? 'rgba(0,255,163,0.25)' : 'rgba(255,71,87,0.25)'}`,
            }}>
              {isUp ? <TrendingUp size={11} color="#00FFA3" /> : <TrendingDown size={11} color="#FF4757" />}
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: isUp ? '#00FFA3' : '#FF4757',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Timeframe */}
          <div style={{ display: 'flex', gap: 3 }}>
            {TIMEFRAMES_DISPLAY.map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                style={{
                  padding: '4px 8px', borderRadius: 6, border: 'none',
                  background: timeframe === tf ? 'rgba(5,150,105,0.25)' : 'transparent',
                  color: timeframe === tf ? '#059669' : 'rgba(255,255,255,0.35)',
                  fontSize: 10, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  borderBottom: timeframe === tf ? '2px solid #059669' : '2px solid transparent',
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
              flex: 1, height: 52, borderRadius: 14,
              background: 'linear-gradient(135deg, #059669 0%, #00C853 100%)',
              border: 'none', cursor: 'pointer',
              fontSize: 16, fontWeight: 900, color: '#fff',
              fontFamily: "'Cairo', sans-serif",
              boxShadow: '0 6px 24px rgba(5,150,105,0.5)',
              letterSpacing: 1,
            }}
          >
            شراء ↑
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            style={{
              flex: 1, height: 52, borderRadius: 14,
              background: 'linear-gradient(135deg, #DC2626 0%, #FF4757 100%)',
              border: 'none', cursor: 'pointer',
              fontSize: 16, fontWeight: 900, color: '#fff',
              fontFamily: "'Cairo', sans-serif",
              boxShadow: '0 6px 24px rgba(220,38,38,0.5)',
              letterSpacing: 1,
            }}
          >
            بيع ↓
          </motion.button>
        </div>
      </div>
    </div>
  )
}
