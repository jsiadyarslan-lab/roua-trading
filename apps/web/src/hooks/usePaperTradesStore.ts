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

      updatePrice: (symbol, price) =>
        set((state) => ({
          trades: state.trades.map((t) => {
            if (t.symbol !== symbol || t.entryPrice === 0) return t
            const diff = t.side === 'long'
              ? price - t.entryPrice
              : t.entryPrice - price
            const pnl = diff * t.qty
            const pct = (diff / t.entryPrice) * 100
            return { ...t, currentPrice: price, unrealizedPnl: pnl, unrealizedPct: pct }
          }),
        })),

      removeTrade: (id) =>
        set((state) => ({ trades: state.trades.filter((t) => t.id !== id) })),

      clearAll: () => set({ trades: [] }),
    }),
    { name: 'roua-paper-trades' }
  )
)
