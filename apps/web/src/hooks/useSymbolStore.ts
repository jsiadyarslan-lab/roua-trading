import { create } from 'zustand'

interface SymbolState {
  selectedSymbol: string
  timeframe: string
  setSelectedSymbol: (symbol: string) => void
  setTimeframe: (tf: string) => void
}

export const useSymbolStore = create<SymbolState>((set) => ({
  selectedSymbol: 'BTC/USD',
  timeframe: '15min',
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setTimeframe: (tf) => set({ timeframe: tf }),
}))
