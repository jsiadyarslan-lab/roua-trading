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

export function useMarketQuotes(symbols: string[]) {
  const globalQuotes = useMarketStore(state => state.quotes)
  
  // Derive local map for compatibility
  const quotesMap = new Map<string, QuoteData>()
  symbols.forEach(s => {
    if (globalQuotes[s]) quotesMap.set(s, globalQuotes[s])
  })

  // Expose a dummy refetch that doesn't do anything because MarketProvider polls globally
  const refetch = useCallback(() => {}, [])

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
