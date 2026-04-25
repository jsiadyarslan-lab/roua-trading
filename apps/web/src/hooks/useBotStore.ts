import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BotLog {
  time: string
  msg: string
  type: string
}

export type BotEngineState =
  | 'idle'
  | 'armed'
  | 'scanning'
  | 'entering'
  | 'managing'
  | 'exiting'
  | 'cooldown'

interface BotState {
  isOn: boolean
  engineState: BotEngineState
  logs: BotLog[]
  stats: {
    trades: number
    profit: number
    winRate: number
    wins: number
    losses: number
    openPositions: number
    sessionLoss: number
  }
  settings: {
    riskPct: number
    confLimit: number
    strategy: string
    useAIConsensus: boolean
  }
  setIsOn: (on: boolean) => void
  setEngineState: (state: BotEngineState) => void
  addLog: (msg: string, type?: string) => void
  setStats: (stats: BotState['stats']) => void
  patchStats: (stats: Partial<BotState['stats']>) => void
  updateSettings: (settings: Partial<BotState['settings']>) => void
  resetAll: () => void
}

const DEFAULT_SETTINGS: BotState['settings'] = {
  riskPct: 2,
  confLimit: 65,
  strategy: 'Trend Follow',
  useAIConsensus: true, // Enable AI consensus by default for smarter signals
}

export const useBotStore = create<BotState>()(
  persist(
    (set) => ({
      isOn: true,
      engineState: 'armed',
      logs: [],
      stats: { trades: 0, profit: 0, winRate: 0, wins: 0, losses: 0, openPositions: 0, sessionLoss: 0 },
      settings: DEFAULT_SETTINGS,
      setIsOn: (on: boolean) => set({ isOn: on, engineState: on ? 'armed' : 'idle' }),
      setEngineState: (engineState) => set({ engineState }),
      addLog: (msg: string, type = 'info') => set((state) => ({
        logs: [{ time: new Date().toLocaleTimeString('ar-EG'), msg, type }, ...state.logs].slice(0, 50)
      })),
      setStats: (stats) => set({ stats }),
      patchStats: (stats) => set((state) => ({
        stats: { ...state.stats, ...stats }
      })),
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
      resetAll: () => set({
        engineState: 'armed',
        logs: [],
        stats: { trades: 0, profit: 0, winRate: 0, wins: 0, losses: 0, openPositions: 0, sessionLoss: 0 }
      }),
    }),
    {
      name: 'roua-bot-storage',
      version: 3,
      migrate: (persistedState: any) => ({
        ...persistedState,
        isOn: true,
        engineState: persistedState?.isOn === false ? 'idle' : (persistedState?.engineState ?? 'armed'),
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
        stats: {
          trades: persistedState?.stats?.trades ?? 0,
          profit: persistedState?.stats?.profit ?? 0,
          winRate: persistedState?.stats?.winRate ?? 0,
          wins: persistedState?.stats?.wins ?? 0,
          losses: persistedState?.stats?.losses ?? 0,
          openPositions: persistedState?.stats?.openPositions ?? 0,
          sessionLoss: persistedState?.stats?.sessionLoss ?? 0,
        },
      }),
    }
  )
)
