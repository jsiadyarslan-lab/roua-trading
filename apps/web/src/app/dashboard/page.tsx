'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries,
  type IChartApi, type ISeriesApi, type CandlestickData, type Time
} from 'lightweight-charts'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useMarketQuotes, useSingleQuote, useHistoricalCandles } from '@/hooks/useMarketData'

// ── Navigation Items ──
const NAV_ITEMS = [
  { section: 'الرئيسي', items: [
    { icon: '📊', label: 'لوحة التحكم', id: 'dashboard' },
    { icon: '💰', label: 'المحفظة', id: 'portfolio' },
  ]},
  { section: 'التحليل', items: [
    { icon: '🧠', label: 'الذكاء الاصطناعي', id: 'ai' },
    { icon: '📰', label: 'أخبار السوق', id: 'news' },
    { icon: '📅', label: 'التقويم', id: 'calendar' },
  ]},
  { section: 'التداول', items: [
    { icon: '⚗️', label: 'المختبر', id: 'lab' },
    { icon: '📋', label: 'نسخ الصفقات', id: 'copy' },
    { icon: '🤖', label: 'إدارة البوتات', id: 'bots' },
  ]},
]

const MARKET_PAIRS = {
  FX: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'],
  Crypto: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'],
  Metals: ['XAU/USD', 'XAG/USD'],
  Indices: ['AAPL', 'MSFT', 'TSLA'],
}

const TIMEFRAMES = [
  { label: '1m', value: '1m' }, { label: '5m', value: '5m' },
  { label: '15m', value: '15m' }, { label: '1H', value: '1h' },
  { label: '4H', value: '4h' }, { label: '1D', value: '1d' },
]

function mapTfToInterval(tf: string): string {
  const m: Record<string, string> = {
    '1m': '1min', '5m': '5min', '15m': '15min',
    '1h': '1h', '4h': '4h', '1d': '1day',
  }
  return m[tf] || '1h'
}

// ── Quantum Orb ──
function QuantumOrb({ changePercent }: { changePercent: number }) {
  const state = Math.abs(changePercent) < 0.3 ? 'calm'
    : changePercent > 2 ? 'strong'
    : changePercent > 0.5 ? 'bullish'
    : changePercent < -2 ? 'volatile'
    : changePercent < -0.5 ? 'bearish' : 'calm'

  const colors: Record<string, { main: string; glow: string; label: string }> = {
    calm: { main: '#4d9eff', glow: 'rgba(77,158,255,0.3)', label: 'هادئ' },
    bullish: { main: '#00ff88', glow: 'rgba(0,255,136,0.3)', label: 'صاعد' },
    bearish: { main: '#ff3355', glow: 'rgba(255,51,85,0.3)', label: 'هابط' },
    volatile: { main: '#ffaa00', glow: 'rgba(255,170,0,0.3)', label: 'متقلب' },
    strong: { main: '#a78bfa', glow: 'rgba(167,139,250,0.3)', label: 'قوي' },
  }
  const c = colors[state]

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 100, height: 100 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
          animation: 'orb-pulse 3s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 15, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${c.main}cc, ${c.main}66, #090b10)`,
          boxShadow: `0 0 20px ${c.glow}`,
        }} />
        <div style={{
          position: 'absolute', top: 22, left: 25, width: 20, height: 12,
          borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
          filter: 'blur(3px)',
        }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700,
            color: c.main, textShadow: `0 0 8px ${c.glow}`,
          }} dir="ltr">
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </span>
        </div>
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '10px', color: c.main,
        background: `${c.main}15`, padding: '2px 8px', borderRadius: '3px',
        border: `0.5px solid ${c.main}30`,
      }}>
        {c.label}
      </span>
    </div>
  )
}

