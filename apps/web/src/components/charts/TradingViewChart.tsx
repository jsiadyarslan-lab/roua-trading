'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { useDashboardStore } from '@/lib/dashboard-store'

const timeframes = [
  { label: '1د', value: '1m' },
  { label: '5د', value: '5m' },
  { label: '15د', value: '15m' },
  { label: '1س', value: '1h' },
  { label: '4س', value: '4h' },
  { label: '1ي', value: '1d' },
]

const indicators = [
  { label: 'RSI', active: true },
  { label: 'MACD', active: false },
  { label: 'BOLL', active: false },
]

// Generate mock chart data
function generateChartData() {
  const data = []
  let basePrice = 67000
  for (let i = 0; i < 60; i++) {
    const change = (Math.random() - 0.48) * 500
    basePrice += change
    const high = basePrice + Math.random() * 300
    const low = basePrice - Math.random() * 300
    data.push({
      time: `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
      price: Math.round(basePrice * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
    })
  }
  return data
}

export default function TradingViewChart() {
  const { selectedPair } = useDashboardStore()
  const [activeTimeframe, setActiveTimeframe] = useState('1h')
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['RSI']))
  const chartData = useMemo(() => generateChartData(), [])

  const toggleIndicator = (label: string) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const currentPrice = chartData[chartData.length - 1]?.price ?? 0
  const prevPrice = chartData[chartData.length - 2]?.price ?? 0
  const priceChange = currentPrice - prevPrice
  const isPositive = priceChange >= 0

  return (
    <div
      style={{ gridArea: 'chart' }}
      className="flex flex-col overflow-hidden"
    >
      {/* Chart header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-chart)' }}
      >
        <div className="flex items-center gap-4">
          {/* Pair info */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              {selectedPair}
            </span>
            <span className="price text-lg font-bold" style={{ color: isPositive ? 'var(--profit)' : 'var(--loss)' }}>
              {currentPrice.toLocaleString()}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: isPositive ? 'var(--profit-bg)' : 'var(--loss-bg)',
                color: isPositive ? 'var(--profit)' : 'var(--loss)',
              }}
            >
              {isPositive ? '+' : ''}{priceChange.toFixed(2)}
            </span>
          </div>

          {/* Timeframe buttons */}
          <div className="flex items-center gap-1">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                className="px-2 py-1 text-[11px] rounded transition-colors"
                style={{
                  background: activeTimeframe === tf.value ? 'var(--accent-bg)' : 'transparent',
                  color: activeTimeframe === tf.value ? 'var(--accent)' : 'var(--text-muted)',
                  border: activeTimeframe === tf.value ? '1px solid var(--accent-border)' : '1px solid transparent',
                }}
                onClick={() => setActiveTimeframe(tf.value)}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Indicators & tools */}
        <div className="flex items-center gap-2">
          {indicators.map((ind) => (
            <button
              key={ind.label}
              className="px-2 py-1 text-[11px] rounded transition-colors"
              style={{
                background: activeIndicators.has(ind.label) ? 'var(--accent-bg)' : 'transparent',
                color: activeIndicators.has(ind.label) ? 'var(--accent)' : 'var(--text-muted)',
                border: activeIndicators.has(ind.label) ? '1px solid var(--accent-border)' : '1px solid transparent',
              }}
              onClick={() => toggleIndicator(ind.label)}
            >
              {ind.label}
            </button>
          ))}

          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

          {/* Drawing tools */}
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded transition-colors hover:bg-[var(--bg-card-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="خط الاتجاه"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              className="p-1 rounded transition-colors hover:bg-[var(--bg-card-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="فيبوناتشي"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7 Q5 2, 7 7 Q9 12, 12 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </button>
            <button
              className="p-1 rounded transition-colors hover:bg-[var(--bg-card-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="خط تقاطع"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0" style={{ background: 'var(--bg-chart)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              tickLine={false}
              interval={9}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              domain={['dataMin - 500', 'dataMax + 500']}
              tickFormatter={(v: number) => (v / 1000).toFixed(1) + 'K'}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-main)',
                boxShadow: 'var(--shadow-card)',
              }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(value: number) => [value.toLocaleString(), 'السعر']}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#priceGradient)"
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* RSI indicator sub-chart */}
      {activeIndicators.has('RSI') && (
        <div
          className="h-16 border-t"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-chart)' }}
        >
          <div className="flex items-center justify-between px-4 py-1">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              RSI (14)
            </span>
            <span className="text-[10px]" style={{ color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}>
              58.4
            </span>
          </div>
          <ResponsiveContainer width="100%" height={40}>
            <AreaChart data={chartData.map((d, i) => ({ ...d, rsi: 40 + Math.sin(i * 0.3) * 20 + Math.random() * 10 }))} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <Area
                type="monotone"
                dataKey="rsi"
                stroke="var(--warning)"
                strokeWidth={1}
                fill="transparent"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
