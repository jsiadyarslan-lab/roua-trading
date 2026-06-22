import { create } from 'zustand'

// V409: Removed BinanceWSManager — Socket.IO (useMarketStreamSocket) is now the
// sole source of crypto prices. The direct browser → Binance WS connection was
// removed in V403. This file is now a simple Zustand store with no side effects.

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

interface MarketStore {
  quotes: Record<string, QuoteData>
  setQuote: (symbol: string, data: QuoteData) => void
  setQuotes: (data: Record<string, QuoteData>) => void
}

// ── Batched quote updates: coalesce multiple setQuote calls within a single
// animation frame into one store update, drastically reducing re-renders.
let pendingQuotes: Record<string, QuoteData> = {}
let flushTimer: ReturnType<typeof requestAnimationFrame> | null = null

function flushPendingQuotes() {
  if (Object.keys(pendingQuotes).length === 0) return
  const batch = pendingQuotes
  pendingQuotes = {}
  flushTimer = null
  useMarketStore.setState((state) => ({
    quotes: { ...state.quotes, ...batch }
  }))
}

export const useMarketStore = create<MarketStore>((set) => ({
  quotes: {},
  setQuote: (symbol, data) => {
    // Batch: accumulate updates and flush once per animation frame
    pendingQuotes[symbol] = data
    if (!flushTimer) {
      flushTimer = requestAnimationFrame(flushPendingQuotes)
    }
  },
  setQuotes: (data) => set((state) => ({
    quotes: { ...state.quotes, ...data }
  }))
}))

