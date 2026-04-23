'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useSingleQuote, useHistoricalCandles } from '@/hooks/useMarketData'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'

const TIMEFRAMES = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
]

const CHART_TYPES = [
  { label: 'شموع', value: 'candle' },
  { label: 'خط', value: 'line' },
]

function mapTimeframeToInterval(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1min', '5m': '5min', '15m': '15min',
    '1h': '1h', '4h': '4h', '1d': '1day',
  }
  return map[tf] || '1h'
}

export default function ChartArea() {
  const {
    selectedPair,
    activeTimeframe,
    setActiveTimeframe,
    chartFullscreen,
    toggleChartFullscreen,
  } = useDashboardStore()

  const [chartType, setChartType] = useState<'candle' | 'line'>('candle')
  const [showIndicator, setShowIndicator] = useState(false)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const macdSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  const interval = mapTimeframeToInterval(activeTimeframe)
  const { candles, loading } = useHistoricalCandles(selectedPair, interval)
  const { quote } = useSingleQuote(selectedPair, 5000)

  // Positions
  const { positions } = usePositionsStore()
  const { trades: paperTrades } = usePaperTradesStore()
  const priceLinesRef = useRef<any[]>([])

  // Compute current price / change for header
  const currentPrice = quote?.price ?? 0
  const priceChange = quote?.change ?? 0
  const priceChangePct = quote?.changePercent ?? 0
  const isPositive = priceChange >= 0

  // Compute MACD-like data from candles
  const computeMACD = useCallback((candles: { close: number }[]) => {
    if (candles.length < 26) return []
    const closePrices = candles.map(c => c.close)
    const ema = (data: number[], period: number) => {
      const k = 2 / (period + 1)
      const result: number[] = [data[0]]
      for (let i = 1; i < data.length; i++) {
        result.push(data[i] * k + result[i - 1] * (1 - k))
      }
      return result
    }
    const ema12 = ema(closePrices, 12)
    const ema26 = ema(closePrices, 26)
    const macdLine = ema12.map((v, i) => v - ema26[i])
    const signalLine = ema(macdLine, 9)
    const histogram = macdLine.map((v, i) => v - signalLine[i])
    return histogram
  }, [])

  const initChart = useCallback(() => {
    if (!chartContainerRef.current) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const container = chartContainerRef.current
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'var(--bg)' },
        textColor: 'var(--text3)',
        fontFamily: 'var(--font-mono)',
      },
      grid: {
        vertLines: { color: 'rgba(77,158,255,0.04)' },
        horzLines: { color: 'rgba(77,158,255,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(77,158,255,0.25)', labelBackgroundColor: 'var(--bg4)' },
        horzLine: { color: 'rgba(77,158,255,0.25)', labelBackgroundColor: 'var(--bg4)' },
      },
      rightPriceScale: {
        borderColor: 'var(--border)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'var(--border)',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    if (chartType === 'candle') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00ff88',
        downColor: '#ff3355',
        borderUpColor: '#00ff88',
        borderDownColor: '#ff3355',
        wickUpColor: '#00ff88',
        wickDownColor: '#ff3355',
      })
      candleSeriesRef.current = candleSeries
      lineSeriesRef.current = null
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#4d9eff',
        lineWidth: 2,
      })
      lineSeriesRef.current = lineSeries
      candleSeriesRef.current = null
    }

    // Volume
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })
    volumeSeriesRef.current = volSeries

    // MACD line
    const macdLine = chart.addSeries(LineSeries, {
      color: '#4d9eff',
      lineWidth: 1,
      priceScaleId: 'macd',
    })
    macdLine.priceScale().applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
      visible: false,
    })
    macdSeriesRef.current = macdLine

    const handleResize = () => {
      if (container && chartRef.current) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        })
      }
    }
    const ro = new ResizeObserver(handleResize)
    ro.observe(container)

    return () => {
      ro.disconnect()
    }
  }, [chartType])

  // Init chart
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

  // Update candle data
  useEffect(() => {
    if (!candles.length) return

    const validCandles = candles.filter(c => c.open > 0 || c.close > 0)
    if (!validCandles.length) return

    const sortedCandles = [...validCandles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    if (candleSeriesRef.current) {
      const data: CandlestickData[] = sortedCandles.map(c => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      candleSeriesRef.current.setData(data)
    }

    if (lineSeriesRef.current) {
      const data = sortedCandles.map(c => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
        value: c.close,
      }))
      lineSeriesRef.current.setData(data)
    }

    if (volumeSeriesRef.current) {
      const volData = sortedCandles.map(c => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,85,0.12)',
      }))
      volumeSeriesRef.current.setData(volData)
    }

    chartRef.current?.timeScale().fitContent()
  }, [candles, chartType])

  // Draw Positions on Chart
  useEffect(() => {
    const series = candleSeriesRef.current || lineSeriesRef.current;
    if (!series) return;

    // Remove old lines
    priceLinesRef.current.forEach(pl => {
      try { series.removePriceLine(pl) } catch {}
    })
    priceLinesRef.current = []

    const allPositions = [
      ...positions.map(p => {
        const manualPt = paperTrades.find(pt => pt.symbol.replace('/', '') === p.symbol.replace('/', '') && pt.source === 'manual')
        return {
          ...p,
          id: p.rawSymbol,
          isPaper: false,
          entryTime: manualPt?.entryTime || null,
          tp: manualPt?.tp || null,
          sl: manualPt?.sl || null
        }
      }),
      ...paperTrades.filter(pt => pt.source === 'bot' || !positions.some(p => p.rawSymbol.replace('/', '') === pt.symbol.replace('/', ''))).map(p => ({
        ...p,
        isPaper: true
      }))
    ].filter(p => {
      const pSym = p.symbol || p.rawSymbol || '';
      return pSym.replace('/', '') === selectedPair.replace('/', '')
    })

    allPositions.forEach(p => {
      // Handle both Alpaca (avg_entry_price string) and Paper (entryPrice number)
      const entryPrice = p.isPaper ? p.entryPrice : parseFloat(p.avg_entry_price || p.avgEntryPrice || '0');
      const side = (p.side || '').toLowerCase();
      const isLong = side === 'long' || side === 'buy';
      const pnlColor = p.unrealizedPnl >= 0 ? '#00C853' : '#FF3B30';

      if (entryPrice && entryPrice > 0) {
        const entryLine = series.createPriceLine({
          price: entryPrice,
          color: isLong ? '#00C853' : '#FF3B30',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `Entry ${p.qty} (${p.isPaper ? 'Paper' : 'Real'})`,
        });
        priceLinesRef.current.push(entryLine)
      }

      if (p.tp) {
        const tpLine = series.createPriceLine({
          price: p.tp,
          color: '#00C853',
          lineWidth: 1,
          lineStyle: 3, // Dotted
          axisLabelVisible: true,
          title: 'TP',
        });
        priceLinesRef.current.push(tpLine)
      }

      if (p.sl) {
        const slLine = series.createPriceLine({
          price: p.sl,
          color: '#FF3B30',
          lineWidth: 1,
          lineStyle: 3, // Dotted
          axisLabelVisible: true,
          title: 'SL',
        });
        priceLinesRef.current.push(slLine)
      }
    })

  }, [positions, paperTrades, selectedPair, chartType, candles]) // re-run if series is re-created

  // Live price update
  useEffect(() => {
    if (!quote) return
    const series = candleSeriesRef.current || lineSeriesRef.current
    if (!series) return

    const allData = series.data()
    if (!allData.length) return
    const last = allData[allData.length - 1]
    if (!last) return

    if (candleSeriesRef.current && 'open' in last) {
      candleSeriesRef.current.update({
        time: last.time,
        open: last.open,
        high: Math.max(last.high, quote.price),
        low: Math.min(last.low, quote.price),
        close: quote.price,
      })
    } else if (lineSeriesRef.current) {
      lineSeriesRef.current.update({
        time: last.time,
        value: quote.price,
      })
    }
  }, [quote, chartType])

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: 'var(--bg)',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}
    >
      {/* Chart Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          minHeight: 36,
        }}
      >
        {/* Timeframe buttons */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setActiveTimeframe(tf.value)}
              className="px-2 py-0.5 rounded cursor-pointer"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: activeTimeframe === tf.value ? 700 : 500,
                background: activeTimeframe === tf.value ? 'var(--blue2)' : 'transparent',
                color: activeTimeframe === tf.value ? 'var(--blue)' : 'var(--text3)',
                border: activeTimeframe === tf.value ? '1px solid var(--border2)' : '1px solid transparent',
                transition: 'all 0.12s',
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Chart type + Indicator */}
        <div className="flex items-center gap-1">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value as 'candle' | 'line')}
              className="px-2 py-0.5 rounded cursor-pointer"
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '10px',
                fontWeight: chartType === ct.value ? 700 : 500,
                background: chartType === ct.value ? 'var(--blue2)' : 'transparent',
                color: chartType === ct.value ? 'var(--blue)' : 'var(--text3)',
                border: chartType === ct.value ? '1px solid var(--border2)' : '1px solid transparent',
                transition: 'all 0.12s',
              }}
            >
              {ct.label}
            </button>
          ))}
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />
          <button
            onClick={() => setShowIndicator(!showIndicator)}
            className="px-2 py-0.5 rounded cursor-pointer"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: showIndicator ? 700 : 500,
              background: showIndicator ? 'var(--blue2)' : 'transparent',
              color: showIndicator ? 'var(--blue)' : 'var(--text3)',
              border: showIndicator ? '1px solid var(--border2)' : '1px solid transparent',
              transition: 'all 0.12s',
            }}
          >
            MACD
          </button>
        </div>
      </div>

      {/* Chart Header: Symbol + Price + Buttons */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          minHeight: 34,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Symbol */}
          <button
            className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer"
            style={{
              background: 'var(--blue2)',
              border: '1px solid var(--border2)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 800,
              color: 'var(--blue)',
              letterSpacing: '0.04em',
            }}
            dir="ltr"
          >
            {selectedPair}
          </button>

          {/* Price */}
          <span
            className="price"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: isPositive ? 'var(--green)' : 'var(--red)',
              textShadow: isPositive
                ? '0 0 12px rgba(0,255,136,0.3)'
                : '0 0 12px rgba(255,51,85,0.3)',
            }}
            dir="ltr"
          >
            {currentPrice > 0
              ? currentPrice >= 100
                ? currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : currentPrice.toFixed(6)
              : '—'}
          </span>

          {/* Change badge */}
          {currentPrice > 0 && (
            <span
              className="price"
              style={{
                fontSize: '9px',
                fontWeight: 700,
                background: isPositive ? 'var(--green2)' : 'var(--red2)',
                border: `1px solid ${isPositive ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,85,0.2)'}`,
                color: isPositive ? 'var(--green)' : 'var(--red)',
                padding: '2px 6px',
                borderRadius: 4,
              }}
              dir="ltr"
            >
              {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{priceChangePct.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Buy/Sell/Fullscreen buttons */}
        <div className="flex items-center gap-1">
          <button
            className="px-3 py-1 rounded cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '10px',
              fontWeight: 700,
              background: 'var(--green2)',
              border: '1px solid rgba(0,255,136,0.2)',
              color: 'var(--green)',
            }}
          >
            شراء
          </button>
          <button
            className="px-3 py-1 rounded cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '10px',
              fontWeight: 700,
              background: 'var(--red2)',
              border: '1px solid rgba(255,51,85,0.2)',
              color: 'var(--red)',
            }}
          >
            بيع
          </button>
          <button
            onClick={toggleChartFullscreen}
            className="px-2 py-1 rounded cursor-pointer"
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              color: 'var(--text3)',
              fontSize: '10px',
            }}
            title="ملء الشاشة"
          >
            ⛶
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div
        ref={chartContainerRef}
        className="flex-1 min-h-0"
        style={{ background: 'var(--bg)' }}
      />

      {/* MACD Panel */}
      {showIndicator && (
        <div
          className="shrink-0 flex items-center px-3 gap-3"
          style={{
            height: 58,
            background: 'var(--bg2)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text3)',
              whiteSpace: 'nowrap',
            }}
          >
            MACD (12,26,9)
          </span>
          <div className="flex-1 flex items-center gap-0.5" dir="ltr">
            {(() => {
              const macdData = computeMACD(candles)
              const last20 = macdData.slice(-20)
              const maxAbs = Math.max(...last20.map(Math.abs), 0.01)
              return last20.map((v, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.min(Math.abs(v) / maxAbs * 100, 100)}%`,
                    minHeight: 2,
                    background: v >= 0 ? 'var(--green)' : 'var(--red)',
                    opacity: 0.6,
                    borderRadius: 1,
                    alignSelf: v >= 0 ? 'flex-end' : 'flex-start',
                  }}
                />
              ))
            })()}
          </div>
          <span
            className="price"
            style={{ fontSize: '10px', color: 'var(--blue)' }}
            dir="ltr"
          >
            {candles.length > 26
              ? computeMACD(candles).slice(-1)[0]?.toFixed(4) ?? '—'
              : '—'}
          </span>
        </div>
      )}
    </div>
  )
}
