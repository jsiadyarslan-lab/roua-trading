'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type WhitespaceData, type Time } from 'lightweight-charts'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useHistoricalCandles, useSingleQuote } from '@/hooks/useMarketData'

const timeframes = [
  { label: '1د', value: '1min' },
  { label: '5د', value: '5min' },
  { label: '15د', value: '15min' },
  { label: '1س', value: '1h' },
  { label: '4س', value: '4h' },
  { label: '1ي', value: '1day' },
]

const indicatorToggles = ['RSI', 'MACD', 'BOLL']

// Fallback: generate realistic candles when API has no data
function generateFallbackCandles(pair: string): CandlestickData[] {
  const basePrice = pair.includes('BTC') ? 67000 : pair.includes('ETH') ? 3500 : pair.includes('EUR') ? 1.08 : pair.includes('GBP') ? 1.27 : pair.includes('XAU') ? 2340 : 100
  const data: CandlestickData[] = []
  const now = new Date()
  now.setHours(now.getHours() - 60)
  let price = basePrice

  for (let i = 0; i < 60; i++) {
    const time = new Date(now.getTime() + i * 3600000)
    const vol = basePrice * 0.005
    const open = price + (Math.random() - 0.5) * vol
    const close = open + (Math.random() - 0.48) * vol * 2
    const high = Math.max(open, close) + Math.random() * vol * 0.5
    const low = Math.min(open, close) - Math.random() * vol * 0.5
    price = close

    data.push({
      time: Math.floor(time.getTime() / 1000) as Time,
      open: Math.round(open * 10000) / 10000,
      high: Math.round(high * 10000) / 10000,
      low: Math.round(low * 10000) / 10000,
      close: Math.round(close * 10000) / 10000,
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

  // Real data from API
  const { candles: apiCandles } = useHistoricalCandles(selectedPair, activeTimeframe)
  const { quote: liveQuote } = useSingleQuote(selectedPair, 5000)

  const toggleIndicator = (label: string) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  // Build chart data: prefer API, then fallback
  const chartData = apiCandles.length > 0
    ? apiCandles
        .map((c) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number))
        .filter((d, i, arr) => i === 0 || (d.time as number) !== (arr[i - 1].time as number))
    : generateFallbackCandles(selectedPair)

  const volumeData = apiCandles.length > 0
    ? apiCandles
        .map((c) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
          value: c.volume,
          color: c.close >= c.open ? '#00FFC620' : '#FF4D4D20',
        }))
        .sort((a, b) => (a.time as number) - (b.time as number))
    : chartData.map((d) => ({
        time: d.time,
        value: Math.round(Math.random() * 1000000 + 500000),
        color: d.close >= d.open ? '#00FFC620' : '#FF4D4D20',
      }))

  const initChart = useCallback(() => {
    if (!chartContainerRef.current) return

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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00FFC6',
      downColor: '#FF4D4D',
      borderUpColor: '#00FFC6',
      borderDownColor: '#FF4D4D',
      wickUpColor: '#00FFC6',
      wickDownColor: '#FF4D4D',
    })
    seriesRef.current = candleSeries

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })
    volumeRef.current = volumeSeries

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

  // Initialize chart once
  useEffect(() => {
    const cleanup = initChart()
    return () => {
      cleanup?.()
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [initChart])

  // Set data when chartData changes
  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || chartData.length === 0) return

    seriesRef.current.setData(chartData)
    volumeRef.current.setData(volumeData)
    chartRef.current?.timeScale().fitContent()
  }, [chartData.length, selectedPair, activeTimeframe]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live tick update
  useEffect(() => {
    if (!seriesRef.current || !liveQuote?.price) return

    const allData = seriesRef.current.data()
    const last = allData[allData.length - 1]
    if (!last || !('open' in last)) return

    seriesRef.current.update({
      time: last.time,
      open: last.open,
      high: Math.max(last.high, liveQuote.price),
      low: Math.min(last.low, liveQuote.price),
      close: liveQuote.price,
    })
  }, [liveQuote?.price, liveQuote?.timestamp]) // eslint-disable-line react-hooks/exhaustive-deps

  // Current price display
  const currentPrice = liveQuote?.price ?? (chartData.length > 0 ? chartData[chartData.length - 1].close : 0)
  const priceChange = liveQuote?.change ?? 0
  const isPositive = priceChange >= 0

  const formatChartPrice = (price: number) => {
    if (!price) return '—'
    if (price > 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (price > 1) return price.toFixed(2)
    return price.toFixed(5)
  }

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
              {formatChartPrice(currentPrice)}
            </span>
            <span
              style={{ fontSize: '9px', fontWeight: 700, background: isPositive ? 'var(--profit-bg)' : 'var(--loss-bg)', border: `1px solid ${isPositive ? 'var(--border-profit)' : 'var(--border-loss)'}`, color: isPositive ? 'var(--profit)' : 'var(--loss)', padding: '2px 7px', borderRadius: '5px', fontFamily: 'var(--font-mono)' }}
              dir="ltr"
            >
              {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{priceChange.toFixed(2)}
            </span>
            {liveQuote?.source && (
              <span style={{ fontSize: '8px', fontWeight: 600, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '1px 5px', borderRadius: '4px' }}>
                {liveQuote.source}
              </span>
            )}
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
