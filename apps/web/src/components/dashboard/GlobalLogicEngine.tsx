'use client'

import { useEffect, useRef } from 'react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'

/**
 * GlobalLogicEngine
 * Background component that synchronizes market prices with open trades and account data.
 * This fixes the "frozen" prices/P&L in the positions table by bridging real-time
 * market quotes (Binance WS, REST polling) to both paper trades AND real Alpaca positions.
 *
 * Also handles cross-tab synchronization so desktop and mobile views stay in sync.
 */
export function GlobalLogicEngine() {
  // Removed reactive quotes subscription to prevent rapid re-renders
  // We will read from getState() inside the timer instead.
  const updatePaperPrice = usePaperTradesStore(s => s.updatePrice)
  const updatePositionPrice = usePositionsStore(s => s.updatePositionPrice)
  const fetchRealPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const lastPriceSyncRef = useRef<Record<string, number>>({})

  // ── Cross-tab synchronization via storage events ──
  // When another tab (desktop/mobile) updates localStorage,
  // this listener re-hydrates the Zustand store from the persisted data.
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

  useEffect(() => {
    const syncInterval = setInterval(() => {
      const now = Date.now()
      const quotes = useMarketStore.getState().quotes
      const activePaperTrades = usePaperTradesStore.getState().trades
      const realPositions = usePositionsStore.getState().positions

      Object.entries(quotes).forEach(([symbol, q]) => {
        const price = q?.price
        if (typeof price !== 'number' || Number.isNaN(price)) return

        const normalizedSymbol = symbol.toUpperCase().replace('/', '')

        // تحقق مما إذا كان هناك صفقة ورقية مطابقة
        const hasMatchingPaperTrade = activePaperTrades.some(
          trade => trade.symbol.toUpperCase().replace('/', '') === normalizedSymbol
        )

        // تحقق مما إذا كان هناك مركز Alpaca حقيقي مطابق
        const hasMatchingRealPosition = realPositions.some(
          position => position.symbol.toUpperCase().replace('/', '') === normalizedSymbol
        )

        if (!hasMatchingPaperTrade && !hasMatchingRealPosition) return

        // تقييد التحديث إلى مرة واحدة في الثانية لكل رمز (redundant now with setInterval but safe)
        const lastSyncAt = lastPriceSyncRef.current[normalizedSymbol] || 0
        if (now - lastSyncAt < 1000) return

        lastPriceSyncRef.current[normalizedSymbol] = now

        // تحديث الصفقات الورقية بالسعر المباشر
        if (hasMatchingPaperTrade) {
          updatePaperPrice(symbol, price)
        }

        // تحديث مراكز Alpaca الحقيقية بالسعر المباشر (حساب P&L فوري)
        if (hasMatchingRealPosition) {
          updatePositionPrice(symbol, price)
        }
      })
    }, 1000)

    return () => clearInterval(syncInterval)
  }, [updatePaperPrice, updatePositionPrice])

  useEffect(() => {
    // تحديث دوري لمراكز Alpaca الحقيقية وحساب الحساب
    const iv = setInterval(() => {
      fetchRealPositions()
      fetchAccount()
    }, 15000)
    return () => clearInterval(iv)
  }, [fetchRealPositions, fetchAccount])

  return null
}
