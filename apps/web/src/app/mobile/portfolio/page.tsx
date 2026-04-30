'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Filter, X } from 'lucide-react'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useBotStore } from '@/hooks/useBotStore'

const fmt = (n: number) => Math.abs(n).toFixed(2)
const pct = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`

function Sparkline({ data, color }: { data: number[], color: string }) {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const w = 100, h = 36
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${pts.join(' L')} L${w},${h} L0,${h} Z`} fill="url(#pg)" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const MOCK_HISTORY = [
  { id: '1', symbol: 'BTC/USD', side: 'BUY', qty: 0.01, price: 68_200, pnl: 124.50, date: '2026-04-29', type: 'PAPER' },
  { id: '2', symbol: 'ETH/USD', side: 'SELL', qty: 0.5, price: 3_180, pnl: -45.20, date: '2026-04-29', type: 'PAPER' },
  { id: '3', symbol: 'GOLD', side: 'BUY', qty: 1, price: 2_320, pnl: 88.00, date: '2026-04-28', type: 'PAPER' },
  { id: '4', symbol: 'EUR/USD', side: 'SELL', qty: 1000, price: 1.085, pnl: -12.40, date: '2026-04-28', type: 'PAPER' },
  { id: '5', symbol: 'BTC/USD', side: 'BUY', qty: 0.005, price: 67_800, pnl: 62.30, date: '2026-04-27', type: 'PAPER' },
  { id: '6', symbol: 'SOL/USD', side: 'BUY', qty: 2, price: 172, pnl: 18.70, date: '2026-04-27', type: 'PAPER' },
  { id: '7', symbol: 'GBP/USD', side: 'SELL', qty: 500, price: 1.272, pnl: -8.10, date: '2026-04-26', type: 'LIVE' },
  { id: '8', symbol: 'ETH/USD', side: 'BUY', qty: 0.3, price: 3_050, pnl: 205.00, date: '2026-04-25', type: 'PAPER' },
]

