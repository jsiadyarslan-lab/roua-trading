'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'
import { TIMEFRAMES } from '@/lib/charts/types'
import type { CrosshairData } from '@/lib/charts/types'
import { X, Target, ShieldAlert, Loader2, CheckCircle, AlertCircle, Minus, Plus, MousePointer2, Clock, Zap, Timer, BarChart3, ChevronDown, ChevronRight, Crosshair, BookOpen, Activity } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Immersive Trading Chart
   Full viewport. No navbar. No footer. Just the chart.
   Quick Trade bar at bottom. Orbital hidden.
   ═══════════════════════════════════════════════════════════════ */

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} className="r-anim-spin" />
    </div>
  )
})

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }
const PAIRS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'SOL/USD']
type ExecStatus = 'idle' | 'validating' | 'submitting' | 'filled' | 'rejected' | 'error'

function ChartContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const addPaperTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)
  const refreshAfterTrade = usePositionsStore(s => s.refreshAfterTrade)
  const account = usePositionsStore(s => s.account)

  const chartActionsRef = useRef<any>(null)

  useEffect(() => {
    const symbolParam = searchParams.get('symbol')
    if (symbolParam) setSelectedSymbol(symbolParam)
  }, [searchParams, setSelectedSymbol])

  const [showOrderSheet, setShowOrderSheet] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [quantity, setQuantity] = useState('0.01')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [tpValue, setTpValue] = useState('')
  const [slValue, setSlValue] = useState('')
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle')
  const [execMessage, setExecMessage] = useState('')
  const [showPairDropdown, setShowPairDropdown] = useState(false)
  const [showTimeframePanel, setShowTimeframePanel] = useState(false)
  const [chartFullscreen, setChartFullscreen] = useState(false)
  const [crosshairMode, setCrosshairMode] = useState(false)
  const [crosshairData, setCrosshairData] = useState<CrosshairData | null>(null)
  const [showBookPanel, setShowBookPanel] = useState(false)
  const [bookTab, setBookTab] = useState<'orderbook' | 'trades'>('orderbook')
  const [orderBookAsks, setOrderBookAsks] = useState<{ price: number; amount: number; total: number }[]>([])
  const [orderBookBids, setOrderBookBids] = useState<{ price: number; amount: number; total: number }[]>([])
  const [recentTrades, setRecentTrades] = useState<{ price: number; amount: number; time: number; side: 'buy' | 'sell' }[]>([])

  const quoteKey = quotes && selectedSymbol ? Object.keys(quotes).find(k => k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null
  const changePercent = quote?.changePercent ?? 0

  const adjustQty = (delta: number) => {
    const current = parseFloat(quantity) || 0
    const step = (livePrice && livePrice > 1000) ? 0.01 : (livePrice && livePrice > 10) ? 0.1 : 1
    const newVal = Math.max(0, current + delta * step)
    setQuantity(newVal.toFixed(newVal < 1 ? 4 : newVal < 100 ? 2 : 0))
  }

  const validateOrder = (): string | null => {
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) return 'يرجى إدخال كمية صالحة'
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) return 'يرجى إدخال سعر الحد'
    if (orderType === 'stop' && (!stopPrice || parseFloat(stopPrice) <= 0)) return 'يرجى إدخال سعر الوقف'
    if (!livePrice || livePrice <= 0) return 'سعر السوق غير متوفر'
    return null
  }

  const executeOrder = async (side: 'buy' | 'sell') => {
    const err = validateOrder()
    if (err) { setExecStatus('error'); setExecMessage(err); setTimeout(() => setExecStatus('idle'), 3000); return }

    setExecStatus('submitting')
    setExecMessage('جارٍ إرسال الأمر...')

    const body: Record<string, any> = { symbol: selectedSymbol, side, qty: parseFloat(quantity), type: orderType === 'stop' ? 'stop' : orderType, time_in_force: 'ioc' }
    if (orderType === 'limit' && limitPrice) body.limit_price = parseFloat(limitPrice)
    if (orderType === 'stop' && stopPrice) body.stop_price = parseFloat(stopPrice)
    if (slEnabled && slValue) body.stop_loss = parseFloat(slValue)
    if (tpEnabled && tpValue) body.take_profit = parseFloat(tpValue)

    let success = false
    let filledPrice = 0

    try {
      await ensureAuth()
      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      const credentials = credData.data || credData.credentials || []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (credentialId) {
        const nestBody = {
          exchangeCredentialId: credentialId,
          symbol: selectedSymbol,
          side: side.toUpperCase(),
          type: orderType.toUpperCase(),
          quantity: parseFloat(quantity),
          price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
          stopLoss: slEnabled && slValue ? parseFloat(slValue) : (stopPrice ? parseFloat(stopPrice) : undefined),
          takeProfit: tpEnabled && tpValue ? parseFloat(tpValue) : undefined,
          idempotencyKey: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }
        const res = await fetch('/api/trading/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nestBody) })
        const j = await res.json()
        if (res.ok && j.id) { success = true; filledPrice = j.filledAvgPrice || j.avgFillPrice || livePrice || 0; }
        else if (res.status === 403) { setExecStatus('rejected'); setExecMessage(j.message || 'تم رفض الأمر'); setTimeout(() => setExecStatus('idle'), 5000); return }
        else throw new Error(j.message || 'Error')
      } else { throw new Error('No credentials') }
    } catch {
      try {
        const res = await fetch('/api/alpaca/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const j = await res.json()
        if (j.success) { success = true; filledPrice = j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : (livePrice || 0) }
        else { setExecStatus('error'); setExecMessage(j.error || 'فشل التنفيذ'); setTimeout(() => setExecStatus('idle'), 4000); return }
      } catch { setExecStatus('error'); setExecMessage('خطأ في الشبكة'); setTimeout(() => setExecStatus('idle'), 4000); return }
    }

    if (success) {
      addPaperTrade({ symbol: selectedSymbol, side: side === 'buy' ? 'long' : 'short', qty: parseFloat(quantity), entryPrice: filledPrice, currentPrice: livePrice || filledPrice, tp: tpEnabled && tpValue ? parseFloat(tpValue) : undefined, sl: slEnabled && slValue ? parseFloat(slValue) : undefined, source: 'manual', entryTime: Date.now() })
      setExecStatus('filled')
      setExecMessage(`تم ${side === 'buy' ? 'شراء' : 'بيع'} ${quantity} ${selectedSymbol} بسعر $${filledPrice.toFixed(2)}`)
      addNotification({ source: 'trade', priority: 'high', action: side === 'buy' ? 'BUY' : 'SELL', title: `تم ${side === 'buy' ? 'شراء' : 'بيع'} ${selectedSymbol}`, body: `${quantity} ${selectedSymbol} @ $${filledPrice.toFixed(2)}`, pair: selectedSymbol, price: filledPrice })
      refreshAfterTrade()
      setTimeout(() => { setShowOrderSheet(false); setExecStatus('idle'); setTpEnabled(false); setSlEnabled(false); setTpValue(''); setSlValue(''); setLimitPrice(''); setStopPrice('') }, 2500)
    }
  }

  const fmtPrice = useCallback((p: number | null) => { if (!p) return '—'; if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return p.toFixed(4) }, [])
  const fmtBookPrice = useCallback((p: number) => { if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return p.toFixed(4) }, [])
  const activeTF = TIMEFRAMES.find(t => t.value === timeframe)
  const tfLabel = activeTF?.label || timeframe
  const openExecution = useCallback((side: 'buy' | 'sell') => { setOrderSide(side); setOrderType('market'); setShowOrderSheet(true); setShowBookPanel(false) }, [])
  const openPendingOrder = useCallback(() => { setOrderSide('buy'); setOrderType('limit'); setShowOrderSheet(true); setShowBookPanel(false) }, [])

  /* ── Order Book & Recent Trades Mock Data ── */
  const generateOrderBook = useCallback((basePrice: number) => {
    const tick = basePrice > 1000 ? 0.50 : basePrice > 100 ? 0.05 : basePrice > 10 ? 0.005 : 0.0005
    const askLevels = 12 + Math.floor(Math.random() * 4)
    const bidLevels = 12 + Math.floor(Math.random() * 4)
    const asks: { price: number; amount: number; total: number }[] = []
    const bids: { price: number; amount: number; total: number }[] = []
    let askTotal = 0
    for (let i = 0; i < askLevels; i++) {
      const price = basePrice + tick * (i + 1) + (Math.random() - 0.5) * tick * 0.3
      const amount = parseFloat((Math.random() * 5 + 0.01).toFixed(4))
      askTotal += amount
      asks.push({ price: parseFloat(price.toFixed(basePrice > 100 ? 2 : 4)), amount, total: parseFloat(askTotal.toFixed(4)) })
    }
    let bidTotal = 0
    for (let i = 0; i < bidLevels; i++) {
      const price = basePrice - tick * (i + 1) + (Math.random() - 0.5) * tick * 0.3
      const amount = parseFloat((Math.random() * 5 + 0.01).toFixed(4))
      bidTotal += amount
      bids.push({ price: parseFloat(price.toFixed(basePrice > 100 ? 2 : 4)), amount, total: parseFloat(bidTotal.toFixed(4)) })
    }
    asks.sort((a, b) => b.price - a.price)
    bids.sort((a, b) => b.price - a.price)
    return { asks, bids }
  }, [])

  const generateRecentTrades = useCallback((basePrice: number) => {
    const trades: { price: number; amount: number; time: number; side: 'buy' | 'sell' }[] = []
    const now = Date.now()
    for (let i = 0; i < 25; i++) {
      const offset = (Math.random() - 0.5) * (basePrice > 1000 ? 2 : basePrice > 100 ? 0.2 : 0.002)
      const price = parseFloat((basePrice + offset).toFixed(basePrice > 100 ? 2 : 4))
      const amount = parseFloat((Math.random() * 3 + 0.001).toFixed(4))
      const time = now - Math.floor(Math.random() * 120000)
      const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell'
      trades.push({ price, amount, time, side })
    }
    trades.sort((a, b) => b.time - a.time)
    return trades
  }, [])

  useEffect(() => {
    if (!livePrice || livePrice <= 0) return
    const { asks, bids } = generateOrderBook(livePrice)
    setOrderBookAsks(asks)
    setOrderBookBids(bids)
    setRecentTrades(generateRecentTrades(livePrice))
    const interval = setInterval(() => {
      if (!livePrice || livePrice <= 0) return
      const { asks, bids } = generateOrderBook(livePrice)
      setOrderBookAsks(asks)
      setOrderBookBids(bids)
      setRecentTrades(prev => {
        const now = Date.now()
        const offset = (Math.random() - 0.5) * (livePrice > 1000 ? 2 : livePrice > 100 ? 0.2 : 0.002)
        const price = parseFloat((livePrice + offset).toFixed(livePrice > 100 ? 2 : 4))
        const amount = parseFloat((Math.random() * 3 + 0.001).toFixed(4))
        const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell'
        const newTrade = { price, amount, time: now, side }
        const updated = [newTrade, ...prev].slice(0, 30)
        return updated
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [livePrice, generateOrderBook, generateRecentTrades])

  const formatRelativeTime = useCallback((ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 5) return 'الآن'
    if (diff < 60) return `منذ ${diff}د`
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)}د`
    return `منذ ${Math.floor(diff / 3600)}س`
  }, [])

  const spreadValue = orderBookAsks.length > 0 && orderBookBids.length > 0 ? orderBookAsks[orderBookAsks.length - 1].price - orderBookBids[0].price : 0
  const spreadPercent = livePrice && spreadValue ? ((spreadValue / livePrice) * 100).toFixed(3) : '0.000'
  const maxAskTotal = orderBookAsks.length > 0 ? orderBookAsks[orderBookAsks.length - 1].total : 1
  const maxBidTotal = orderBookBids.length > 0 ? orderBookBids[0].total : 1

  const toggleCrosshair = useCallback(() => {
    const next = !crosshairMode
    setCrosshairMode(next)
    chartActionsRef.current?.setCrosshairMode?.(next)
  }, [crosshairMode])

  const handleCrosshairData = useCallback((data: CrosshairData | null) => {
    setCrosshairData(data)
  }, [])

  const prevPriceLinePrice = useRef<number | null>(null)
  useEffect(() => {
    const actions = chartActionsRef.current
    if (!actions || !livePrice || livePrice <= 0) return
    if (prevPriceLinePrice.current === null || Math.abs(livePrice - prevPriceLinePrice.current) > (livePrice * 0.0001)) {
      actions.addPriceLine?.('mobile-current-price', livePrice, '#FF453A', '', 1, 2, false)
      prevPriceLinePrice.current = livePrice
    }
  }, [livePrice])

  useEffect(() => { return () => { chartActionsRef.current?.removePriceLine?.('mobile-current-price'); prevPriceLinePrice.current = null } }, [selectedSymbol])

  const dropdownRef = useRef<HTMLDivElement>(null)
  const tfPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowPairDropdown(false)
      if (tfPanelRef.current && !tfPanelRef.current.contains(e.target as Node)) setShowTimeframePanel(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isPositive = changePercent >= 0
  const priceColor = livePrice ? (isPositive ? C.success : C.danger) : C.text2

  return (
    <div className="r-page--chart">
      {/* Chart container — full viewport */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, direction: 'ltr' }}>
        <RouaChart currentPrice={livePrice} mobile={true} hideToolbar={true} isChartFullscreen={chartFullscreen} onToggleChartFullscreen={() => setChartFullscreen(!chartFullscreen)} chartActions={chartActionsRef} onCrosshairDataChange={handleCrosshairData} />

        {/* Pair + Price overlay — shows OHLC when crosshair active */}
        <div style={{ position: 'absolute', top: 36, left: 8, right: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 'var(--z-overlay)', direction: 'ltr', gap: 6 }}>
          <div ref={dropdownRef} style={{ position: 'relative', pointerEvents: 'auto', flexShrink: 0 }}>
            <button onClick={() => { setShowPairDropdown(!showPairDropdown); setShowTimeframePanel(false) }} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,212,255,0.15)', cursor: 'pointer', backdropFilter: 'blur(12px)' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--font-mono)', letterSpacing: -0.5 }}>{selectedSymbol.replace('/', '')}</span>
              <ChevronDown size={10} color="#00D4FF" strokeWidth={3} />
            </button>
            {showPairDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 'var(--z-dropdown)', minWidth: 140, maxHeight: 200, overflowY: 'auto', background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
                {PAIRS.map(pair => (
                  <button key={pair} onClick={() => { setSelectedSymbol(pair); setShowPairDropdown(false) }} style={{ width: '100%', padding: '7px 8px', borderRadius: 4, background: selectedSymbol === pair ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: selectedSymbol === pair ? '#00D4FF' : '#F0F2F5', fontFamily: 'var(--font-mono)' }}>{pair}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Crosshair OHLC or Live Price */}
          {crosshairMode && crosshairData ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(160,200,220,0.15)', flexShrink: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: crosshairData.close >= crosshairData.open ? C.success : C.danger, fontFamily: 'var(--font-mono)' }}>{fmtPrice(crosshairData.close)}</span>
              <span style={{ fontSize: 7, color: C.text2, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span>O<b style={{ color: 'rgba(255,255,255,0.5)' }}>{crosshairData.open > 100 ? crosshairData.open.toFixed(2) : crosshairData.open.toFixed(4)}</b></span>
                <span>H<b style={{ color: 'rgba(63,185,80,0.7)' }}>{crosshairData.high > 100 ? crosshairData.high.toFixed(2) : crosshairData.high.toFixed(4)}</b></span>
                <span>L<b style={{ color: 'rgba(248,81,73,0.7)' }}>{crosshairData.low > 100 ? crosshairData.low.toFixed(2) : crosshairData.low.toFixed(4)}</b></span>
              </span>
              <span style={{ fontSize: 7, fontWeight: 700, color: crosshairData.changePercent >= 0 ? C.success : C.danger, fontFamily: 'var(--font-mono)', padding: '0px 3px', borderRadius: 2, background: crosshairData.changePercent >= 0 ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)' }}>
                {crosshairData.changePercent >= 0 ? '+' : ''}{crosshairData.changePercent.toFixed(2)}%
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: priceColor, fontFamily: 'var(--font-mono)' }}>{fmtPrice(livePrice)}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: isPositive ? C.success : C.danger, fontFamily: 'var(--font-mono)', padding: '1px 4px', borderRadius: 3, background: isPositive ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)' }}>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</span>
            </div>
          )}
        </div>

        {/* Crosshair date label — bottom of chart */}
        {crosshairMode && crosshairData && (
          <div style={{ position: 'absolute', bottom: chartFullscreen ? 4 : 68, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 'var(--z-overlay)', direction: 'ltr' }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#00D4FF', fontFamily: 'var(--font-mono)', background: 'rgba(11,14,20,0.85)', backdropFilter: 'blur(8px)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(0,212,255,0.12)', whiteSpace: 'nowrap' }}>
              {crosshairData.dateStr}
            </span>
          </div>
        )}
      </div>

      {/* Toolbar — compact, top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, zIndex: 'var(--z-overlay)', paddingLeft: 4, paddingRight: 4, display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(11,14,20,0.88)', backdropFilter: 'blur(12px)', direction: 'ltr', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
        <button onClick={() => openExecution('buy')} title="شراء" style={{ width: 44, height: 32, borderRadius: 6, background: 'rgba(0,255,163,0.1)', border: '1px solid rgba(0,255,163,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#00FFA3', touchAction: 'manipulation' }}><Zap size={14} /></button>
        <button onClick={openPendingOrder} title="أوامر معلقة" style={{ width: 44, height: 32, borderRadius: 6, background: 'transparent', border: '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', touchAction: 'manipulation' }}><Timer size={14} /></button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 2px', flexShrink: 0 }} />
        <button onClick={() => chartActionsRef.current?.toggleIndicators()} title="المؤشرات" style={{ width: 44, height: 32, borderRadius: 6, background: 'transparent', border: '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', touchAction: 'manipulation' }}><BarChart3 size={14} /></button>
        <button onClick={toggleCrosshair} title="التصالب" style={{ width: 44, height: 32, borderRadius: 6, background: crosshairMode ? 'rgba(0,212,255,0.15)' : 'transparent', border: crosshairMode ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: crosshairMode ? '#00D4FF' : 'rgba(255,255,255,0.5)', touchAction: 'manipulation', transition: 'all 0.15s' }}><Crosshair size={14} /></button>
        <button onClick={() => { setShowBookPanel(!showBookPanel); if (!showBookPanel) setBookTab('orderbook') }} title="دفتر الأوامر" style={{ width: 44, height: 32, borderRadius: 6, background: showBookPanel && bookTab === 'orderbook' ? 'rgba(0,212,255,0.15)' : 'transparent', border: showBookPanel && bookTab === 'orderbook' ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: showBookPanel && bookTab === 'orderbook' ? '#00D4FF' : 'rgba(255,255,255,0.5)', touchAction: 'manipulation', transition: 'all 0.15s' }}><BookOpen size={14} /></button>
        <button onClick={() => { setShowBookPanel(!showBookPanel); if (!showBookPanel) setBookTab('trades') }} title="آخر الصفقات" style={{ width: 44, height: 32, borderRadius: 6, background: showBookPanel && bookTab === 'trades' ? 'rgba(0,212,255,0.15)' : 'transparent', border: showBookPanel && bookTab === 'trades' ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: showBookPanel && bookTab === 'trades' ? '#00D4FF' : 'rgba(255,255,255,0.5)', touchAction: 'manipulation', transition: 'all 0.15s' }}><Activity size={14} /></button>
        <div style={{ flex: 1 }} />
        <div ref={tfPanelRef} style={{ position: 'relative' }}>
          <button onClick={() => { setShowTimeframePanel(!showTimeframePanel); setShowPairDropdown(false) }} title="الإطار الزمني" style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', height: 32, borderRadius: 6, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', touchAction: 'manipulation' }}>
            <Clock size={12} color="rgba(255,255,255,0.5)" />
            <span style={{ fontSize: 9, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--font-mono)' }}>{tfLabel}</span>
            <ChevronDown size={8} color="#00D4FF" />
          </button>
          {showTimeframePanel && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 'var(--z-dropdown)', minWidth: 220, background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
                {TIMEFRAMES.map(tf => (
                  <button key={tf.value} onClick={() => { setTimeframe(tf.value); setShowTimeframePanel(false) }} style={{ background: timeframe === tf.value ? '#00D4FF' : '#1a1f2e', border: `1px solid ${timeframe === tf.value ? '#00D4FF' : 'rgba(255,255,255,0.05)'}`, color: timeframe === tf.value ? '#000' : 'rgba(255,255,255,0.4)', borderRadius: 4, padding: '4px 0', fontSize: 8, fontWeight: timeframe === tf.value ? 800 : 600, fontFamily: 'var(--font-mono)', cursor: 'pointer', textAlign: 'center' }}>{tf.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 2px', flexShrink: 0 }} />
        <button onClick={() => router.back()} title="رجوع" style={{ width: 44, height: 32, borderRadius: 6, background: 'transparent', border: '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', touchAction: 'manipulation' }}><ChevronRight size={14} /></button>
      </div>

      {/* Quick Trade Bar — bottom of chart */}
      {!showOrderSheet && !chartFullscreen && !showBookPanel && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 'var(--z-overlay)', background: 'rgba(11,14,20,0.92)', backdropFilter: 'blur(20px)', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          {/* Account Info Mini Bar */}
          {account && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', direction: 'rtl' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>قوة الشراء</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                  ${Number(account.buying_power ?? 0).toLocaleString('en', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>P&L</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: Number(account.unrealizedPnl ?? 0) >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                  {Number(account.unrealizedPnl ?? 0) >= 0 ? '+' : ''}{Number(account.unrealizedPnl ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px' }}>
            <button className="r-trade-btn r-trade-btn--buy" style={{ flex: 1 }} onClick={() => openExecution('buy')}>شراء</button>
            <button className="r-trade-btn r-trade-btn--sell" style={{ flex: 1 }} onClick={() => openExecution('sell')}>بيع</button>
          </div>
        </div>
      )}

      {/* Order Book / Recent Trades Panel */}
      {showBookPanel && !showOrderSheet && !chartFullscreen && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 'var(--z-overlay)', background: 'rgba(11,14,20,0.95)', backdropFilter: 'blur(30px) saturate(180%)', borderTop: '0.5px solid rgba(0,212,255,0.12)', direction: 'rtl', height: '40vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '16px 16px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)' }}>
          {/* Drag Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 4, flexShrink: 0 }}>
            <div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: 2, padding: '0 12px 8px', flexShrink: 0 }}>
            <button onClick={() => setBookTab('orderbook')} style={{ flex: 1, height: 30, borderRadius: 8, background: bookTab === 'orderbook' ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)', border: bookTab === 'orderbook' ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent', color: bookTab === 'orderbook' ? '#00D4FF' : '#8B92A8', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-cairo)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <BookOpen size={12} /> دفتر الأوامر
            </button>
            <button onClick={() => setBookTab('trades')} style={{ flex: 1, height: 30, borderRadius: 8, background: bookTab === 'trades' ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)', border: bookTab === 'trades' ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent', color: bookTab === 'trades' ? '#00D4FF' : '#8B92A8', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-cairo)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Activity size={12} /> آخر الصفقات
            </button>
            <button onClick={() => setShowBookPanel(false)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid transparent', color: '#8B92A8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Order Book Content */}
          {bookTab === 'orderbook' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', direction: 'ltr' }}>
              {/* Header Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 12px 4px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)', direction: 'rtl' }}>السعر</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)', direction: 'rtl' }}>الكمية</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)', direction: 'rtl' }}>المجموع</span>
              </div>

              {/* Asks (Red) */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                {orderBookAsks.map((level, i) => (
                  <div key={`ask-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1px 12px', minHeight: 18 }}>
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(level.total / maxAskTotal) * 100}%`, background: 'rgba(255,71,87,0.08)', pointerEvents: 'none' }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#FF4757', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'right', flex: 1, position: 'relative', zIndex: 1 }}>{fmtBookPrice(level.price)}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#F0F2F5', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'center', flex: 1, position: 'relative', zIndex: 1 }}>{level.amount.toFixed(4)}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#8B92A8', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'left', flex: 1, position: 'relative', zIndex: 1 }}>{level.total.toFixed(4)}</span>
                  </div>
                ))}
              </div>

              {/* Spread Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 12px', background: 'rgba(0,212,255,0.04)', borderTop: '0.5px solid rgba(0,212,255,0.1)', borderBottom: '0.5px solid rgba(0,212,255,0.1)', flexShrink: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#00D4FF', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>{livePrice ? fmtBookPrice(livePrice) : '—'}</span>
                <span style={{ fontSize: 7, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>فارق</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: '#8B92A8', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>${spreadValue.toFixed(livePrice && livePrice > 100 ? 2 : 4)}</span>
                <span style={{ fontSize: 8, fontWeight: 600, color: '#8B92A8', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>({spreadPercent}%)</span>
              </div>

              {/* Bids (Green) */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                {orderBookBids.map((level, i) => (
                  <div key={`bid-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1px 12px', minHeight: 18 }}>
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(level.total / maxBidTotal) * 100}%`, background: 'rgba(0,255,163,0.08)', pointerEvents: 'none' }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#00FFA3', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'right', flex: 1, position: 'relative', zIndex: 1 }}>{fmtBookPrice(level.price)}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#F0F2F5', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'center', flex: 1, position: 'relative', zIndex: 1 }}>{level.amount.toFixed(4)}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#8B92A8', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'left', flex: 1, position: 'relative', zIndex: 1 }}>{level.total.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Trades Content */}
          {bookTab === 'trades' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', direction: 'ltr' }}>
              {/* Header Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 12px 4px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)', direction: 'rtl' }}>السعر</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)', direction: 'rtl' }}>الكمية</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--font-cairo)', direction: 'rtl' }}>الوقت</span>
              </div>

              {/* Trades List */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                {recentTrades.map((trade, i) => (
                  <div key={`trade-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 12px', minHeight: 20, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: trade.side === 'buy' ? '#00FFA3' : '#FF4757', flexShrink: 0 }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: trade.side === 'buy' ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)', direction: 'ltr' }}>{fmtBookPrice(trade.price)}</span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#F0F2F5', fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'center', flex: 1 }}>{trade.amount.toFixed(4)}</span>
                    <span style={{ fontSize: 8, fontWeight: 600, color: '#8B92A8', fontFamily: 'var(--font-cairo)', direction: 'rtl', textAlign: 'left', flex: 1 }}>{formatRelativeTime(trade.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mini Quick Trade inside Book Panel */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0, direction: 'rtl' }}>
            <button className="r-trade-btn r-trade-btn--buy" style={{ flex: 1, padding: '6px 0', fontSize: 11 }} onClick={() => openExecution('buy')}>شراء</button>
            <button className="r-trade-btn r-trade-btn--sell" style={{ flex: 1, padding: '6px 0', fontSize: 11 }} onClick={() => openExecution('sell')}>بيع</button>
          </div>
        </div>
      )}

      {/* Order Sheet */}
      {showOrderSheet && (
        <>
          <div onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }} style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal-backdrop)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 'var(--z-modal)', background: C.bg, backdropFilter: 'blur(50px) saturate(200%)', borderRadius: '20px 20px 0 0', borderTop: '0.5px solid rgba(255,255,255,0.12)', direction: 'rtl', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', maxHeight: '75vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6, flexShrink: 0 }}><div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} /></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>{orderType === 'market' ? 'تنفيذ أمر سوقي' : orderType === 'limit' ? 'أمر محدد' : 'أمر وقف'}</h2>
                <button onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}><X size={16} color="#FFF" /></button>
              </div>

              {/* Buy/Sell Toggle */}
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 14, padding: 3, display: 'flex', marginBottom: 12, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 3, left: 3, width: 'calc(50% - 3px)', bottom: 3, background: orderSide === 'buy' ? C.success : C.danger, borderRadius: 10, zIndex: 0, transition: 'transform 0.2s', transform: orderSide === 'buy' ? 'translateX(0)' : 'translateX(100%)' }} />
                <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: 'var(--font-cairo)', zIndex: 1, position: 'relative' }}>شراء</button>
                <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: 'var(--font-cairo)', zIndex: 1, position: 'relative' }}>بيع</button>
              </div>

              {/* Order Type + Quantity */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>نوع الأمر</label>
                  <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                    {[{ key: 'market' as const, label: 'سوقي' }, { key: 'limit' as const, label: 'محدد' }, { key: 'stop' as const, label: 'وقف' }].map(ot => (
                      <button key={ot.key} onClick={() => setOrderType(ot.key)} style={{ flex: 1, padding: '4px 0', borderRadius: 6, background: orderType === ot.key ? C.accent : 'transparent', color: orderType === ot.key ? '#000' : C.text2, fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-cairo)', border: 'none', cursor: 'pointer' }}>{ot.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1.3 }}>
                  <label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>الكمية</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <button onClick={() => adjustQty(-1)} style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={12} color={C.text} /></button>
                    <input value={quantity} onChange={e => setQuantity(e.target.value)} type="number" style={{ flex: 1, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 6px', color: C.text, fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', outline: 'none', direction: 'ltr', textAlign: 'center' }} />
                    <button onClick={() => adjustQty(1)} style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={12} color={C.text} /></button>
                  </div>
                </div>
              </div>

              {orderType === 'limit' && <div style={{ marginBottom: 8 }}><label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>سعر الحد</label><input value={limitPrice} onChange={e => setLimitPrice(e.target.value)} type="number" placeholder={livePrice?.toString() || '0.00'} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', direction: 'ltr' }} /></div>}
              {orderType === 'stop' && <div style={{ marginBottom: 8 }}><label style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--font-cairo)', fontWeight: 700, display: 'block', marginBottom: 3 }}>سعر الوقف</label><input value={stopPrice} onChange={e => setStopPrice(e.target.value)} type="number" placeholder={livePrice?.toString() || '0.00'} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', direction: 'ltr' }} /></div>}

              {/* TP/SL */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '10px', border: '0.5px solid rgba(255,255,255,0.04)', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Target size={14} color={C.success} /><span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>جني الأرباح (TP)</span></div>
                    <button onClick={() => setTpEnabled(!tpEnabled)} style={{ width: 38, height: 22, borderRadius: 11, background: tpEnabled ? C.success : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}><div style={{ position: 'absolute', top: 2, insetInlineStart: tpEnabled ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} /></button>
                  </div>
                  {tpEnabled && <input type="number" placeholder="سعر الهدف..." value={tpValue} onChange={(e) => setTpValue(e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', marginTop: 6, direction: 'ltr' }} />}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '10px', border: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShieldAlert size={14} color={C.danger} /><span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>وقف الخسارة (SL)</span></div>
                    <button onClick={() => setSlEnabled(!slEnabled)} style={{ width: 38, height: 22, borderRadius: 11, background: slEnabled ? C.danger : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}><div style={{ position: 'absolute', top: 2, insetInlineStart: slEnabled ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} /></button>
                  </div>
                  {slEnabled && <input type="number" placeholder="سعر التوقف..." value={slValue} onChange={(e) => setSlValue(e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', marginTop: 6, direction: 'ltr' }} />}
                </div>
              </div>

              {/* Execute Button */}
              <div style={{ padding: '6px 0 16px', flexShrink: 0 }}>
                {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
                  <button onClick={() => executeOrder(orderSide)} className={`r-trade-btn ${orderSide === 'buy' ? 'r-trade-btn--buy' : 'r-trade-btn--sell'}`} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-cairo)' }}>
                    {orderSide === 'buy' ? 'شراء' : 'بيع'} {selectedSymbol}
                  </button>
                )}
                {execStatus === 'submitting' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0' }}><Loader2 size={18} className="r-anim-spin" color="#00D4FF" /><span style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: 'var(--font-cairo)' }}>جارٍ التنفيذ...</span></div>}
                {execStatus === 'filled' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(50,215,75,0.1)', borderRadius: 10 }}><CheckCircle size={18} color="#32D74B" /><span style={{ fontSize: 13, fontWeight: 700, color: '#32D74B', fontFamily: 'var(--font-cairo)' }}>{execMessage}</span></div>}
                {execStatus === 'rejected' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(255,184,0,0.1)', borderRadius: 10 }}><AlertCircle size={18} color="#FFB800" /><span style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', fontFamily: 'var(--font-cairo)' }}>{execMessage}</span></div>}
                {execStatus === 'error' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(255,69,58,0.1)', borderRadius: 10 }}><AlertCircle size={18} color="#FF4757" /><span style={{ fontSize: 13, fontWeight: 700, color: '#FF4757', fontFamily: 'var(--font-cairo)' }}>{execMessage}</span></div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function MobileChartPage() {
  return (
    <Suspense fallback={<div className="r-page--chart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={24} className="r-anim-spin" color="#00D4FF" /></div>}>
      <ChartContent />
    </Suspense>
  )
}
