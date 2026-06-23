import { create } from 'zustand'

// V409: Removed BinanceWSManager — Socket.IO (useMarketStreamSocket) is now the
// sole source of crypto prices. The direct browser → Binance WS connection was
// removed in V403. This file is now a simple Zustand store with no side effects.

let _setQuoteCount = 0;

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

export const useMarketStore = create<MarketStore>((set) => ({
  quotes: {},
  // V420: Direct update — removed requestAnimationFrame batching.
  // Batching caused TickerBar to not re-render for non-charted symbols.
  // Each setQuote now creates a new quotes object immediately, triggering
  // all subscribed components to re-render. Performance is acceptable:
  // ~10 updates/sec × 24 symbols = 240 re-renders/sec, but TickerBar and
  // Watchlist are simple components with fast reconciliation.
  setQuote: (symbol, data) => {
    _setQuoteCount++;
    // V432: Log first 20 setQuote calls to see if Socket.IO calls reach here
    if (_setQuoteCount <= 20) {
      console.warn(`[useMarketStore] setQuote #${_setQuoteCount} for ${symbol} = ${data.price}`)
    }
    set((state) => ({
    quotes: { ...state.quotes, [symbol]: data }
  }))
  },
  setQuotes: (data) => set((state) => ({
    quotes: { ...state.quotes, ...data }
  }))
}))


