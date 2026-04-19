'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type WhitespaceData, type Time } from 'lightweight-charts'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useSingleQuote, useHistoricalCandles } from '@/hooks/useMarketData'

const timeframes = [
  { label: '1د', value: '1m' },
  { label: '5د', value: '5m' },
  { label: '15د', value: '15m' },
  { label: '1س', value: '1h' },
  { label: '4س', value: '4h' },
  { label: '1ي', value: '1d' },
]

const indicatorToggles = ['RSI', 'MACD', 'BOLL']

// Map our timeframe values to API interval values
function mapTimeframeToInterval(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1min', '5m': '5min', '15m': '15min',
    '1h': '1h', '4h': '4h', '1d': '1day',
  }
  return map[tf] || '1h'
}

export default function TradingViewChart() {
  const { selectedPair } = useDashboardStore()
  const [activeTimeframe, setActiveTimeframe] = useState('1h')
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['RSI']))
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Fetch real historical candles
  const { candles, loading: candlesLoading } = useHistoricalCandles(
    selectedPair,
    mapTimeframeToInterval(activeTimeframe)
  )

  // Fetch real-time quote for live price updates
  const { quote } = useSingleQuote(selectedPair, 5000)

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
        horxLine: { color: '#0A84FF40', labelBackgroundColor: '#1a2332' },
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

    seriesRef.current = candleSeries

    // Volume histogram (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    volumeRef.current = volumeSeries

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

  // Update chart data when candles or timeframe change
  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current) return

    if (candles.length > 0) {
      // Convert API candles to lightweight-charts format
      const candleData: CandlestickData[] = candles
        .filter(c => c.open > 0 || c.close > 0) // skip invalid candles
        .map(c => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number))

      if (candleData.length > 0) {
        seriesRef.current.setData(candleData)

        // Set volume data
        const volumeData = candles
          .filter(c => c.open > 0 || c.close > 0)
          .map(c => ({
            time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
            value: c.volume,
            color: c.close >= c.open ? '#00FFC620' : '#FF4D4D20',
          }))
          .sort((a, b) => (a.time as number) - (b.time as number))

        volumeRef.current.setData(volumeData)
        chartRef.current?.timeScale().fitContent()
      }
    }
  }, [candles, activeTimeframe])

  // Live price update: update the last candle with real-time price
  useEffect(() => {
    if (!quote || !seriesRef.current) return

    const allData = seriesRef.current.data()
    if (allData.length === 0) return

    const last = allData[allData.length - 1]
    if (!last || !('open' in last)) return

    // Update the last candle with the real-time close price
    seriesRef.current.update({
      time: last.time,
      open: last.open,
      high: Math.max(last.high, quote.price),
      low: Math.min(last.low, quote.price),
      close: quote.price,
    })
  }, [quote])

  // Re-init chart on timeframe change
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }
    const cleanup = initChart()
    return () => {
      cleanup?.()
    }
  }, [activeTimeframe, initChart])

  // Type guard
  const isCandle = (d: CandlestickData<Time> | WhitespaceData<Time>): d is CandlestickData<Time> => 'open' in d

  const currentData = seriesRef.current?.data()
  const lastCandle = currentData?.[currentData.length - 1]
  const prevCandle = currentData?.[currentData.length - 2]
  const currentPrice = (lastCandle && isCandle(lastCandle)) ? lastCandle.close : (quote?.price ?? 0)
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
              {currentPrice > 0 ? currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: currentPrice > 1000 ? 2 : 6 }) : '—'}
            </span>
            <span
              style={{ fontSize: '9px', fontWeight: 700, background: isPositive ? 'var(--profit-bg)' : 'var(--loss-bg)', border: `1px solid ${isPositive ? 'var(--border-profit)' : 'var(--border-loss)'}`, color: isPositive ? 'var(--profit)' : 'var(--loss)', padding: '2px 7px', borderRadius: '5px', fontFamily: 'var(--font-mono)' }}
              dir="ltr"
            >
              {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{priceChange.toFixed(2)}
            </span>
            {quote && (
              <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }} dir="ltr">
                via {quote.source}
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
