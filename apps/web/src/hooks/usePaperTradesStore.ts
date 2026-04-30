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

export interface ClosedPaperTrade {
  id: string
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  exitPrice: number
  realizedPnl: number
  realizedPct: number
  tp?: number
  sl?: number
  entryTime: number
  closeTime: number
  strategy?: string
  source: 'bot' | 'manual'
}

interface PaperTradesState {
  trades: PaperTrade[]
  closedTrades: ClosedPaperTrade[]
  addTrade: (t: Omit<PaperTrade, 'id' | 'unrealizedPnl' | 'unrealizedPct'>) => void
  updatePrice: (symbol: string, price: number) => void
  removeTrade: (id: string) => void
  closeTrade: (id: string) => void
  clearAll: () => void
  clearClosedTrades: () => void
}

export const usePaperTradesStore = create<PaperTradesState>()(
  persist(
    (set, get) => ({
      trades: [],
      closedTrades: [],

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

      closeTrade: (id) =>
        set((state) => {
          const trade = state.trades.find((t) => t.id === id)
          if (!trade) return state

          const exitPrice = trade.currentPrice || trade.entryPrice
          const diff = trade.side === 'long'
            ? exitPrice - trade.entryPrice
            : trade.entryPrice - exitPrice
          const realizedPnl = diff * trade.qty
          const realizedPct = trade.entryPrice > 0 ? (diff / trade.entryPrice) * 100 : 0

          const closedTrade: ClosedPaperTrade = {
            id: trade.id,
            symbol: trade.symbol,
            side: trade.side,
            qty: trade.qty,
            entryPrice: trade.entryPrice,
            exitPrice,
            realizedPnl,
            realizedPct,
            tp: trade.tp,
            sl: trade.sl,
            entryTime: trade.entryTime,
            closeTime: Date.now(),
            strategy: trade.strategy,
            source: trade.source,
          }

          return {
            trades: state.trades.filter((t) => t.id !== id),
            closedTrades: [closedTrade, ...state.closedTrades].slice(0, 200), // Keep last 200
          }
        }),

      clearAll: () => set({ trades: [] }),
      clearClosedTrades: () => set({ closedTrades: [] }),
    }),
    { name: 'roua-paper-trades' }
  )
)
