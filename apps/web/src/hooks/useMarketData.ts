'use client'

import { useState, useEffect, useCallback } from 'react'
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

export function useMarketQuotes(symbols: string[], refreshInterval = 0) {
  const globalQuotes = useMarketStore(state => state.quotes)

  const quotesMap = new Map<string, QuoteData>()
  symbols.forEach((symbol) => {
    const quote = globalQuotes[symbol]
    if (quote) quotesMap.set(symbol, quote)
  })

  const refetch = useCallback(async () => {
    const results = await Promise.all(symbols.map(symbol => fetchQuoteFromAPI(symbol)))
    results.forEach((quote, index) => {
      if (quote) {
        useMarketStore.getState().setQuote(symbols[index], quote)
      }
    })
  }, [symbols])

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

export function useSingleQuote(symbol: string, _refreshInterval = 6000) {
  const { quotes, refetch } = useMarketQuotes([symbol])
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
