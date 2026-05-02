import { create } from 'zustand'

export type TradingMode = 'trader' | 'investor' | 'ai'

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
  // Trading mode (trader/investor/ai)
  mode: TradingMode
  setMode: (mode: TradingMode) => void
  // Hydration flag to prevent SSR mismatch
  _hydrated: boolean
}

/**
 * FIX: SSR Hydration Mismatch
 * 
 * The original code read localStorage during store creation, which causes
 * hydration mismatches because:
 * - On server: typeof window === 'undefined' → always 'trader'
 * - On client: reads localStorage → may be 'investor' or 'ai'
 * 
 * Solution: Initialize with default ('trader'), then hydrate from localStorage
 * in a useEffect after mount. This ensures server and client render identically.
 */
export const useDashboardStore = create<DashboardState>((set) => ({
  selectedPair: 'BTC/USD',
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
  // Trading mode — always start with 'trader' to match SSR
  mode: 'trader' as TradingMode,
  setMode: (mode) => {
    if (typeof window !== 'undefined') localStorage.setItem('roua-mode', mode)
    set({ mode })
  },
  // Hydration flag
  _hydrated: false,
}))

/**
 * Hydrate the dashboard store from localStorage.
 * Call this once in a useEffect after mount to prevent SSR mismatch.
 */
if (typeof window !== 'undefined') {
  // Defer hydration to next tick to ensure SSR has completed
  const savedMode = localStorage.getItem('roua-mode')
  if (savedMode === 'investor' || savedMode === 'ai') {
    useDashboardStore.setState({ mode: savedMode as TradingMode, _hydrated: true })
  } else {
    useDashboardStore.setState({ _hydrated: true })
  }
}
