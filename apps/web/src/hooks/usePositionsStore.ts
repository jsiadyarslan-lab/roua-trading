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
  account: any
  loading: boolean
  error: string | null
  lastUpdate: string | null
  setPositions: (positions: Position[]) => void
  setAccount: (account: any) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setLastUpdate: (lastUpdate: string | null) => void
  fetchPositions: () => Promise<void>
  fetchAccount: () => Promise<void>
}

export const usePositionsStore = create<PositionsState>((set) => ({
  positions: [],
  account: null,
  loading: false,
  error: null,
  lastUpdate: null,
  setPositions: (positions) => set({ positions }),
  setAccount: (account) => set({ account }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),
  fetchAccount: async () => {
    try {
      const res = await fetch('/api/alpaca/account')
      const j = await res.json()
      if (j.success) set({ account: j.data })
    } catch {}
  },
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
