'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, Maximize2, TrendingUp, TrendingDown } from 'lucide-react'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D', '1W']
const PAIRS = ['BTC/USD', 'ETH/USD', 'GOLD', 'EUR/USD', 'GBP/USD']

export default function MobileChartPage() {
  const router = useRouter()
  const [selectedTF, setSelectedTF] = useState('1h')
  const [selectedPair, setSelectedPair] = useState('BTC/USD')
  const price = 69_420.5
  const change = 2.4

  return (
    <div style={{ height: '100vh', background: '#0B0E14', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top Bar ── */}
      <div style={{
        paddingTop: 52,
        padding: '52px 16px 10px',
        background: 'rgba(0,0,0,0.5)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        zIndex: 10,
      }}>
        <div className="flex items-center justify-between" dir="rtl">
          {/* Back */}
          <button onClick={() => router.back()} style={{ padding: 6 }}>
            <ArrowRight size={20} color="rgba(255,255,255,0.6)" />
          </button>

          {/* Pair Selector */}
          <div style={{ overflowX: 'auto' }} className="scrollbar-hide">
            <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
              {PAIRS.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPair(p)}
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    background: selectedPair === p ? '#059669' : 'rgba(255,255,255,0.06)',
                    border: 'none',
                    fontSize: 12, fontWeight: 700,
                    color: selectedPair === p ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button style={{ padding: 6, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
            <Maximize2 size={16} color="rgba(255,255,255,0.4)" />
          </button>
        </div>

        {/* Price + Change */}
        <div className="flex items-center gap-3 mt-2" dir="rtl">
          <span style={{ fontSize: 26, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
            ${price.toLocaleString('en', { minimumFractionDigits: 2 })}
          </span>
          <div className="flex items-center gap-1" style={{
            padding: '3px 8px', borderRadius: 6,
            background: change >= 0 ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)',
          }}>
            {change >= 0 ? <TrendingUp size={12} color="#00FFA3" /> : <TrendingDown size={12} color="#FF4757" />}
            <span style={{ fontSize: 12, fontWeight: 700, color: change >= 0 ? '#00FFA3' : '#FF4757', fontFamily: "'JetBrains Mono', monospace" }}>
              {change >= 0 ? '+' : ''}{change}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Timeframe Bar ── */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 12px',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        overflowX: 'auto',
      }} className="scrollbar-hide">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => setSelectedTF(tf)}
            style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: selectedTF === tf ? 'rgba(5,150,105,0.2)' : 'transparent',
              color: selectedTF === tf ? '#059669' : 'rgba(255,255,255,0.4)',
              fontSize: 12, fontWeight: selectedTF === tf ? 700 : 400,
              fontFamily: "'JetBrains Mono', monospace",
              borderBottom: selectedTF === tf ? '2px solid #059669' : '2px solid transparent',
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* ── Chart Area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Placeholder chart visual */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <svg width="100%" height="100%" viewBox="0 0 360 400" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,300 C40,290 60,260 90,240 C120,220 140,240 170,200 C200,160 220,180 250,150 C280,120 300,130 330,100 C345,85 355,90 360,80 L360,400 L0,400 Z"
              fill="url(#chartGrad)"
            />
            <path
              d="M0,300 C40,290 60,260 90,240 C120,220 140,240 170,200 C200,160 220,180 250,150 C280,120 300,130 330,100 C345,85 355,90 360,80"
              fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round"
            />
            {/* Grid lines */}
            {[80, 160, 240, 320].map((y, i) => (
              <line key={i} x1="0" y1={y} x2="360" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}
          </svg>
          <div style={{ position: 'absolute', top: 12, left: 16, right: 16 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: "'Cairo', sans-serif", textAlign: 'center' }}>
              اربط TradingView لعرض الرسم البياني الكامل
            </p>
          </div>
        </div>

        {/* ── Floating Buy/Sell Buttons ── */}
        <div style={{
          position: 'absolute', bottom: 24, left: 16, right: 16,
          display: 'flex', gap: 12, zIndex: 10,
        }}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            style={{
              flex: 1, padding: '16px 0', borderRadius: 16,
              background: 'linear-gradient(135deg, #00C853, #00FFA3)',
              border: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: 800, color: '#0B0E14',
              fontFamily: "'Cairo', sans-serif",
              boxShadow: '0 4px 20px rgba(0,200,83,0.4)',
            }}
          >
            شراء ↑
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            style={{
              flex: 1, padding: '16px 0', borderRadius: 16,
              background: 'linear-gradient(135deg, #FF3B30, #FF6B6B)',
              border: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: 800, color: '#fff',
              fontFamily: "'Cairo', sans-serif",
              boxShadow: '0 4px 20px rgba(255,59,48,0.4)',
            }}
          >
            بيع ↓
          </motion.button>
        </div>
      </div>
    </div>
  )
}
