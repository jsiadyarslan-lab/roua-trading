import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from '@/lib/auth-store'

export interface PaperTrade {
  id: string
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  currentPrice: number
  tp?: number
  sl?: number
  entryTime: number           // unix ms
  unrealizedPnl: number
  unrealizedPct: number
  strategy?: string           // 'manual' | bot strategy name
  source: 'bot' | 'manual'
}

export interface ClosedPaperTrade {
  id: string
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  exitPrice: number
  realizedPnl: number
  realizedPct: number
  tp?: number
  sl?: number
  entryTime: number
  closeTime: number
  strategy?: string
  source: 'bot' | 'manual'
}

interface PaperTradesState {
  trades: PaperTrade[]
  closedTrades: ClosedPaperTrade[]
  addTrade: (t: Omit<PaperTrade, 'id' | 'unrealizedPnl' | 'unrealizedPct'>) => void
  updatePrice: (symbol: string, price: number) => void
  updateTrade: (id: string, updates: Partial<PaperTrade>) => void
  removeTrade: (id: string) => void
  closeTrade: (id: string) => void
  clearAll: () => void
  clearClosedTrades: () => void
  syncWithServer?: () => Promise<void>
  /** SECURITY: Clear all data when user changes */
  clearUserData: () => void
  /** SECURITY: Current userId that the store data belongs to */
  _ownerUserId: string | null
}

/**
 * SECURITY: Get a user-scoped localStorage key to prevent data leakage.
 * Without userId in the key, user B would see user A's paper trades.
 */
function getStorageKey(): string {
  try {
    const user = useAuthStore.getState().user
    if (user?.id) return `roua-paper-trades:${user.id}`
  } catch { /* Auth store not yet initialized */ }
  return 'roua-paper-trades:guest'
}

/**
 * SECURITY: Get current userId for cache validation.
 */
function getCurrentUserId(): string | null {
  try {
    const user = useAuthStore.getState().user
    if (user?.id && !user.isGuest) return user.id
  } catch { /* Auth store not yet initialized */ }
  return null
}

