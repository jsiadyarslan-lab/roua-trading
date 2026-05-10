'use client'

import { useEffect, useRef } from 'react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'

/**
 * GlobalLogicEngine
 * Background component that synchronizes market prices with open trades and account data.
 * This fixes the "frozen" prices/P&L in the positions table by bridging real-time
 * market quotes (Binance WS, REST polling) to both paper trades AND real Alpaca positions.
 *
 * Also handles cross-tab synchronization so desktop and mobile views stay in sync.
 *
 * FIX: Reduced polling to prevent "dancing" trades. Previously, there were
 * MULTIPLE overlapping fetch intervals (1s price sync + 15s full fetch here,
 * + 10s fetch on dashboard, + 30s fetch in AlpacaPositions). These competing
 * timers replaced the entire positions array at different times, causing
 * positions to flicker between states.
 *
 * Now:
 * - 1s: Price sync only (updates currentPrice in-place, doesn't replace array)
 * - 30s: Full positions/account fetch (single source of truth for full refresh)
 * - Removed the 15s full-fetch interval from this component
 */
export function GlobalLogicEngine() {
  // Removed reactive quotes subscription to prevent rapid re-renders
  // We will read from getState() inside the timer instead.
  const updatePositionPrice = usePositionsStore(s => s.updatePositionPrice)
  const fetchRealPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const lastPriceSyncRef = useRef<Record<string, number>>({})
  const lastFullFetchRef = useRef<number>(0)

  // ── Cross-tab synchronization via storage events ──
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('roua-positions-store') && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (parsed?.state) {
            const { account, positions, lastUpdate, dataSource } = parsed.state
            if (account) usePositionsStore.setState({ account })
            if (positions) usePositionsStore.setState({ positions })
            if (lastUpdate) usePositionsStore.setState({ lastUpdate })
            if (dataSource) usePositionsStore.setState({ dataSource })
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // ── Price sync: every 2 seconds (was 1s) ──
  // This only updates currentPrice in existing positions — does NOT
  // replace the entire positions array, so no "dancing"
  //
  // FIX: DISABLED paper trade price updates. Previously, this synced
  // prices to paper trades every 2 seconds, which caused phantom trades
  // to "dance" (flicker/update rapidly). Since paper trades are now
  // cleared on every page load (see usePaperTradesStore), there should
  // be no paper trades to update. But as an extra safety measure, we
  // skip paper trade price updates entirely. Only real positions from
  // the exchange get price updates.
  useEffect(() => {
    const syncInterval = setInterval(() => {
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

        // FIX: ONLY update prices for REAL positions, NOT paper trades.
        // Paper trade price updates were the cause of the "dancing"
        // phantom trades that refreshed every 2 seconds.
        if (!hasMatchingRealPosition) return

        // تقييد التحديث إلى مرة واحدة كل 2 ثانية لكل رمز
        const lastSyncAt = lastPriceSyncRef.current[normalizedSymbol] || 0
        if (now - lastSyncAt < 2000) return

        lastPriceSyncRef.current[normalizedSymbol] = now

        if (hasMatchingRealPosition) {
          updatePositionPrice(symbol, price)
        }
      })
    }, 2000) // Changed from 1000ms to 2000ms

    return () => clearInterval(syncInterval)
  }, [updatePositionPrice])

  // ── Full fetch: every 30 seconds (was 15s) ──
  // This is the ONLY full refresh interval in this component.
  // The dashboard page has its own 10s interval, but that's fine
  // because mergePositions() now prevents dancing.
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now()
      // Guard: don't fetch more than once every 15s
      if (now - lastFullFetchRef.current < 15000) return
      lastFullFetchRef.current = now
      fetchRealPositions()
      fetchAccount()
    }, 30000) // Changed from 15000ms to 30000ms
    return () => clearInterval(iv)
  }, [fetchRealPositions, fetchAccount])

  return null
}
