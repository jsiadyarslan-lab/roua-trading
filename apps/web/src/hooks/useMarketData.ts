'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useMarketStore } from './useMarketStore'
import type { QuoteData } from './useMarketStore'

export type { QuoteData } from './useMarketStore'

const CRYPTO_BASES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI']

function isCryptoPair(symbol: string) {
  const base = symbol.split('/')[0]
  const quote = symbol.split('/')[1]
  return CRYPTO_BASES.includes(base) || ['USDT', 'BUSD', 'USDC'].includes(quote)
}

function normalizeBinanceSymbol(symbol: string) {
  let s = symbol.replace('/', '')
  if (symbol.endsWith('/USD') && !symbol.endsWith('/USDT')) {
    s = s.replace('USD', 'USDT')
  }
  return s.toLowerCase()
}

async function fetchQuoteFromAPI(symbol: string): Promise<QuoteData | null> {
  try {
    const response = await fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)
    if (!response.ok) return null
    const result = await response.json()
    if (result.success && result.data) {
      return result.data
    }
  } catch {
    // silent
  }
  return null
}

/**
 * Custom hook for fetching market quotes with stable references.
 * 
 * FIX: The original implementation had an infinite re-render loop because:
 * 1. `symbols` was passed as inline array, creating new reference each render
 * 2. `quotesMap = new Map()` was created on every render without memoization
 * 3. `refetch` depended on `symbols`, recreating every render
 * 
 * Now uses:
 * - Sorted + joined string as stable dependency key
 * - useMemo for quotesMap
 * - useRef for stable refetch function
 */
export function useMarketQuotes(symbols: string[], refreshInterval = 0) {
  const globalQuotes = useMarketStore(state => state.quotes)

  // Create a stable key from sorted symbols to prevent infinite re-renders
  const symbolsKey = useMemo(() => [...symbols].sort().join(','), [symbols])

  // Memoize the quotesMap to prevent unnecessary re-renders
  const quotesMap = useMemo(() => {
    const map = new Map<string, QuoteData>()
    symbols.forEach((symbol) => {
      const quote = globalQuotes[symbol]
      if (quote && quote.price > 0) map.set(symbol, quote)
    })
    return map
  }, [globalQuotes, symbolsKey]) // symbolsKey is stable for same symbols

  // Use ref for stable refetch that doesn't cause re-renders
  const symbolsRef = useRef(symbols)
  symbolsRef.current = symbols

  const refetch = useCallback(async () => {
    const currentSymbols = symbolsRef.current
    const results = await Promise.allSettled(currentSymbols.map(symbol => fetchQuoteFromAPI(symbol)))
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value && result.value.price > 0) {
        useMarketStore.getState().setQuote(currentSymbols[index], result.value)
      }
    })
  }, []) // No dependencies — uses ref for current symbols

  useEffect(() => {
    void refetch()

    if (refreshInterval <= 0) return

    const intervalId = window.setInterval(() => {
      void refetch()
    }, refreshInterval)

    return () => window.clearInterval(intervalId)
  }, [refetch, refreshInterval])

  return { quotes: quotesMap, refetch }
}

export function useSingleQuote(symbol: string, refreshInterval = 6000) {
  // Wrap symbol in useMemo-stable array to prevent unnecessary re-renders
  const symbols = useMemo(() => [symbol], [symbol])
  const { quotes, refetch } = useMarketQuotes(symbols, refreshInterval)
  return {
    quote: quotes.get(symbol) || null,
    refetch,
  }
}

export interface CandleData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  source: string
}

export function useHistoricalCandles(symbol: string, interval: string = '1h') {
  const [candles, setCandles] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/exchange/history/${encodeURIComponent(symbol)}?interval=${interval}`
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (result.success && result.data && result.data.length > 0) {
        setCandles(result.data)
      }
    } catch {
      // keep existing candles as fallback
    } finally {
      setLoading(false)
    }
  }, [symbol, interval])

  useEffect(() => {
    setLoading(true)
    fetchData()
    const iv = setInterval(fetchData, 30000)
    return () => clearInterval(iv)
  }, [fetchData])

  return { candles, loading, refetch: fetchData }
}
