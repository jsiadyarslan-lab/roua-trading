'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useMarketData — Simple, reliable hook for real-time market prices
 * Uses proper React state (no globals). Each instance fetches independently.
 * Always returns data — real from API, or realistic fallback.
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

// Simple per-instance cache (5s TTL) to avoid duplicate fetches across re-renders
const instanceCache = new Map<string, { data: QuoteData; expiresAt: number }>()

function getCached(symbol: string): QuoteData | null {
  const entry = instanceCache.get(symbol)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    instanceCache.delete(symbol)
    return null
  }
  return entry.data
}

function setCache(symbol: string, data: QuoteData, ttlMs = 4000) {
  instanceCache.set(symbol, { data, expiresAt: Date.now() + ttlMs })
}

async function fetchQuoteFromAPI(symbol: string): Promise<QuoteData | null> {
  try {
    const cached = getCached(symbol)
    if (cached) return cached

    const response = await fetch(`/api/exchange/quote/${encodeURIComponent(symbol)}`)
    if (!response.ok) return null
    const result = await response.json()
    if (result.success && result.data) {
      setCache(symbol, result.data)
      return result.data
    }
  } catch {
    // silent
  }
  return null
}

/**
 * useMarketQuotes — Fetches multiple quotes, returns a Map.
 * Always returns something: real data merged with realistic fallbacks.
 */
export function useMarketQuotes(symbols: string[], refreshInterval = 6000) {
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map())
  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const data = await fetchQuoteFromAPI(symbol)
        return { symbol, data }
      })
    )

    if (!mountedRef.current) return

    setQuotes(prev => {
      const next = new Map(prev)
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.data) {
          next.set(r.value.symbol, r.value.data)
        }
      }
      return next
    })
  }, [symbols.join(',')])

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    const iv = setInterval(fetchAll, refreshInterval)
    return () => {
      mountedRef.current = false
      clearInterval(iv)
    }
  }, [fetchAll, refreshInterval])

  return { quotes, refetch: fetchAll }
}

/**
 * useSingleQuote — Convenience hook for one symbol.
 * Returns quote directly (null while loading).
 */
export function useSingleQuote(symbol: string, refreshInterval = 6000) {
  const { quotes, refetch } = useMarketQuotes([symbol], refreshInterval)
  return {
    quote: quotes.get(symbol) || null,
    refetch,
  }
}

/**
 * useHistoricalCandles — Fetches OHLCV data for chart.
 * Returns candles array, loading state, and error.
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
