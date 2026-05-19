'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'
import { TIMEFRAMES } from '@/lib/charts/types'
import type { DrawingTool } from '@/lib/charts/types'
import { X, Target, ShieldAlert, Loader2, CheckCircle, AlertCircle, Minus, Plus, MousePointer2, Clock, Zap, Timer, BarChart3, ChevronDown } from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
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

  const quoteKey = quotes && selectedSymbol ? Object.keys(quotes).find(k => k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null
  const changePercent = quote?.changePercent ?? 0
  const buyingPower = account?.buying_power ? Number(account.buying_power) : 0

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
        const nestBody = { credentialId, symbol: selectedSymbol, side: side.toUpperCase(), type: orderType.toUpperCase(), quantity: parseFloat(quantity), price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined, stopPrice: orderType === 'stop' && stopPrice ? parseFloat(stopPrice) : undefined, stopLoss: slEnabled && slValue ? parseFloat(slValue) : undefined, takeProfit: tpEnabled && tpValue ? parseFloat(tpValue) : undefined }
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

  const fmtPrice = (p: number | null) => { if (!p) return '—'; if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return p.toFixed(4) }
  const activeTF = TIMEFRAMES.find(t => t.value === timeframe)
  const tfLabel = activeTF?.label || timeframe
  const openExecution = useCallback((side: 'buy' | 'sell') => { setOrderSide(side); setOrderType('market'); setShowOrderSheet(true) }, [])
  const openPendingOrder = useCallback(() => { setOrderSide('buy'); setOrderType('limit'); setShowOrderSheet(true) }, [])

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

  const ToolBtn = ({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title: string }) => (
    <button
      onClick={onClick}
      title={title}
      style={{ width: 44, height: 32, borderRadius: 6, background: active ? 'rgba(0,212,255,0.12)' : 'transparent', border: active ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: active ? '#00D4FF' : 'rgba(255,255,255,0.5)', touchAction: 'manipulation' }}
    >
      {children}
    </button>
  )
  const Separator = () => <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 2px', flexShrink: 0 }} />

  const isPositive = changePercent >= 0
  const priceColor = livePrice ? (isPositive ? C.success : C.danger) : C.text2

  return (
    <div className="m-page--chart">
      {/* Chart container — fills space ABOVE navbar only */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, direction: 'ltr' }}>
        <RouaChart currentPrice={livePrice} mobile={true} hideToolbar={true} isChartFullscreen={chartFullscreen} onToggleChartFullscreen={() => setChartFullscreen(!chartFullscreen)} chartActions={chartActionsRef} />

        {/* Pair + Price overlay */}
        <div style={{ position: 'absolute', top: 40, left: 8, right: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 5, direction: 'ltr' }}>
          <div ref={dropdownRef} style={{ position: 'relative', pointerEvents: 'auto' }}>
            <button onClick={() => { setShowPairDropdown(!showPairDropdown); setShowTimeframePanel(false) }} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,212,255,0.15)', cursor: 'pointer', backdropFilter: 'blur(12px)' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>{selectedSymbol.replace('/', '')}</span>
              <ChevronDown size={10} color="#00D4FF" strokeWidth={3} />
            </button>
            {showPairDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 60, minWidth: 140, maxHeight: 200, overflowY: 'auto', background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
                {PAIRS.map(pair => (
                  <button key={pair} onClick={() => { setSelectedSymbol(pair); setShowPairDropdown(false) }} style={{ width: '100%', padding: '7px 8px', borderRadius: 4, background: selectedSymbol === pair ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: selectedSymbol === pair ? '#00D4FF' : '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>{pair}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: priceColor, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPrice(livePrice)}</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: isPositive ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace", padding: '1px 4px', borderRadius: 3, background: isPositive ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)' }}>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, zIndex: 10, paddingLeft: 4, paddingRight: 4, display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(11,14,20,0.88)', backdropFilter: 'blur(12px)', direction: 'ltr', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
        <ToolBtn onClick={() => openExecution('buy')} title="شراء"><Zap size={14} /></ToolBtn>
        <ToolBtn onClick={openPendingOrder} title="أوامر معلقة"><Timer size={14} /></ToolBtn>
        <Separator />
        <ToolBtn onClick={() => chartActionsRef.current?.toggleIndicators()} title="المؤشرات"><BarChart3 size={14} /></ToolBtn>
        <ToolBtn onClick={() => chartActionsRef.current?.toggleDrawings()} title="أدوات الرسم"><Pencil size={14} /></ToolBtn>
        <ToolBtn onClick={() => chartActionsRef.current?.setTool('cursor')} title="المؤشر" active={chartActionsRef.current?.activeTool === 'cursor'}><MousePointer2 size={14} /></ToolBtn>
        <Separator />
        <div ref={tfPanelRef} style={{ position: 'relative' }}>
          <ToolBtn onClick={() => { setShowTimeframePanel(!showTimeframePanel); setShowPairDropdown(false) }} title="الإطار الزمني">
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Clock size={12} /><span style={{ fontSize: 9, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>{tfLabel}</span><ChevronDown size={8} color="#00D4FF" /></div>
          </ToolBtn>
          {showTimeframePanel && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 60, minWidth: 220, background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
                {TIMEFRAMES.map(tf => (
                  <button key={tf.value} onClick={() => { setTimeframe(tf.value); setShowTimeframePanel(false) }} style={{ background: timeframe === tf.value ? '#00D4FF' : '#1a1f2e', border: `1px solid ${timeframe === tf.value ? '#00D4FF' : 'rgba(255,255,255,0.05)'}`, color: timeframe === tf.value ? '#000' : 'rgba(255,255,255,0.4)', borderRadius: 4, padding: '4px 0', fontSize: 8, fontWeight: timeframe === tf.value ? 800 : 600, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', textAlign: 'center' }}>{tf.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order Sheet */}
      {showOrderSheet && (
        <>
          <div onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }} />
          <div style={{ position: 'fixed', bottom: 'calc(var(--m-nav-total, 56px))', left: 0, right: 0, zIndex: 55, background: C.bg, backdropFilter: 'blur(50px) saturate(200%)', borderRadius: '20px 20px 0 0', borderTop: '0.5px solid rgba(255,255,255,0.12)', direction: 'rtl', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', maxHeight: '75vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6, flexShrink: 0 }}><div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} /></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{orderType === 'market' ? 'تنفيذ أمر سوقي' : orderType === 'limit' ? 'أمر محدد' : 'أمر وقف'}</h2>
                <button onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}><X size={16} color="#FFF" /></button>
              </div>

              {/* Buy/Sell Toggle */}
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 14, padding: 3, display: 'flex', marginBottom: 12, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 3, left: 3, width: 'calc(50% - 3px)', bottom: 3, background: orderSide === 'buy' ? C.success : C.danger, borderRadius: 10, zIndex: 0, transition: 'transform 0.2s', transform: orderSide === 'buy' ? 'translateX(0)' : 'translateX(100%)' }} />
                <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>شراء</button>
                <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 36, borderRadius: 10, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>بيع</button>
              </div>

              {/* Order Type + Quantity */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 3 }}>نوع الأمر</label>
                  <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                    {[{ key: 'market' as const, label: 'سوقي' }, { key: 'limit' as const, label: 'محدد' }, { key: 'stop' as const, label: 'وقف' }].map(ot => (
                      <button key={ot.key} onClick={() => setOrderType(ot.key)} style={{ flex: 1, padding: '4px 0', borderRadius: 6, background: orderType === ot.key ? C.accent : 'transparent', color: orderType === ot.key ? '#000' : C.text2, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer' }}>{ot.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1.3 }}>
                  <label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 3 }}>الكمية</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <button onClick={() => adjustQty(-1)} style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={12} color={C.text} /></button>
                    <input value={quantity} onChange={e => setQuantity(e.target.value)} type="number" style={{ flex: 1, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 6px', color: C.text, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr', textAlign: 'center' }} />
                    <button onClick={() => adjustQty(1)} style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={12} color={C.text} /></button>
                  </div>
                </div>
              </div>

              {orderType === 'limit' && <div style={{ marginBottom: 8 }}><label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 3 }}>سعر الحد</label><input value={limitPrice} onChange={e => setLimitPrice(e.target.value)} type="number" placeholder={livePrice?.toString() || '0.00'} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} /></div>}
              {orderType === 'stop' && <div style={{ marginBottom: 8 }}><label style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 3 }}>سعر الوقف</label><input value={stopPrice} onChange={e => setStopPrice(e.target.value)} type="number" placeholder={livePrice?.toString() || '0.00'} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} /></div>}

              {/* TP/SL */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '10px', border: '0.5px solid rgba(255,255,255,0.04)', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Target size={14} color={C.success} /><span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>جني الأرباح (TP)</span></div>
                    <button onClick={() => setTpEnabled(!tpEnabled)} style={{ width: 38, height: 22, borderRadius: 11, background: tpEnabled ? C.success : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}><div style={{ position: 'absolute', top: 2, insetInlineStart: tpEnabled ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} /></button>
                  </div>
                  {tpEnabled && <input type="number" placeholder="سعر الهدف..." value={tpValue} onChange={(e) => setTpValue(e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', marginTop: 6, direction: 'ltr' }} />}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '10px', border: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShieldAlert size={14} color={C.danger} /><span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>وقف الخسارة (SL)</span></div>
                    <button onClick={() => setSlEnabled(!slEnabled)} style={{ width: 38, height: 22, borderRadius: 11, background: slEnabled ? C.danger : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}><div style={{ position: 'absolute', top: 2, insetInlineStart: slEnabled ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} /></button>
                  </div>
                  {slEnabled && <input type="number" placeholder="سعر التوقف..." value={slValue} onChange={(e) => setSlValue(e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', padding: '0 10px', color: '#FFF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', marginTop: 6, direction: 'ltr' }} />}
                </div>
              </div>

              {/* Execute Button */}
              <div style={{ padding: '6px 0 16px', flexShrink: 0 }}>
                {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
                  <button onClick={() => executeOrder(orderSide)} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: orderSide === 'buy' ? 'linear-gradient(135deg, #32D74B, #28A745)' : 'linear-gradient(135deg, #FF453A, #DC2626)', color: '#FFF', fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', boxShadow: orderSide === 'buy' ? '0 4px 16px rgba(50,215,75,0.25)' : '0 4px 16px rgba(255,69,58,0.25)' }}>
                    {orderSide === 'buy' ? 'شراء' : 'بيع'} {selectedSymbol}
                  </button>
                )}
                {execStatus === 'submitting' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0' }}><Loader2 size={18} className="animate-spin" color="#00D4FF" /><span style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>جارٍ التنفيذ...</span></div>}
                {execStatus === 'filled' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(50,215,75,0.1)', borderRadius: 10 }}><CheckCircle size={18} color="#32D74B" /><span style={{ fontSize: 13, fontWeight: 700, color: '#32D74B', fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span></div>}
                {execStatus === 'rejected' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(255,184,0,0.1)', borderRadius: 10 }}><AlertCircle size={18} color="#FFB800" /><span style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span></div>}
                {execStatus === 'error' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', background: 'rgba(255,69,58,0.1)', borderRadius: 10 }}><AlertCircle size={18} color="#FF4757" /><span style={{ fontSize: 13, fontWeight: 700, color: '#FF4757', fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span></div>}
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
    <Suspense fallback={<div className="m-page--chart" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={24} className="animate-spin" color="#00D4FF" /></div>}>
      <ChartContent />
    </Suspense>
  )
}
