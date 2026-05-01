'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'
import { 
  ChevronRight, TrendingUp, TrendingDown, Zap, X, 
  Target, ShieldAlert, Loader2, CheckCircle, AlertCircle,
  Minus, Plus, Clock
} from 'lucide-react'
import SlideToConfirm from '@/components/mobile/SlideToConfirm'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { 
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
    </div>
  )
})

const PAIRS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'SOL/USD']

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: 'rgba(28, 28, 30, 0.98)',
  border: 'rgba(255,255,255,0.08)',
}

type ExecStatus = 'idle' | 'validating' | 'submitting' | 'filled' | 'rejected' | 'error'

export default function MobileChartPage() {
  const router = useRouter()
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const addPaperTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)

  // Order form state
  const [showOrderSheet, setShowOrderSheet] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [quantity, setQuantity] = useState('0.01')
  const [limitPrice, setLimitPrice] = useState('')
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [tpValue, setTpValue] = useState('')
  const [slValue, setSlValue] = useState('')

  // Execution state
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle')
  const [execMessage, setExecMessage] = useState('')
  const [execSource, setExecSource] = useState<string>('')

  // Live price
  const quoteKey = (quotes && selectedSymbol) ? Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  ) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null
  const changePercent = quote?.changePercent ?? 0

  // Adjust quantity
  const adjustQty = (delta: number) => {
    const current = parseFloat(quantity) || 0
    const step = (livePrice && livePrice > 1000) ? 0.01 : (livePrice && livePrice > 10) ? 0.1 : 1
    const newVal = Math.max(0, current + delta * step)
    setQuantity(newVal.toFixed(newVal < 1 ? 4 : newVal < 100 ? 2 : 0))
  }

  // Validate order
  const validateOrder = (): string | null => {
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) return 'يرجى إدخال كمية صالحة'
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) return 'يرجى إدخال سعر الحد'
    if (!livePrice || livePrice <= 0) return 'سعر السوق غير متوفر حالياً'

    const tp = parseFloat(tpValue)
    const sl = parseFloat(slValue)
    if (tpEnabled && tp) {
      if (orderSide === 'buy' && tp <= livePrice) return 'جني الأرباح يجب أن يكون أعلى من السعر الحالي'
      if (orderSide === 'sell' && tp >= livePrice) return 'جني الأرباح يجب أن يكون أقل من السعر الحالي'
    }
    if (slEnabled && sl) {
      if (orderSide === 'buy' && sl >= livePrice) return 'وقف الخسارة يجب أن يكون أقل من السعر الحالي'
      if (orderSide === 'sell' && sl <= livePrice) return 'وقف الخسارة يجب أن يكون أعلى من السعر الحالي'
    }
    return null
  }

  // Execute order — NestJS first, Alpaca fallback
  const executeOrder = useCallback(async () => {
    const validationError = validateOrder()
    if (validationError) {
      setExecStatus('error')
      setExecMessage(validationError)
      setTimeout(() => setExecStatus('idle'), 3000)
      return
    }

    setExecStatus('submitting')
    setExecMessage('جارٍ إرسال الأمر...')

    const body: Record<string, any> = {
      symbol: selectedSymbol,
      side: orderSide,
      qty: parseFloat(quantity),
      type: orderType,
      time_in_force: 'ioc',
    }
    if (orderType === 'limit' && limitPrice) body.limit_price = parseFloat(limitPrice)
    if (slEnabled && slValue) body.stop_loss = parseFloat(slValue)
    if (tpEnabled && tpValue) body.take_profit = parseFloat(tpValue)

    let success = false
    let orderId = ''
    let filledPrice = 0
    let source = ''

    // Path 1: NestJS Trading API
    try {
      await ensureAuth()
      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      const credentials = credData.data || credData.credentials || []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (credentialId) {
        const nestBody = {
          credentialId,
          symbol: selectedSymbol,
          side: orderSide.toUpperCase(),
          type: orderType.toUpperCase(),
          quantity: parseFloat(quantity),
          price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
          stopLoss: slEnabled && slValue ? parseFloat(slValue) : undefined,
          takeProfit: tpEnabled && tpValue ? parseFloat(tpValue) : undefined,
        }

        const res = await fetch('/api/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nestBody),
        })
        const j = await res.json()

        if (res.ok && j.id) {
          success = true
          orderId = j.id
          filledPrice = j.filledAvgPrice || j.avgFillPrice || livePrice || 0
          source = 'nestjs'
        } else if (res.status === 403) {
          setExecStatus('rejected')
          setExecMessage(j.message || 'تم رفض الأمر من حارس المخاطر')
          setExecSource('nestjs')
          setTimeout(() => setExecStatus('idle'), 5000)
          return
        } else {
          throw new Error(j.message || 'NestJS error')
        }
      } else {
        throw new Error('No credentials')
      }
    } catch {
      // Path 2: Alpaca Direct fallback
      try {
        const res = await fetch('/api/alpaca/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const j = await res.json()

        if (j.success) {
          success = true
          orderId = j.orderId
          filledPrice = j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : (livePrice || 0)
          source = 'alpaca'
        } else {
          setExecStatus('error')
          setExecMessage(j.error || 'فشل تنفيذ الأمر')
          setTimeout(() => setExecStatus('idle'), 4000)
          return
        }
      } catch {
        setExecStatus('error')
        setExecMessage('خطأ في الشبكة — تعذّر الوصول للمزود')
        setTimeout(() => setExecStatus('idle'), 4000)
        return
      }
    }

    if (success) {
      // Track in paper store
      addPaperTrade({
        symbol: selectedSymbol,
        side: orderSide === 'buy' ? 'long' : 'short',
        qty: parseFloat(quantity),
        entryPrice: filledPrice,
        currentPrice: livePrice || filledPrice,
        tp: tpEnabled && tpValue ? parseFloat(tpValue) : undefined,
        sl: slEnabled && slValue ? parseFloat(slValue) : undefined,
        source: 'manual',
        entryTime: Date.now()
      })

      setExecStatus('filled')
      const sourceLabel = source === 'nestjs' ? 'آمن 🛡️' : 'مباشر ⚡'
      setExecSource(sourceLabel)
      setExecMessage(`تم ${orderSide === 'buy' ? 'شراء' : 'بيع'} ${quantity} ${selectedSymbol} بسعر $${filledPrice.toFixed(2)}`)

      addNotification({
        source: 'trade',
        priority: 'high',
        action: orderSide === 'buy' ? 'BUY' : 'SELL',
        title: `تم ${orderSide === 'buy' ? 'شراء' : 'بيع'} ${selectedSymbol}`,
        body: `${quantity} ${selectedSymbol} @ $${filledPrice.toFixed(2)} [${sourceLabel}]`,
        pair: selectedSymbol,
        price: filledPrice,
      })

      // Refresh data
      fetchAccount()
      fetchPositions()
      setTimeout(() => { fetchAccount(); fetchPositions() }, 2000)

      // Auto-close sheet after delay
      setTimeout(() => {
        setShowOrderSheet(false)
        setExecStatus('idle')
        // Reset form
        setTpEnabled(false)
        setSlEnabled(false)
        setTpValue('')
        setSlValue('')
        setLimitPrice('')
      }, 2500)
    }
  }, [selectedSymbol, orderSide, orderType, quantity, limitPrice, tpEnabled, slEnabled, tpValue, slValue, livePrice, addPaperTrade, addNotification, fetchAccount, fetchPositions])

  // Estimated order value
  const orderValue = (livePrice || 0) * (parseFloat(quantity) || 0)

  return (
    <div style={{ position: 'absolute', inset: 0, paddingBottom: 80, background: '#000000', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 40 }}>

      {/* ── Minimalist Header ── */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
        paddingLeft: 12, paddingRight: 12, paddingBottom: 8,
        background: 'rgba(11, 14, 20, 0.9)',
        backdropFilter: 'blur(30px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        zIndex: 50,
      }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChevronRight size={20} color="#FFFFFF" />
          </button>

          {/* Live Price Display */}
          <div style={{ flexShrink: 0, minWidth: 100 }}>
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 16, fontWeight: 900, color: '#FFFFFF', fontFamily: "'JetBrains Mono', monospace" }}>
                {livePrice ? (livePrice > 100 ? livePrice.toLocaleString('en', { maximumFractionDigits: 2 }) : livePrice.toFixed(4)) : '—'}
              </span>
              {changePercent !== 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                  background: changePercent >= 0 ? 'rgba(50,215,75,0.15)' : 'rgba(255,69,58,0.15)',
                  color: changePercent >= 0 ? C.success : C.danger,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
          </div>

          {/* Pair Tabs */}
          <div style={{ overflowX: 'auto', flex: 1 }} className="scrollbar-hide">
            <div style={{ display: 'flex', gap: 4, width: 'max-content', direction: 'ltr' }}>
              {PAIRS.map(p => (
                <button key={p} onClick={() => setSelectedSymbol(p)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none',
                    background: selectedSymbol === p ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: selectedSymbol === p ? C.accent : 'rgba(255,255,255,0.35)',
                    fontSize: 10, fontWeight: selectedSymbol === p ? 800 : 600,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                    transition: '0.2s',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Chart Area ── */}
      <div style={{ 
        flex: 1, 
        margin: '6px 8px 8px', 
        borderRadius: 16,
        overflow: 'hidden',
        background: '#0B0E14',
        border: '0.5px solid rgba(255,255,255,0.06)',
        position: 'relative',
        direction: 'ltr',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        <RouaChart
          currentPrice={livePrice}
          mobile={true}
          compact={true}
        />

        {/* ── Buy/Sell Quick Buttons ── */}
        <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 60, display: 'flex', gap: 8 }}>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => { setOrderSide('buy'); setShowOrderSheet(true) }}
            style={{
              height: 40, padding: '0 16px', borderRadius: 12,
              background: 'rgba(50,215,75,0.2)',
              border: '1px solid rgba(50,215,75,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              color: C.success, fontSize: 12, fontWeight: 900,
              fontFamily: "'Cairo', sans-serif",
              backdropFilter: 'blur(10px)',
            }}
          >
            <TrendingUp size={14} />
            شراء
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => { setOrderSide('sell'); setShowOrderSheet(true) }}
            style={{
              height: 40, padding: '0 16px', borderRadius: 12,
              background: 'rgba(255,69,58,0.2)',
              border: '1px solid rgba(255,69,58,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              color: C.danger, fontSize: 12, fontWeight: 900,
              fontFamily: "'Cairo', sans-serif",
              backdropFilter: 'blur(10px)',
            }}
          >
            <TrendingDown size={14} />
            بيع
          </motion.button>
        </div>
      </div>

      {/* ── Order Execution Sheet ── */}
      <AnimatePresence>
        {showOrderSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }}
              style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
                background: C.bg,
                backdropFilter: 'blur(50px) saturate(200%)',
                borderRadius: '24px 24px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.15)',
                padding: '12px 20px calc(24px + env(safe-area-inset-bottom))',
                direction: 'rtl',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                maxHeight: '85vh',
                overflowY: 'auto',
              }}
            >
              <div className="flex justify-center mb-4">
                <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex flex-col">
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>تنفيذ صفقة</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span style={{ fontSize: 12, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: livePrice ? (changePercent >= 0 ? C.success : C.danger) : C.text2, fontFamily: "'JetBrains Mono', monospace" }}>
                      {livePrice ? (livePrice > 100 ? livePrice.toLocaleString('en', { maximumFractionDigits: 2 }) : livePrice.toFixed(4)) : '—'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }} 
                  style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
                >
                  <X size={18} color="#FFFFFF" />
                </button>
              </div>

              {/* Side Selector */}
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 4, display: 'flex', marginBottom: 16, position: 'relative' }}>
                <motion.div
                  animate={{ x: orderSide === 'buy' ? 0 : '100%' }}
                  style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', bottom: 4, background: orderSide === 'buy' ? C.success : C.danger, borderRadius: 12, zIndex: 0 }}
                />
                <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>شراء</button>
                <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>بيع</button>
              </div>

              {/* Order Type + Quantity Row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {/* Order Type Toggle */}
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>نوع الأمر</label>
                  <div style={{ display: 'flex', gap: 4, padding: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                    <button
                      onClick={() => setOrderType('market')}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: 8,
                        background: orderType === 'market' ? C.accent : 'transparent',
                        color: orderType === 'market' ? '#000' : C.text2,
                        fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                        border: 'none', cursor: 'pointer',
                      }}
                    >سوقي</button>
                    <button
                      onClick={() => setOrderType('limit')}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: 8,
                        background: orderType === 'limit' ? C.accent : 'transparent',
                        color: orderType === 'limit' ? '#000' : C.text2,
                        fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                        border: 'none', cursor: 'pointer',
                      }}
                    >محدد</button>
                  </div>
                </div>

                {/* Quantity Input */}
                <div style={{ flex: 1.3 }}>
                  <label style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>الكمية</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => adjustQty(-1)}
                      style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <Minus size={14} color={C.text} />
                    </motion.button>
                    <input
                      value={quantity} onChange={e => setQuantity(e.target.value)}
                      type="number"
                      style={{
                        flex: 1, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                        border: `0.5px solid ${C.border}`, padding: '0 8px',
                        color: C.text, fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                        outline: 'none', direction: 'ltr', textAlign: 'center',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => adjustQty(1)}
                      style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <Plus size={14} color={C.text} />
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Limit Price */}
              {orderType === 'limit' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>سعر الحد</label>
                  <input
                    value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                    type="number" placeholder={livePrice?.toString() || '0.00'}
                    style={{
                      width: '100%', height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.05)',
                      border: `0.5px solid ${C.border}`, padding: '0 12px',
                      color: C.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none', direction: 'ltr', textAlign: 'left',
                    }}
                  />
                </motion.div>
              )}

              {/* TP / SL Toggles */}
              <div className="space-y-2 mb-5">
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '12px', border: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target size={16} color={C.success} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>جني الأرباح (TP)</span>
                    </div>
                    <button onClick={() => setTpEnabled(!tpEnabled)} style={{ width: 42, height: 24, borderRadius: 12, background: tpEnabled ? C.success : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}>
                      <motion.div animate={{ x: tpEnabled ? 18 : 2 }} style={{ position: 'absolute', top: 2, left: 0, width: 20, height: 20, borderRadius: '50%', background: '#FFF' }} />
                    </button>
                  </div>
                  {tpEnabled && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="pt-3">
                      <input type="number" placeholder="سعر الهدف..." value={tpValue} onChange={(e) => setTpValue(e.target.value)} style={{ width: '100%', height: 38, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', color: '#FFF', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }} />
                    </motion.div>
                  )}
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '12px', border: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} color={C.danger} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>وقف الخسارة (SL)</span>
                    </div>
                    <button onClick={() => setSlEnabled(!slEnabled)} style={{ width: 42, height: 24, borderRadius: 12, background: slEnabled ? C.danger : 'rgba(255,255,255,0.1)', position: 'relative', border: 'none' }}>
                      <motion.div animate={{ x: slEnabled ? 18 : 2 }} style={{ position: 'absolute', top: 2, left: 0, width: 20, height: 20, borderRadius: '50%', background: '#FFF' }} />
                    </button>
                  </div>
                  {slEnabled && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="pt-3">
                      <input type="number" placeholder="سعر التوقف..." value={slValue} onChange={(e) => setSlValue(e.target.value)} style={{ width: '100%', height: 38, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px', color: '#FFF', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none' }} />
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Order Value Preview */}
              {orderValue > 0 && (
                <div style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '10px 14px',
                  marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  border: '0.5px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>القيمة التقديرية</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: orderSide === 'buy' ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                    ${orderValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Execution Status / Confirm */}
              {execStatus === 'submitting' ? (
                <div style={{
                  padding: '14px', borderRadius: 16,
                  background: 'rgba(0,212,255,0.08)', border: `0.5px solid rgba(0,212,255,0.2)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Loader2 size={20} className="animate-spin" color={C.accent} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
                </div>
              ) : execStatus === 'filled' ? (
                <div style={{
                  padding: '14px', borderRadius: 16,
                  background: 'rgba(50,215,75,0.12)', border: `0.5px solid rgba(50,215,75,0.3)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <CheckCircle size={20} color={C.success} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.success, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
                </div>
              ) : execStatus === 'rejected' || execStatus === 'error' ? (
                <div style={{
                  padding: '14px', borderRadius: 16,
                  background: 'rgba(255,69,58,0.12)', border: `0.5px solid rgba(255,69,58,0.3)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
                }}>
                  <AlertCircle size={20} color={C.danger} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.danger, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
                </div>
              ) : null}

              {/* SlideToConfirm (only when idle or after error) */}
              {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
                <SlideToConfirm 
                  onConfirm={executeOrder}
                  color={orderSide === 'buy' ? C.success : C.danger}
                  label={orderSide === 'buy' ? 'اسحب لتأكيد الشراء' : 'اسحب لتأكيد البيع'}
                />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
