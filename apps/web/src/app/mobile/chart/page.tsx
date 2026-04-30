'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { 
  ChevronRight, TrendingUp, TrendingDown, Zap, X, 
  Target, ShieldAlert 
} from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { 
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
    </div>
  )
})

const PAIRS = ['BTC/USD', 'ETH/USD', 'GOLD', 'EUR/USD', 'GBP/USD', 'SOL/USD']

export default function MobileChartPage() {
  const router = useRouter()
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)

  const [showOrderSheet, setShowOrderSheet] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [tpValue, setTpValue] = useState('')
  const [slValue, setSlValue] = useState('')

  const quoteKey = (quotes && selectedSymbol) ? Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  ) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null

  return (
    <div style={{ position: 'absolute', inset: 0, paddingBottom: 80, background: '#000000', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 40 }}>

      {/* ── Minimalist Header ── */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
        paddingLeft: 12, paddingRight: 12, paddingBottom: 8,
        background: 'rgba(11, 14, 20, 0.9)',
        backdropFilter: 'blur(30px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        zIndex: 50,
      }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChevronRight size={20} color="#FFFFFF" />
          </button>

          {/* Pair Tabs - Now more compact */}
          <div style={{ overflowX: 'auto', flex: 1 }} className="scrollbar-hide">
            <div style={{ display: 'flex', gap: 6, width: 'max-content', direction: 'ltr' }}>
              {PAIRS.map(p => (
                <button key={p} onClick={() => setSelectedSymbol(p)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, border: 'none',
                    background: selectedSymbol === p ? '#00D4FF' : 'rgba(255,255,255,0.05)',
                    color: selectedSymbol === p ? '#000' : 'rgba(255,255,255,0.4)',
                    fontSize: 11, fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                    transition: '0.2s'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Chart Area ── */}
      <div style={{ 
        flex: 1, 
        margin: '8px 10px 10px', 
        borderRadius: 20,
        overflow: 'hidden',
        background: '#0B0E14',
        border: '0.5px solid rgba(255,255,255,0.08)',
        position: 'relative',
        direction: 'ltr',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        <RouaChart
          currentPrice={livePrice}
          mobile={true}
          compact={true}
        />

        {/* ── Compact Execution FAB ── */}
        <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 60 }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowOrderSheet(true)}
            style={{
              width: 50, height: 50, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00D4FF, #00A3FF)',
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(0, 212, 255, 0.4)',
            }}
          >
            <Zap size={24} color="#000000" strokeWidth={2.5} />
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
              style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
                background: 'rgba(28, 28, 30, 0.98)',
                backdropFilter: 'blur(50px) saturate(200%)',
                borderRadius: '24px 24px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.15)',
                padding: '12px 20px calc(24px + env(safe-area-inset-bottom))',
                direction: 'rtl',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)'
              }}
            >
              <div className="flex justify-center mb-6">
                <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col">
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>تنفيذ صفقة</h2>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
                </div>
                <button onClick={() => setShowOrderSheet(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
                  <X size={18} color="#FFFFFF" />
                </button>
              </div>

              {/* Side Selector */}
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 4, display: 'flex', marginBottom: 24, position: 'relative' }}>
                <motion.div
                  animate={{ x: orderSide === 'buy' ? 0 : '100%' }}
                  style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', bottom: 4, background: orderSide === 'buy' ? '#32D74B' : '#FF453A', borderRadius: 12, zIndex: 0 }}
                />
                <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>شراء</button>
                <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>بيع</button>
              </div>

              {/* TP / SL Toggles */}
              <div className="space-y-3 mb-8">
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
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="pt-4">
                      <input type="number" placeholder="سعر الهدف..." value={tpValue} onChange={(e) => setTpValue(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', color: '#FFF', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }} />
                    </motion.div>
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
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="pt-4">
                      <input type="number" placeholder="سعر التوقف..." value={slValue} onChange={(e) => setSlValue(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', color: '#FFF', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }} />
                    </motion.div>
                  )}
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowOrderSheet(false)}
                style={{ width: '100%', height: 56, borderRadius: 18, background: orderSide === 'buy' ? '#32D74B' : '#FF453A', color: '#000', fontSize: 17, fontWeight: 800, border: 'none', fontFamily: "'Cairo', sans-serif" }}
              >
                تأكيد الصفقة
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
