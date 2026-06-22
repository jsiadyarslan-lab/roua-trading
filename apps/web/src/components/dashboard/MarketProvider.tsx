'use client'

import { useEffect } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { binanceWS, useMarketStore } from '@/hooks/useMarketStore'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { PriceAlertEngine } from '@/components/dashboard/PriceAlertEngine'
import { useMarketStreamSocket } from '@/hooks/useMarketStreamSocket'

/**
 * MASTER SYMBOL LIST — Single source of truth for all price subscriptions.
 * All dashboard components read from useMarketStore.
 *
 * V390: All prices now flow through ONE Socket.IO connection to NestJS.
 * The backend routes each symbol to the appropriate streaming source:
 *   - Crypto → BinanceStreamingService (Binance WS)
 *   - Forex/Metals/Indices → OandaStreamingService (OANDA v20 Stream)
 *   - Stocks → polling cycle (TwelveData REST, 5s)
 */
export const GLOBAL_SYMBOLS = [
  // Crypto
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD',
  'ADA/USD', 'DOGE/USD',
  // Crypto USDT pairs (Binance native)
  'BTC/USDT', 'ETH/USDT',
  // Forex — OANDA supported (verified working on Practice account)
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
  // Metals (OANDA)
  'XAU/USD', 'XAG/USD',
  // Indices (OANDA) — only US30, NAS100, SPX500 are valid on Practice
  'US30/USD', 'NAS100/USD', 'SPX500/USD',
  // Stocks (polled via REST on backend)
  'AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META',
  // V375: Removed GER30/USD, UK100/USD, WTI/USD, BRENT/USD — cause 503 on OANDA Practice
]

const CRYPTO_BASES_SET = (() => {
  const { CRYPTO_BASES } = require('@/lib/charts/config')
  return CRYPTO_BASES
})()

const WS_CRYPTO_SYMBOLS = GLOBAL_SYMBOLS.filter(s => {
  const base = s.split('/')[0]
  const quote = s.split('/')[1]
  return CRYPTO_BASES_SET.has(base) && ['USD','USDT','BUSD'].includes(quote)
})

const NON_CRYPTO_SYMBOLS = GLOBAL_SYMBOLS.filter(s => {
  const base = s.split('/')[0]
  return !CRYPTO_BASES_SET.has(base)
})

/**
 * V390: REST fallback for when Socket.IO is disconnected.
 * Only fetches if the existing quote is stale (>30s old).
 * This is NOT the primary price source — Socket.IO is.
 */
async function fetchAndStoreIfStale(symbol: string) {
  try {
    const existing = useMarketStore.getState().quotes[symbol]
    // If we have a fresh quote from Socket.IO, skip REST fetch
    if (existing && existing.timestamp) {
      const ageMs = Date.now() - new Date(existing.timestamp).getTime()
      if (ageMs < 30_000) return // Fresh enough — Socket.IO is working
    }

    const res = await fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)
    if (!res.ok) return
    const data = await res.json()
    if (data.success && data.data && data.data.price > 0) {
      const isStale = data.stale === true
      useMarketStore.getState().setQuote(symbol, {
        ...data.data,
        stale: isStale,
        source: isStale ? `${data.data.source || 'unknown'} (مؤقت)` : data.data.source,
      })
    }
  } catch { /* silent */ }
}

async function fetchBatchIfStale(symbols: string[]) {
  const BATCH_SIZE = 5
  const BATCH_DELAY = 500

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(fetchAndStoreIfStale))
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY))
    }
  }
}

/**
 * MarketProvider — Mounts once in layout.
 *
 * V390: Uses useMarketStreamSocket as the PRIMARY price source.
 * All crypto, forex, metals, indices, and stocks flow through ONE
 * Socket.IO connection to NestJS. REST polling is now just a fallback
 * for when Socket.IO disconnects.
 */
export function MarketProvider({ children }: { children: React.ReactNode }) {
  // V390: UNIFIED Socket.IO stream — intended as PRIMARY price source for ALL assets.
  // V391: BUT Socket.IO proxy has 404 issue on Railway (V388/V389 didn't resolve it).
  // Until Socket.IO works, BinanceWSManager (below) is the PRIMARY source for crypto.
  useMarketStreamSocket()

  useEffect(() => {
    // Keep the legacy dashboard pair store and the newer symbol store in sync.
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

  // V391: RESTORE BinanceWSManager as crypto price source.
  // Socket.IO proxy (V388/V389) is still returning 404 on Railway.
  // Until that's fixed, BinanceWSManager is the ONLY working crypto source.
  // This is the direct browser → Binance WS connection that worked before V390.
  useEffect(() => {
    WS_CRYPTO_SYMBOLS.forEach(sym => binanceWS.subscribe(sym))
    return () => {
      WS_CRYPTO_SYMBOLS.forEach(sym => binanceWS.unsubscribe(sym))
    }
  }, [])

  // V390: Initial fetch — populate store while connections are establishing.
  useEffect(() => {
    Promise.allSettled(GLOBAL_SYMBOLS.map(fetchAndStoreIfStale))
  }, [])

  // V391: REST polling fallback — more aggressive now (15s) since Socket.IO is broken.
  // Fetches stale quotes (>30s old) as fallback for ALL symbol types.
  useVisibleInterval(() => fetchBatchIfStale(GLOBAL_SYMBOLS), 15_000)


  return (
    <>
      <PriceAlertEngine />
      {children}
    </>
  )
}
