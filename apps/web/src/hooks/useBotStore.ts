import { create } from 'zustand'

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
  setIsOn: (on: boolean) => void
  addLog: (msg: string, type?: string) => void
  setStats: (stats: { trades: number; profit: number; winRate: number }) => void
}

export const useBotStore = create<BotState>((set) => ({
  isOn: false,
  logs: [],
  stats: { trades: 0, profit: 0, winRate: 0 },
  setIsOn: (on: boolean) => set({ isOn: on }),
  addLog: (msg: string, type = 'info') => set((state) => ({
    logs: [{ time: new Date().toLocaleTimeString('ar-EG'), msg, type }, ...state.logs].slice(0, 50)
  })),
  setStats: (stats) => set({ stats }),
}))
