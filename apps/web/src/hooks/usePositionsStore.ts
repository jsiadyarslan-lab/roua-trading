import { create } from 'zustand'

interface Position {
  symbol: string
  rawSymbol: string
  side: string
  qty: number
  avgEntryPrice: number
  currentPrice:  number
  marketValue:   number
  unrealizedPnl: number
  unrealizedPct: number
  sl?: number
  tp?: number
}

interface PositionsState {
  positions: Position[]
  loading: boolean
  error: string | null
  lastUpdate: string | null
  setPositions: (positions: Position[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setLastUpdate: (lastUpdate: string | null) => void
  fetchPositions: () => Promise<void>
}

export const usePositionsStore = create<PositionsState>((set) => ({
  positions: [],
  loading: false,
  error: null,
  lastUpdate: null,
  setPositions: (positions) => set({ positions }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),
  fetchPositions: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/alpaca/positions')
      const j = await res.json()
      if (j.success) {
        set({ 
          positions: j.data, 
          lastUpdate: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
        })
      } else {
        set({ error: j.error || 'فشل في جلب المراكز' })
      }
    } catch {
      set({ error: 'خطأ في الشبكة' })
    } finally {
      set({ loading: false })
    }
  },
}))
