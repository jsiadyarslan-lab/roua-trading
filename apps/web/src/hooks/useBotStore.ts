import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from '@/lib/auth-store'

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
    // ── Protection settings (synced from admin DB settings) ──
    maxDailyLoss: number      // Maximum daily loss in USD (e.g. -2000)
    maxDrawdown: number       // Maximum drawdown percentage (e.g. 15)
    maxOpenPositions: number  // Maximum concurrent open positions (e.g. 5)
    stopLossDefault: number   // Default stop loss percentage (e.g. 2)
    takeProfitDefault: number // Default take profit percentage (e.g. 4)
  }
  settingsSynced: boolean     // Whether settings have been synced from DB
  setIsOn: (on: boolean) => void
  setEngineState: (state: BotEngineState) => void
  addLog: (msg: string, type?: string) => void
  setStats: (stats: BotState['stats']) => void
  patchStats: (stats: Partial<BotState['stats']>) => void
  updateSettings: (settings: Partial<BotState['settings']>) => void
  syncFromDB: () => Promise<void>
  resetAll: () => void
}

/**
 * SECURITY: Get a user-scoped localStorage key to prevent data leakage.
 * Without userId in the key, user B would see user A's bot settings.
 */
function getStorageKey(): string {
  try {
    const user = useAuthStore.getState().user
    if (user?.id) return `roua-bot-storage:${user.id}`
  } catch { /* Auth store not yet initialized */ }
  try {
    let sessionId = sessionStorage.getItem('roua-guest-session-id')
    if (!sessionId) {
      sessionId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem('roua-guest-session-id', sessionId)
    }
    return `roua-bot-storage:${sessionId}`
  } catch {
    return 'roua-bot-storage:guest'
  }
}

const DEFAULT_SETTINGS: BotState['settings'] = {
  riskPct: 2,
  confLimit: 65,
  strategy: 'AUTO',
  useAIConsensus: true,
  // Default protection values — will be overwritten by admin DB settings
  maxDailyLoss: -2000,
  maxDrawdown: 15,
  maxOpenPositions: 20,  // V144: Increased from 15 to 20 — global RiskGatekeeper limit
  stopLossDefault: 2,
  takeProfitDefault: 4,
}

export const useBotStore = create<BotState>()(
  persist(
    (set, get) => ({
      isOn: false,
      engineState: 'idle',
      logs: [],
      stats: { trades: 0, profit: 0, winRate: 0, wins: 0, losses: 0, openPositions: 0, sessionLoss: 0 },
      settings: DEFAULT_SETTINGS,
      settingsSynced: false,
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
      /**
       * Sync bot settings from the admin Setting table in the database.
       * This is the CRITICAL bridge that connects admin dashboard changes
       * to the live bot engine. Without this, admin settings are saved
       * but never applied to the running bot.
       */
      syncFromDB: async () => {
        try {
          const res = await fetch('/api/bot/settings')
          if (res.ok) {
            const data = await res.json()
            if (data.settings) {
              const current = get().settings
              set({
                settings: {
                  ...current,
                  // Protection settings from admin DB (these are the critical ones)
                  maxDailyLoss: data.settings.maxDailyLoss ?? current.maxDailyLoss,
                  maxDrawdown: data.settings.maxDrawdown ?? current.maxDrawdown,
                  maxOpenPositions: data.settings.maxOpenPositions ?? current.maxOpenPositions,
                  stopLossDefault: data.settings.stopLossDefault ?? current.stopLossDefault,
                  takeProfitDefault: data.settings.takeProfitDefault ?? current.takeProfitDefault,
                  // Bot config from admin DB
                  riskPct: data.settings.riskPerTrade ?? current.riskPct,
                  confLimit: data.settings.confLimit ?? current.confLimit,
                  strategy: data.settings.strategy ?? current.strategy,
                },
                settingsSynced: true,
              })
            }
          }
        } catch {
          // Silently fail — will use defaults
        }
      },
      resetAll: () => set({
        engineState: 'armed',
        logs: [],
        stats: { trades: 0, profit: 0, winRate: 0, wins: 0, losses: 0, openPositions: 0, sessionLoss: 0 }
      }),
    }),
    {
      name: 'roua-bot-storage', // Base name — actual key is resolved dynamically
      storage: (() => {
        const bs = createJSONStorage(() => localStorage)
        const baseStorage = bs as any
        return {
          getItem: (name: string): any => {
            const dynamicKey = getStorageKey()
            return baseStorage.getItem(dynamicKey)
          },
          setItem: (name: string, value: any) => {
            const dynamicKey = getStorageKey()
            baseStorage.setItem(dynamicKey, value as string)
          },
          removeItem: (name: string) => {
            const dynamicKey = getStorageKey()
            baseStorage.removeItem(dynamicKey)
          },
        }
      })(),
      version: 6,
      migrate: (persistedState: any) => ({
        ...persistedState,
        // Reset bot state on rehydration — the engine isn't running after page reload
        isOn: false,
        engineState: 'idle',
        settings: {
          ...DEFAULT_SETTINGS,
          ...(persistedState?.settings ?? {}),
          // Allow user to set any confLimit they want (no artificial cap)
          confLimit: typeof persistedState?.settings?.confLimit === 'number'
            ? persistedState.settings.confLimit
            : DEFAULT_SETTINGS.confLimit,
          // Ensure new protection fields have defaults for users upgrading from v4
          maxDailyLoss: persistedState?.settings?.maxDailyLoss ?? DEFAULT_SETTINGS.maxDailyLoss,
          maxDrawdown: persistedState?.settings?.maxDrawdown ?? DEFAULT_SETTINGS.maxDrawdown,
          maxOpenPositions: persistedState?.settings?.maxOpenPositions ?? DEFAULT_SETTINGS.maxOpenPositions,
          stopLossDefault: persistedState?.settings?.stopLossDefault ?? DEFAULT_SETTINGS.stopLossDefault,
          takeProfitDefault: persistedState?.settings?.takeProfitDefault ?? DEFAULT_SETTINGS.takeProfitDefault,
        },
        settingsSynced: persistedState?.settingsSynced ?? false,
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
