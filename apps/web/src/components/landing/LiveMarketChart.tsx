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

    // Dynamic import of lightweight-charts (client only)
    const { createChart, ColorType } = await import('lightweight-charts')

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const container = containerRef.current

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0f1a' },
        textColor: '#64748B',
        fontFamily: 'var(--font-mono)',
      },
      grid: {
        vertLines: { color: 'rgba(59, 130, 246, 0.06)' },
        horzLines: { color: 'rgba(59, 130, 246, 0.06)' },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(59, 130, 246, 0.3)',
          labelBackgroundColor: '#1a2332',
        },
        horzLine: {
          color: 'rgba(59, 130, 246, 0.3)',
          labelBackgroundColor: '#1a2332',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(59, 130, 246, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(59, 130, 246, 0.1)',
        timeVisible: false,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    })

    chartRef.current = chart

    // Add candlestick series (v5 API)
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B98180',
      wickDownColor: '#EF444480',
    })

    seriesRef.current = candleSeries

    // Set initial data
    const initialData = generateCandleData(80)
    candleSeries.setData(initialData as any)

    // Update price display
    const last = initialData[initialData.length - 1]
    const prev = initialData[initialData.length - 2]
    setLastPrice(last.close)
    setPriceChange(last.close - prev.close)

    chart.timeScale().fitContent()

    // Handle resize
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

    // Auto-update every 3s
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

      // Update last data reference for next tick
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

  const isPositive = priceChange >= 0

  return (
    <div className="relative w-full h-[350px] md:h-[420px]">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}

/* ── Main Component ── */
export default function LiveMarketChart() {
  const [lastPrice, setLastPrice] = useState(67000)
  const [priceChange, setPriceChange] = useState(0)
  const priceUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Simulate price updates for header display
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
    <section className="relative py-20 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Glassmorphism card container */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(10, 15, 26, 0.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.05), 0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* Chart Header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: 'rgba(59, 130, 246, 0.1)' }}
          >
            <div className="flex items-center gap-3">
              {/* LIVE indicator */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                <Activity className="w-3 h-3" style={{ color: '#10B981' }} />
                <span className="text-[10px] font-bold tracking-wider" style={{ color: '#10B981', fontFamily: 'var(--font-brand)' }}>
                  LIVE
                </span>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#10B981' }} />
              </div>

              <span
                className="text-sm font-bold"
                style={{ color: '#E5E7EB', fontFamily: 'var(--font-mono)' }}
              >
                BTC/USD
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span
                className="text-lg font-bold"
                style={{
                  color: isPositive ? '#10B981' : '#EF4444',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <Badge
                variant="outline"
                className="text-[11px] font-mono px-2"
                style={{
                  color: isPositive ? '#10B981' : '#EF4444',
                  borderColor: isPositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                  background: isPositive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
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
