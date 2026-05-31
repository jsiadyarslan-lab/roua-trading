import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SymbolState {
  selectedSymbol: string
  timeframe: string
  setSelectedSymbol: (symbol: string) => void
  setTimeframe: (tf: string) => void
  clearUserData: () => void
}

/**
 * Get a user-isolated localStorage key for symbol/timeframe selection.
 * Uses userId from auth store to prevent data leakage between users.
 */
function getStorageKey(): string {
  try {
    const { useAuthStore } = require('@/lib/auth-store')
    const user = useAuthStore.getState()?.user
    if (user?.id) return `roua-symbol-store:${user.id}`
  } catch { /* Auth store not loaded yet */ }

  try {
    const cachedRaw = localStorage.getItem('roua_auth_user')
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (cached?.id) return `roua-symbol-store:${cached.id}`
    }
  } catch { /* Cache unavailable */ }

  return 'roua-symbol-store:guest'
}

// Custom storage with dynamic key for user isolation
const dynamicStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(getStorageKey())
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(getStorageKey(), value)
    } catch { /* localStorage full */ }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(getStorageKey())
    } catch { /* ignore */ }
  },
}

export const useSymbolStore = create<SymbolState>()(
  persist(
    (set) => ({
      selectedSymbol: 'BTC/USD',
      timeframe: '15min',
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
      setTimeframe: (tf) => set({ timeframe: tf }),
      clearUserData: () => set({ selectedSymbol: 'BTC/USD', timeframe: '15min' }),
    }),
    {
      name: 'roua-symbol-store', // Base name — actual key includes userId
      storage: createJSONStorage(() => dynamicStorage),
      partialize: (state) => ({
        selectedSymbol: state.selectedSymbol,
        timeframe: state.timeframe,
      }),
      version: 1,
    }
  )
)
