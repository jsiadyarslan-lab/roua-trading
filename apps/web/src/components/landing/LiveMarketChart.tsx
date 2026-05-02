'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Activity } from 'lucide-react'

/* ── Types ── */
interface CandleData {
  time: string
  open: number
  high: number
  low: number
  close: number
}

/* ── Generate realistic OHLC data ── */
function generateCandleData(count: number): CandleData[] {
  const data: CandleData[] = []
  let basePrice = 67000
  const now = new Date()

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getTime() - (count - i) * 3600000)
    const volatility = 0.003 + Math.random() * 0.005
    const drift = (Math.random() - 0.48) * volatility

    const open = basePrice
    const change = open * drift
    const close = open + change
    const wick = Math.abs(change) * (0.5 + Math.random() * 1.5)
    const high = Math.max(open, close) + wick
    const low = Math.min(open, close) - wick * (0.3 + Math.random() * 0.7)

    basePrice = close

    data.push({
      time: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
    })
  }

  return data
}

/* ── Chart Inner Component ── */
function ChartInner() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [lastPrice, setLastPrice] = useState(0)
  const [priceChange, setPriceChange] = useState(0)

  const initChart = useCallback(async () => {
    if (!containerRef.current) return

    const { createChart, ColorType, CandlestickSeries } = await import('lightweight-charts')

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const container = containerRef.current

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0f1a' },
        textColor: '#475569',
        fontFamily: 'var(--font-mono)',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.04)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(16, 185, 129, 0.2)', labelBackgroundColor: '#0f1722' },
        horzLine: { color: 'rgba(16, 185, 129, 0.2)', labelBackgroundColor: '#0f1722' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.06)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.06)',
        timeVisible: false,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    })

    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B98160',
      wickDownColor: '#EF444460',
    })

    seriesRef.current = candleSeries

    const initialData = generateCandleData(80)
    candleSeries.setData(initialData as any)

    const last = initialData[initialData.length - 1]
    const prev = initialData[initialData.length - 2]
    setLastPrice(last.close)
    setPriceChange(last.close - prev.close)

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        })
      }
    }

    resizeObserverRef.current = new ResizeObserver(handleResize)
    resizeObserverRef.current.observe(container)

    intervalRef.current = setInterval(() => {
      if (!seriesRef.current) return

      const lastData = initialData[initialData.length - 1]
      const volatility = 0.001 + Math.random() * 0.003
      const drift = (Math.random() - 0.48) * volatility
      const newClose = lastData.close * (1 + drift)
      const newHigh = Math.max(lastData.close, newClose) + Math.abs(newClose - lastData.close) * Math.random()
      const newLow = Math.min(lastData.close, newClose) - Math.abs(newClose - lastData.close) * Math.random()

      const updatedCandle = {
        time: lastData.time,
        open: lastData.open,
        high: Math.round(Math.max(lastData.high, newHigh) * 100) / 100,
        low: Math.round(Math.min(lastData.low, newLow) * 100) / 100,
        close: Math.round(newClose * 100) / 100,
      }

      seriesRef.current.update(updatedCandle as any)
      setLastPrice(updatedCandle.close)
      setPriceChange(updatedCandle.close - updatedCandle.open)
      initialData[initialData.length - 1] = updatedCandle
    }, 3000)
  }, [])

  useEffect(() => {
    initChart()

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect()
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [initChart])

  return (
    <div className="relative w-full h-[300px] md:h-[380px]">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}

/* ── Main Component ── */
export default function LiveMarketChart() {
  const [lastPrice, setLastPrice] = useState(67000)
  const [priceChange, setPriceChange] = useState(0)
  const priceUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let current = 67000
    priceUpdateRef.current = setInterval(() => {
      const drift = (Math.random() - 0.48) * 0.003
      current = current * (1 + drift)
      setLastPrice(Math.round(current * 100) / 100)
      setPriceChange(Math.round((current - 67000) * 100) / 100)
    }, 3000)

    return () => {
      if (priceUpdateRef.current) clearInterval(priceUpdateRef.current)
    }
  }, [])

  const isPositive = priceChange >= 0

  return (
    <section id="live-market" className="relative py-16 sm:py-20 px-4 sm:px-6 lg:px-8">
      {/* Section divider */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 max-w-xl"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.08), transparent)' }}
      />

      <div className="max-w-5xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-4"
            style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.12)',
              color: '#34D399',
              fontFamily: 'var(--font-en)',
            }}
          >
            LIVE MARKET
          </div>
          <h2
            className="text-xl sm:text-2xl font-bold text-white"
            style={{ fontFamily: 'var(--font-ar)' }}
          >
            تتبع السوق في الوقت الفعلي
          </h2>
        </div>

        {/* Chart card */}
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            background: '#0a0f1a',
            border: '1px solid rgba(148, 163, 184, 0.06)',
          }}
        >
          {/* Chart Header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b"
            style={{ borderColor: 'rgba(148, 163, 184, 0.06)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(16, 185, 129, 0.06)' }}
              >
                <Activity className="w-2.5 h-2.5" style={{ color: '#10B981' }} />
                <span
                  className="text-[9px] font-bold tracking-wider"
                  style={{ color: '#10B981', fontFamily: 'var(--font-brand)' }}
                >
                  LIVE
                </span>
                <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: '#10B981' }} />
              </div>

              <span
                className="text-xs font-bold"
                style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}
              >
                BTC/USD
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span
                className="text-sm font-bold"
                style={{
                  color: isPositive ? '#10B981' : '#EF4444',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-mono px-1.5 py-0"
                style={{
                  color: isPositive ? '#10B981' : '#EF4444',
                  borderColor: isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                  background: isPositive ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                }}
              >
                {isPositive ? '+' : ''}{priceChange.toFixed(2)}
              </Badge>
            </div>
          </div>

          {/* Chart */}
          <ChartInner />
        </div>
      </div>
    </section>
  )
}
