'use client'

import { useEffect } from 'react'
import { binanceWS, useMarketStore } from '@/hooks/useMarketStore'
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
    const data = await res.json()
    if (data.success && data.data) {
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
    // 1. Subscribe all crypto symbols via the singleton WS manager (one connection for all)
    WS_CRYPTO_SYMBOLS.forEach(sym => binanceWS.subscribe(sym))

    // 2. Fetch initial data for ALL symbols via API
    Promise.allSettled(GLOBAL_SYMBOLS.map(fetchAndStore))

    // 3. Poll non-crypto (Forex + Stocks) every 15 seconds
    const pollInterval = setInterval(() => {
      Promise.allSettled(NON_CRYPTO_SYMBOLS.map(fetchAndStore))
    }, 15_000)

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
