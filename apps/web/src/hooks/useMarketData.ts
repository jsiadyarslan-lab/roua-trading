'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMarketStore, binanceWS, QuoteData } from './useMarketStore'


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

export function useMarketQuotes(symbols: string[], refreshInterval = 6000) {
  const globalQuotes = useMarketStore(state => state.quotes)
  const setQuote = useMarketStore(state => state.setQuote)
  const mountedRef = useRef(true)

  // Derive local map for compatibility with older code relying on Map
  const quotesMap = new Map<string, QuoteData>()
  symbols.forEach(s => {
    if (globalQuotes[s]) quotesMap.set(s, globalQuotes[s])
  })

  // Split symbols
  const cryptoSymbols = symbols.filter(isCryptoPair)
  const nonCryptoSymbols = symbols.filter(s => !isCryptoPair(s))

  const fetchAllInit = useCallback(async () => {
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        // Skip fetch if we already have it from WS and it's fresh, but to be safe, we fetch initial once.
        const data = await fetchQuoteFromAPI(symbol)
        return { symbol, data }
      })
    )
    if (!mountedRef.current) return
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.data) {
        setQuote(r.value.symbol, r.value.data)
      }
    }
  }, [symbols.join(',')])

  const pollNonCrypto = useCallback(async () => {
    if (nonCryptoSymbols.length === 0) return
    const results = await Promise.allSettled(
      nonCryptoSymbols.map(async (symbol) => {
        const data = await fetchQuoteFromAPI(symbol)
        return { symbol, data }
      })
    )
    if (!mountedRef.current) return
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.data) {
        setQuote(r.value.symbol, r.value.data)
      }
    }
  }, [nonCryptoSymbols.join(',')])

  useEffect(() => {
    mountedRef.current = true
    fetchAllInit()

    // 1. Setup Polling
    const iv = setInterval(pollNonCrypto, refreshInterval)

    // 2. Setup Binance WebSocket via Singleton
    cryptoSymbols.forEach(s => binanceWS.subscribe(s))

    return () => {
      mountedRef.current = false
      clearInterval(iv)
      // We don't eagerly unsubscribe to avoid connection flapping if user just switched tabs
      setTimeout(() => {
        cryptoSymbols.forEach(s => binanceWS.unsubscribe(s))
      }, 5000)
    }
  }, [symbols.join(','), refreshInterval, fetchAllInit, pollNonCrypto])

  return { quotes: quotesMap, refetch: fetchAllInit }
}

export function useSingleQuote(symbol: string, refreshInterval = 6000) {
  const { quotes, refetch } = useMarketQuotes([symbol], refreshInterval)
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
