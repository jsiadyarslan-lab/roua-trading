'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type WhitespaceData, type Time } from 'lightweight-charts'
import { useDashboardStore } from '@/lib/dashboard-store'

const timeframes = [
  { label: '1د', value: '1m' },
  { label: '5د', value: '5m' },
  { label: '15د', value: '15m' },
  { label: '1س', value: '1h' },
  { label: '4س', value: '4h' },
  { label: '1ي', value: '1d' },
]

const indicatorToggles = ['RSI', 'MACD', 'BOLL']

// Generate mock candlestick data
function generateCandlestickData(): CandlestickData[] {
  const data: CandlestickData[] = []
  let basePrice = 67000
  const now = new Date()
  now.setHours(now.getHours() - 60)

  for (let i = 0; i < 60; i++) {
    const time = new Date(now.getTime() + i * 3600000)
    const open = basePrice + (Math.random() - 0.5) * 300
    const close = open + (Math.random() - 0.48) * 500
    const high = Math.max(open, close) + Math.random() * 200
    const low = Math.min(open, close) - Math.random() * 200
    basePrice = close

    data.push({
      time: Math.floor(time.getTime() / 1000) as Time,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
    })
  }
  return data
}

export default function TradingViewChart() {
  const { selectedPair } = useDashboardStore()
  const [activeTimeframe, setActiveTimeframe] = useState('1h')
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['RSI']))
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  const toggleIndicator = (label: string) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const initChart = useCallback(() => {
    if (!chartContainerRef.current) return

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d1520' },
        textColor: '#94a3b8',
        fontFamily: 'var(--font-mono)',
      },
      grid: {
        vertLines: { color: '#ffffff0f' },
        horzLines: { color: '#ffffff0f' },
      },
      crosshair: {
        vertLine: { color: '#0A84FF40', labelBackgroundColor: '#1a2332' },
        horzLine: { color: '#0A84FF40', labelBackgroundColor: '#1a2332' },
      },
      rightPriceScale: {
        borderColor: '#ffffff0f',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#ffffff0f',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    // Candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00FFC6',
      downColor: '#FF4D4D',
      borderUpColor: '#00FFC6',
      borderDownColor: '#FF4D4D',
      wickUpColor: '#00FFC6',
      wickDownColor: '#FF4D4D',
    })

    const data = generateCandlestickData()
    candleSeries.setData(data)
    seriesRef.current = candleSeries

    // Volume histogram (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    volumeSeries.setData(
      data.map((d) => ({
        time: d.time,
        value: Math.round(Math.random() * 1000000 + 500000),
        color: d.close >= d.open ? '#00FFC620' : '#FF4D4D20',
      }))
    )
    volumeRef.current = volumeSeries

    chart.timeScale().fitContent()

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(chartContainerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    const cleanup = initChart()
    return () => {
      cleanup?.()
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [initChart, selectedPair, activeTimeframe])

  // Type guard: WhitespaceData only has 'time', CandlestickData has OHLC
  const isCandle = (d: CandlestickData<Time> | WhitespaceData<Time>): d is CandlestickData<Time> => 'open' in d

  // Simulated live candle update
  useEffect(() => {
    const interval = setInterval(() => {
      if (!seriesRef.current) return
      const allData = seriesRef.current.data()
      const last = allData[allData.length - 1]
      if (!last || !isCandle(last)) return

      const newClose = last.close + (Math.random() - 0.5) * 100
      seriesRef.current.update({
        time: last.time,
        open: last.open,
        high: Math.max(last.high, newClose),
        low: Math.min(last.low, newClose),
        close: newClose,
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const currentData = seriesRef.current?.data()
  const lastCandle = currentData?.[currentData.length - 1]
  const prevCandle = currentData?.[currentData.length - 2]
  const currentPrice = (lastCandle && isCandle(lastCandle)) ? lastCandle.close : 0
  const prevClose = (prevCandle && isCandle(prevCandle)) ? prevCandle.close : 0
  const priceChange = currentPrice - prevClose
  const isPositive = priceChange >= 0

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100%', background: 'var(--bg-chart)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
      {/* Chart header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)', flexShrink: 0, minHeight: '40px' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', cursor: 'pointer', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
              {selectedPair}
            </button>
            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.06)' }} />
            <span className={`price text-lg font-bold ${isPositive ? 'positive' : 'negative'}`} style={{ textShadow: isPositive ? '0 0 16px rgba(0,255,198,0.33)' : '0 0 16px rgba(255,77,77,0.33)' }} dir="ltr">
              {(currentPrice as number)?.toLocaleString?.() ?? '—'}
            </span>
            <span
              style={{ fontSize: '9px', fontWeight: 700, background: isPositive ? 'var(--profit-bg)' : 'var(--loss-bg)', border: `1px solid ${isPositive ? 'var(--border-profit)' : 'var(--border-loss)'}`, color: isPositive ? 'var(--profit)' : 'var(--loss)', padding: '2px 7px', borderRadius: '5px', fontFamily: 'var(--font-mono)' }}
              dir="ltr"
            >
              {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{priceChange.toFixed(2)}
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

        {/* Indicators & drawing tools */}
        <div className="flex items-center gap-2">
          {indicatorToggles.map((ind) => (
            <button
              key={ind}
              className="px-2 py-1 text-[11px] rounded transition-colors"
              style={{
                background: activeIndicators.has(ind) ? 'var(--accent-bg)' : 'transparent',
                color: activeIndicators.has(ind) ? 'var(--accent)' : 'var(--text-muted)',
                border: activeIndicators.has(ind) ? '1px solid var(--accent-border)' : '1px solid transparent',
              }}
              onClick={() => toggleIndicator(ind)}
            >
              {ind}
            </button>
          ))}

          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

          {/* Drawing tools */}
          <div className="flex items-center gap-1">
            <button className="p-1 rounded transition-colors hover:bg-[var(--bg-active)]" style={{ color: 'var(--text-muted)' }} title="خط الاتجاه">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            <button className="p-1 rounded transition-colors hover:bg-[var(--bg-active)]" style={{ color: 'var(--text-muted)' }} title="فيبوناتشي">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7 Q5 2, 7 7 Q9 12, 12 7" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
            </button>
            <button className="p-1 rounded transition-colors hover:bg-[var(--bg-active)]" style={{ color: 'var(--text-muted)' }} title="خط تقاطع">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" /><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Chart canvas */}
      <div ref={chartContainerRef} className="flex-1 min-h-0" style={{ background: 'var(--bg-chart)' }} />

      {/* RSI indicator sub-chart */}
      {activeIndicators.has('RSI') && (
        <div className="h-16 border-t flex items-center px-4 gap-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-chart)' }}>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>RSI (14)</span>
          <span className="val-gold text-[10px] price">58.4</span>
          <div className="flex-1 flex items-center gap-1">
            {[30, 40, 50, 60, 70].map((level) => (
              <div key={level} className="flex-1 h-1 rounded-full" style={{ background: level <= 58 ? 'var(--warning)' : 'var(--bg-input)', opacity: level <= 58 ? 0.7 : 0.3 }} />
            ))}
          </div>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>30</span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>70</span>
        </div>
      )}
    </div>
  )
}
