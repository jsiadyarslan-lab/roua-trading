import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PaperTrade {
  id: string
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  currentPrice: number
  tp?: number
  sl?: number
  entryTime: number           // unix ms
  unrealizedPnl: number
  unrealizedPct: number
  strategy?: string           // 'manual' | bot strategy name
  source: 'bot' | 'manual'
}

interface PaperTradesState {
  trades: PaperTrade[]
  addTrade: (t: Omit<PaperTrade, 'id' | 'unrealizedPnl' | 'unrealizedPct'>) => void
  updatePrice: (symbol: string, price: number) => void
  removeTrade: (id: string) => void
  clearAll: () => void
}

export const usePaperTradesStore = create<PaperTradesState>()(
  persist(
    (set, get) => ({
      trades: [],

      addTrade: (t) =>
        set((state) => ({
          trades: [
            ...state.trades,
            {
              ...t,
              id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              unrealizedPnl: 0,
              unrealizedPct: 0,
            },
          ],
        })),

      updatePrice: (symbol, price) => {
        const normalizedSymbol = symbol.toUpperCase().replace(/\//g, '')
        const currentTrades = get().trades
        let changed = false

        const trades = currentTrades.map((t) => {
          const tradeSymbol = t.symbol.toUpperCase().replace(/\//g, '')
          if (tradeSymbol !== normalizedSymbol) return t

          if (t.currentPrice === price) return t

          const currentPrice = price
          let pnl = 0
          let pct = 0

          if (t.entryPrice > 0) {
            const diff = t.side === 'long'
              ? price - t.entryPrice
              : t.entryPrice - price
            pnl = diff * t.qty
            pct = (diff / t.entryPrice) * 100
          }

          changed = true
          return { ...t, currentPrice, unrealizedPnl: pnl, unrealizedPct: pct }
        })

        if (!changed) return
        set({ trades })
      },

      removeTrade: (id) =>
        set((state) => ({ trades: state.trades.filter((t) => t.id !== id) })),

      clearAll: () => set({ trades: [] }),
    }),
    { name: 'roua-paper-trades' }
  )
)
