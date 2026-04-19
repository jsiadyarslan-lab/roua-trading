'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Info, Zap, ShieldAlert } from 'lucide-react'

interface ScannerRow {
  pair: string
  signal: 'BUY' | 'SELL'
  price: string
  score: number
  strength: number
  reason: string
}

const scannerData: ScannerRow[] = [
  { pair: 'EUR/USD', signal: 'BUY', price: '1.0847', score: 87, strength: 80, reason: 'EMA 9 عبر فوق EMA 21' },
  { pair: 'GBP/USD', signal: 'SELL', price: '1.2734', score: 72, strength: 60, reason: 'اختراق مستوى دعم رئيسي' },
  { pair: 'BTC/USD', signal: 'BUY', price: '67,234', score: 91, strength: 90, reason: 'نمط ابتلاعي صاعد مع حجم عالي' },
  { pair: 'ETH/USD', signal: 'BUY', price: '3,456', score: 68, strength: 60, reason: 'ارتداد من مستوى فيبوناتشي 61.8%' },
  { pair: 'XAU/USD', signal: 'SELL', price: '2,341', score: 55, strength: 50, reason: 'تباعد سلبي على RSI' },
]

function StrengthBar({ value }: { value: number }) {
  const bars = 10
  const filled = Math.round(value / 10)
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm"
          style={{
            height: `${8 + (i % 3) * 2}px`,
            background: i < filled ? (value >= 70 ? 'var(--profit)' : value >= 50 ? 'var(--warning)' : 'var(--loss)') : 'var(--bg-input)',
            opacity: i < filled ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  )
}

function ScoreBar({ value }: { value: number }) {
  const getColor = () => {
    if (value >= 80) return 'var(--profit)'
    if (value >= 60) return 'var(--warning)'
    return 'var(--loss)'
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
        <motion.div className="h-full rounded-full" style={{ background: getColor() }} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      </div>
      <span className="price text-[11px] font-medium" style={{ color: getColor() }}>{value}</span>
    </div>
  )
}

type RiskLevel = 'Low' | 'Medium' | 'High'
type StrategyType = 'Scalping' | 'Swing' | 'Momentum'

export default function SmartScanner() {
  const [botActive, setBotActive] = useState(true)
  const [strategy, setStrategy] = useState<StrategyType>('Swing')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Medium')
  const [loading, setLoading] = useState(false)

  // POST /api/signals/generate/:pair integration
  const generateSignals = async () => {
    setLoading(true)
    try {
      const pairs = ['BTC/USD', 'EUR/USD', 'GBP/USD']
      await Promise.all(
        pairs.map((pair) =>
          fetch(`/api/signals/generate/${encodeURIComponent(pair)}`, { method: 'POST' }).catch(() => null)
        )
      )
    } catch { /* silent */ }
    setLoading(false)
  }

  const strategies: StrategyType[] = ['Scalping', 'Swing', 'Momentum']
  const riskLevels: RiskLevel[] = ['Low', 'Medium', 'High']

  return (
    <div className="card flex flex-col overflow-hidden" style={{ height: '100%' }}>
      {/* AI Bot Card */}
      <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        {/* Row 1: Title + Status + P&L */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Bot size={16} style={{ color: 'var(--accent)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>Smart Scanner</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>500 إشارة</span>
            </div>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

            {/* Status */}
            <div className="flex items-center gap-1">
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: botActive ? 'var(--profit)' : 'var(--text-muted)' }}
                animate={{ opacity: botActive ? [1, 0.4, 1] : 0.5 }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-[10px]" style={{ color: botActive ? 'var(--profit)' : 'var(--text-muted)' }}>
                {botActive ? 'نشط' : 'متوقف'}
              </span>
            </div>
            <span className="price text-[10px]" style={{ color: 'var(--profit)' }}>+$340 (+0.34%)</span>
          </div>

          <button
            className="px-3 py-1 text-[10px] font-medium rounded-md transition-colors"
            style={{
              background: botActive ? 'var(--loss-bg)' : 'var(--profit-bg)',
              color: botActive ? 'var(--loss)' : 'var(--profit)',
              border: botActive ? '1px solid var(--border-loss)' : '1px solid var(--border-profit)',
            }}
            onClick={() => setBotActive(!botActive)}
          >
            {botActive ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>

        {/* Row 2: AI Analysis gauge + Strategy + Risk Level */}
        <div className="flex items-center gap-4">
          {/* Bullish/Bearish gauge */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px]" style={{ color: 'var(--profit)' }}>صعودي 72%</span>
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--loss-bg)' }}>
              <div className="h-full rounded-full" style={{ background: 'var(--profit)', width: '72%' }} />
            </div>
            <span className="text-[9px]" style={{ color: 'var(--loss)' }}>هبوطي 28%</span>
          </div>

          <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

          {/* Strategy Type */}
          <div className="flex items-center gap-1.5">
            <Zap size={11} style={{ color: 'var(--warning)' }} />
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>الاستراتيجية:</span>
            <div className="flex items-center gap-1">
              {strategies.map((s) => (
                <button
                  key={s}
                  className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: strategy === s ? 'var(--accent-bg)' : 'transparent',
                    color: strategy === s ? 'var(--accent)' : 'var(--text-muted)',
                    border: strategy === s ? '1px solid var(--accent-border)' : '1px solid transparent',
                  }}
                  onClick={() => setStrategy(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

          {/* Risk Level */}
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={11} style={{ color: 'var(--warning)' }} />
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>المخاطرة:</span>
            <div className="flex items-center gap-1">
              {riskLevels.map((r) => (
                <button
                  key={r}
                  className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: riskLevel === r ? (r === 'High' ? 'var(--loss-bg)' : r === 'Medium' ? 'var(--warning-bg)' : 'var(--profit-bg)') : 'transparent',
                    color: riskLevel === r ? (r === 'High' ? 'var(--loss)' : r === 'Medium' ? 'var(--warning)' : 'var(--profit)') : 'var(--text-muted)',
                    border: riskLevel === r ? '1px solid currentColor' : '1px solid transparent',
                  }}
                  onClick={() => setRiskLevel(r)}
                >
                  {r === 'Low' ? 'منخفضة' : r === 'Medium' ? 'متوسطة' : 'عالية'}
                </button>
              ))}
            </div>
          </div>

          {/* Refresh signals */}
          <button
            className="text-[9px] px-2 py-0.5 rounded-md transition-colors ml-auto"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
            onClick={generateSignals}
            disabled={loading}
          >
            {loading ? '⏳ جارٍ التحديث...' : '🔄 تحديث الإشارات'}
          </button>
        </div>
      </div>

      {/* Scanner table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Table header */}
        <div className="grid grid-cols-5 gap-2 px-4 py-2 text-[10px] font-medium border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>
          <span>الزوج</span>
          <span>الإشارة</span>
          <span>السعر</span>
          <span>النتيجة</span>
          <span>القوة</span>
        </div>

        {/* Table rows */}
        {scannerData.map((row, i) => (
          <motion.div
            key={row.pair}
            className="grid grid-cols-5 gap-2 px-4 py-2 items-center transition-colors hover:bg-[var(--bg-card-hover)] border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            {/* Pair */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{row.pair}</span>
              <div className="group relative">
                <Info size={11} style={{ color: 'var(--text-muted)' }} className="cursor-help" />
                <div
                  className="absolute bottom-full right-0 mb-1 px-2 py-1 rounded text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}
                >
                  {row.reason}
                </div>
              </div>
            </div>

            {/* Signal */}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded text-center w-fit"
              style={{
                background: row.signal === 'BUY' ? 'var(--profit-bg)' : 'var(--loss-bg)',
                color: row.signal === 'BUY' ? 'var(--profit)' : 'var(--loss)',
                border: row.signal === 'BUY' ? '1px solid var(--border-profit)' : '1px solid var(--border-loss)',
              }}
            >
              {row.signal === 'BUY' ? 'شراء' : 'بيع'}
            </span>

            {/* Price */}
            <span className="price text-xs" style={{ color: 'var(--text-main)' }}>{row.price}</span>

            {/* Score */}
            <ScoreBar value={row.score} />

            {/* Strength */}
            <StrengthBar value={row.strength} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
