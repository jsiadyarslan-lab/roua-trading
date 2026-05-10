'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'
import type { ExecutionState, DataStatus } from '@/lib/dashboard-live'

// FIX: Helper to poll v2 order status until terminal state or timeout.
// v2 pipeline returns ACCEPTED immediately (async BullMQ execution),
// so we poll the order status endpoint to wait for FILLED/REJECTED.
async function pollOrderStatus(
  orderId: string,
  timeoutMs: number = 10000,
): Promise<{ status: string; averagePrice?: number; filledQuantity?: number }> {
  const startTime = Date.now()
  const pollInterval = 1000 // Poll every 1 second

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`/api/trading/v2/orders/${orderId}`)
      if (!res.ok) break
      const j = await res.json()
      const order = j.data || j
      const status = order.status

      // Terminal states — stop polling
      if (status === 'FILLED') {
        return {
          status: 'FILLED',
          averagePrice: Number(order.averagePrice) || undefined,
          filledQuantity: Number(order.filledQuantity) || undefined,
        }
      }
      if (status === 'REJECTED' || status === 'CANCELLED' || status === 'EXPIRED') {
        return { status }
      }
      // Still in PENDING/ACCEPTED/SENT — keep polling
    } catch {
      // Network error — keep polling
    }
    await new Promise(r => setTimeout(r, pollInterval))
  }

  return { status: 'TIMEOUT' }
}

export type OrderType = 'market' | 'limit'
export type TimeInForce = 'ioc' | 'gtc' | 'day'
export type OrderSide = 'buy' | 'sell'

export interface ExecutionStatus {
  msg: string
  type: 'success' | 'error' | 'loading' | 'confirm' | ''
}

export interface OrderResult {
  success: boolean
  orderId?: string
  symbol?: string
  side?: string
  qty?: string
  filledAvgPrice?: number
  source: 'nestjs' | 'alpaca'
  error?: string
  riskReason?: string
}

export interface OpenOrder {
  id: string
  symbol: string
  side: string
  type: string
  status: string
  qty: string
  filledQty: string
  filledAvgPrice: string | null
  limitPrice?: string | null
  submittedAt: string
  createdAt: string
  source: 'nestjs' | 'alpaca'
}

