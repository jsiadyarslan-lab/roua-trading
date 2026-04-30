'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { 
  ArrowRight, TrendingUp, TrendingDown, Zap, X, 
  Target, ShieldAlert, Link2 
} from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })

const PAIRS = ['BTC/USD', 'ETH/USD', 'GOLD', 'EUR/USD', 'GBP/USD', 'SOL/USD']
const TIMEFRAMES_DISPLAY = ['1m', '5m', '15m', '1h', '4h', '1D']

export default function MobileChartPage() {
  const router = useRouter()
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)

  // Order States
  const [showOrderSheet, setShowOrderSheet] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [tpValue, setTpValue] = useState('')
  const [slValue, setSlValue] = useState('')

  const quoteKey = Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  )
  const livePrice = quoteKey ? Number(quotes[quoteKey]?.price) : 0
  const priceChange = quoteKey ? Number(quotes[quoteKey]?.changePercent ?? 0) : 0
  const isUp = priceChange >= 0

  return (
    <div style={{ position: 'absolute', inset: 0, paddingBottom: 80, background: '#000000', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 40 }}>

      {/* ── Header ── */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 10,
        background: 'rgba(11, 14, 20, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        zIndex: 20,
      }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <button onClick={() => router.back()} style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(255,255,255,0.07)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ArrowRight size={20} color="#FFFFFF" />
          </button>

          {/* Pair Tabs */}
          <div style={{ overflowX: 'auto', flex: 1 }} className="scrollbar-hide">
            <div style={{ display: 'flex', gap: 6, width: 'max-content', direction: 'ltr' }}>
              {PAIRS.map(p => (
                <button key={p} onClick={() => setSelectedSymbol(p)}
                  style={{
                    padding: '6px 14px', borderRadius: 10, border: 'none',
                    background: selectedSymbol === p ? '#00D4FF' : 'rgba(255,255,255,0.06)',
                    color: selectedSymbol === p ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: 12, fontWeight: 800,
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
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif" }}>السعر المباشر</span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3fb950', boxShadow: '0 0 8px #3fb950' }} className="animate-pulse" />
            </div>
            <motion.span 
              key={livePrice}
              initial={{ opacity: 0.8 }}
              animate={{ opacity: 1 }}
              style={{
                fontSize: 28, fontWeight: 900, color: '#FFFFFF',
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: -1
              }}>
              {livePrice ? livePrice.toLocaleString('en', { minimumFractionDigits: livePrice < 10 ? 4 : 2 }) : '—'}
            </motion.span>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8,
              background: isUp ? 'rgba(50,215,75,0.15)' : 'rgba(255,69,58,0.15)',
              marginBottom: 4
            }}>
              {isUp ? <TrendingUp size={12} color="#32D74B" strokeWidth={3} /> : <TrendingDown size={12} color="#FF453A" strokeWidth={3} />}
              <span style={{
                fontSize: 13, fontWeight: 800,
                color: isUp ? '#32D74B' : '#FF453A',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeframe Selector ── */}
      <div style={{ padding: '6px 12px', background: '#000000', borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }} className="scrollbar-hide">
          {TIMEFRAMES_DISPLAY.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              style={{
                padding: '6px 14px', borderRadius: 10, border: 'none',
                background: timeframe === tf ? 'rgba(0,212,255,0.12)' : 'transparent',
                color: timeframe === tf ? '#00D4FF' : 'rgba(255,255,255,0.3)',
                fontSize: 12, fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', direction: 'ltr' }}>
        <RouaChart
          currentPrice={livePrice}
          mobile={true}
          compact={true}
        />

        {/* ── Execution FAB ── */}
        <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 30 }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowOrderSheet(true)}
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00D4FF, #00A3FF)',
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(0, 212, 255, 0.4)',
            }}
          >
            <Zap size={28} color="#000000" strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>

      {/* ── Order Execution Sheet ── */}
      <AnimatePresence>
        {showOrderSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowOrderSheet(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
                background: 'rgba(28, 28, 30, 0.95)',
                backdropFilter: 'blur(40px) saturate(180%)',
                borderRadius: '28px 28px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.15)',
                padding: '12px 20px calc(24px + env(safe-area-inset-bottom))',
                direction: 'rtl'
              }}
            >
              <div className="flex justify-center mb-6">
                <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              <div className="flex items-center justify-between mb-6">
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>تنفيذ صفقة جديدة</h2>
                <button onClick={() => setShowOrderSheet(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
                  <X size={18} color="#FFFFFF" />
                </button>
              </div>

              {/* Side Selector */}
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 14, padding: 4, display: 'flex', marginBottom: 24, position: 'relative' }}>
                <motion.div
                  animate={{ x: orderSide === 'buy' ? 0 : '100%' }}
                  style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', bottom: 4, background: orderSide === 'buy' ? '#32D74B' : '#FF453A', borderRadius: 10, zIndex: 0 }}
                />
                <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>شراء</button>
                <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>بيع</button>
              </div>

              {/* Toggles */}
              <div className="space-y-4 mb-8">
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: '16px', border: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Target size={18} color="#32D74B" />
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>جني الأرباح (TP)</span>
                    </div>
                    <button onClick={() => setTpEnabled(!tpEnabled)} style={{ width: 46, height: 26, borderRadius: 13, background: tpEnabled ? '#32D74B' : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}>
                      <motion.div animate={{ x: tpEnabled ? 20 : 2 }} style={{ position: 'absolute', top: 3, left: 0, width: 20, height: 20, borderRadius: '50%', background: '#FFF' }} />
                    </button>
                  </div>
                  {tpEnabled && (
                    <div className="pt-4">
                      <input type="number" placeholder="سعر الهدف..." value={tpValue} onChange={(e) => setTpValue(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', color: '#FFF', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }} />
                    </div>
                  )}
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: '16px', border: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ShieldAlert size={18} color="#FF453A" />
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>وقف الخسارة (SL)</span>
                    </div>
                    <button onClick={() => setSlEnabled(!slEnabled)} style={{ width: 46, height: 26, borderRadius: 13, background: slEnabled ? '#FF453A' : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}>
                      <motion.div animate={{ x: slEnabled ? 20 : 2 }} style={{ position: 'absolute', top: 3, left: 0, width: 20, height: 20, borderRadius: '50%', background: '#FFF' }} />
                    </button>
                  </div>
                  {slEnabled && (
                    <div className="pt-4">
                      <input type="number" placeholder="سعر التوقف..." value={slValue} onChange={(e) => setSlValue(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', color: '#FFF', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }} />
                    </div>
                  )}
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowOrderSheet(false)}
                style={{ width: '100%', height: 54, borderRadius: 18, background: orderSide === 'buy' ? '#32D74B' : '#FF453A', color: '#000', fontSize: 17, fontWeight: 800, border: 'none', fontFamily: "'Cairo', sans-serif", boxShadow: orderSide === 'buy' ? '0 8px 24px rgba(50,215,75,0.3)' : '0 8px 24px rgba(255,69,58,0.3)' }}
              >
                تأكيد العملية
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
