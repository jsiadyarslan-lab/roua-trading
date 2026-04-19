'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useMarketData — Unified hook for real-time market prices
 *
 * Fetches quotes from /api/exchange/quote/[symbol] and keeps them fresh.
 * All dashboard components should use this hook instead of hardcoded mock data.
 */

export interface QuoteData {
  symbol: string
  name: string
  exchange: string
  currency: string
  price: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  marketCap: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  timestamp: string
  source: string
}

export interface UseMarketDataOptions {
  symbols: string[]
  refreshInterval?: number  // ms, default 5000
  enabled?: boolean
}

export interface UseMarketDataReturn {
  quotes: Map<string, QuoteData>
  loading: boolean
  errors: Map<string, string>
  lastUpdate: Date | null
  refetch: () => void
}

// Singleton cache shared across all hook instances
const globalQuotes = new Map<string, QuoteData>()
const globalErrors = new Map<string, string>()
const globalLoading = new Set<string>()
let globalLastUpdate: Date | null = null
const subscribers = new Set<() => void>()

function notifyAll() {
  subscribers.forEach(fn => fn())
}

// Active fetch trackers to prevent duplicate requests
const inFlight = new Map<string, Promise<void>>()

async function fetchQuote(symbol: string) {
  if (inFlight.has(symbol)) return inFlight.get(symbol)!

  const promise = (async () => {
    globalLoading.add(symbol)
    try {
      const response = await fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (result.success && result.data) {
        globalQuotes.set(symbol, result.data)
        globalErrors.delete(symbol)
      } else {
        globalErrors.set(symbol, result.error || 'فشل في جلب البيانات')
      }
    } catch (err: any) {
      globalErrors.set(symbol, err.message)
    } finally {
      globalLoading.delete(symbol)
      inFlight.delete(symbol)
    }
  })()

  inFlight.set(symbol, promise)
  await promise
}

async function fetchAllQuotes(symbols: string[]) {
  await Promise.allSettled(symbols.map(s => fetchQuote(s)))
  globalLastUpdate = new Date()
  notifyAll()
}

export function useMarketData({
  symbols,
  refreshInterval = 5000,
  enabled = true,
}: UseMarketDataOptions): UseMarketDataReturn {
  const [, forceUpdate] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // Subscribe to global state changes
  useEffect(() => {
    const handler = () => {
      if (mountedRef.current) forceUpdate(n => n + 1)
    }
    subscribers.add(handler)
    return () => {
      subscribers.delete(handler)
      mountedRef.current = false
    }
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    if (!enabled || symbols.length === 0) return

    // Fetch immediately
    fetchAllQuotes(symbols)

    // Set up polling
    intervalRef.current = setInterval(() => {
      fetchAllQuotes(symbols)
    }, refreshInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [symbols.join(','), refreshInterval, enabled])

  const refetch = useCallback(() => {
    fetchAllQuotes(symbols)
  }, [symbols.join(',')])

  // Build loading state from global
  const loading = symbols.some(s => globalLoading.has(s))

  return {
    quotes: new Map(globalQuotes),
    loading,
    errors: new Map(globalErrors),
    lastUpdate: globalLastUpdate,
    refetch,
  }
}

/**
 * useSingleQuote — Convenience hook for a single symbol
 */
export function useSingleQuote(symbol: string, refreshInterval = 5000) {
  const { quotes, loading, errors, lastUpdate, refetch } = useMarketData({
    symbols: [symbol],
    refreshInterval,
  })

  return {
    quote: quotes.get(symbol) || null,
    loading,
    error: errors.get(symbol) || null,
    lastUpdate,
    refetch,
  }
}

/**
 * useHistoricalData — Hook for fetching OHLCV candle data
 */
export interface CandleData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  source: string
}

export function useHistoricalData(
  symbol: string,
  interval: string = '1h',
  enabled: boolean = true
) {
  const [candles, setCandles] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled || !symbol) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/exchange/history/${encodeURIComponent(symbol)}?interval=${interval}`
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (result.success && result.data) {
        setCandles(result.data)
      } else {
        setError(result.error || 'فشل في جلب البيانات التاريخية')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [symbol, interval, enabled])

  useEffect(() => {
    fetchData()
    // Refresh every 30 seconds for live data
    const iv = setInterval(fetchData, 30000)
    return () => clearInterval(iv)
  }, [fetchData])

  return { candles, loading, error, refetch: fetchData }
}