export function useExecutionEngine() {
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const globalQuotes = useMarketStore(state => state.quotes)
  const { addTrade: addPaperTrade } = usePaperTradesStore()
  const addNotification = useNotificationStore(state => state.addNotification)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)

  // Form state
  const [localSymbol, setLocalSymbol] = useState(selectedSymbol)

  // Sync localSymbol when selectedSymbol changes externally
  useEffect(() => {
    setLocalSymbol(selectedSymbol)
  }, [selectedSymbol])

  const [quantity, setQuantity] = useState('0.1')
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('ioc')
  const [riskPct, setRiskPct] = useState('1')

  // UI state
  const [status, setStatus] = useState<ExecutionStatus>({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<OrderSide | null>(null)
  const [executionState, setExecutionState] = useState<ExecutionState>('idle')
  const [account, setAccount] = useState<{ cash: number; buyingPower: number } | null>(null)
  const [recentOrders, setRecentOrders] = useState<OpenOrder[]>([])
  const [usedNestJS, setUsedNestJS] = useState(false)

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Current price from market store
  const currentPrice = globalQuotes[localSymbol]?.price ?? 0

  // Sync when global symbol changes
  const syncSymbol = useCallback((symbol: string) => {
    setLocalSymbol(symbol)
  }, [])

  // Clear status with timer
  const clearStatusAfter = useCallback((ms: number) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => setStatus({ msg: '', type: '' }), ms)
  }, [])

  // Load account balance
  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/account')
      const j = await res.json()
      if (j.success && j.data) {
        setAccount({ cash: j.data.cash ?? 0, buyingPower: j.data.buyingPower ?? 0 })
      }
    } catch {}
  }, [])

  // Load open orders
  const loadOpenOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/orders?status=open&limit=10')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        setRecentOrders(j.data.map((o: any) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          type: o.type,
          status: o.status,
          qty: o.qty,
          filledQty: o.filledQty,
          filledAvgPrice: o.filledAvgPrice,
          limitPrice: o.limitPrice,
          submittedAt: o.submittedAt,
          createdAt: o.createdAt,
          source: 'alpaca' as const,
        })))
      }
    } catch {}
  }, [])

  // Cancel an open order
  const cancelOrder = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`/api/alpaca/orders/${orderId}`, { method: 'DELETE' })
      const j = await res.json()
      if (j.success || res.ok) {
        setRecentOrders(prev => prev.filter(o => o.id !== orderId))
        addNotification({
          source: 'trade',
          priority: 'medium',
          action: 'CANCEL',
          title: 'تم إلغاء الأمر',
          body: `تم إلغاء الأمر ${orderId.slice(0, 8)}...`,
          pair: '',
          price: 0,
        })
      }
    } catch {}
  }, [addNotification])

  // Risk calculations
  const riskAmount = account?.cash ? (account.cash * (parseFloat(riskPct) / 100)) : 0
  const slPips = stopLoss && currentPrice > 0 ? Math.abs(currentPrice - parseFloat(stopLoss)) : null
  const autoQty = slPips && slPips > 0 ? (riskAmount / slPips).toFixed(4) : null
  const potentialLoss = slPips && parseFloat(quantity) > 0 ? (slPips * parseFloat(quantity)) : null
  const potentialGain = takeProfit && currentPrice > 0 && parseFloat(quantity) > 0
    ? Math.abs(parseFloat(takeProfit) - currentPrice) * parseFloat(quantity) : null
  const rrRatio = potentialGain && potentialLoss && potentialLoss > 0
    ? (potentialGain / potentialLoss).toFixed(2) : null

  // Estimated cost for pre-trade summary
  const estimatedCost = currentPrice > 0 && parseFloat(quantity) > 0
    ? currentPrice * parseFloat(quantity) : 0

  // Validate form
  const validateAndConfirm = useCallback((side: OrderSide) => {
    setExecutionState('validating')

    if (!localSymbol) {
      setExecutionState('rejected')
      setStatus({ msg: 'يرجى إدخال رمز الأصل', type: 'error' })
      clearStatusAfter(3000)
      return false
    }

    const qtyNum = parseFloat(quantity)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setExecutionState('rejected')
      setStatus({ msg: 'الكمية غير صالحة', type: 'error' })
      clearStatusAfter(3000)
      return false
    }

    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setExecutionState('rejected')
      setStatus({ msg: 'يرجى إدخال سعر الأمر المعلق', type: 'error' })
      clearStatusAfter(3000)
      return false
    }

    // Pre-flight balance check — warn only, don't block
    // (Paper trading / Alpaca will handle actual rejection)
    // This is just a UX hint


    // Validate SL/TP logic
    const tpNum = parseFloat(takeProfit)
    const slNum = parseFloat(stopLoss)
    const price = currentPrice > 0 ? currentPrice : 0

    if (price > 0) {
      if (side === 'buy') {
        if (slNum > 0 && slNum >= price) {
          setExecutionState('rejected')
          setStatus({ msg: 'وقف الخسارة يجب أن يكون أقل من سعر الشراء', type: 'error' })
          clearStatusAfter(3000)
          return false
        }
        if (tpNum > 0 && tpNum <= price) {
          setExecutionState('rejected')
          setStatus({ msg: 'جني الأرباح يجب أن يكون أعلى من سعر الشراء', type: 'error' })
          clearStatusAfter(3000)
          return false
        }
      } else {
        if (slNum > 0 && slNum <= price) {
          setExecutionState('rejected')
          setStatus({ msg: 'وقف الخسارة يجب أن يكون أعلى من سعر البيع', type: 'error' })
          clearStatusAfter(3000)
          return false
        }
        if (tpNum > 0 && tpNum >= price) {
          setExecutionState('rejected')
          setStatus({ msg: 'جني الأرباح يجب أن يكون أقل من سعر البيع', type: 'error' })
          clearStatusAfter(3000)
          return false
        }
      }
    }

    setPendingAction(side)
    setExecutionState('ready')

    const typeLabel = orderType === 'limit' ? 'معلق' : 'سوقي'
    const limitLabel = orderType === 'limit' && limitPrice ? ` بسعر ${limitPrice}` : ''
    setStatus({
      msg: `تأكيد أمر ${typeLabel} ${side === 'buy' ? 'شراء' : 'بيع'} ${quantity} من ${localSymbol}${limitLabel}؟`,
      type: 'confirm'
    })
    return true
  }, [localSymbol, quantity, orderType, limitPrice, stopLoss, takeProfit, currentPrice, clearStatusAfter])

  // Execute order — tries NestJS first, falls back to Alpaca
  const executeOrder = useCallback(async () => {
    if (!pendingAction || !localSymbol || !quantity) return
    const side = pendingAction
    setLoading(true)
    setExecutionState('submitting')
    setStatus({ msg: `جارٍ إرسال الأمر...`, type: 'loading' })

    const body: Record<string, any> = {
      symbol: localSymbol,
      side,
      qty: parseFloat(quantity),
      type: orderType,
      time_in_force: timeInForce,
    }
    if (orderType === 'limit' && limitPrice) body.limit_price = parseFloat(limitPrice)
    if (stopLoss) body.stop_loss = parseFloat(stopLoss)
    if (takeProfit) body.take_profit = parseFloat(takeProfit)

    let result: OrderResult

    // ── Path 1: NestJS Trading API v2 (with RiskGatekeeper + BullMQ queue) ──
    // FIX: Migrated from v1 (direct /api/trading/orders) to v2 pipeline
    // (/api/trading/v2/orders) which uses BullMQ queue for async execution.
    // Benefits: idempotency protection, 3x retry with exponential backoff,
    // full order lifecycle (PENDING → ACCEPTED → SENT → FILLED),
    // rate limiting, and connection resilience watching.
    try {
      await ensureAuth()
      // Try to get a credential ID from NestJS portfolio service
      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      // FIX: Ensure credentials is always an array before accessing index.
      // Previously, if credData.data was an object (not an array), credentials[0]
      // would be undefined, causing credentialId to be undefined and falling through
      // to Alpaca. But if credData itself was malformed, .data or .credentials
      // could be null/undefined, causing crashes.
      const rawCredentials = credData.data || credData.credentials || []
      const credentials = Array.isArray(rawCredentials) ? rawCredentials : []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (credentialId) {
        // FIX: Generate idempotencyKey client-side for v2 pipeline.
        // This prevents duplicate orders if the user double-clicks or the
        // network retries. The key is a UUID v4 that uniquely identifies
        // this specific order attempt for 24 hours.
        const idempotencyKey = crypto.randomUUID()

        const nestBody = {
          credentialId,
          symbol: localSymbol,
          side: side.toUpperCase(),
          type: orderType.toUpperCase(),
          quantity: parseFloat(quantity),
          price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
          // FIX: v2 requires stopLoss (mandatory per RiskGatekeeper rule #1)
          // If user didn't set one, calculate a default (2% from current price)
          stopLoss: stopLoss ? parseFloat(stopLoss) : currentPrice > 0
            ? (side === 'buy' ? currentPrice * 0.98 : currentPrice * 1.02)
            : undefined,
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
          idempotencyKey,
          clientOrderId: idempotencyKey,
        }

        const res = await fetch('/api/trading/v2/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nestBody),
        })
        const j = await res.json()

        // FIX: v2 returns { success: true, data: { orderId, status: 'ACCEPTED' } }
        // not { id, filledAvgPrice } like v1. We need to handle the async
        // response by either polling for completion or treating ACCEPTED as success.
        if (res.ok && j.success && j.data?.orderId) {
          // FIX: Validate j.data exists before accessing j.data.orderId
          // Optional chaining above ensures j.data?.orderId is defined,
          // but explicitly verify to prevent edge cases.
          const orderId = j.data?.orderId || j.orderId
          if (!orderId) {
            throw new Error('NestJS v2 returned success but no orderId')
          }
          result = {
            success: true,
            orderId,
            symbol: localSymbol,
            side,
            qty: quantity,
            filledAvgPrice: undefined, // Will be available after execution completes
            source: 'nestjs',
          }

          // Poll for order completion (up to 10 seconds)
          // This gives the BullMQ worker time to execute and report back
          try {
            const pollResult = await pollOrderStatus(j.data.orderId, 10000)
            if (pollResult.status === 'FILLED' && pollResult.averagePrice) {
              result.filledAvgPrice = pollResult.averagePrice
            }
          } catch {
            // Polling failed — order is still ACCEPTED/processing, not an error
          }
        } else if (res.status === 403 || (j.message && j.message.includes('رفض'))) {
          // Risk gatekeeper rejected
          result = {
            success: false,
            source: 'nestjs',
            error: j.message || 'تم رفض الأمر من حارس المخاطر',
            riskReason: j.message,
          }
        } else if (res.status === 409) {
          // Idempotency conflict — order already submitted
          result = {
            success: false,
            source: 'nestjs',
            error: 'تم استلام هذا الطلب مسبقاً. يرجى الانتظار.',
          }
        } else {
          // NestJS v2 failed — fallback to Alpaca
          throw new Error(j.message || 'NestJS v2 error')
        }
      } else {
        throw new Error('No credentials')
      }
    } catch {
      // ── Path 2: Alpaca Direct (fallback) ──
      setUsedNestJS(false)
      try {
        const res = await fetch('/api/alpaca/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const j = await res.json()

        if (j.success) {
          // FIX: Validate orderId exists — Alpaca might return success without orderId
          // in edge cases, which would cause crashes downstream when accessing result.orderId
          const orderId = j.orderId || j.id || j.data?.orderId
          if (!orderId) {
            result = {
              success: false,
              source: 'alpaca',
              error: 'لم يتم استلام رقم الأمر من المزود',
            }
          } else {
          result = {
            success: true,
            orderId,
            symbol: j.symbol || localSymbol,
            side: j.side || side,
            qty: j.qty || quantity,
            filledAvgPrice: j.filledAvgPrice ? parseFloat(j.filledAvgPrice) : undefined,
            source: 'alpaca',
          }
          }
        } else {
          result = {
            success: false,
            source: 'alpaca',
            error: j.error || 'فشل التنفيذ',
          }
        }
      } catch (e: any) {
        result = {
          success: false,
          source: 'alpaca',
          error: `خطأ في الشبكة — تعذّر الوصول للمزود`,
        }
      }
    }

    // ── Handle result ──
    if (result.success) {
      const filled = result.filledAvgPrice ? ` بسعر $${result.filledAvgPrice.toFixed(2)}` : ''
      const sourceLabel = result.source === 'nestjs' ? '🛡️ آمن' : '⚡ مباشر'

      // Track in paper store
      addPaperTrade({
        symbol: localSymbol,
        side: side === 'buy' ? 'long' : 'short',
        qty: parseFloat(quantity),
        entryPrice: result.filledAvgPrice || currentPrice,
        currentPrice: currentPrice,
        tp: takeProfit ? parseFloat(takeProfit) : undefined,
        sl: stopLoss ? parseFloat(stopLoss) : undefined,
        source: 'manual',
        entryTime: Date.now()
      })

      setExecutionState(result.filledAvgPrice ? 'filled' : 'accepted')
      setStatus({
        msg: `تم ${side === 'buy' ? 'شراء' : 'بيع'} ${result.qty} ${result.symbol}${filled}\n${sourceLabel} — رقم الأمر: ${result.orderId?.slice(0, 8)}...`,
        type: 'success',
      })

      addNotification({
        source: 'trade',
        priority: 'high',
        action: side === 'buy' ? 'BUY' : 'SELL',
        title: `تم ${side === 'buy' ? 'شراء' : 'بيع'} ${result.symbol}`,
        body: `تم تنفيذ ${result.qty} ${result.symbol}${filled} [${sourceLabel}]`,
        pair: result.symbol || localSymbol,
        price: result.filledAvgPrice || currentPrice,
      })

      // Refresh data — batched to avoid 7 simultaneous API calls
      // Instead of calling loadAccount + fetchAccount + fetchPositions + loadOpenOrders
      // immediately AND again after 2s, we batch into a single refresh cycle
      Promise.all([fetchAccount(), fetchPositions(), loadOpenOrders()]).then(() => {
        // Single delayed refresh to catch exchange settlement
        setTimeout(() => {
          fetchAccount()
          fetchPositions()
        }, 2000)
      })
    } else {
      setExecutionState('rejected')
      setStatus({
        msg: result.riskReason
          ? `تم رفض الأمر: ${result.riskReason}`
          : `${result.error || 'فشل التنفيذ'}`,
        type: 'error'
      })
    }

    setLoading(false)
    setPendingAction(null)
    clearStatusAfter(4000) // 4 seconds — enough to read details
  }, [pendingAction, localSymbol, quantity, orderType, limitPrice, stopLoss, takeProfit, timeInForce, currentPrice, addPaperTrade, addNotification, fetchAccount, fetchPositions, loadAccount, loadOpenOrders, clearStatusAfter])

  // Auto-calculate TP/SL/Qty
  const autoCalculate = useCallback(() => {
    if (currentPrice > 0) {
      const tp = currentPrice * 1.02
      const sl = currentPrice * 0.99
      setTakeProfit(tp.toFixed(2))
      setStopLoss(sl.toFixed(2))

      if (account && account.cash) {
        const risk = account.cash * (parseFloat(riskPct) / 100)
        const pips = Math.abs(currentPrice - sl)
        const calcQty = Math.max(1, Math.floor(risk / pips)).toString()
        if (parseFloat(calcQty) > 0) {
          setQuantity(calcQty)
        }
      }
    }
  }, [currentPrice, account, riskPct])

  // Apply optimal quantity from risk calculator
  const applyOptimalQty = useCallback(() => {
    if (autoQty && parseFloat(autoQty) > 0) {
      setQuantity(autoQty)
    }
  }, [autoQty])

  // Reset form
  const resetForm = useCallback(() => {
    setQuantity('0.1')
    setStopLoss('')
    setTakeProfit('')
    setLimitPrice('')
    setOrderType('market')
    setTimeInForce('ioc')
    setExecutionState('idle')
    setPendingAction(null)
    setStatus({ msg: '', type: '' })
  }, [])

  return {
    // Form state
    localSymbol, setLocalSymbol, syncSymbol,
    quantity, setQuantity,
    orderType, setOrderType,
    limitPrice, setLimitPrice,
    stopLoss, setStopLoss,
    takeProfit, setTakeProfit,
    timeInForce, setTimeInForce,
    riskPct, setRiskPct,

    // Derived values
    currentPrice,
    riskAmount,
    autoQty,
    potentialLoss,
    potentialGain,
    rrRatio,
    estimatedCost,

    // UI state
    status, setStatus,
    loading,
    pendingAction,
    executionState,
    account,
    usedNestJS,

    // Orders
    recentOrders, loadOpenOrders,
    cancelOrder,

    // Actions
    loadAccount,
    validateAndConfirm,
    executeOrder,
    autoCalculate,
    applyOptimalQty,
    resetForm,
    setSelectedSymbol,
  }
}
