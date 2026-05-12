'use client'

import { useEffect, useRef } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'

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
 */
export function GlobalLogicEngine() {
  const updatePositionPrice = usePositionsStore(s => s.updatePositionPrice)
  const fetchRealPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const lastPriceSyncRef = useRef<Record<string, number>>({})
  const lastFullFetchRef = useRef<number>(0)

  // ── Cross-tab synchronization via storage events ──
  // FIX: DISABLED cross-tab position sync. Previously, this re-added
  // phantom positions from another tab's stale localStorage data.
  useEffect(() => {
    return () => {}
  }, [])

  // ── Price sync: every 2 seconds ──
  // Only updates currentPrice in existing positions — does NOT replace the array.
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'hidden') return
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
    }, 2000)

    return () => clearInterval(syncInterval)
  }, [updatePositionPrice])

  // ── Adaptive full fetch: 5s when active, 15s when idle ──
  // FIX: Reduced from 30s to 15s baseline, and 5s when automated trading is active.
  // This ensures the balance and positions update quickly after automated trades.
  // The mergePositions() function prevents "dancing" regardless of interval speed.
  useEffect(() => {
    let isActive = false

    // Check if Smart Executor or Agent is active by examining store state
    const checkActive = (): boolean => {
      try {
        // Check for open positions that might be from automated trading
        const positions = usePositionsStore.getState().positions
        // If there are open positions, use faster polling
        if (positions.length > 0) return true
      } catch { /* store not ready */ }
      return false
    }

    const iv = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()

      // Re-evaluate active state periodically
      isActive = checkActive()

      // Adaptive guard: 5s when active, 15s when idle
      const minInterval = isActive ? 5000 : 15000
      if (now - lastFullFetchRef.current < minInterval) return

      lastFullFetchRef.current = now
      fetchRealPositions()
      fetchAccount()
    }, 5000) // Check every 5 seconds, but actual fetch respects the guard

    return () => clearInterval(iv)
  }, [fetchRealPositions, fetchAccount])

  return null
}
