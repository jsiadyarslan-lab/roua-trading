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

// V430: Batched updates — collect setQuote calls within a single microtask
// and apply them all at once. Previously, every price tick triggered a
// separate Zustand state update + React re-render. With 24 symbols at
// ~1 tick/second, that was 24 re-renders/sec per consumer.
// Now, all quotes received within the same event loop tick are batched
// into a single state update, reducing re-renders to ~4/sec.
let pendingQuotes: Record<string, QuoteData> = {}
let batchTimer: ReturnType<typeof queueMicrotask> | null = null

function flushBatch(set: (fn: (state: any) => any) => void) {
  if (Object.keys(pendingQuotes).length === 0) return
  const batch = { ...pendingQuotes }
  pendingQuotes = {}
  batchTimer = null
  set((state: any) => ({
    quotes: { ...state.quotes, ...batch }
  }))
}

export const useMarketStore = create<MarketStore>((set) => ({
  quotes: {},
  // V430: Batched setQuote — defers state update to next microtask.
  // Multiple setQuote calls within the same event loop tick (e.g.,
  // receiving 12 crypto ticks from a single Socket.IO polling response)
  // are coalesced into one state update.
  setQuote: (symbol, data) => {
    pendingQuotes[symbol] = data
    if (!batchTimer) {
      batchTimer = queueMicrotask(() => flushBatch(set))
    }
  },
  setQuotes: (data) => set((state) => ({
    quotes: { ...state.quotes, ...data }
  }))
}))