// ── Main Dashboard ──
export default function QuantumDashboard() {
  const { selectedPair, setSelectedPair, sidebarCollapsed, toggleSidebar } = useDashboardStore()
  const [activeMarketTab, setActiveMarketTab] = useState<keyof typeof MARKET_PAIRS>('Crypto')
  const [activeTimeframe, setActiveTimeframe] = useState('1h')
  const [rightTab, setRightTab] = useState<'trade' | 'signals' | 'bot'>('trade')
  const [tradeDirection, setTradeDirection] = useState<'buy' | 'sell'>('buy')
  const [tradeSize, setTradeSize] = useState('0.01')
  const [tradeSL, setTradeSL] = useState('')
  const [tradeTP, setTradeTP] = useState('')
  const [tradeLeverage, setTradeLeverage] = useState('1')
  const [botEnabled, setBotEnabled] = useState(false)
  const [navActive, setNavActive] = useState('dashboard')

  // Real data hooks
  const allSymbols = Object.values(MARKET_PAIRS).flat()
  const { quotes } = useMarketQuotes(allSymbols, 6000)
  const { quote: currentQuote } = useSingleQuote(selectedPair, 5000)
  const { candles, loading: candlesLoading } = useHistoricalCandles(selectedPair, mapTfToInterval(activeTimeframe))

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ema12Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ema26Ref = useRef<ISeriesApi<'Line'> | null>(null)

  // Signal & position data from API
  const [signals, setSignals] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [news, setNews] = useState<any[]>([])

  // Fetch signals (graceful - won't crash if auth required)
  useEffect(() => {
    fetch('/api/signals/active')
      .then(r => {
        if (!r.ok) return null
        return r.json()
      })
      .then(d => { if (d?.success) setSignals(d.data || []) })
      .catch(() => {})
  }, [])

  // Fetch positions (graceful - won't crash if server error)
  useEffect(() => {
    fetch('/api/trading/positions')
      .then(r => {
        if (!r.ok) return null
        return r.json()
      })
      .then(d => { if (d?.data) setPositions(d.data || []) })
      .catch(() => {})
  }, [])

  // Fetch news feed
  useEffect(() => {
    fetch('/api/news/feed')
      .then(r => { if (!r.ok) return null; return r.json() })
      .then(d => { if (Array.isArray(d)) setNews(d) })
      .catch(() => {})
  }, [])

  // Init chart
  const initChart = useCallback(() => {
    if (!chartContainerRef.current) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#090b10' },
        textColor: '#3d5270',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(77,158,255,0.04)' },
        horzLines: { color: 'rgba(77,158,255,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(77,158,255,0.3)', labelBackgroundColor: '#131a28' },
        horzLine: { color: 'rgba(77,158,255,0.3)', labelBackgroundColor: '#131a28' },
      },
      rightPriceScale: {
        borderColor: 'rgba(77,158,255,0.10)',
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(77,158,255,0.10)',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff88',
      downColor: '#ff3355',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff3355',
      wickUpColor: '#00ff8880',
      wickDownColor: '#ff335580',
    })
    seriesRef.current = candleSeries

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
    volumeRef.current = volumeSeries

    // EMA12
    const ema12 = chart.addSeries(LineSeries, {
      color: '#4d9eff',
      lineWidth: 1,
      priceScaleId: 'right',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    ema12Ref.current = ema12

    // EMA26
    const ema26 = chart.addSeries(LineSeries, {
      color: '#ffaa00',
      lineWidth: 1,
      priceScaleId: 'right',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    ema26Ref.current = ema26

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }
    const ro = new ResizeObserver(handleResize)
    ro.observe(chartContainerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cleanup = initChart()
    return () => {
      cleanup?.()
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    }
  }, [initChart])

  // Update candles
  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || candles.length === 0) return

    const candleData: CandlestickData[] = candles
      .filter(c => c.open > 0 || c.close > 0)
      .map(c => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number))

    if (candleData.length > 0) {
      seriesRef.current.setData(candleData)
      const volData = candles.filter(c => c.open > 0 || c.close > 0).map(c => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,85,0.12)',
      })).sort((a, b) => (a.time as number) - (b.time as number))
      volumeRef.current.setData(volData)

      // Calculate EMAs
      const closes = candleData.map(c => c.close)
      const ema12Data = calcEMA(closes, 12, candleData)
      const ema26Data = calcEMA(closes, 26, candleData)
      if (ema12Ref.current) ema12Ref.current.setData(ema12Data)
      if (ema26Ref.current) ema26Ref.current.setData(ema26Data)

      chartRef.current?.timeScale().fitContent()
    }
  }, [candles])

  // Live price update
  useEffect(() => {
    if (!currentQuote || !seriesRef.current) return
    const allData = seriesRef.current.data()
    if (allData.length === 0) return
    const last = allData[allData.length - 1]
    if (!last || !('open' in last)) return
    seriesRef.current.update({
      time: last.time,
      open: last.open,
      high: Math.max(last.high, currentQuote.price),
      low: Math.min(last.low, currentQuote.price),
      close: currentQuote.price,
    })
  }, [currentQuote])

  // Reinit on timeframe change
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
      seriesRef.current = null
      volumeRef.current = null
      ema12Ref.current = null
      ema26Ref.current = null
    }
    const cleanup = initChart()
    return () => {
      cleanup?.()
    }
  }, [activeTimeframe, initChart])

  const price = currentQuote?.price ?? 0
  const change = currentQuote?.changePercent ?? 0
  const isPositive = change >= 0

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }} dir="rtl">

      {/* ═══ TOPBAR ═══ */}
      <div className="flex items-center h-[48px] px-4 gap-4 shrink-0" style={{ background: 'var(--bg2)', borderBottom: '0.5px solid var(--border)' }}>
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 900, color: 'var(--blue)' }}>QUANTUM_AI</span>
          <div className="pulse-live" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text3)' }}>مباشر</span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

        {/* Search */}
        <div className="relative" style={{ width: 340 }}>
          <input
            placeholder="بحث: مستخدمين، صفقات، أزواج..."
            className="w-full px-3 py-1.5 rounded text-[11px] outline-none"
            style={{ background: 'var(--bg4)', border: '0.5px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <div className="flex-1" />

        {/* System Health */}
        <div className="flex items-center gap-2">
          {['API', 'DB', 'WS'].map(label => (
            <div key={label} className="flex items-center gap-1">
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: label === 'WS' ? 'var(--amber)' : 'var(--green)', boxShadow: `0 0 4px ${label === 'WS' ? 'var(--amber)' : 'var(--green)'}` }} />
              <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Language Toggle */}
        <button style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '3px 8px', border: '0.5px solid var(--border2)', borderRadius: '3px', color: 'var(--text2)', background: 'transparent', cursor: 'pointer' }}>
          EN | AR
        </button>

        {/* Notifications */}
        <button className="relative" style={{ color: 'var(--text2)', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--red)', fontSize: '7px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' }}>3</span>
        </button>

        {/* Avatar */}
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, var(--blue), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
          ر
        </div>
      </div>

      {/* ═══ MAIN BODY ═══ */}
      <div className="flex flex-1 min-h-0">

        {/* ═══ SIDEBAR LEFT ═══ */}
        <div className="shrink-0 flex flex-col custom-scrollbar overflow-y-auto" style={{
          width: sidebarCollapsed ? 56 : 220,
          background: 'rgba(8,12,20,.95)',
          borderLeft: '0.5px solid var(--border)',
          backdropFilter: 'blur(20px)',
          transition: 'width 0.2s',
        }}>
          {/* Nav Sections */}
          {NAV_ITEMS.map(section => (
            <div key={section.section}>
              {!sidebarCollapsed && (
                <div className="px-4 pt-4 pb-1" style={{ fontSize: '9px', fontFamily: 'var(--font-ui)', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {section.section}
                </div>
              )}
              {section.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setNavActive(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-2 transition-colors"
                  style={{
                    background: navActive === item.id ? 'var(--blue3)' : 'transparent',
                    borderRight: navActive === item.id ? '2px solid var(--blue)' : '2px solid transparent',
                    color: navActive === item.id ? 'var(--blue)' : 'var(--text2)',
                    fontSize: '12px', fontFamily: 'var(--font-ui)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{item.icon}</span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              ))}
            </div>
          ))}

          {/* Market Pairs */}
          {!sidebarCollapsed && (
            <>
              <div className="px-4 pt-4 pb-1" style={{ fontSize: '9px', fontFamily: 'var(--font-ui)', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>
                الأسواق
              </div>
              <div className="flex gap-1 px-3 mb-2">
                {(Object.keys(MARKET_PAIRS) as (keyof typeof MARKET_PAIRS)[]).map(tab => (
                  <button key={tab} onClick={() => setActiveMarketTab(tab)} style={{
                    fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: '2px', cursor: 'pointer',
                    background: activeMarketTab === tab ? 'var(--blue2)' : 'transparent',
                    color: activeMarketTab === tab ? 'var(--blue)' : 'var(--text3)',
                    border: activeMarketTab === tab ? '0.5px solid var(--border2)' : '0.5px solid transparent',
                  }}>{tab}</button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {MARKET_PAIRS[activeMarketTab].map(symbol => {
                  const q = quotes.get(symbol)
                  const isActive = selectedPair === symbol
                  return (
                    <button key={symbol} onClick={() => setSelectedPair(symbol)} className="w-full flex items-center justify-between px-4 py-1.5 transition-colors" style={{
                      background: isActive ? 'var(--blue3)' : 'transparent',
                      cursor: 'pointer',
                    }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: isActive ? 'var(--blue)' : 'var(--text2)', fontWeight: 600 }}>{symbol}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="price" style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 600 }}>
                          {q ? (q.price > 1000 ? q.price.toFixed(2) : q.price.toFixed(q.price > 10 ? 4 : 6)) : '—'}
                        </span>
                        {q && (
                          <span className="price" style={{ fontSize: '9px', color: q.changePercent >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* News Ticker */}
          {!sidebarCollapsed && news.length > 0 && (
            <div className="px-3 py-2">
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-ui)', color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>آخر الأخبار</div>
              <div className="space-y-1">
                {news.slice(0, 4).map((item: any, i: number) => (
                  <div key={i} className="px-2 py-1.5 rounded" style={{ background: 'var(--bg4)', border: '0.5px solid var(--border)' }}>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span style={{ fontSize: '7px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', background: item.bgColor || 'var(--blue2)', color: item.color || 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                        {item.categoryAr || item.category || 'عام'}
                      </span>
                      {item.impact === 'high' && (
                        <span style={{ fontSize: '7px', color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>●</span>
                      )}
                    </div>
                    <p style={{ fontSize: '9px', color: 'var(--text2)', fontFamily: 'var(--font-ui)', lineHeight: '1.4' }}>
                      {item.text?.slice(0, 60)}{item.text?.length > 60 ? '...' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapse Button */}
          <div className="mt-auto p-3 flex justify-center">
            <button onClick={toggleSidebar} style={{
              fontSize: '14px', cursor: 'pointer', color: 'var(--text3)', background: 'transparent',
              border: '0.5px solid var(--border)', borderRadius: '3px', padding: '4px 8px',
            }}>
              {sidebarCollapsed ? '◀' : '▶'}
            </button>
          </div>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Chart Toolbar */}
          <div className="flex items-center h-[36px] px-3 gap-2 shrink-0" style={{ background: 'var(--bg2)', borderBottom: '0.5px solid var(--border)' }}>
            {TIMEFRAMES.map(tf => (
              <button key={tf.value} onClick={() => setActiveTimeframe(tf.value)} style={{
                fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '2px 8px', borderRadius: '3px', cursor: 'pointer',
                background: activeTimeframe === tf.value ? 'var(--blue2)' : 'transparent',
                color: activeTimeframe === tf.value ? 'var(--blue)' : 'var(--text3)',
                border: activeTimeframe === tf.value ? '0.5px solid var(--border2)' : '0.5px solid transparent',
              }}>{tf.label}</button>
            ))}
            <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
            <button style={{ fontSize: '14px', color: 'var(--blue)', cursor: 'pointer', background: 'transparent' }}>📊</button>
            <button style={{ fontSize: '14px', color: 'var(--text3)', cursor: 'pointer', background: 'transparent' }}>🕯️</button>
            <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
            <button style={{ fontSize: '14px', color: 'var(--text3)', cursor: 'pointer', background: 'transparent' }}>✛</button>
            <button style={{ fontSize: '14px', color: 'var(--text3)', cursor: 'pointer', background: 'transparent' }}>↗</button>
            <button style={{ fontSize: '14px', color: 'var(--text3)', cursor: 'pointer', background: 'transparent' }}>—</button>
            <div className="flex-1" />
            <button style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text3)', background: 'var(--blue3)', border: '0.5px solid var(--border)', borderRadius: '3px', padding: '2px 8px', cursor: 'pointer' }}>IND+</button>
          </div>

          {/* Chart Header */}
          <div className="flex items-center h-[36px] px-3 gap-3 shrink-0" style={{ background: 'var(--bg2)', borderBottom: '0.5px solid var(--border)' }}>
            <button onClick={() => setActiveMarketTab(activeMarketTab)} style={{
              fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 800, padding: '4px 10px', borderRadius: '4px', cursor: 'pointer',
              background: 'var(--bg3)', border: '0.5px solid var(--border2)', color: 'var(--text)',
            }}>
              {selectedPair} ▼
            </button>
            <div className="flex items-center gap-2">
              <span className="price" style={{ fontSize: '14px', fontWeight: 700, color: isPositive ? 'var(--green)' : 'var(--red)' }} dir="ltr">
                {price > 0 ? (price > 1000 ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(price > 10 ? 4 : 6)) : '—'}
              </span>
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px', fontFamily: 'var(--font-mono)',
                background: isPositive ? 'var(--green2)' : 'var(--red2)',
                color: isPositive ? 'var(--green)' : 'var(--red)',
              }} dir="ltr">
                {isPositive ? '▲' : '▼'} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
              </span>
              {currentQuote && (
                <span style={{ fontSize: '8px', color: 'var(--text4)', fontFamily: 'var(--font-mono)' }} dir="ltr">
                  {currentQuote.source}
                </span>
              )}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <button style={{
                fontSize: '11px', fontWeight: 700, padding: '3px 12px', borderRadius: '3px', cursor: 'pointer',
                background: 'var(--green2)', color: 'var(--green)', border: '0.5px solid rgba(0,255,136,0.3)',
                fontFamily: 'var(--font-mono)',
              }}>BUY</button>
              <button style={{
                fontSize: '11px', fontWeight: 700, padding: '3px 12px', borderRadius: '3px', cursor: 'pointer',
                background: 'var(--red2)', color: 'var(--red)', border: '0.5px solid rgba(255,51,85,0.3)',
                fontFamily: 'var(--font-mono)',
              }}>SELL</button>
              <button style={{
                fontSize: '11px', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer',
                background: 'transparent', color: 'var(--text3)', border: '0.5px solid var(--border)',
              }}>⛶</button>
            </div>
          </div>

          {/* Chart Canvas */}
          <div className="flex-1 min-h-0 relative" style={{ background: 'var(--bg)' }}>
            {candlesLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(9,11,16,0.8)' }}>
                <div className="shimmer" style={{ width: '80%', height: 20, borderRadius: 4 }} />
              </div>
            )}
            <div ref={chartContainerRef} className="w-full h-full" />
          </div>

          {/* MACD Panel */}
          <div className="flex items-center h-[58px] px-3 gap-2 shrink-0" style={{ background: 'var(--bg2)', borderTop: '0.5px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text3)' }}>MACD(12,26,9)</span>
            <div className="flex-1 flex items-center gap-[2px]">
              {Array.from({ length: 60 }, (_, i) => {
                const v = Math.sin(i * 0.3) * Math.cos(i * 0.15) * (Math.random() * 0.5 + 0.5)
                return <div key={i} style={{ flex: 1, height: `${Math.abs(v) * 80}%`, background: v >= 0 ? 'rgba(0,255,136,0.4)' : 'rgba(255,51,85,0.4)', borderRadius: 1 }} />
              })}
            </div>
          </div>

          {/* ═══ BOTTOM PANEL ═══ */}
          <div className="shrink-0" style={{ height: 140, background: 'var(--bg2)', borderTop: '0.5px solid var(--border)' }}>
            <div className="flex h-full">
              {/* Open Positions */}
              <div className="flex-1 flex flex-col overflow-hidden custom-scrollbar">
                <div className="flex items-center px-3 py-1.5 shrink-0" style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text2)', fontFamily: 'var(--font-ui)' }}>الصفقات المفتوحة</span>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginRight: 8 }}>
                    {positions.length || 0}
                  </span>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full" style={{ fontSize: '10px' }}>
                    <thead>
                      <tr style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                        <th className="text-right px-3 py-1 font-normal">الزوج</th>
                        <th className="text-right px-2 py-1 font-normal">الاتجاه</th>
                        <th className="text-right px-2 py-1 font-normal">الحجم</th>
                        <th className="text-right px-2 py-1 font-normal">الدخول</th>
                        <th className="text-right px-2 py-1 font-normal">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.length > 0 ? positions.map((p: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '0.5px solid var(--border)' }}>
                          <td className="px-3 py-1 price" style={{ color: 'var(--text)' }}>{p.symbol || '—'}</td>
                          <td className="px-2 py-1" style={{ color: p.side === 'BUY' ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>{p.side || '—'}</td>
                          <td className="px-2 py-1 price" style={{ color: 'var(--text2)' }}>{p.size || '—'}</td>
                          <td className="px-2 py-1 price" style={{ color: 'var(--text2)' }}>{p.entryPrice || '—'}</td>
                          <td className="px-2 py-1 price" style={{ color: 'var(--green)' }}>+0.00</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={5} className="text-center py-4" style={{ color: 'var(--text4)', fontSize: '10px' }}>لا توجد صفقات مفتوحة</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signals Summary */}
              <div className="shrink-0 flex flex-col" style={{ width: 280, borderRight: '0.5px solid var(--border)' }}>
                <div className="flex items-center px-3 py-1.5 shrink-0" style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text2)', fontFamily: 'var(--font-ui)' }}>آخر الإشارات</span>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-1">
                  {signals.length > 0 ? signals.slice(0, 3).map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1 rounded" style={{ background: 'var(--bg4)', border: '0.5px solid var(--border)' }}>
                      <span className="price" style={{ fontSize: '10px', color: 'var(--text)' }}>{s.symbol || '—'}</span>
                      <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '2px', fontFamily: 'var(--font-mono)',
                        background: s.direction === 'BUY' ? 'var(--green2)' : 'var(--red2)',
                        color: s.direction === 'BUY' ? 'var(--green)' : 'var(--red)',
                        width: 34, textAlign: 'center',
                      }}>{s.direction || '—'}</span>
                    </div>
                  )) : (
                    <div className="text-center py-3" style={{ color: 'var(--text4)', fontSize: '10px' }}>لا توجد إشارات نشطة</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SIDEBAR RIGHT ═══ */}
        <div className="shrink-0 flex flex-col overflow-hidden" style={{
          width: 280, background: 'var(--bg2)', borderRight: '0.5px solid var(--border)',
        }}>
          {/* Quantum Orb */}
          <div className="flex justify-center py-3" style={{ borderBottom: '0.5px solid var(--border)' }}>
            <QuantumOrb changePercent={change} />
          </div>

          {/* Tabs */}
          <div className="flex shrink-0" style={{ borderBottom: '0.5px solid var(--border)' }}>
            {[
              { id: 'trade' as const, label: 'التداول' },
              { id: 'signals' as const, label: 'الإشارات' },
              { id: 'bot' as const, label: 'البوت' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setRightTab(tab.id)} className="flex-1 py-2 text-center transition-colors" style={{
                fontSize: '11px', fontFamily: 'var(--font-ui)', fontWeight: 600, cursor: 'pointer',
                color: rightTab === tab.id ? 'var(--blue)' : 'var(--text3)',
                borderBottom: rightTab === tab.id ? '2px solid var(--blue)' : '2px solid transparent',
                background: rightTab === tab.id ? 'var(--blue3)' : 'transparent',
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto custom-scrollbar p-3">
            {rightTab === 'trade' && (
              <div className="space-y-3">
                {/* Buy/Sell Toggle */}
                <div className="flex gap-1">
                  <button onClick={() => setTradeDirection('buy')} className="flex-1 py-2 rounded text-sm font-bold transition-colors" style={{
                    background: tradeDirection === 'buy' ? 'var(--green2)' : 'var(--bg4)',
                    color: tradeDirection === 'buy' ? 'var(--green)' : 'var(--text3)',
                    border: tradeDirection === 'buy' ? '0.5px solid rgba(0,255,136,0.3)' : '0.5px solid var(--border)',
                    fontFamily: 'var(--font-mono)',
                  }}>BUY</button>
                  <button onClick={() => setTradeDirection('sell')} className="flex-1 py-2 rounded text-sm font-bold transition-colors" style={{
                    background: tradeDirection === 'sell' ? 'var(--red2)' : 'var(--bg4)',
                    color: tradeDirection === 'sell' ? 'var(--red)' : 'var(--text3)',
                    border: tradeDirection === 'sell' ? '0.5px solid rgba(255,51,85,0.3)' : '0.5px solid var(--border)',
                    fontFamily: 'var(--font-mono)',
                  }}>SELL</button>
                </div>

                {/* Trade Fields */}
                {[
                  { label: 'الزوج', value: selectedPair, onChange: null },
                  { label: 'الحجم', value: tradeSize, onChange: setTradeSize },
                  { label: 'وقف الخسارة (SL)', value: tradeSL, onChange: setTradeSL },
                  { label: 'جني الأرباح (TP)', value: tradeTP, onChange: setTradeTP },
                  { label: 'الرافعة', value: tradeLeverage, onChange: setTradeLeverage },
                ].map(field => (
                  <div key={field.label}>
                    <label style={{ fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--font-ui)', marginBottom: 2, display: 'block' }}>{field.label}</label>
                    <input
                      value={field.value}
                      onChange={field.onChange ? (e) => field.onChange!(e.target.value) : undefined}
                      readOnly={!field.onChange}
                      className="w-full px-3 py-1.5 rounded text-[11px]"
                      style={{
                        background: 'var(--bg4)', border: '0.5px solid var(--border)', color: 'var(--text)',
                        fontFamily: 'var(--font-mono)', outline: 'none',
                      }}
                    />
                  </div>
                ))}

                {/* Risk Calculator */}
                <div className="p-2 rounded" style={{ background: 'var(--bg4)', border: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>حاسبة المخاطر</div>
                  <div className="flex justify-between">
                    <span style={{ fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Risk:Reward</span>
                    <span style={{ fontSize: '9px', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>1:2.5</span>
                  </div>
                </div>

                {/* Execute Button */}
                <button className="w-full py-3 rounded font-bold text-sm" style={{
                  background: tradeDirection === 'buy'
                    ? 'linear-gradient(135deg, #00ff88, #00cc6a)'
                    : 'linear-gradient(135deg, #ff3355, #cc1133)',
                  color: '#090b10',
                  fontFamily: 'var(--font-ui)',
                  cursor: 'pointer',
                  boxShadow: tradeDirection === 'buy' ? '0 0 20px rgba(0,255,136,0.3)' : '0 0 20px rgba(255,51,85,0.3)',
                }}>
                  {tradeDirection === 'buy' ? 'شراء' : 'بيع'} {selectedPair}
                </button>
              </div>
            )}

            {rightTab === 'signals' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>الإشارات النشطة</span>
                  <button style={{ fontSize: '9px', color: 'var(--blue)', background: 'var(--blue2)', border: '0.5px solid var(--border2)', borderRadius: '2px', padding: '2px 6px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>تحديث</button>
                </div>
                {signals.length > 0 ? signals.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded" style={{ background: 'var(--bg4)', border: '0.5px solid var(--border)' }}>
                    <span className="price" style={{ fontSize: '10px', width: 65, color: 'var(--text)' }}>{s.symbol}</span>
                    <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '2px', width: 34, textAlign: 'center', fontFamily: 'var(--font-mono)',
                      background: s.direction === 'BUY' ? 'var(--green2)' : 'var(--red2)',
                      color: s.direction === 'BUY' ? 'var(--green)' : 'var(--red)',
                    }}>{s.direction}</span>
                    <div className="flex-1 h-[3px] rounded" style={{ background: 'var(--bg)' }}>
                      <div className="h-full rounded" style={{ width: `${s.confidence || 65}%`, background: s.confidence > 70 ? 'var(--green)' : s.confidence > 50 ? 'var(--amber)' : 'var(--red)' }} />
                    </div>
                    <span className="price" style={{ fontSize: '9px', color: 'var(--text2)' }}>{s.confidence || 65}%</span>
                  </div>
                )) : (
                  <div className="text-center py-6" style={{ color: 'var(--text4)', fontSize: '10px' }}>لا توجد إشارات نشطة حالياً</div>
                )}
              </div>
            )}

            {rightTab === 'bot' && (
              <div className="space-y-4">
                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: '11px', color: 'var(--text)', fontFamily: 'var(--font-ui)' }}>التداول الآلي</span>
                  <button onClick={() => setBotEnabled(!botEnabled)} style={{
                    width: 36, height: 18, borderRadius: 9, position: 'relative', cursor: 'pointer',
                    background: botEnabled ? 'var(--green)' : 'var(--bg4)',
                    border: botEnabled ? 'none' : '0.5px solid var(--border)',
                    transition: 'background 0.2s',
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2,
                      right: botEnabled ? 2 : 20,
                      transition: 'right 0.2s',
                    }} />
                  </button>
                </div>

                {/* Stats */}
                <div className="space-y-2">
                  {[
                    { label: 'إجمالي الصفقات', value: '147' },
                    { label: 'نسبة الفوز', value: '68.7%' },
                    { label: 'الربح الإجمالي', value: '+$2,341' },
                    { label: 'أقصى خسارة', value: '-$187' },
                  ].map(stat => (
                    <div key={stat.label} className="flex justify-between p-2 rounded" style={{ background: 'var(--bg4)', border: '0.5px solid var(--border)' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--font-ui)' }}>{stat.label}</span>
                      <span className="price" style={{ fontSize: '10px', color: stat.value.startsWith('+') ? 'var(--green)' : stat.value.startsWith('-') ? 'var(--red)' : 'var(--text)' }}>{stat.value}</span>
                    </div>
                  ))}
                </div>

                {/* Operation Log */}
                <div>
                  <div style={{ fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>سجل العمليات</div>
                  <div className="space-y-1">
                    {[
                      { time: '14:32', msg: 'شراء BTC/USDT 0.01', type: 'buy' },
                      { time: '13:15', msg: 'بيع ETH/USDT 0.5', type: 'sell' },
                      { time: '12:01', msg: 'إشارة جديدة EUR/USD', type: 'signal' },
                    ].map((log, i) => (
                      <div key={i} className="flex items-center gap-2" style={{ fontSize: '9px' }}>
                        <span className="price" style={{ color: 'var(--text4)' }}>{log.time}</span>
                        <span style={{ color: log.type === 'buy' ? 'var(--green)' : log.type === 'sell' ? 'var(--red)' : 'var(--amber)', fontFamily: 'var(--font-ui)' }}>{log.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── EMA Calculator ──
function calcEMA(closes: number[], period: number, candleData: CandlestickData<Time>[]) {
  if (closes.length < period) return []
  const k = 2 / (period + 1)
  const ema: { time: Time; value: number }[] = []
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  ema.push({ time: candleData[period - 1].time, value: prev })
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k)
    ema.push({ time: candleData[i].time, value: prev })
  }
  return ema
}
