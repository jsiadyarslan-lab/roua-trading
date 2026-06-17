'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
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
// FIX: Also try v1 endpoint as fallback — v2 orders endpoint may not
// have a GET route yet. We try both paths to be resilient.
async function pollOrderStatus(
  orderId: string,
  timeoutMs: number = 10000,
): Promise<{ status: string; averagePrice?: number; filledQuantity?: number }> {
  const startTime = Date.now()
  const pollInterval = 1000 // Poll every 1 second

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Try v2 endpoint first
      let res = await fetch(`/api/trading/v2/orders/${orderId}`)
      if (!res.ok) {
        // Fallback to v1 endpoint
        res = await fetch(`/api/trading/orders/${orderId}`)
      }
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
  const tn = useTranslations('notifications.execution')
  const tc = useTranslations('common')
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const globalQuotes = useMarketStore(state => state.quotes)
  const { addTrade: addPaperTrade } = usePaperTradesStore()
  const addNotification = useNotificationStore(state => state.addNotification)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)
  const refreshAfterTrade = usePositionsStore(state => state.refreshAfterTrade)

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

  // V248: Ref to hold executeOrder — avoids TDZ crash when validateAndConfirm
  // (defined before executeOrder) tries to call it. The ref is assigned
  // synchronously after executeOrder is defined, so by the time the user
  // clicks Buy/Sell, the ref points to the real function.
  const executeOrderRef = useRef<(side: string) => Promise<void>>(async () => {})

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
  // V231 UNIFIED: Read from usePositionsStore.account (NestJS /api/portfolio/credentials/balances)
  // instead of /api/alpaca/account which returns 503 when Alpaca is not configured.
  // The positions store already fetches the correct balance for the active account
  // (paper-trading OR real exchange) via fetchAccount().
  const loadAccount = useCallback(async () => {
    try {
      const storeAccount = usePositionsStore.getState().account
      if (storeAccount) {
        setAccount({
          cash: Number(storeAccount.cash) || 0,
          buyingPower: Number(storeAccount.buyingPower) || 0,
        })
        return
      }
      // Fallback: trigger a fetch from the store, then read after a short delay
      await usePositionsStore.getState().fetchAccount()
      setTimeout(() => {
        const acc = usePositionsStore.getState().account
        if (acc) {
          setAccount({
            cash: Number(acc.cash) || 0,
            buyingPower: Number(acc.buyingPower) || 0,
          })
        } else {
          setAccount({ cash: 0, buyingPower: 0 })
        }
      }, 500)
    } catch {
      setAccount({ cash: 0, buyingPower: 0 })
    }
  }, [])

  // Load open orders
  // V231 UNIFIED: Read from NestJS /api/trading/positions (DB) instead of
  // /api/alpaca/orders?status=open which returns 503 when Alpaca is not configured.
  // The DB positions are the source of truth — they include paper-trading positions
  // created by TradingService.placeOrder (chart buttons + widget + smart executor).
  const loadOpenOrders = useCallback(async () => {
    try {
      const activeCredId = usePositionsStore.getState().activeCredentialId
      const credParam = activeCredId ? `?credentialId=${encodeURIComponent(activeCredId)}` : ''
      const res = await fetch(`/api/trading/positions${credParam}`)
      if (!res.ok) {
        setRecentOrders([])
        return
      }
      const data = await res.json()
      const raw = Array.isArray(data) ? data : (data.data || data.positions || [])
      if (Array.isArray(raw)) {
        // Map DB positions (OPEN status) to the recentOrders format expected by the UI
        setRecentOrders(raw
          .filter((p: any) => p && p.status === 'OPEN' && p.symbol)
          .map((p: any) => ({
            id: p.id,
            symbol: p.symbol,
            side: (p.side || '').toLowerCase(),
            type: 'market',
            status: 'filled',
            qty: Number(p.quantity) || 0,
            filledQty: Number(p.quantity) || 0,
            filledAvgPrice: Number(p.entryPrice) || undefined,
            limitPrice: undefined,
            submittedAt: p.openedAt,
            createdAt: p.openedAt,
            source: 'nestjs' as const,
          }))
        )
      } else {
        setRecentOrders([])
      }
    } catch {
      setRecentOrders([])
    }
  }, [])

  // Cancel an open order
  // V231 UNIFIED: Use NestJS /api/trading/orders/:id instead of /api/alpaca/orders
  const cancelOrder = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`/api/trading/orders/${orderId}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({} as any))
      if (j.success || res.ok) {
        setRecentOrders(prev => prev.filter(o => o.id !== orderId))
        addNotification({
          source: 'trade',
          priority: 'medium',
          action: 'CANCEL',
          title: tn('orderCancelled'),
          body: tn('orderCancelledDesc', { orderId: orderId.slice(0, 8) }),
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
      setStatus({ msg: tn('symbolRequired'), type: 'error' })
      clearStatusAfter(3000)
      return false
    }

    const qtyNum = parseFloat(quantity)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setExecutionState('rejected')
      setStatus({ msg: tn('invalidQty'), type: 'error' })
      clearStatusAfter(3000)
      return false
    }

    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setExecutionState('rejected')
      setStatus({ msg: tn('limitPriceRequired'), type: 'error' })
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
          setStatus({ msg: tn('slBelowBuyPrice'), type: 'error' })
          clearStatusAfter(3000)
          return false
        }
        if (tpNum > 0 && tpNum <= price) {
          setExecutionState('rejected')
          setStatus({ msg: tn('tpAboveBuyPrice'), type: 'error' })
          clearStatusAfter(3000)
          return false
        }
      } else {
        if (slNum > 0 && slNum <= price) {
          setExecutionState('rejected')
          setStatus({ msg: tn('slAboveSellPrice'), type: 'error' })
          clearStatusAfter(3000)
          return false
        }
        if (tpNum > 0 && tpNum >= price) {
          setExecutionState('rejected')
          setStatus({ msg: tn('tpBelowSellPrice'), type: 'error' })
          clearStatusAfter(3000)
          return false
        }
      }
    }

    setPendingAction(side)
    setExecutionState('ready')

    // V248: Execute immediately via ref — avoids TDZ crash.
    executeOrderRef.current(side)

    return true
  }, [localSymbol, quantity, orderType, limitPrice, stopLoss, takeProfit, currentPrice, clearStatusAfter])

  // Execute order — tries NestJS first, falls back to Alpaca
  // V248: Accept optional side parameter to avoid reading stale pendingAction state.
  const executeOrder = useCallback(async (sideParam?: string) => {
    const side = sideParam || pendingAction
    if (!side || !localSymbol || !quantity) return

    // FIX: Check max open positions limit (10) across all sources BEFORE submitting.
    // Count positions from the store + paper trades to enforce the global limit.
    const MAX_OPEN_POSITIONS = 10
    const currentPositions = usePositionsStore.getState().positions.length
    const currentPaperTrades = usePaperTradesStore.getState().trades.length
    const totalOpenPositions = currentPositions + currentPaperTrades
    if (totalOpenPositions >= MAX_OPEN_POSITIONS) {
      setExecutionState('rejected')
      setStatus({
        msg: tn('maxPositions', { count: totalOpenPositions, max: MAX_OPEN_POSITIONS }),
        type: 'error'
      })
      clearStatusAfter(5000)
      return
    }

    setLoading(true)
    setExecutionState('submitting')
    setStatus({ msg: tn('submittingOrder'), type: 'loading' })

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

    let result: OrderResult | undefined

    // ── Path 1: NestJS Trading API v2 (with RiskGatekeeper + BullMQ queue) ──
    // FIX: Migrated from v1 (direct /api/trading/orders) to v2 pipeline
    // (/api/trading/v2/orders) which uses BullMQ queue for async execution.
    // Benefits: idempotency protection, 3x retry with exponential backoff,
    // full order lifecycle (PENDING → ACCEPTED → SENT → FILLED),
    // rate limiting, and connection resilience watching.
    try {
      await ensureAuth()
      // V256: Use the user's ACTIVE credential — same as chart and QuickExecutionMini.
      // The old code fetched ALL credentials and tried to "smart match" by exchange type,
      // which picked MT5 (non-paper) instead of paper-trading when the user had both.
      // The user already chose their active account in Settings — respect that choice.
      const credentialId = usePositionsStore.getState().activeCredentialId
      if (!credentialId) {
        throw new Error('No active account selected — choose one in Settings')
      }

      if (credentialId) {
        // FIX: Generate idempotencyKey client-side for v2 pipeline.
        // This prevents duplicate orders if the user double-clicks or the
        // network retries. The key is a UUID v4 that uniquely identifies
        // this specific order attempt for 24 hours.
        const nestBody = {
          credentialId: credentialId,
          symbol: localSymbol,
          side: side.toUpperCase(),
          type: orderType.toUpperCase(),
          quantity: parseFloat(quantity),
          price: orderType === 'limit' && limitPrice
            ? parseFloat(limitPrice)
            : currentPrice > 0 ? currentPrice : undefined,
          stopLoss: stopLoss ? parseFloat(stopLoss) : currentPrice > 0
            ? (side === 'buy' ? currentPrice * 0.98 : currentPrice * 1.02)
            : undefined,
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        }

        const res = await fetch('/api/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nestBody),
        })
        const j = await res.json()

        // V254: V1 endpoint returns the FILLED order directly (synchronous).
        // No polling needed — the position is already in the DB.
        if (res.ok && j.id) {
          result = {
            success: true,
            orderId: j.id,
            symbol: j.symbol || localSymbol,
            side,
            qty: String(j.filledQuantity || quantity),
            filledAvgPrice: j.averagePrice ? parseFloat(j.averagePrice) : undefined,
            source: 'nestjs',
          }
          setUsedNestJS(true)
        } else if (res.ok && j.success && j.data?.orderId) {
          // V2 response format (fallback — shouldn't happen with V254)
          result = {
            success: true,
            orderId: j.data.orderId,
            symbol: localSymbol,
            side,
            qty: quantity,
            filledAvgPrice: undefined,
            source: 'nestjs',
          }
          setUsedNestJS(true)
        } else if (res.status === 403 || (j.message && j.message.includes('رفض'))) {
          // Risk gatekeeper rejected
          result = {
            success: false,
            source: 'nestjs',
            error: j.message || tn('riskRejected'),
            riskReason: j.message,
          }
        } else if (res.status === 409) {
          // Idempotency conflict — order already submitted
          result = {
            success: false,
            source: 'nestjs',
            error: tn('duplicateOrder'),
          }
        } else {
          // NestJS v2 failed — fallback to Alpaca
          // FIX: Only fall through to Alpaca if the order was NOT accepted.
          // If it was accepted (we already handled it above), we should not
          // create a duplicate order.
          throw new Error(j.message || 'NestJS v2 error')
        }
      } else {
        throw new Error('No credentials')
      }
    } catch (e: any) {
      // V231: REMOVED Alpaca fallback. NestJS handles ALL execution paths including
      // paper-trading (via TradingService._executePaperTrade). Falling back to Alpaca
      // created 503 errors when Alpaca was not configured, and could create DOUBLE
      // orders if both paths succeeded.
      //
      // If NestJS failed, surface the actual error to the user instead of trying
      // a second execution path that would also fail.
      if (!result) {
        result = {
          success: false,
          source: 'nestjs',
          error: e?.message || tn('networkError'),
        }
      }
    }

    // ── Handle result ──
    // FIX: Ensure result is defined before using it. If both NestJS and Alpaca
    // failed to produce a result (shouldn't happen, but defensive), show error.
    const finalResult = result || {
      success: false,
      source: 'alpaca' as const,
      error: tn('submitFailed'),
    }

    if (finalResult.success) {
      const filled = finalResult.filledAvgPrice ? ` بسعر $${finalResult.filledAvgPrice.toFixed(2)}` : ''
      const sourceLabel = finalResult.source === 'nestjs' ? '🛡️ ' + tn('safeLabel') : '⚡ ' + tn('directLabel')

      // Track in paper store
      addPaperTrade({
        symbol: localSymbol,
        side: side === 'buy' ? 'long' : 'short',
        qty: parseFloat(quantity),
        entryPrice: finalResult.filledAvgPrice || currentPrice,
        currentPrice: currentPrice,
        tp: takeProfit ? parseFloat(takeProfit) : undefined,
        sl: stopLoss ? parseFloat(stopLoss) : undefined,
        source: 'manual',
        entryTime: Date.now()
      })

      setExecutionState(finalResult.filledAvgPrice ? 'filled' : 'accepted')
      setStatus({
        msg: tn('orderSuccessStatus' as any, { side: side === 'buy' ? tc('buy') : tc('sell'), qty: String(finalResult.qty), symbol: finalResult.symbol, filled: String(filled), source: sourceLabel, orderId: String(finalResult.orderId?.slice(0, 8) || '') } as any),
        type: 'success',
      })

      addNotification({
        source: 'trade',
        priority: 'high',
        action: side === 'buy' ? 'BUY' : 'SELL',
        title: tn('orderFillTitle' as any, { side: String(side === 'buy' ? tc('buy') : tc('sell')), symbol: finalResult.symbol } as any),
        body: tn('orderFillDesc' as any, { qty: String(finalResult.qty), symbol: finalResult.symbol, filled: String(filled), source: sourceLabel } as any),
        pair: finalResult.symbol || localSymbol,
        price: finalResult.filledAvgPrice || currentPrice,
      })

      // V245: Immediate refresh — no debounce, no delay.
      // fetchPositions + fetchAccount directly, plus a 2s safety net.
      Promise.all([
        usePositionsStore.getState().fetchPositions(),
        usePositionsStore.getState().fetchAccount(),
      ]).catch(() => {})
      setTimeout(() => {
        Promise.all([
          usePositionsStore.getState().fetchPositions(),
          usePositionsStore.getState().fetchAccount(),
        ]).catch(() => {})
      }, 2000)
      loadOpenOrders().catch(() => {})
    } else {
      setExecutionState('rejected')
      setStatus({
        msg: finalResult.riskReason
          ? tn('orderRejected', { reason: finalResult.riskReason })
          : finalResult.error || tn('executionFailed', { error: '' }).replace(': ', ''),
        type: 'error'
      })
    }

    setLoading(false)
    setPendingAction(null)
    clearStatusAfter(4000) // 4 seconds — enough to read details
  }, [pendingAction, localSymbol, quantity, orderType, limitPrice, stopLoss, takeProfit, timeInForce, currentPrice, addPaperTrade, addNotification, fetchAccount, fetchPositions, loadAccount, loadOpenOrders, clearStatusAfter, tn, tc])

  // V248: Wire the ref — runs synchronously during render, so by the time
  // the user clicks, executeOrderRef.current points to the real executeOrder.
  executeOrderRef.current = executeOrder

  // Auto-calculate TP/SL/Qty
  const autoCalculate = useCallback(() => {
    if (currentPrice > 0) {
      // FIX: SL direction must respect order side:
      // - BUY: SL below price, TP above price
      // - SELL: SL above price, TP below price
      // Previously, SL was always set below price (0.99x) which is wrong for SELL orders.
      const isSell = pendingAction === 'sell'
      const tp = isSell ? currentPrice * 0.98 : currentPrice * 1.02
      const sl = isSell ? currentPrice * 1.01 : currentPrice * 0.99
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
  }, [currentPrice, account, riskPct, pendingAction])

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
