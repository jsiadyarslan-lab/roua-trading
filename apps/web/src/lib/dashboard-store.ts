import { create } from 'zustand'

interface DashboardState {
  selectedPair: string
  setSelectedPair: (pair: string) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  wsConnected: boolean
  setWsConnected: (v: boolean) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedPair: 'BTC/USD',
  setSelectedPair: (pair) => set({ selectedPair: pair }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  wsConnected: true,
  setWsConnected: (v) => set({ wsConnected: v }),
}))
