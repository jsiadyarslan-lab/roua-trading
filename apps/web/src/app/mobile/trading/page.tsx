'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import {
  ChevronLeft, ArrowUpRight, ArrowDownRight, Plus, Minus,
  Target, TrendingUp, TrendingDown,
  Clock, Loader2, CheckCircle, AlertCircle, Zap
} from 'lucide-react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
}

/* ─── Popular Pairs ─── */
const PAIR_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'XRP/USD', 'BNB/USD']

type ExecStatus = 'idle' | 'submitting' | 'filled' | 'rejected' | 'error'

/* ─── Main Page ─── */
export default function TradingPage() {
  const router = useRouter()
  const quotes = useMarketStore(s => s.quotes)
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const addPaperTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)

  // Trading state
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('0.01')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')

  // Execution state
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle')
  const [execMessage, setExecMessage] = useState('')
  const [execSource, setExecSource] = useState('')
  const [recentOrders, setRecentOrders] = useState<any[]>([])

  // Get live quote data
  const quoteKey = quotes ? Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  ) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : 0
  const changePercent = quote?.changePercent ?? 0

  // Calculate order value
  const qty = parseFloat(quantity) || 0
  const orderValue = qty * livePrice

  // Load recent orders from Alpaca
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/orders?status=open&limit=5')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        setRecentOrders(j.data.slice(0, 5).map((o: any) => ({
          id: o.id,
          pair: o.symbol,
          side: o.side,
          qty: o.qty,
          price: o.filledAvgPrice ? `$${parseFloat(o.filledAvgPrice).toLocaleString('en', { minimumFractionDigits: 2 })}` : o.limitPrice ? `$${parseFloat(o.limitPrice).toLocaleString('en', { minimumFractionDigits: 2 })}` : '—',
          time: o.submittedAt ? new Date(o.submittedAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '—',
          status: o.status === 'filled' ? 'filled' : 'pending',
        })))
      }
    } catch {}
  }, [])

  // Adjust quantity
  const adjustQty = (delta: number) => {
    const current = parseFloat(quantity) || 0
    const step = livePrice > 1000 ? 0.01 : livePrice > 10 ? 0.1 : 1
    const newVal = Math.max(0, current + delta * step)
    setQuantity(newVal.toFixed(newVal < 1 ? 4 : newVal < 100 ? 2 : 0))
  }

  // Quick percentage of account balance
  const handleQuickQty = async (pct: number) => {
    try {
      const res = await fetch('/api/alpaca/account')
      const j = await res.json()
      if (j.success && j.data?.cash) {
        const maxQty = (j.data.cash * (pct / 100)) / (livePrice || 1)
        setQuantity(maxQty.toFixed(maxQty < 1 ? 4 : 2))
      }
    } catch {}
  }

  // Validate order
  const validateOrder = (): string | null => {
    if (!qty || qty <= 0) return 'يرجى إدخال كمية صالحة'
    if (!livePrice || livePrice <= 0) return 'سعر السوق غير متوفر حالياً'
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) return 'يرجى إدخال سعر الحد'

    const tp = parseFloat(takeProfit)
    const sl = parseFloat(stopLoss)
    if (tp) {
      if (side === 'buy' && tp <= livePrice) return 'جني الأرباح يجب أن يكون أعلى من السعر الحالي'
      if (side === 'sell' && tp >= livePrice) return 'جني الأرباح يجب أن يكون أقل من السعر الحالي'
    }
    if (sl) {
      if (side === 'buy' && sl >= livePrice) return 'وقف الخسارة يجب أن يكون أقل من السعر الحالي'
      if (side === 'sell' && sl <= livePrice) return 'وقف الخسارة يجب أن يكون أعلى من السعر الحالي'
    }
    return null
  }

  // Execute order — NestJS first, Alpaca fallback
  const handleExecute = useCallback(async () => {
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
      side,
      qty,
      type: orderType,
      time_in_force: 'ioc',
    }
    if (orderType === 'limit' && limitPrice) body.limit_price = parseFloat(limitPrice)
    if (stopLoss) body.stop_loss = parseFloat(stopLoss)
    if (takeProfit) body.take_profit = parseFloat(takeProfit)

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
          quantity: qty,
          price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
          stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
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
          filledPrice = j.filledAvgPrice || j.avgFillPrice || livePrice
          source = 'nestjs'
        } else if (res.status === 403) {
          setExecStatus('rejected')
          setExecMessage(j.message || 'تم رفض الأمر من حارس المخاطر')
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
          filledPrice = j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : livePrice
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
        qty,
        entryPrice: filledPrice,
        currentPrice: livePrice,
        tp: takeProfit ? parseFloat(takeProfit) : undefined,
        sl: stopLoss ? parseFloat(stopLoss) : undefined,
        source: 'manual',
        entryTime: Date.now()
      })

      const sourceLabel = source === 'nestjs' ? 'آمن' : 'مباشر'
      setExecSource(sourceLabel)
      setExecStatus('filled')
      setExecMessage(`تم ${side === 'buy' ? 'شراء' : 'بيع'} ${quantity} ${selectedSymbol} @ $${filledPrice.toFixed(2)}`)

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
      loadOrders()
      setTimeout(() => { fetchAccount(); fetchPositions(); loadOrders() }, 2000)

      setTimeout(() => {
        setExecStatus('idle')
        setQuantity('0.01')
        setTakeProfit('')
        setStopLoss('')
        setLimitPrice('')
      }, 3000)
    }
  }, [selectedSymbol, side, qty, quantity, orderType, limitPrice, takeProfit, stopLoss, livePrice, addPaperTrade, addNotification, fetchAccount, fetchPositions, loadOrders])

  return (
    <div style={{
      /* Use 100% instead of 100dvh — the parent <main> already constrains height */
      height: '100%',
      minHeight: '100%',
      background: '#000000',
      display: 'flex',
      flexDirection: 'column',
      direction: 'rtl',
      position: 'relative',
    }}>

      {/* ── Header (fixed at top) ── */}
      <div style={{
        flexShrink: 0,
        padding: 'calc(env(safe-area-inset-top) + 8px) 16px 8px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: side === 'buy'
          ? 'linear-gradient(180deg, rgba(50,215,75,0.06), transparent)'
          : 'linear-gradient(180deg, rgba(255,69,58,0.06), transparent)',
        transition: '0.3s',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 12,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={18} color={c.text} />
        </motion.button>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>التداول المباشر</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: livePrice > 0 ? c.success : c.amber,
            boxShadow: livePrice > 0 ? '0 0 6px rgba(50,215,75,0.6)' : '0 0 6px rgba(255,184,0,0.6)',
          }} />
          <span style={{ fontSize: 9, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
            {livePrice > 0 ? 'مباشر' : 'بانتظار البيانات'}
          </span>
        </div>
      </div>

      {/* ── Pair Selector (fixed below header) ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 6, padding: '0 16px 8px',
        overflowX: 'auto', direction: 'ltr',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {PAIR_SYMBOLS.map((symbol) => {
          const isActive = selectedSymbol === symbol
          const pairQuoteKey = quotes ? Object.keys(quotes).find(k =>
            k.toUpperCase().replace('/', '') === symbol.toUpperCase().replace('/', '')
          ) : null
          const pairQuote = pairQuoteKey ? quotes[pairQuoteKey] : null
          const pairChange = pairQuote?.changePercent ?? 0
          const isUp = pairChange >= 0

          return (
            <motion.button
              key={symbol}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedSymbol(symbol)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '6px 12px', borderRadius: 12, minWidth: 70,
                background: isActive ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                border: isActive ? `1px solid rgba(0,212,255,0.3)` : `0.5px solid ${c.border}`,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? c.accent : c.text, fontFamily: "'JetBrains Mono', monospace" }}>
                {symbol}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: isUp ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                {pairChange !== 0 ? `${isUp ? '+' : ''}${pairChange.toFixed(1)}%` : '—'}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ── Scrollable Content Area ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>

        {/* ── Current Price + Buy/Sell Toggle ── */}
        <div style={{
          background: 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)',
          backdropFilter: 'blur(40px) saturate(190%)',
          WebkitBackdropFilter: 'blur(40px) saturate(190%)',
          borderRadius: 24,
          padding: 16,
          margin: '0 16px 8px',
          border: '0.5px solid rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)',
        }}>
          {/* Accent line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
            background: `linear-gradient(90deg, transparent, ${c.accent}66, transparent)`,
            zIndex: 10,
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{selectedSymbol}</p>
              <p style={{ fontSize: 24, fontWeight: 900, color: c.text, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1, marginTop: 2 }}>
                {livePrice > 0
                  ? (livePrice < 10 ? livePrice.toFixed(4) : livePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                  : '—'}
              </p>
            </div>
            <div style={{
              padding: '6px 12px', borderRadius: 12,
              background: changePercent >= 0 ? `${c.success}15` : `${c.danger}15`,
              border: `0.5px solid ${changePercent >= 0 ? `${c.success}30` : `${c.danger}30`}`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {changePercent >= 0 ? <TrendingUp size={14} color={c.success} /> : <TrendingDown size={14} color={c.danger} />}
              <span style={{ fontSize: 12, fontWeight: 800, color: changePercent >= 0 ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                {changePercent !== 0 ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%` : '—'}
              </span>
            </div>
          </div>

          {/* ── Buy/Sell Toggle ── */}
          <div style={{
            display: 'flex', gap: 8, padding: 4,
            background: 'rgba(255,255,255,0.03)', borderRadius: 14,
          }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setSide('buy')}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: side === 'buy' ? c.success : 'transparent',
                color: side === 'buy' ? '#000' : c.text2,
                fontSize: 14, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: '0.2s',
              }}
            >
              <ArrowUpRight size={16} />
              شراء
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setSide('sell')}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: side === 'sell' ? c.danger : 'transparent',
                color: side === 'sell' ? '#FFF' : c.text2,
                fontSize: 14, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: '0.2s',
              }}
            >
              <ArrowDownRight size={16} />
              بيع
            </motion.button>
          </div>
        </div>

        {/* ── Order Settings Card ── */}
        <div style={{
          background: 'rgba(28,28,30,0.65)',
          backdropFilter: 'blur(40px) saturate(190%)',
          WebkitBackdropFilter: 'blur(40px) saturate(190%)',
          borderRadius: 24,
          padding: 16,
          margin: '0 16px 8px',
          border: '0.5px solid rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
        }}>
          {/* Market/Limit Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>نوع الأمر</span>
            <div style={{
              display: 'flex', gap: 6, padding: 3,
              background: 'rgba(255,255,255,0.03)', borderRadius: 10,
            }}>
              <button
                onClick={() => setOrderType('market')}
                style={{
                  padding: '5px 12px', borderRadius: 8,
                  background: orderType === 'market' ? c.accent : 'transparent',
                  color: orderType === 'market' ? '#000' : c.text2,
                  fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  border: 'none', cursor: 'pointer', transition: '0.2s',
                }}
              >سوقي</button>
              <button
                onClick={() => setOrderType('limit')}
                style={{
                  padding: '5px 12px', borderRadius: 8,
                  background: orderType === 'limit' ? c.accent : 'transparent',
                  color: orderType === 'limit' ? '#000' : c.text2,
                  fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  border: 'none', cursor: 'pointer', transition: '0.2s',
                }}
              >محدد</button>
            </div>
          </div>

          {/* Limit Price */}
          {orderType === 'limit' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ marginBottom: 12 }}
            >
              <label style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>سعر الحد</label>
              <input
                value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                placeholder={livePrice > 0 ? livePrice.toString() : '0.00'}
                type="number"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                  color: c.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none', direction: 'ltr', textAlign: 'left',
                }}
              />
            </motion.div>
          )}

          {/* Quantity Input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 4 }}>الكمية</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => adjustQty(-1)}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Minus size={16} color={c.text} />
              </motion.button>
              <input
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                type="number"
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                  color: c.text, fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none', direction: 'ltr', textAlign: 'center',
                }}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => adjustQty(1)}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Plus size={16} color={c.text} />
              </motion.button>
            </div>
          </div>

          {/* Quick Qty Buttons */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
            {[25, 50, 75, 100].map(pct => (
              <motion.button
                key={pct}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleQuickQty(pct)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 8,
                  background: 'rgba(0,212,255,0.06)', border: `0.5px solid rgba(0,212,255,0.15)`,
                  color: c.accent, fontSize: 10, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer',
                }}
              >
                {pct}%
              </motion.button>
            ))}
          </div>

          {/* TP/SL Inputs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Target size={11} color={c.success} />
                <label style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>جني الأرباح (TP)</label>
              </div>
              <input
                value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
                placeholder="اختياري"
                type="number"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                  color: c.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none', direction: 'ltr', textAlign: 'left',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Target size={11} color={c.danger} />
                <label style={{ fontSize: 10, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>وقف الخسارة (SL)</label>
              </div>
              <input
                value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                placeholder="اختياري"
                type="number"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                  color: c.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none', direction: 'ltr', textAlign: 'left',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Order Summary Card ── */}
        <div style={{
          background: 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)',
          backdropFilter: 'blur(40px) saturate(190%)',
          WebkitBackdropFilter: 'blur(40px) saturate(190%)',
          borderRadius: 24,
          padding: 16,
          margin: '0 16px 8px',
          border: '0.5px solid rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
            background: `linear-gradient(90deg, transparent, ${c.accent}66, transparent)`,
            zIndex: 10,
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Zap size={14} color={c.accent} />
            <span style={{ fontSize: 12, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>ملخص الأمر</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الزوج</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الاتجاه</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: side === 'buy' ? c.success : c.danger, fontFamily: "'Cairo', sans-serif" }}>
                {side === 'buy' ? 'شراء' : 'بيع'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>النوع</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>
                {orderType === 'market' ? 'سوقي' : 'محدد'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>الكمية</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{quantity}</span>
            </div>
            <div style={{ height: 1, background: c.border, margin: '2px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>القيمة الإجمالية</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: side === 'buy' ? c.success : c.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                ${orderValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

      </div>{/* END Scrollable Content */}

      {/* ── Fixed Bottom — Buy/Sell Buttons (ALWAYS VISIBLE, above navbar) ── */}
      <div style={{
        flexShrink: 0,
        padding: '8px 16px calc(8px + 68px + env(safe-area-inset-bottom))',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        background: 'rgba(20,20,22,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        {(execStatus === 'idle' || execStatus === 'error' || execStatus === 'rejected') && (
          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { setSide('buy'); setTimeout(() => handleExecute(), 0) }}
              style={{
                flex: 1, height: 48, borderRadius: 14,
                background: 'linear-gradient(135deg, #32D74B, #28a745)',
                border: '1px solid rgba(50,215,75,0.3)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 16, fontWeight: 900, color: '#000', fontFamily: "'Cairo', sans-serif",
                boxShadow: '0 0 12px rgba(50,215,75,0.15)',
              }}
            >
              <ArrowUpRight size={18} />
              شراء
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => { setSide('sell'); setTimeout(() => handleExecute(), 0) }}
              style={{
                flex: 1, height: 48, borderRadius: 14,
                background: 'linear-gradient(135deg, #FF453A, #dc3545)',
                border: '1px solid rgba(255,69,58,0.3)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'Cairo', sans-serif",
                boxShadow: '0 0 12px rgba(255,69,58,0.15)',
              }}
            >
              <ArrowDownRight size={18} />
              بيع
            </motion.button>
          </div>
        )}
        {execStatus === 'submitting' && (
          <div style={{
            height: 48, borderRadius: 14,
            background: 'rgba(0,212,255,0.1)', border: `0.5px solid rgba(0,212,255,0.2)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Loader2 size={20} className="animate-spin" color={c.accent} />
            <span style={{ fontSize: 14, fontWeight: 800, color: c.accent, fontFamily: "'Cairo', sans-serif" }}>جارٍ التنفيذ...</span>
          </div>
        )}
        {execStatus === 'filled' && (
          <div style={{
            height: 48, borderRadius: 14,
            background: 'rgba(50,215,75,0.15)', border: `0.5px solid rgba(50,215,75,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <CheckCircle size={20} color={c.success} />
            <span style={{ fontSize: 14, fontWeight: 800, color: c.success, fontFamily: "'Cairo', sans-serif" }}>تم التنفيذ بنجاح</span>
          </div>
        )}
        {(execStatus === 'rejected' || execStatus === 'error') && execMessage && (
          <div style={{
            marginTop: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <AlertCircle size={14} color={c.danger} />
            <span style={{ fontSize: 11, fontWeight: 700, color: c.danger, fontFamily: "'Cairo', sans-serif" }}>{execMessage}</span>
          </div>
        )}
      </div>

    </div>
  )
}
