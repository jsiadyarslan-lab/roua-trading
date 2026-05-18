'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'
import { TIMEFRAMES } from '@/lib/charts/types'
import type { DrawingTool } from '@/lib/charts/types'
import {
  X, Target, ShieldAlert, Loader2, CheckCircle, AlertCircle,
  Minus, Plus, Crosshair, TrendingUp, Pencil, MousePointer2,
  Clock, Zap, Timer, BarChart3, ChevronDown
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

/* ─── Pair Descriptions ─── */
const PAIR_DESCRIPTIONS: Record<string, string> = {
  'BTC/USD': 'Bitcoin vs US Dollar',
  'ETH/USD': 'Ethereum vs US Dollar',
  'XAU/USD': 'Gold vs US Dollar',
  'EUR/USD': 'Euro vs US Dollar',
  'GBP/USD': 'Great Britain Pound vs US Dollar',
  'SOL/USD': 'Solana vs US Dollar',
  'USD/JPY': 'US Dollar vs Japanese Yen',
  'USD/CHF': 'US Dollar vs Swiss Franc',
  'AUD/USD': 'Australian Dollar vs US Dollar',
  'NZD/USD': 'New Zealand Dollar vs US Dollar',
  'USD/CAD': 'US Dollar vs Canadian Dollar',
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
  const refreshAfterTrade = usePositionsStore(s => s.refreshAfterTrade)
  const account = usePositionsStore(s => s.account)
  const positions = usePositionsStore(s => s.positions)

  // Chart actions ref for external toolbar control
  const chartActionsRef = useRef<{
    toggleIndicators: () => void;
    toggleDrawings: () => void;
    setTool: (tool: DrawingTool) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    togglePause: () => void;
    setChartType: (type: any) => void;
    isPaused: boolean;
    activeTool: DrawingTool;
    addPriceLine: (id: string, price: number, color: string, label: string, lineWidth?: number, lineStyle?: number, axisLabelVisible?: boolean) => void;
    removePriceLine: (id: string) => void;
  } | null>(null)

  // Read symbol and side from URL params
  useEffect(() => {
    const symbolParam = searchParams.get('symbol')
    if (symbolParam) {
      setSelectedSymbol(symbolParam)
    }
  }, [searchParams, setSelectedSymbol])

  // Order form state
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

  // Execution state
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle')
  const [execMessage, setExecMessage] = useState('')
  const [execSource, setExecSource] = useState<string>('')

  // Pair selector
  const [showPairDropdown, setShowPairDropdown] = useState(false)
  // Timeframe panel
  const [showTimeframePanel, setShowTimeframePanel] = useState(false)
  const PAIRS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'SOL/USD']

  // Live price + OHLC
  const quoteKey = (quotes && selectedSymbol) ? Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  ) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null
  const changePercent = quote?.changePercent ?? 0
  const ohlc = quote ? {
    open: Number(quote.open || quote.price || 0),
    high: Number(quote.high || quote.price || 0),
    low: Number(quote.low || quote.price || 0),
    close: Number(quote.close || quote.price || 0),
  } : null

  // Account balance
  const buyingPower = account?.buying_power ? Number(account.buying_power) : 0

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
    if (orderType === 'stop' && (!stopPrice || parseFloat(stopPrice) <= 0)) return 'يرجى إدخال سعر الوقف'
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

  // Execute order
  const executeOrder = async (side: 'buy' | 'sell') => {
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
      type: orderType === 'stop' ? 'stop' : orderType,
      time_in_force: 'ioc',
    }
    if (orderType === 'limit' && limitPrice) body.limit_price = parseFloat(limitPrice)
    if (orderType === 'stop' && stopPrice) body.stop_price = parseFloat(stopPrice)
    if (slEnabled && slValue) body.stop_loss = parseFloat(slValue)
    if (tpEnabled && tpValue) body.take_profit = parseFloat(tpValue)

    let success = false
    let orderId = ''
    let filledPrice = 0
    let source = ''

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
          stopPrice: orderType === 'stop' && stopPrice ? parseFloat(stopPrice) : undefined,
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
          setExecMessage(j.message || 'تم رفض الأمر')
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
        setExecMessage('خطأ في الشبكة')
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

      refreshAfterTrade()

      setTimeout(() => {
        setShowOrderSheet(false)
        setExecStatus('idle')
        setTpEnabled(false)
        setSlEnabled(false)
        setTpValue('')
        setSlValue('')
        setLimitPrice('')
        setStopPrice('')
      }, 2500)
    }
  }

  // Format price
  const fmtPrice = (p: number | null) => {
    if (!p) return '—'
    if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return p.toFixed(4)
  }

  // Format OHLC short
  const fmtOHLC = (p: number) => {
    if (p > 100) return p.toFixed(2)
    return p.toFixed(4)
  }

  // Ref for dropdown
  const dropdownRef = useRef<HTMLDivElement>(null)
  const tfPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPairDropdown(false)
      }
      if (tfPanelRef.current && !tfPanelRef.current.contains(e.target as Node)) {
        setShowTimeframePanel(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const [chartFullscreen, setChartFullscreen] = useState(false)

  // Current timeframe label
  const activeTF = TIMEFRAMES.find(t => t.value === timeframe)
  const tfLabel = activeTF?.label || timeframe

  // Open execution sheet for market order
  const openExecution = useCallback((side: 'buy' | 'sell') => {
    setOrderSide(side)
    setOrderType('market')
    setShowOrderSheet(true)
  }, [])

  // Open pending order sheet
  const openPendingOrder = useCallback(() => {
    setOrderSide('buy')
    setOrderType('limit')
    setShowOrderSheet(true)
  }, [])

  // ── Current Price Line (Red) & Support/Resistance Lines (Blue) ──
  // Red horizontal line at the current live price
  // Blue dashed lines at auto-calculated support/resistance levels
  const prevPriceLinePrice = useRef<number | null>(null)

  useEffect(() => {
    const actions = chartActionsRef.current
    if (!actions || !livePrice || livePrice <= 0) return

    // Only update when price changes significantly (avoid jitter)
    const shouldUpdate = prevPriceLinePrice.current === null ||
      Math.abs(livePrice - prevPriceLinePrice.current) > (livePrice * 0.0001)

    if (shouldUpdate) {
      // ── Red current price line ──
      actions.addPriceLine(
        'mobile-current-price',
        livePrice,
        '#FF453A',
        fmtPrice(livePrice),
        1,
        0,   // Solid line
        true
      )
      prevPriceLinePrice.current = livePrice

      // ── Blue support/resistance lines ──
      // Calculate from OHLC data: support near recent low, resistance near recent high
      if (ohlc) {
        const priceRange = ohlc.high - ohlc.low
        const supportLevel = ohlc.low - priceRange * 0.15
        const resistanceLevel = ohlc.high + priceRange * 0.15

        // Near-term support (just below current price)
        const nearSupport = livePrice - priceRange * 0.08
        // Near-term resistance (just above current price)
        const nearResistance = livePrice + priceRange * 0.08

        actions.addPriceLine(
          'mobile-support-1',
          nearSupport,
          'rgba(0,122,255,0.6)',
          'S1',
          1,
          2,   // Dashed line
          true
        )
        actions.addPriceLine(
          'mobile-resistance-1',
          nearResistance,
          'rgba(0,122,255,0.6)',
          'R1',
          1,
          2,   // Dashed line
          true
        )
        actions.addPriceLine(
          'mobile-support-2',
          supportLevel,
          'rgba(0,122,255,0.35)',
          'S2',
          1,
          3,   // Large dashed line
          true
        )
        actions.addPriceLine(
          'mobile-resistance-2',
          resistanceLevel,
          'rgba(0,122,255,0.35)',
          'R2',
          1,
          3,   // Large dashed line
          true
        )
      }
    }
  }, [livePrice, ohlc])

  // Cleanup price lines on unmount or symbol change
  useEffect(() => {
    return () => {
      const actions = chartActionsRef.current
      if (actions) {
        actions.removePriceLine('mobile-current-price')
        actions.removePriceLine('mobile-support-1')
        actions.removePriceLine('mobile-resistance-1')
        actions.removePriceLine('mobile-support-2')
        actions.removePriceLine('mobile-resistance-2')
      }
      prevPriceLinePrice.current = null
    }
  }, [selectedSymbol])

  return (
    <div style={{
      height: '100%',
      background: '#0B0E14',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ═══════════════════════════════════════════════════
          PAIR INFO BAR — MetaTrader Style
          Name ▼ | TF | OHLC values | Description
          ═══════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        paddingTop: 'calc(env(safe-area-inset-top) + 4px)',
        paddingBottom: 4,
        paddingLeft: 10,
        paddingRight: 10,
        background: '#0B0E14',
        direction: 'rtl',
      }}>
        {/* Line 1: Pair name ▼ + Timeframe + OHLC */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, direction: 'ltr' }}>
          {/* Pair Selector */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowPairDropdown(!showPairDropdown); setShowTimeframePanel(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 6px', borderRadius: 4,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>
                {selectedSymbol.replace('/', '')}
              </span>
              <ChevronDown size={12} color="#00D4FF" strokeWidth={3} />
            </button>
            {showPairDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 60,
                minWidth: 150, maxHeight: 220, overflowY: 'auto',
                background: 'rgba(15,17,23,0.98)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: 8,
                padding: 4,
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
              }}>
                {PAIRS.map(pair => {
                  const isActive = selectedSymbol === pair
                  return (
                    <button
                      key={pair}
                      onClick={() => { setSelectedSymbol(pair); setShowPairDropdown(false) }}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 4,
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

          {/* Separator */}
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>|</span>

          {/* Timeframe */}
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: "'JetBrains Mono', monospace" }}>
            {tfLabel}
          </span>

          {/* Separator */}
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>|</span>

          {/* OHLC Values */}
          {ohlc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>O</span>
              <span style={{ color: '#F0F2F5', fontWeight: 600 }}>{fmtOHLC(ohlc.open)}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>H</span>
              <span style={{ color: '#32D74B', fontWeight: 600 }}>{fmtOHLC(ohlc.high)}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>L</span>
              <span style={{ color: '#FF453A', fontWeight: 600 }}>{fmtOHLC(ohlc.low)}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>C</span>
              <span style={{ color: changePercent >= 0 ? '#32D74B' : '#FF453A', fontWeight: 700 }}>{fmtOHLC(ohlc.close)}</span>
            </div>
          )}
        </div>

        {/* Line 2: Pair description */}
        <div style={{ marginTop: 1, direction: 'ltr' }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
            {PAIR_DESCRIPTIONS[selectedSymbol] || `${selectedSymbol} Trading`}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          TOOLBAR — Compact Icon Row
          Execution | Pending | Indicators | Tools | Cursor | Timeframes
          ═══════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        height: 36,
        paddingLeft: 6,
        paddingRight: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#0B0E14',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        direction: 'rtl',
      }}>
        {/* زر التنفيذ (Execution) */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => openExecution('buy')}
          style={{
            width: 32, height: 28, borderRadius: 6,
            background: 'rgba(50,215,75,0.12)',
            border: '1px solid rgba(50,215,75,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', position: 'relative',
          }}
          title="تنفيذ أمر سوقي"
        >
          <Zap size={14} color="#32D74B" />
        </motion.button>

        {/* زر تنفيذ أوامر معلقة (Pending Orders) */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={openPendingOrder}
          style={{
            width: 32, height: 28, borderRadius: 6,
            background: 'rgba(255,184,0,0.1)',
            border: '1px solid rgba(255,184,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="أوامر معلقة"
        >
          <Timer size={14} color="#FFB800" />
        </motion.button>

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

        {/* زر المؤشرات (Indicators) */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => chartActionsRef.current?.toggleIndicators()}
          style={{
            width: 32, height: 28, borderRadius: 6,
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="المؤشرات"
        >
          <BarChart3 size={14} color="#00D4FF" />
        </motion.button>

        {/* زر الأدوات (Tools / Drawings) */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => chartActionsRef.current?.toggleDrawings()}
          style={{
            width: 32, height: 28, borderRadius: 6,
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="أدوات الرسم"
        >
          <Pencil size={14} color="#00D4FF" />
        </motion.button>

        {/* زر المؤشر (Cursor) */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => chartActionsRef.current?.setTool('cursor')}
          style={{
            width: 32, height: 28, borderRadius: 6,
            background: 'rgba(0,212,255,0.15)',
            border: '1px solid rgba(0,212,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="المؤشر"
        >
          <MousePointer2 size={14} color="#00D4FF" />
        </motion.button>

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

        {/* الفريمات الزمنية (Timeframes) */}
        <div ref={tfPanelRef} style={{ position: 'relative' }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => { setShowTimeframePanel(!showTimeframePanel); setShowPairDropdown(false) }}
            style={{
              height: 28, minWidth: 40, borderRadius: 6,
              padding: '0 8px',
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              cursor: 'pointer',
            }}
            title="الإطار الزمني"
          >
            <Clock size={12} color="#00D4FF" />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>{tfLabel}</span>
          </motion.button>
          {showTimeframePanel && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 60,
              minWidth: 220,
              background: 'rgba(15,17,23,0.98)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 8,
              padding: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginBottom: 6, direction: 'rtl' }}>الإطار الزمني</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
                {TIMEFRAMES.map(tf => {
                  const isActive = timeframe === tf.value
                  return (
                    <button
                      key={tf.value}
                      onClick={() => { setTimeframe(tf.value); setShowTimeframePanel(false) }}
                      style={{
                        background: isActive ? '#00D4FF' : '#1a1f2e',
                        border: `1px solid ${isActive ? '#00D4FF' : 'rgba(255,255,255,0.08)'}`,
                        color: isActive ? '#000' : 'rgba(255,255,255,0.5)',
                        borderRadius: 4, padding: '5px 0',
                        fontSize: 9, fontWeight: isActive ? 800 : 600,
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: 'pointer', textAlign: 'center',
                      }}
                    >
                      {tf.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Live Price Display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, direction: 'ltr' }}>
          <span style={{
            fontSize: 13, fontWeight: 900,
            color: livePrice ? (changePercent >= 0 ? C.success : C.danger) : C.text2,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {fmtPrice(livePrice)}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: changePercent >= 0 ? C.success : C.danger,
            fontFamily: "'JetBrains Mono', monospace",
            padding: '1px 4px', borderRadius: 3,
            background: changePercent >= 0 ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)',
          }}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          CHART AREA — Maximized
          ═══════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        position: 'relative',
        direction: 'ltr',
        minHeight: 0,
      }}>
        <RouaChart
          currentPrice={livePrice}
          mobile={true}
          hideToolbar={true}
          isChartFullscreen={chartFullscreen}
          onToggleChartFullscreen={() => setChartFullscreen(!chartFullscreen)}
          chartActions={chartActionsRef}
        />
      </div>

      {/* ═══════════════════════════════════════════════════
          ORDER SHEET — Full Execution Panel
          ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showOrderSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }}
              style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{
                position: 'fixed', bottom: '56px', left: 0, right: 0, zIndex: 45,
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
              <div className="flex justify-center pt-3 pb-2" style={{ flexShrink: 0 }}>
                <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: "'Cairo', sans-serif" }}>
                    {orderType === 'market' ? 'تنفيذ أمر سوقي' : orderType === 'limit' ? 'أمر محدد' : 'أمر وقف'}
                  </h2>
                  <button
                    onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
                  >
                    <X size={18} color="#FFFFFF" />
                  </button>
                </div>

                {/* Buy/Sell Toggle */}
                <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 4, display: 'flex', marginBottom: 14, position: 'relative' }}>
                  <motion.div
                    animate={{ x: orderSide === 'buy' ? 0 : '100%' }}
                    style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', bottom: 4, background: orderSide === 'buy' ? C.success : C.danger, borderRadius: 12, zIndex: 0 }}
                  />
                  <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>شراء</button>
                  <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: "'Cairo', sans-serif", zIndex: 1, position: 'relative' }}>بيع</button>
                </div>

                {/* Order Type + Quantity */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>نوع الأمر</label>
                    <div style={{ display: 'flex', gap: 3, padding: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                      {[
                        { key: 'market' as const, label: 'سوقي' },
                        { key: 'limit' as const, label: 'محدد' },
                        { key: 'stop' as const, label: 'وقف' },
                      ].map(ot => (
                        <button
                          key={ot.key}
                          onClick={() => setOrderType(ot.key)}
                          style={{
                            flex: 1, padding: '5px 0', borderRadius: 8,
                            background: orderType === ot.key ? C.accent : 'transparent',
                            color: orderType === ot.key ? '#000' : C.text2,
                            fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                            border: 'none', cursor: 'pointer',
                          }}
                        >{ot.label}</button>
                      ))}
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

                {/* Stop Price */}
                {orderType === 'stop' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>سعر الوقف</label>
                    <input
                      value={stopPrice} onChange={e => setStopPrice(e.target.value)}
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

                {/* TP/SL */}
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

                {/* Execute Button */}
                <div style={{ flexShrink: 0, padding: '8px 20px 20px', borderTop: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(20,20,22,0.95)', position: 'relative', zIndex: 36 }}>
                  {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => executeOrder(orderSide)}
                        disabled={false}
                        style={{
                          flex: 1,
                          padding: '14px 0',
                          borderRadius: 12,
                          border: 'none',
                          background: orderSide === 'buy'
                            ? 'linear-gradient(135deg, #32D74B 0%, #28A745 100%)'
                            : 'linear-gradient(135deg, #FF453A 0%, #DC2626 100%)',
                          color: '#FFFFFF',
                          fontSize: 14,
                          fontWeight: 800,
                          fontFamily: "'Cairo', sans-serif",
                          cursor: 'pointer',
                          boxShadow: orderSide === 'buy'
                            ? '0 4px 16px rgba(50,215,75,0.3)'
                            : '0 4px 16px rgba(255,69,58,0.3)',
                        }}
                      >
                        {orderSide === 'buy' ? 'شراء' : 'بيع'} {selectedSymbol}
                      </button>
                    </div>
                  )}

                  {execStatus === 'submitting' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0' }}>
                      <Loader2 size={20} className="animate-spin" color="#00D4FF" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>
                        جارٍ التنفيذ...
                      </span>
                    </div>
                  )}

                  {execStatus === 'filled' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: 'rgba(50,215,75,0.1)', borderRadius: 12 }}>
                      <CheckCircle size={20} color="#32D74B" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#32D74B', fontFamily: "'Cairo', sans-serif" }}>
                        {execMessage}
                      </span>
                    </div>
                  )}

                  {execStatus === 'rejected' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: 'rgba(255,184,0,0.1)', borderRadius: 12 }}>
                      <AlertCircle size={20} color="#FFB800" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#FFB800', fontFamily: "'Cairo', sans-serif" }}>
                        {execMessage}
                      </span>
                    </div>
                  )}

                  {execStatus === 'error' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: 'rgba(255,69,58,0.1)', borderRadius: 12 }}>
                      <AlertCircle size={20} color="#FF453A" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#FF453A', fontFamily: "'Cairo', sans-serif" }}>
                        {execMessage}
                      </span>
                    </div>
                  )}
                </div>
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
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
      </div>
    }>
      <ChartPageContent />
    </Suspense>
  )
}
