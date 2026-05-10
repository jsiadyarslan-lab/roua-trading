'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'
import {
  X, Target, ShieldAlert, Loader2, CheckCircle, AlertCircle,
  Minus, Plus, Wallet, ArrowUpRight, ArrowDownRight
} from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
    </div>
  )
})

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

function ChartPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const addPaperTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const account = usePositionsStore(s => s.account)
  const positions = usePositionsStore(s => s.positions)

  // Read symbol and side from URL params (e.g. from Markets page click)
  useEffect(() => {
    const symbolParam = searchParams.get('symbol')
    if (symbolParam) {
      setSelectedSymbol(symbolParam)
    }
    const sideParam = searchParams.get('side')
    if (sideParam === 'BUY' || sideParam === 'buy') {
      setOrderSide('buy')
    } else if (sideParam === 'SELL' || sideParam === 'sell') {
      setOrderSide('sell')
    }
  }, [searchParams, setSelectedSymbol])

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

  // Pair selector
  const [showPairDropdown, setShowPairDropdown] = useState(false)
  const PAIRS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'SOL/USD']

  // Live price
  const quoteKey = (quotes && selectedSymbol) ? Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  ) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null
  const changePercent = quote?.changePercent ?? 0

  // Account balance
  const buyingPower = account?.buying_power ? Number(account.buying_power) : 0
  const equity = account?.equity ? Number(account.equity) : 0

  // Total P&L from positions
  const totalPnl = positions.reduce((sum, p) => {
    const pnl = Number(p.unrealizedPnl || 0)
    return sum + pnl
  }, 0)

  // Adjust quantity
  const adjustQty = (delta: number) => {
    const current = parseFloat(quantity) || 0
    const step = (livePrice && livePrice > 1000) ? 0.01 : (livePrice && livePrice > 10) ? 0.1 : 1
    const newVal = Math.max(0, current + delta * step)
    setQuantity(newVal.toFixed(newVal < 1 ? 4 : newVal < 100 ? 2 : 0))
  }

  // Quick quantity presets (% of buying power)
  const setQtyPercent = (pct: number) => {
    if (!livePrice || livePrice <= 0 || buyingPower <= 0) return
    const qty = (buyingPower * pct / 100) / livePrice
    const step = livePrice > 1000 ? 0.01 : livePrice > 10 ? 0.1 : 1
    setQuantity(Math.max(step, Math.floor(qty / step) * step).toFixed(livePrice > 1000 ? 2 : livePrice > 10 ? 1 : 0))
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
  const executeOrder = useCallback(async (side: 'buy' | 'sell') => {
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
      side: side,
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
          side: side.toUpperCase(),
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
      addPaperTrade({
        symbol: selectedSymbol,
        side: side === 'buy' ? 'long' : 'short',
        qty: parseFloat(quantity),
        entryPrice: filledPrice,
        currentPrice: livePrice || filledPrice,
        tp: tpEnabled && tpValue ? parseFloat(tpValue) : undefined,
        sl: slEnabled && slValue ? parseFloat(slValue) : undefined,
        source: 'manual',
        entryTime: Date.now()
      })

      setExecStatus('filled')
      const sourceLabel = source === 'nestjs' ? 'آمن' : 'مباشر'
      setExecSource(sourceLabel)
      setExecMessage(`تم ${side === 'buy' ? 'شراء' : 'بيع'} ${quantity} ${selectedSymbol} بسعر $${filledPrice.toFixed(2)}`)

      addNotification({
        source: 'trade',
        priority: 'high',
        action: side === 'buy' ? 'BUY' : 'SELL',
        title: `تم ${side === 'buy' ? 'شراء' : 'بيع'} ${selectedSymbol}`,
        body: `${quantity} ${selectedSymbol} @ $${filledPrice.toFixed(2)} [${sourceLabel}]`,
        pair: selectedSymbol,
        price: filledPrice,
      })

      fetchAccount()
      fetchPositions()
      setTimeout(() => { fetchAccount(); fetchPositions() }, 2000)

      // Auto-close sheet after delay
      setTimeout(() => {
        setShowOrderSheet(false)
        setExecStatus('idle')
        setTpEnabled(false)
        setSlEnabled(false)
        setTpValue('')
        setSlValue('')
        setLimitPrice('')
      }, 2500)
    }
  }, [selectedSymbol, orderType, quantity, limitPrice, tpEnabled, slEnabled, tpValue, slValue, livePrice, addPaperTrade, addNotification, fetchAccount, fetchPositions])

  // Quick Buy/Sell from bottom bar (opens sheet with side pre-set, then executes)
  const handleQuickBuy = useCallback(() => {
    setOrderSide('buy')
    setShowOrderSheet(true)
  }, [])

  const handleQuickSell = useCallback(() => {
    setOrderSide('sell')
    setShowOrderSheet(true)
  }, [])

  // Estimated order value
  const orderValue = (livePrice || 0) * (parseFloat(quantity) || 0)

  // Fetch account data on mount
  useEffect(() => {
    fetchAccount()
    fetchPositions()
  }, [fetchAccount, fetchPositions])

  // Format price consistently
  const fmtPrice = (p: number | null) => {
    if (!p) return '—'
    if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return p.toFixed(4)
  }

  // Ref for dropdown to close on outside click
  const dropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPairDropdown(false)
      }
    }
    if (showPairDropdown) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPairDropdown])

  return (
    <div style={{
      /* Direct calc: --app-height minus navbar padding (35px + safe-area).
         This avoids relying on the template's height which is now minHeight-only. */
      height: 'calc(var(--app-height, 100dvh) - 56px)',
      background: '#000000',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ═══ TOP BAR: Pair Name + Price + Trade Button ═══ */}
      <div style={{
        flexShrink: 0,
        height: 38,
        marginTop: 'calc(env(safe-area-inset-top) + 2px)',
        marginLeft: 8,
        marginRight: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        direction: 'rtl',
      }}>
        {/* Left: Pair selector + Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
          {/* Pair dropdown */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPairDropdown(!showPairDropdown)}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 6,
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.2)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>
                {selectedSymbol}
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {/* Dropdown */}
            {showPairDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 33,
                minWidth: 140, maxHeight: 200, overflowY: 'auto',
                background: 'rgba(20,20,22,0.98)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: 10,
                padding: 4,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}>
                {PAIRS.map(pair => {
                  const isActive = selectedSymbol === pair
                  return (
                    <button
                      key={pair}
                      onClick={() => { setSelectedSymbol(pair); setShowPairDropdown(false) }}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 6,
                        background: isActive ? 'rgba(0,212,255,0.12)' : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#00D4FF' : '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>
                        {pair}
                      </span>
                      {isActive && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* Price */}
          <span style={{
            fontSize: 13, fontWeight: 900,
            color: livePrice ? (changePercent >= 0 ? C.success : C.danger) : C.text2,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {fmtPrice(livePrice)}
          </span>
          {/* Change % */}
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: changePercent >= 0 ? C.success : C.danger,
            fontFamily: "'JetBrains Mono', monospace",
            padding: '1px 4px', borderRadius: 4,
            background: changePercent >= 0 ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)',
          }}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </span>
        </div>

        {/* Right: Trade button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => { setOrderSide('buy'); setShowOrderSheet(true) }}
          style={{
            height: 26,
            padding: '0 10px',
            borderRadius: 7,
            background: 'rgba(0,212,255,0.12)',
            border: '1px solid rgba(0,212,255,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2.5">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
          </svg>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#00D4FF', fontFamily: "'Cairo', sans-serif" }}>تداول</span>
        </motion.button>
      </div>

      {/* ═══ CHART AREA (takes all remaining space) ═══ */}
      <div style={{
        flex: 1,
        marginLeft: 8,
        marginRight: 8,
        marginBottom: 0,
        borderRadius: 14,
        overflow: 'hidden',
        background: '#0B0E14',
        border: '1.5px solid rgba(0,212,255,0.35)',
        position: 'relative',
        direction: 'ltr',
        boxShadow: '0 0 0 1px rgba(0,212,255,0.15), 0 4px 16px rgba(0,0,0,0.3)',
        minHeight: 0,
      }}>
        <RouaChart
          currentPrice={livePrice}
          mobile={true}
          compact={true}
        />

        {/* ── Floating Timeframe Buttons — Top-Left ── */}
        <div style={{
          position: 'absolute',
          top: 6,
          left: 6,
          zIndex: 32,
          display: 'flex',
          gap: 2,
          direction: 'ltr',
        }}>
          {['5m', '15m', '1h', '4h', '1d'].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                height: 20,
                padding: '0 5px',
                borderRadius: 5,
                background: timeframe === tf ? 'rgba(0,212,255,0.18)' : 'rgba(0,0,0,0.5)',
                border: timeframe === tf ? '1px solid rgba(0,212,255,0.35)' : '1px solid rgba(255,255,255,0.06)',
                color: timeframe === tf ? '#00D4FF' : 'rgba(255,255,255,0.35)',
                fontSize: 7,
                fontWeight: timeframe === tf ? 800 : 600,
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer',
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Bottom spacer for navbar ═══ */}
      <div style={{ flexShrink: 0, height: 6 }} />

      {/* ═══ ORDER EXECUTION SHEET (Bottom Sheet) ═══ */}
      <AnimatePresence>
        {showOrderSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }}
              style={{ position: 'fixed', inset: 0, zIndex: 34, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{
                position: 'fixed', bottom: '56px', left: 0, right: 0, zIndex: 35,
                background: C.bg,
                backdropFilter: 'blur(50px) saturate(200%)',
                borderRadius: '24px 24px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.15)',
                direction: 'rtl',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2" style={{ flexShrink: 0 }}>
                <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              {/* Scrollable content area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>

                {/* Header with Balance */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col">
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>تنفيذ صفقة</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ fontSize: 12, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: livePrice ? (changePercent >= 0 ? C.success : C.danger) : C.text2, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPrice(livePrice)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {buyingPower > 0 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        padding: '4px 8px', borderRadius: 8,
                        background: 'rgba(0,212,255,0.08)',
                        border: '0.5px solid rgba(0,212,255,0.15)',
                      }}>
                        <Wallet size={12} color={C.accent} />
                        <span style={{ fontSize: 9, color: C.accent, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                          ${buyingPower.toLocaleString('en', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
                    >
                      <X size={18} color="#FFFFFF" />
                    </button>
                  </div>
                </div>

                {/* Side Selector */}
                <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 4, display: 'flex', marginBottom: 14, position: 'relative' }}>
                  <motion.div
                    animate={{ x: orderSide === 'buy' ? 0 : '100%' }}
                    style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', bottom: 4, background: orderSide === 'buy' ? C.success : C.danger, borderRadius: 12, zIndex: 0 }}
                  />
                  <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>شراء</button>
                  <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>بيع</button>
                </div>

                {/* Order Type + Quantity Row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
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

                {/* Quick Quantity Presets */}
                {buyingPower > 0 && livePrice && livePrice > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    {[5, 10, 25, 50].map(pct => (
                      <button
                        key={pct}
                        onClick={() => setQtyPercent(pct)}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: 8,
                          background: 'rgba(255,255,255,0.04)',
                          border: '0.5px solid rgba(255,255,255,0.08)',
                          color: C.text2, fontSize: 10, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          cursor: 'pointer',
                        }}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                )}

                {/* Limit Price */}
                {orderType === 'limit' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginBottom: 10 }}>
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
                <div className="space-y-2 mb-4">
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
                    marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: '0.5px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>القيمة التقديرية</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: orderSide === 'buy' ? C.success : C.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                      ${orderValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* Execution Status Messages */}
                {execStatus === 'submitting' && (
                  <div style={{
                    padding: '12px', borderRadius: 14,
                    background: 'rgba(0,212,255,0.08)', border: `0.5px solid rgba(0,212,255,0.2)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    marginBottom: 10,
                  }}>
                    <Loader2 size={18} className="animate-spin" color={C.accent} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
                  </div>
                )}
                {execStatus === 'filled' && (
                  <div style={{
                    padding: '12px', borderRadius: 14,
                    background: 'rgba(50,215,75,0.12)', border: `0.5px solid rgba(50,215,75,0.3)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    marginBottom: 10,
                  }}>
                    <CheckCircle size={18} color={C.success} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.success, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
                  </div>
                )}
                {(execStatus === 'rejected' || execStatus === 'error') && (
                  <div style={{
                    padding: '12px', borderRadius: 14,
                    background: 'rgba(255,69,58,0.12)', border: `0.5px solid rgba(255,69,58,0.3)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    marginBottom: 10,
                  }}>
                    <AlertCircle size={18} color={C.danger} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.danger, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
                  </div>
                )}
              </div>{/* END scrollable content */}

              {/* Fixed Bottom — Buy / Sell Buttons (always visible in sheet, above navbar) */}
              <div style={{ flexShrink: 0, padding: '8px 20px 20px', borderTop: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(20,20,22,0.95)', position: 'relative', zIndex: 36 }}>
                {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => executeOrder('buy')}
                      style={{
                        flex: 1, height: 50, borderRadius: 14,
                        background: C.success, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 17, fontWeight: 900, color: '#000', fontFamily: "'Cairo', sans-serif",
                      }}
                    >
                      <ArrowUpRight size={20} />
                      شراء
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => executeOrder('sell')}
                      style={{
                        flex: 1, height: 50, borderRadius: 14,
                        background: C.danger, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 17, fontWeight: 900, color: '#FFF', fontFamily: "'Cairo', sans-serif",
                      }}
                    >
                      <ArrowDownRight size={20} />
                      بيع
                    </motion.button>
                  </div>
                )}
                {execStatus === 'submitting' && (
                  <div style={{
                    height: 50, borderRadius: 14,
                    background: 'rgba(0,212,255,0.1)', border: `0.5px solid rgba(0,212,255,0.2)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <Loader2 size={20} className="animate-spin" color={C.accent} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>جارٍ التنفيذ...</span>
                  </div>
                )}
                {(execStatus === 'filled') && (
                  <div style={{
                    height: 50, borderRadius: 14,
                    background: 'rgba(50,215,75,0.15)', border: `0.5px solid rgba(50,215,75,0.3)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <CheckCircle size={20} color={C.success} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.success, fontFamily: "'Cairo', sans-serif" }}>تم التنفيذ بنجاح</span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function MobileChartPage() {
  return (
    <Suspense fallback={
      <div style={{ height: 'calc(var(--app-height, 100dvh) - 35px - env(safe-area-inset-bottom, 0px))', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
      </div>
    }>
      <ChartPageContent />
    </Suspense>
  )
}
