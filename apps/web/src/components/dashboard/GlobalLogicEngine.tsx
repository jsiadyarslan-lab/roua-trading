'use client'

import { useRef } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'

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
  const updatePositionPrice = usePositionsStore(s => s.updatePositionPrice)
  const fetchRealPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const lastPriceSyncRef = useRef<Record<string, number>>({})
  const lastFullFetchRef = useRef<number>(0)
  // FIX: Track previous equity for balance change notifications
  const prevEquityRef = useRef<number>(0)
  const lastNotificationRef = useRef<number>(0)

  // ── Price sync: every 2 seconds ──
  // Only updates currentPrice in existing positions — does NOT replace the array.
  useVisibleInterval(() => {
    const now = Date.now()
    const quotes = useMarketStore.getState().quotes
    const realPositions = usePositionsStore.getState().positions

    Object.entries(quotes).forEach(([symbol, q]) => {
      const price = q?.price
      if (typeof price !== 'number' || Number.isNaN(price)) return

      const normalizedSymbol = symbol.toUpperCase().replace('/', '')

      const hasMatchingRealPosition = realPositions.some(
        position => position.symbol.toUpperCase().replace('/', '') === normalizedSymbol
      )

      if (!hasMatchingRealPosition) return

      const lastSyncAt = lastPriceSyncRef.current[normalizedSymbol] || 0
      if (now - lastSyncAt < 2000) return

      lastPriceSyncRef.current[normalizedSymbol] = now
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
              title: `تحديث الرصيد: ${isPositive ? '+' : ''}$${equityDelta.toFixed(2)}`,
              body: `الرصيد تغيّر من $${prevEquity.toFixed(2)} إلى $${currentEquity.toFixed(2)}`,
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
  }, 2000)

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

    // Adaptive guard: 5s when active, 15s when idle
    const minInterval = isActive ? 5000 : 15000
    if (now - lastFullFetchRef.current < minInterval) return

    lastFullFetchRef.current = now
    fetchRealPositions()
    fetchAccount()
  }, 5000) // Check every 5 seconds, but actual fetch respects the adaptive guard

  return null
}
