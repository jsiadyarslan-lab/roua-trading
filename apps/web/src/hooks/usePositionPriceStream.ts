'use client'

/**
 * V-PNL: usePositionPriceStream — Subscribes to useMarketStore quote changes
 * and pushes live prices to usePositionsStore.updatePositionPrice() in real-time.
 *
 * PROBLEM (root cause analysis):
 * Previously, PnL was updated by GlobalLogicEngine's useVisibleInterval (200ms loop)
 * which iterated ALL quotes and called updatePositionPrice() for matching positions.
 * This meant PnL lagged 200ms-1000ms behind the live chart price, even though
 * useMarketStore was receiving ticks in real-time from Socket.IO long-polling.
 *
 * SOLUTION:
 * Subscribe DIRECTLY to useMarketStore changes via the store's subscribe() API.
 * Every quote update triggers an immediate updatePositionPrice() call for matching
 * positions. No polling loop, no throttle — pure event-driven.
 *
 * SAFETY:
 * - updatePositionPrice() already early-returns when |price delta| < 0.0001,
 *   so redundant calls with the same price are O(1) no-ops.
 * - Only processes symbols that have matching open positions (early skip).
 * - Uses a Set ref to avoid re-subscribing on every render.
 *
 * USAGE:
 * Mount this hook ONCE in the dashboard layout (alongside MarketProvider).
 * It auto-subscribes to new positions as they open, and unsubscribes as they close.
 */

import { useEffect, useRef } from 'react'
import { useMarketStore } from './useMarketStore'
import { usePositionsStore } from './usePositionsStore'

// Normalize symbol for matching: BTC/USDT → BTCUSDT, EUR/USD → EURUSD
function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\//g, '').replace(/USD$/, 'USDT')
}

export function usePositionPriceStream() {
  const unsubscribersRef = useRef<Map<string, () => void>>(new Map())
  const prevPositionsKeyRef = useRef<string>('')

  useEffect(() => {
    // Subscribe to positions changes — when positions open/close, we re-bind
    const positionsUnsub = usePositionsStore.subscribe((state, prevState) => {
      if (state.positions === prevState.positions) return

      // Build a key identifying the current set of position symbols
      const positionSymbols = new Set(
        state.positions.map(p => normalizeSymbol(p.symbol))
      )
      const positionsKey = Array.from(positionSymbols).sort().join(',')

      // Skip if unchanged (avoids re-binding on every price update)
      if (positionsKey === prevPositionsKeyRef.current) return
      prevPositionsKeyRef.current = positionsKey

      // Re-bind quote subscriptions for the new position set
      _rebindSubscriptions(positionSymbols, unsubscribersRef.current)
    })

    // Initial bind for any positions already loaded
    const initialPositions = usePositionsStore.getState().positions
    const initialSymbols = new Set(
      initialPositions.map(p => normalizeSymbol(p.symbol))
    )
    prevPositionsKeyRef.current = Array.from(initialSymbols).sort().join(',')
    _rebindSubscriptions(initialSymbols, unsubscribersRef.current)

    return () => {
      positionsUnsub()
      // Clean up all quote subscriptions
      for (const unsub of unsubscribersRef.current.values()) {
        try { unsub() } catch { /* non-critical */ }
      }
      unsubscribersRef.current.clear()
    }
  }, [])
}

/**
 * For each position symbol, ensure we have a subscription to useMarketStore
 * that calls updatePositionPrice() whenever that symbol's quote changes.
 * Remove subscriptions for symbols no longer in the position set.
 */
function _rebindSubscriptions(
  positionSymbols: Set<string>,
  activeSubscriptions: Map<string, () => void>
): void {
  // Remove subscriptions for symbols that no longer have positions
  for (const symbol of Array.from(activeSubscriptions.keys())) {
    if (!positionSymbols.has(symbol)) {
      const unsub = activeSubscriptions.get(symbol)
      try { unsub?.() } catch { /* non-critical */ }
      activeSubscriptions.delete(symbol)
    }
  }

  // Add subscriptions for new position symbols
  for (const normalizedSym of positionSymbols) {
    if (activeSubscriptions.has(normalizedSym)) continue

    // useMarketStore.subscribe fires on EVERY quote change — we filter inside.
    // Zustand subscribe(selector, listener) would be cleaner but our store
    // uses a flat quotes object, so we filter manually.
    const unsub = useMarketStore.subscribe((state, prevState) => {
      // Find the quote for this symbol — check both normalized and original forms
      // useMarketStore keys quotes by original symbol (EUR/USD, BTC/USDT)
      // We need to find the matching key
      const quotes = state.quotes
      const prevQuotes = prevState.quotes

      // Try direct lookup with common formats
      const candidateKeys = [
        normalizedSym.replace('USDT', 'USD').replace(/(.{3})/, '$1/'), // BTCUSDT → BTC/USD
        normalizedSym.replace('USDT', '/USDT'),                          // BTCUSDT → BTC/USDT
        normalizedSym.replace(/(.{3})(.*)/, '$1/$2'),                    // EURUSD → EUR/USD
        normalizedSym,                                                    // raw
      ]

      let currentQuote: any = null
      let prevQuote: any = null
      let matchedKey: string | null = null

      for (const key of candidateKeys) {
        if (quotes[key]) {
          currentQuote = quotes[key]
          prevQuote = prevQuotes[key]
          matchedKey = key
          break
        }
      }

      if (!matchedKey || !currentQuote) return
      if (currentQuote === prevQuote) return // No change for this symbol

      const price = typeof currentQuote.price === 'number'
        ? currentQuote.price
        : typeof currentQuote.close === 'number'
          ? currentQuote.close
          : null

      if (price === null || price <= 0) return

      // Call updatePositionPrice with the matched quote key (original format)
      try {
        usePositionsStore.getState().updatePositionPrice(matchedKey, price)
      } catch { /* store not ready */ }
    })

    activeSubscriptions.set(normalizedSym, unsub)
  }
}
