'use client'

import { useEffect, useRef } from 'react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'

/**
 * GlobalLogicEngine
 * Background component that synchronizes market prices with open trades and account data.
 * This fixes the "frozen" prices in the positions table.
 */
export function GlobalLogicEngine() {
  const quotes = useMarketStore(s => s.quotes)
  const updatePaperPrice = usePaperTradesStore(s => s.updatePrice)
  const fetchRealPositions = usePositionsStore(s => s.fetchPositions)
  const lastPriceSyncRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const now = Date.now()
    const activeTrades = usePaperTradesStore.getState().trades

    Object.entries(quotes).forEach(([symbol, q]) => {
      const price = q?.price
      if (typeof price !== 'number' || Number.isNaN(price)) return

      const normalizedSymbol = symbol.toUpperCase().replace('/', '')
      const hasMatchingTrade = activeTrades.some(
        trade => trade.symbol.toUpperCase().replace('/', '') === normalizedSymbol
      )

      if (!hasMatchingTrade) return

      const lastSyncAt = lastPriceSyncRef.current[normalizedSymbol] || 0
      if (now - lastSyncAt < 1000) return

      lastPriceSyncRef.current[normalizedSymbol] = now
      updatePaperPrice(symbol, price)
    })
  }, [quotes, updatePaperPrice])

  useEffect(() => {
    // 2. Periodically refresh real Alpaca positions to ensure sync
    const iv = setInterval(() => {
      fetchRealPositions()
    }, 15000)
    return () => clearInterval(iv)
  }, [fetchRealPositions])

  return null
}
