import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BotLog {
  time: string
  msg: string
  type: string
}

interface BotState {
  isOn: boolean
  logs: BotLog[]
  stats: {
    trades: number
    profit: number
    winRate: number
  }
  settings: {
    riskPct: number
    confLimit: number
    strategy: string
    useAIConsensus: boolean
  }
  setIsOn: (on: boolean) => void
  addLog: (msg: string, type?: string) => void
  setStats: (stats: { trades: number; profit: number; winRate: number }) => void
  updateSettings: (settings: Partial<BotState['settings']>) => void
  resetAll: () => void
}

const DEFAULT_SETTINGS: BotState['settings'] = {
  riskPct: 2,
  confLimit: 65,
  strategy: 'Trend Follow',
  useAIConsensus: false,
}

export const useBotStore = create<BotState>()(
  persist(
    (set) => ({
      isOn: true,
      logs: [],
      stats: { trades: 0, profit: 0, winRate: 0 },
      settings: DEFAULT_SETTINGS,
      setIsOn: (on: boolean) => set({ isOn: on }),
      addLog: (msg: string, type = 'info') => set((state) => ({
        logs: [{ time: new Date().toLocaleTimeString('ar-EG'), msg, type }, ...state.logs].slice(0, 50)
      })),
      setStats: (stats) => set({ stats }),
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
      resetAll: () => set({
        logs: [],
        stats: { trades: 0, profit: 0, winRate: 0 }
      }),
    }),
    {
      name: 'roua-bot-storage',
      version: 2,
      migrate: (persistedState: any) => ({
        ...persistedState,
        isOn: true,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(persistedState?.settings ?? {}),
          confLimit: Math.min(
            typeof persistedState?.settings?.confLimit === 'number'
              ? persistedState.settings.confLimit
              : DEFAULT_SETTINGS.confLimit,
            DEFAULT_SETTINGS.confLimit
          ),
        },
        logs: Array.isArray(persistedState?.logs) ? persistedState.logs.slice(0, 50) : [],
        stats: persistedState?.stats ?? { trades: 0, profit: 0, winRate: 0 },
      }),
    }
  )
)
