'use client'

import { useEffect } from 'react'
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

  useEffect(() => {
    // 1. Update Paper Trades prices
    Object.entries(quotes).forEach(([symbol, q]) => {
      if (q.price) {
        updatePaperPrice(symbol, q.price)
      }
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