export const usePaperTradesStore = create<PaperTradesState>()(
  persist(
    (set, get) => ({
      trades: [],
      closedTrades: [],
      _ownerUserId: null as string | null,

      addTrade: (t) => {
        set((state) => ({
          trades: [
            ...state.trades,
            {
              ...t,
              id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              unrealizedPnl: 0,
              unrealizedPct: 0,
            },
          ],
        }))
        triggerBackgroundSync()
      },

      updatePrice: (symbol, price) => {
        const normalizedSymbol = symbol.toUpperCase().replace(/\//g, '')
        const currentTrades = get().trades
        let changed = false
        const closedIds: string[] = []  // FIX: Track trades that hit SL/TP for auto-close

        const trades = currentTrades.map((t) => {
          const tradeSymbol = t.symbol.toUpperCase().replace(/\//g, '')
          if (tradeSymbol !== normalizedSymbol) return t

          if (t.currentPrice === price) return t

          const currentPrice = price
          let pnl = 0
          let pct = 0

          if (t.entryPrice > 0) {
            const diff = t.side === 'long'
              ? price - t.entryPrice
              : t.entryPrice - price
            pnl = diff * t.qty
            pct = (diff / t.entryPrice) * 100
          }

          // FIX: Auto-close trade when SL or TP is hit
          if (t.status !== 'closed') {
            if (t.sl && t.sl > 0) {
              if ((t.side === 'long' && price <= t.sl) || (t.side === 'short' && price >= t.sl)) {
                closedIds.push(t.id)
                changed = true
                return { ...t, currentPrice, unrealizedPnl: pnl, unrealizedPct: pct, status: 'closed' as const, closePrice: t.sl }
              }
            }
            if (t.tp && t.tp > 0) {
              if ((t.side === 'long' && price >= t.tp) || (t.side === 'short' && price <= t.tp)) {
                closedIds.push(t.id)
                changed = true
                return { ...t, currentPrice, unrealizedPnl: pnl, unrealizedPct: pct, status: 'closed' as const, closePrice: t.tp }
              }
            }
          }

          changed = true
          return { ...t, currentPrice, unrealizedPnl: pnl, unrealizedPct: pct }
        })

        if (!changed) return
        set({ trades })
      },

      updateTrade: (id, updates) => {
        set((state) => ({
          trades: state.trades.map(t => t.id === id ? { ...t, ...updates } : t)
        }))
        get().syncWithServer?.()
      },

      removeTrade: (id) => {
        set((state) => ({ trades: state.trades.filter((t) => t.id !== id) }))
        triggerBackgroundSync()
      },

      closeTrade: (id) => {
        set((state) => {
          const trade = state.trades.find((t) => t.id === id)
          if (!trade) return state

          const exitPrice = trade.currentPrice || trade.entryPrice
          const diff = trade.side === 'long'
            ? exitPrice - trade.entryPrice
            : trade.entryPrice - exitPrice
          const realizedPnl = diff * trade.qty
          const realizedPct = trade.entryPrice > 0 ? (diff / trade.entryPrice) * 100 : 0

          const closedTrade: ClosedPaperTrade = {
            id: trade.id,
            symbol: trade.symbol,
            side: trade.side,
            qty: trade.qty,
            entryPrice: trade.entryPrice,
            exitPrice,
            realizedPnl,
            realizedPct,
            tp: trade.tp,
            sl: trade.sl,
            entryTime: trade.entryTime,
            closeTime: Date.now(),
            strategy: trade.strategy,
            source: trade.source,
          }

          // ── Send notification for closed position ──
          try {
            const { useNotificationStore } = require('@/hooks/useNotificationStore')
            const isProfit = realizedPnl >= 0
            useNotificationStore.getState().addNotification({
              source: trade.source === 'bot' ? 'bot' : 'trade',
              priority: isProfit ? 'high' : 'urgent',
              action: isProfit ? 'CLOSE' : 'WARN',
              title: `${trade.source === 'bot' ? '🤖 البوت' : '📊 المركز'}: ${isProfit ? 'إغلاق بربح' : 'إغلاق بخسارة'} ${trade.symbol}`,
              body: `${trade.side === 'long' ? 'شراء' : 'بيع'} ${trade.qty} ${trade.symbol} @ $${exitPrice.toFixed(2)} — ${isProfit ? '+' : ''}$${realizedPnl.toFixed(2)} (${isProfit ? '+' : ''}${realizedPct.toFixed(1)}%)`,
              pair: trade.symbol,
              price: exitPrice,
            })
          } catch { /* Notification store not available */ }

          return {
            trades: state.trades.filter((t) => t.id !== id),
            closedTrades: [closedTrade, ...state.closedTrades].slice(0, 200), // Keep last 200
          }
        })
        triggerBackgroundSync()
      },

      clearAll: () => {
        set({ trades: [] })
        triggerBackgroundSync()
      },
      clearClosedTrades: () => {
        set({ closedTrades: [] })
        triggerBackgroundSync()
      },

      /**
       * SECURITY: Clear all cached data when user changes.
       * This prevents user B from seeing user A's paper trades.
       */
      clearUserData: () => {
        set({
          trades: [],
          closedTrades: [],
          _ownerUserId: null,
        })
        // Remove ALL paper-trades-related keys from localStorage
        try {
          const keysToRemove: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('roua-paper-trades')) {
              keysToRemove.push(key)
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key))
        } catch { /* localStorage unavailable */ }
      },
      
      // Syncs current paper trades state to the backend silently
      syncWithServer: async () => {
        try {
          const state = get()
          await fetch('/api/trading/paper/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trades: state.trades,
              closedTrades: state.closedTrades
            })
          })
        } catch {
          // Silent failure — local storage remains the source of truth
        }
      }
    }),
    {
      /**
       * SECURITY: Use user-scoped storage key to prevent data leakage.
       * Each user gets their own localStorage key: roua-paper-trades:${userId}
       *
       * FIX: The old `name: getStorageKey()` was evaluated ONCE at module load time
       * (before auth was initialized), so all users shared the same 'guest' key.
       * Now we use a custom storage adapter that dynamically resolves the key
       * on every getItem/setItem call based on the current auth state.
       */
      name: 'roua-paper-trades', // Base name — actual key is resolved dynamically
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
      partialize: (state) => ({
        trades: state.trades,
        closedTrades: state.closedTrades,
        _ownerUserId: state._ownerUserId,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.warn('[PaperTradesStore] Rehydration failed:', error)
          }
          // SECURITY: Validate that rehydrated data belongs to current user
          if (state) {
            const currentUserId = getCurrentUserId()
            const storedOwner = state._ownerUserId
            if (storedOwner && currentUserId && storedOwner !== currentUserId) {
              console.warn('[PaperTradesStore] SECURITY: Data belongs to different user, clearing')
              state.clearUserData()
              return
            }

            // ═══════════════════════════════════════════════════
            // CLEANUP: Remove phantom trades with invalid prices.
            // These are trades created by the BotEngine from
            // degraded/fallback data that slipped through before
            // the data quality gate fix. They show as $0.00 or
            // $0.01 on the dashboard and are completely fake.
            // ═══════════════════════════════════════════════════
            if (state.trades && state.trades.length > 0) {
              const validTrades = state.trades.filter((trade) => {
                const entryPrice = trade.entryPrice || 0
                const tradeValue = trade.qty * entryPrice
                // Remove trades with zero/invalid entry price or tiny value
                return entryPrice > 0 && tradeValue >= 0.01
              })

              const removedCount = state.trades.length - validTrades.length
              if (removedCount > 0) {
                console.warn(
                  `[PaperTradesStore] Cleaned up ${removedCount} phantom trade(s) with invalid prices`,
                )
                // Update the store with clean data
                usePaperTradesStore.setState({ trades: validTrades })
              }
            }

            // Also clean closed trades
            if (state.closedTrades && state.closedTrades.length > 0) {
              const validClosedTrades = state.closedTrades.filter((trade) => {
                const entryPrice = trade.entryPrice || 0
                return entryPrice > 0
              })

              const removedClosedCount = state.closedTrades.length - validClosedTrades.length
              if (removedClosedCount > 0) {
                usePaperTradesStore.setState({ closedTrades: validClosedTrades })
              }
            }
          }
        }
      },
    }
  )
)

// Helper to safely trigger sync without breaking UI flows
function triggerBackgroundSync() {
  setTimeout(() => {
    usePaperTradesStore.getState().syncWithServer?.()
  }, 1000)
}
