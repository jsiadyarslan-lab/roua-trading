'use client'

import { useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAgentStore } from '@/hooks/useAgentStore'
import { setNotificationTranslator } from '@/hooks/usePaperTradesStore'
import { setAlertTranslator } from '@/components/charts/AlertManager'
import { useMT5Streaming } from '@/hooks/useMT5Streaming'

/**
 * GlobalLogicEngine
 * Background component that synchronizes market prices with open trades and account data.
 *
 * FIX: Adaptive polling — when Smart Executor or Agent is active, polls every 5s
 * instead of 15s. This ensures balance/positions update quickly after automated trades.
 *
 * Polling intervals:
 * - 2s: Price sync only (updates currentPrice in-place, doesn't replace array)
 * - 5s: Full positions/account fetch WHEN executor/agent is active
 * - 15s: Full positions/account fetch WHEN no automated trading (idle)
 * - mergePositions() prevents "dancing" trades on all intervals
 *
 * FIX: Balance change notifications — when equity changes by >$10 due to P&L,
 * a notification is pushed so the user is aware of significant balance changes.
 */
export function GlobalLogicEngine() {
  const t = useTranslations('dashboard.globalLogic')
  const tne = useTranslations('notifications.execution')
  const tnp = useTranslations('notifications.push')

  // V196: Connect to MT5 streaming for real-time balance/position/price updates
  useMT5Streaming()

  // Initialize notification translator for usePaperTradesStore (non-component context)
  useEffect(() => {
    setNotificationTranslator((key: string, vars?: Record<string, any>) => tne(key, vars))
    setAlertTranslator((key: string, vars?: Record<string, any>) => tnp(key, vars))
  }, [tne, tnp])

  const updatePositionPrice = usePositionsStore(s => s.updatePositionPrice)
  const fetchRealPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchSettings = useAgentStore(s => s.fetchSettings)
  const lastPriceSyncRef = useRef<Record<string, number>>({})
  const lastFullFetchRef = useRef<number>(0)
  const prevEquityRef = useRef<number>(0)
  const lastNotificationRef = useRef<number>(0)

  // V175: Fetch AgentSettings ONCE on mount so leverage is available immediately.
  // Without this, margin-calculator uses DEFAULT_CRYPTO_LEVERAGE=1 instead of
  // user-configured 10x, causing margin display = full notional ($36,788 instead of $3,678)
  // and triggering V149 "Clearing stale margin" warning on every page load.
  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // ── Price sync: BACKUP every 2 seconds (V225: reduced from 1s primary → 2s backup) ──
  // V225: Binance WS now calls updatePositionPrice() directly (~100ms latency).
  // This loop is now a BACKUP that catches symbols NOT served by WS (forex, stocks)
  // or when WS is disconnected. Redundant calls are harmless — updatePositionPrice()
  // skips if price unchanged (Math.abs delta < 0.0001).
  //
  // FIX V139: Normalize USD→USDT when matching symbols. Positions from SmartExecutor
  // use BTC/USDT format, but market quotes may use BTC/USD. Without this normalization,
  // positions with BTC/USDT never matched quotes stored under BTC/USD key, causing
  // P&L to appear "frozen" for those positions.
  useVisibleInterval(() => {
    const now = Date.now()
    const quotes = useMarketStore.getState().quotes
    const realPositions = usePositionsStore.getState().positions

    Object.entries(quotes).forEach(([symbol, q]) => {
      const price = q?.price
      if (typeof price !== 'number' || Number.isNaN(price)) return

      // V410: Removed the 'Binance WS' source skip — BinanceWSManager was deleted in V409.
      // All crypto prices now flow through Socket.IO with source 'binance-stream' or 'oanda-stream'.
      // This backup loop processes ALL quotes regardless of source.
      // FIX V139: Normalize USD→USDT for matching purposes.
      const normalizedSymbol = symbol.toUpperCase().replace('/', '').replace(/USD$/, 'USDT')

      const hasMatchingRealPosition = realPositions.some(
        position => position.symbol.toUpperCase().replace('/', '').replace(/USD$/, 'USDT') === normalizedSymbol
      )

      if (!hasMatchingRealPosition) return

      // V-PNL: Removed per-symbol throttle — was bottlenecking PnL to 1 update/100ms.
      // updatePositionPrice() already early-returns when |price delta| < 0.0001,
      // so redundant calls with the same price are O(1) no-ops. Trust that guard.
      updatePositionPrice(symbol, price)
    })

    // ═══════════════════════════════════════════════════════════════
    // FIX: BALANCE CHANGE NOTIFICATION
    // After price sync, check if equity changed significantly.
    // If equity changed by >$10, push a notification to inform the user.
    // Throttled: at most one notification per 30 seconds.
    // ═══════════════════════════════════════════════════════════════
    const currentAccount = usePositionsStore.getState().account
    const currentEquity = Number(currentAccount?.equity) || 0
    const prevEquity = prevEquityRef.current

    if (prevEquity > 0 && currentEquity > 0) {
      const equityDelta = currentEquity - prevEquity
      const SIGNIFICANT_CHANGE = 10 // $10 threshold

      if (Math.abs(equityDelta) >= SIGNIFICANT_CHANGE) {
        const now = Date.now()
        const lastNotif = lastNotificationRef.current || 0
        // Throttle: at most one notification per 30 seconds
        if (now - lastNotif > 30000) {
          lastNotificationRef.current = now
          try {
            const addNotification = useNotificationStore.getState().addNotification
            const isPositive = equityDelta > 0
            addNotification({
              source: 'trade',
              priority: isPositive ? 'medium' : 'high',
              action: isPositive ? 'BUY' : 'SELL',
              title: t('balanceUpdate', { delta: `${isPositive ? '+' : ''}$${equityDelta.toFixed(2)}` }),
              body: t('balanceChanged', { from: `$${prevEquity.toFixed(2)}`, to: `$${currentEquity.toFixed(2)}` }),
              price: currentEquity,
            })
          } catch { /* notification store not ready */ }
        }
      }
    }

    // Always update the previous equity reference
    if (currentEquity > 0) {
      prevEquityRef.current = currentEquity
    }
  }, 200) // V-PNL: 1000ms → 200ms — PnL updates 5x more frequently. updatePositionPrice() early-returns on unchanged price, so faster polling is safe.

  // ── Adaptive full fetch: 5s when active, 15s when idle ──
  // FIX: Reduced from 30s to 15s baseline, and 5s when automated trading is active.
  // This ensures the balance and positions update quickly after automated trades.
  // The mergePositions() function prevents "dancing" regardless of interval speed.
  useVisibleInterval(() => {
    const now = Date.now()

    // Check if Smart Executor or Agent is active by examining store state
    let isActive = false
    try {
      const positions = usePositionsStore.getState().positions
      if (positions.length > 0) isActive = true
    } catch { /* store not ready */ }

    // Adaptive guard: 5s when active, 12s when idle
    // FIX: Reduced from 8s/20s to 5s/12s — positions data refreshes faster.
    // mergePositions() now protects live price fields from being overwritten
    // by stale backend data, so faster fetches are safe and beneficial.
    const minInterval = isActive ? 5000 : 12000 // PERF: 5s active, 12s idle
    if (now - lastFullFetchRef.current < minInterval) return

    lastFullFetchRef.current = now
    fetchRealPositions()
    fetchAccount()
  }, 5000) // Check every 5 seconds, but actual fetch respects the adaptive guard

  return null
}
