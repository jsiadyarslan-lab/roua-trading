'use client'

import { useEffect } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
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
      // SECURITY: Mark stale data so consumers can distinguish live vs cached prices.
      // Without this check, stale quotes flow into the market store as if they were fresh,
      // causing misleading price displays and potentially incorrect trading decisions.
      const isStale = data.stale === true
      useMarketStore.getState().setQuote(symbol, {
        ...data.data,
        stale: isStale,
        source: isStale ? `${data.data.source || 'unknown'} (مؤقت)` : data.data.source,
      })
    }
  } catch { /* silent */ }
}

/**
 * FIX V139: Fetch crypto symbols via REST as a fallback/supplement to Binance WS.
 * The WS provides sub-second updates, but can disconnect or have the symbol
 * mismatch bug (now fixed). This REST poll ensures that even if WS fails,
 * crypto prices update every 15 seconds — much better than the previous
 * 10-minute gap when WS failed.
 */
async function fetchCryptoBatch(symbols: string[]) {
  const BATCH_SIZE = 3
  const BATCH_DELAY = 2000 // 2s between batches

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(fetchAndStore))
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY))
    }
  }
}

/**
 * Fetch non-crypto symbols in staggered batches to respect API rate limits.
 * FIX: Increased polling interval from 120s to 600s (10 min) and batch delay from 3s to 5s.
 * With free sources only (TwelveData disabled): 12 symbols × 144/day = 1,728 fetches/day — sustainable.
 * Server-side cache of 600s means actual API hits are even lower.
 */
async function fetchNonCryptoBatch(symbols: string[]) {
  const BATCH_SIZE = 2
  const BATCH_DELAY = 5000 // 5s between batches (increased from 3s)

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(fetchAndStore))
    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY))
    }
  }
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

    // 3. Poll non-crypto (Forex + Stocks) every 600 seconds (10 min) to reduce API pressure
    //    FIX: Increased from 120s to 600s — free sources don't need rapid polling
    //    Staggered: fetch 2 at a time with 5s delay between batches
    const pollNonCrypto = () => {
      fetchNonCryptoBatch(NON_CRYPTO_SYMBOLS)
    }
    pollNonCrypto()
    return () => {
      WS_CRYPTO_SYMBOLS.forEach(sym => binanceWS.unsubscribe(sym))
    }
  }, [])

  // Poll non-crypto every 10 min — pauses when tab hidden
  useVisibleInterval(() => fetchNonCryptoBatch(NON_CRYPTO_SYMBOLS), 600_000)

  // FIX V139: Poll crypto via REST every 15 seconds as fallback for Binance WS.
  // WS provides sub-second updates, but this REST poll ensures:
  // 1. Prices update even if WS disconnects or fails to reconnect
  // 2. All symbol formats get price updates (BTC/USD and BTC/USDT)
  // 3. P&L stays fresh for all open positions
  useVisibleInterval(() => fetchCryptoBatch(WS_CRYPTO_SYMBOLS), 15_000)

  return (
    <>
      <PriceAlertEngine />
      {children}
    </>
  )
}
