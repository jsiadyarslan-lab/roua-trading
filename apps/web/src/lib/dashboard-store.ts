import { create } from 'zustand'

interface DashboardState {
  selectedPair: string
  setSelectedPair: (pair: string) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  wsConnected: boolean
  setWsConnected: (v: boolean) => void
  // New state fields
  activeTimeframe: string
  setActiveTimeframe: (tf: string) => void
  rightTab: 'trade' | 'signals' | 'bot'
  setRightTab: (tab: 'trade' | 'signals' | 'bot') => void
  tradeDirection: 'buy' | 'sell'
  setTradeDirection: (dir: 'buy' | 'sell') => void
  botEnabled: boolean
  toggleBot: () => void
  language: 'ar' | 'en'
  toggleLanguage: () => void
  chartFullscreen: boolean
  toggleChartFullscreen: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedPair: 'BTC/USDT',
  setSelectedPair: (pair) => set({ selectedPair: pair }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  wsConnected: true,
  setWsConnected: (v) => set({ wsConnected: v }),
  // New state fields
  activeTimeframe: '15m',
  setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),
  rightTab: 'trade',
  setRightTab: (tab) => set({ rightTab: tab }),
  tradeDirection: 'buy',
  setTradeDirection: (dir) => set({ tradeDirection: dir }),
  botEnabled: false,
  toggleBot: () => set((s) => ({ botEnabled: !s.botEnabled })),
  language: 'ar',
  toggleLanguage: () => set((s) => ({ language: s.language === 'ar' ? 'en' : 'ar' })),
  chartFullscreen: false,
  toggleChartFullscreen: () => set((s) => ({ chartFullscreen: !s.chartFullscreen })),
}))
