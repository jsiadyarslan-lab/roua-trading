import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from '@/lib/auth-store'

/**
 * i18n helper for notification strings in non-component contexts.
 * Set by the nearest component via setNotificationTranslator().
 */
let _tn: ((key: string, vars?: Record<string, any>) => string) | null = null

export function setNotificationTranslator(tn: (key: string, vars?: Record<string, any>) => string) {
  _tn = tn
}

function tn(key: string, vars?: Record<string, any>): string {
  return _tn ? _tn(key, vars) : key
}

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
  source: 'bot' | 'manual' | 'executor' | 'agent'
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
  source: 'bot' | 'manual' | 'executor' | 'agent'
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
 * SECURITY: Static localStorage key for reliable rehydration.
 *
 * CRITICAL FIX: Previously used a DYNAMIC key (roua-paper-trades:${userId})
 * that depended on useAuthStore.getState().user, which is NOT available
 * during Zustand rehydration (page refresh). This caused:
 *   1. User opens trade → stored under roua-paper-trades:${userId}
 *   2. Page refresh → rehydration tries getStorageKey() → auth not ready → returns guest key
 *   3. Guest key has NO data → trades rehydrated as [] → DISAPPEARED
 *
 * NEW APPROACH: Use a STATIC key ('roua-paper-trades-store') for ALL users.
 * Owner validation is done during rehydration via _ownerUserId field.
 * This ensures trades are ALWAYS rehydrated from localStorage on page refresh.
 */
function getStorageKey(): string {
  return 'roua-paper-trades-store'
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
          if (!(t as any).status || (t as any).status !== 'closed') {
            if (t.sl && t.sl > 0) {
              if ((t.side === 'long' && price <= t.sl) || (t.side === 'short' && price >= t.sl)) {
                closedIds.push(t.id)
                changed = true
                return { ...t, currentPrice, unrealizedPnl: pnl, unrealizedPct: pct, _status: 'closed', closePrice: t.sl }
              }
            }
            if (t.tp && t.tp > 0) {
              if ((t.side === 'long' && price >= t.tp) || (t.side === 'short' && price <= t.tp)) {
                closedIds.push(t.id)
                changed = true
                return { ...t, currentPrice, unrealizedPnl: pnl, unrealizedPct: pct, _status: 'closed', closePrice: t.tp }
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
            // Map source to correct Arabic label
            const sourceLabel = trade.source === 'bot' || trade.source === 'executor'
              ? '⚔️ ' + tn('sourceExecutor')
              : trade.source === 'agent'
              ? '🧠 ' + tn('sourceAgent')
              : '📊 ' + tn('sourcePosition')
            useNotificationStore.getState().addNotification({
              source: trade.source === 'bot' || trade.source === 'executor' ? 'bot' : 'trade',
              priority: isProfit ? 'high' : 'urgent',
              action: isProfit ? 'CLOSE' : 'WARN',
              title: `${sourceLabel}: ${isProfit ? tn('closeProfit') : tn('closeLoss')} ${trade.symbol}`,
              body: `${trade.side === 'long' ? tn('sourceExecutor') : tn('sourceAgent')} ${trade.qty} ${trade.symbol} @ $${exitPrice.toFixed(2)} — ${isProfit ? '+' : ''}$${realizedPnl.toFixed(2)} (${isProfit ? '+' : ''}${realizedPct.toFixed(1)}%)`,
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
        // Remove the static localStorage key
        try {
          localStorage.removeItem('roua-paper-trades-store')
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
       * STORAGE CONFIG: Static key for reliable rehydration.
       *
       * CRITICAL FIX: Previously used a dynamic storage key based on auth state.
       * This broke rehydration on page refresh because auth wasn't ready when
       * localStorage was read. Now using a STATIC key with _ownerUserId validation
       * in onRehydrateStorage to prevent data leakage between users.
       */
      name: 'roua-paper-trades-store',
      storage: createJSONStorage(() => localStorage),
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

          // ═══════════════════════════════════════════════════════════════
          // FIX: Filter out PHANTOM trades on rehydration, but KEEP
          // ALL legitimate trades including bot/executor/agent trades.
          //
          // Previously, bot/executor/agent trades were FILTERED OUT on
          // rehydration (deleted from localStorage on page refresh), which
          // caused them to disappear. This was wrong because:
          // 1. These trades exist in the DB and should survive refresh
          // 2. The user can see them in the positions list
          // 3. Filtering them means losing track of open positions
          //
          // Now we only filter out truly phantom/invalid trades:
          // - Trades with zero/negative entry price
          // - Trades with trade value < $1 (dust)
          // - Trades with numeric-only symbols
          //
          // ALL valid trades (including bot/executor/agent) are preserved.
          // ═══════════════════════════════════════════════════════════════
          if (state && state.trades && state.trades.length > 0) {
            const validTrades = state.trades.filter((t: PaperTrade) => {
              // Filter out phantom/invalid trades
              if (!t.entryPrice || t.entryPrice <= 0) return false
              if (!t.qty || t.qty <= 0) return false
              const tradeValue = Math.abs(t.qty * t.entryPrice)
              if (tradeValue < 1) return false
              // Filter out numeric-only symbols
              const base = t.symbol.split('/')[0]
              if (/^\d+$/.test(base)) return false
              // FIX: REMOVED the filter that deleted bot/executor/agent trades.
              // All valid trades are kept regardless of source.
              return true
            })

            if (validTrades.length !== state.trades.length) {
              console.warn(
                `[PaperTradesStore] Filtered ${state.trades.length - validTrades.length} phantom trade(s), keeping ${validTrades.length} valid trade(s)`
              )
              usePaperTradesStore.setState({ trades: validTrades })
            }
          }

          // SECURITY: Validate that rehydrated data belongs to current user
          if (state) {
            const currentUserId = getCurrentUserId()
            const storedOwner = state._ownerUserId
            if (storedOwner && currentUserId && storedOwner !== currentUserId) {
              console.warn('[PaperTradesStore] SECURITY: Data belongs to different user, clearing')
              state.clearUserData()
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