export default function MobilePortfolioPage() {
  const { stats } = useBotStore()
  const { trades: openTrades } = usePaperTradesStore()
  const [filterSide, setFilterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL')
  const [showFilter, setShowFilter] = useState(false)

  const chartData = [500, 510, 505, 520, 515, 530, 518, 542, 539, 558, 570, 560, 575, 590, 602, 598, 615, 628, 640, 655, 642, 670, 658, 680, 695, 710, 698, 720, 738, 755]
  const totalAssets = 755.80
  const dailyChange = 2.4
  const totalPnl = MOCK_HISTORY.reduce((s, t) => s + t.pnl, 0)
  const wins = MOCK_HISTORY.filter(t => t.pnl >= 0).length
  const winRate = Math.round((wins / MOCK_HISTORY.length) * 100)
  const riskScore = 34

  const filtered = MOCK_HISTORY.filter(t => {
    if (filterSide !== 'ALL' && t.side !== filterSide) return false
    if (filterResult === 'WIN' && t.pnl < 0) return false
    if (filterResult === 'LOSS' && t.pnl >= 0) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0B0E14', direction: 'rtl', paddingBottom: 24 }}>

      {/* ── Header ── */}
      <div style={{ padding: '52px 16px 16px', background: 'linear-gradient(180deg, rgba(5,150,105,0.1), transparent)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>المحفظة</h1>
      </div>

      {/* ── Performance Card ── */}
      <div style={{ margin: '0 16px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '16px 18px' }}>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif" }}>إجمالي الأصول</p>
        <div className="flex items-end justify-between mt-1">
          <div>
            <p style={{ fontSize: 32, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
              ${totalAssets.toLocaleString('en', { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp size={12} color="#00FFA3" />
              <span style={{ fontSize: 12, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                +{dailyChange}% اليوم
              </span>
            </div>
          </div>
          <Sparkline data={chartData} color="#00FFA3" />
        </div>

        {/* Stats Row */}
        <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'إجمالي الربح', value: `+$${fmt(totalPnl)}`, color: totalPnl >= 0 ? '#00FFA3' : '#FF4757' },
            { label: 'نسبة الفوز', value: `${winRate}%`, color: '#00D4FF' },
            { label: 'عدد الصفقات', value: String(MOCK_HISTORY.length), color: '#FFB800' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk Card ── */}
      <div style={{ margin: '0 16px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '16px 18px' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif", marginBottom: 12 }}>تقييم المخاطر</p>
        <div className="flex items-center gap-4">
          <div style={{ position: 'relative', width: 64, height: 64 }}>
            <svg width={64} height={64} viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle cx="32" cy="32" r="28" fill="none"
                stroke={riskScore < 40 ? '#00FFA3' : riskScore < 70 ? '#FFB800' : '#FF4757'}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(riskScore / 100) * 176} 176`}
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>{riskScore}</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#00FFA3', fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>منخفض ✓</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>أكبر أصل: BTC (35%)</div>
            <div style={{ padding: '6px 10px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, color: '#d4af37', fontFamily: "'Cairo', sans-serif" }}>
                💡 AI: تنويع المحفظة بإضافة الفوركس
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Trade History ── */}
      <div style={{ margin: '0 16px' }}>
        <div className="flex items-center justify-between mb-3">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
            سجل الصفقات ({filtered.length})
          </p>
          <button
            onClick={() => setShowFilter(!showFilter)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 8,
              background: showFilter ? 'rgba(5,150,105,0.2)' : 'rgba(255,255,255,0.06)',
              border: 'none', color: showFilter ? '#059669' : 'rgba(255,255,255,0.5)',
            }}
          >
            <Filter size={12} />
            <span style={{ fontSize: 11, fontFamily: "'Cairo', sans-serif" }}>فلترة</span>
          </button>
        </div>

        {/* Filter Bar */}
        <AnimatePresence>
          {showFilter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', marginBottom: 12 }}
            >
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex gap-2 mb-2">
                  {(['ALL', 'BUY', 'SELL'] as const).map(s => (
                    <button key={s} onClick={() => setFilterSide(s)}
                      style={{
                        flex: 1, padding: '5px 0', borderRadius: 8, border: 'none',
                        background: filterSide === s ? '#059669' : 'rgba(255,255,255,0.06)',
                        color: filterSide === s ? '#fff' : 'rgba(255,255,255,0.4)',
                        fontSize: 11, fontFamily: "'Cairo', sans-serif",
                      }}>
                      {s === 'ALL' ? 'الكل' : s === 'BUY' ? 'شراء' : 'بيع'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {(['ALL', 'WIN', 'LOSS'] as const).map(r => (
                    <button key={r} onClick={() => setFilterResult(r)}
                      style={{
                        flex: 1, padding: '5px 0', borderRadius: 8, border: 'none',
                        background: filterResult === r ? (r === 'WIN' ? '#059669' : r === 'LOSS' ? '#FF4757' : '#059669') : 'rgba(255,255,255,0.06)',
                        color: filterResult === r ? '#fff' : 'rgba(255,255,255,0.4)',
                        fontSize: 11, fontFamily: "'Cairo', sans-serif",
                      }}>
                      {r === 'ALL' ? 'الكل' : r === 'WIN' ? 'رابحة' : 'خاسرة'}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trade List */}
        <div className="flex flex-col gap-2">
          {filtered.map((trade, i) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              style={{
                padding: '12px 14px', borderRadius: 14,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${trade.pnl >= 0 ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)'}`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
                    {trade.symbol}
                  </span>
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 5,
                    background: trade.side === 'BUY' ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)',
                    color: trade.side === 'BUY' ? '#00FFA3' : '#FF4757',
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                  }}>
                    {trade.side === 'BUY' ? 'شراء' : 'بيع'}
                  </span>
                  {trade.type === 'PAPER' && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, background: 'rgba(0,212,255,0.1)', color: '#00D4FF', fontFamily: 'monospace' }}>ورقي</span>
                  )}
                </div>
                <span style={{
                  fontSize: 14, fontWeight: 800,
                  color: trade.pnl >= 0 ? '#00FFA3' : '#FF4757',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {trade.pnl >= 0 ? '+' : '-'}${fmt(trade.pnl)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {trade.qty} @ ${trade.price.toLocaleString()}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif" }}>
                  {trade.date}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
