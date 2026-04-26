'use client'

import { useEffect } from 'react'
import { binanceWS, useMarketStore } from '@/hooks/useMarketStore'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { PriceAlertEngine } from '@/components/dashboard/PriceAlertEngine'

/**
 * MASTER SYMBOL LIST — Single source of truth for all WS subscriptions.
 * All dashboard components read from useMarketStore instead of opening their own connections.
 * Add any new symbol here to make it available platform-wide.
 */
export const GLOBAL_SYMBOLS = [
  // Crypto
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD',
  'ADA/USD', 'DOGE/USD',
  // Crypto USDT pairs (Binance native)
  'BTC/USDT', 'ETH/USDT',
  // Forex
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF',
  // Commodities
  'XAU/USD',
  // Stocks (polled via Twelve Data)
  'AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META',
]

const CRYPTO_BASES = ['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX']

const WS_CRYPTO_SYMBOLS = GLOBAL_SYMBOLS.filter(s => {
  const base = s.split('/')[0]
  const quote = s.split('/')[1]
  return CRYPTO_BASES.includes(base) && ['USD','USDT','BUSD'].includes(quote)
})

const NON_CRYPTO_SYMBOLS = GLOBAL_SYMBOLS.filter(s => {
  const base = s.split('/')[0]
  return !CRYPTO_BASES.includes(base)
})

async function fetchAndStore(symbol: string) {
  try {
    const res = await fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)
    if (!res.ok) return // Silently skip failed requests
    const data = await res.json()
    if (data.success && data.data && data.data.price > 0) {
      useMarketStore.getState().setQuote(symbol, data.data)
    }
  } catch { /* silent */ }
}

/**
 * MarketProvider — Mounts once in layout, subscribes all symbols to Binance WS.
 * Ensures only ONE WebSocket connection exists for the entire dashboard.
 */
export function MarketProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Keep the legacy dashboard pair store and the newer symbol store in sync.
    // This prevents the chart, header, watchlists, and left/right panels from drifting apart.
    const unsubscribeDashboard = useDashboardStore.subscribe((state, prevState) => {
      if (state.selectedPair === prevState.selectedPair) return
      const currentSymbol = useSymbolStore.getState().selectedSymbol
      if (currentSymbol !== state.selectedPair) {
        useSymbolStore.getState().setSelectedSymbol(state.selectedPair)
      }
    })

    const unsubscribeSymbol = useSymbolStore.subscribe((state, prevState) => {
      if (state.selectedSymbol === prevState.selectedSymbol) return
      const currentPair = useDashboardStore.getState().selectedPair
      if (currentPair !== state.selectedSymbol) {
        useDashboardStore.getState().setSelectedPair(state.selectedSymbol)
      }
    })

    const initialPair = useDashboardStore.getState().selectedPair
    const initialSymbol = useSymbolStore.getState().selectedSymbol
    if (initialPair !== initialSymbol) {
      useDashboardStore.getState().setSelectedPair(initialSymbol)
    }

    return () => {
      unsubscribeDashboard()
      unsubscribeSymbol()
    }
  }, [])

  useEffect(() => {
    // 1. Subscribe all crypto symbols via the singleton WS manager (one connection for all)
    WS_CRYPTO_SYMBOLS.forEach(sym => binanceWS.subscribe(sym))

    // 2. Fetch initial data for ALL symbols via API
    Promise.allSettled(GLOBAL_SYMBOLS.map(fetchAndStore))

    // 3. Poll non-crypto (Forex + Stocks) every 60 seconds to respect TwelveData limit (8 req/min)
    //    Stagger requests: fetch a few at a time instead of all at once
    const pollNonCrypto = () => {
      // Split into batches of 3 to avoid rate limits
      const batch = NON_CRYPTO_SYMBOLS.slice(0, 3)
      const remaining = NON_CRYPTO_SYMBOLS.slice(3)
      Promise.allSettled(batch.map(fetchAndStore)).then(() => {
        if (remaining.length > 0) {
          // Fetch remaining after 2s delay
          setTimeout(() => {
            Promise.allSettled(remaining.map(fetchAndStore))
          }, 2000)
        }
      })
    }
    pollNonCrypto()
    const pollInterval = setInterval(pollNonCrypto, 60_000)

    return () => {
      clearInterval(pollInterval)
      WS_CRYPTO_SYMBOLS.forEach(sym => binanceWS.unsubscribe(sym))
    }
  }, [])

  return (
    <>
      <PriceAlertEngine />
      {children}
    </>
  )
}
