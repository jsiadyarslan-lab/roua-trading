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
  }
  setIsOn: (on: boolean) => void
  addLog: (msg: string, type?: string) => void
  setStats: (stats: { trades: number; profit: number; winRate: number }) => void
  updateSettings: (settings: Partial<BotState['settings']>) => void
}

export const useBotStore = create<BotState>()(
  persist(
    (set) => ({
      isOn: false,
      logs: [],
      stats: { trades: 0, profit: 0, winRate: 0 },
      settings: {
        riskPct: 2,
        confLimit: 75,
        strategy: 'Trend Follow'
      },
      setIsOn: (on: boolean) => set({ isOn: on }),
      addLog: (msg: string, type = 'info') => set((state) => ({
        logs: [{ time: new Date().toLocaleTimeString('ar-EG'), msg, type }, ...state.logs].slice(0, 50)
      })),
      setStats: (stats) => set({ stats }),
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
    }),
    {
      name: 'roua-bot-storage',
    }
  )
)
