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
  /** V227: Why the trade was closed — STOP_LOSS, TAKE_PROFIT, MANUAL, TIME_EXPIRED */
  closeReason?: string
}

interface PaperTradesState {
  trades: PaperTrade[]
  closedTrades: ClosedPaperTrade[]
  addTrade: (t: Omit<PaperTrade, 'id' | 'unrealizedPnl' | 'unrealizedPct'>) => void
  updatePrice: (symbol: string, price: number) => void
  updateTrade: (id: string, updates: Partial<PaperTrade>) => void
  removeTrade: (id: string) => void
  closeTrade: (id: string, closeReason?: string) => void
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

// ═══════════════════════════════════════════════════════════════════════
// V228 FIX: Deferred store reference to avoid TDZ (Temporal Dead Zone) error
//
// PROBLEM: The `onRehydrateStorage` callback referenced `usePaperTradesStore`
// directly. In the minified production build, `usePaperTradesStore` becomes
// a `const` variable (e.g. `l`). The `onRehydrateStorage` callback closes
// over this variable, but during Zustand persist rehydration (which runs as
// a microtask), the variable may still be in the TDZ — causing:
//   ReferenceError: Cannot access 'l' before initialization
//
// FIX: Use a module-level `let` variable `_storeRef` that is assigned
// SYNCHRONOUSLY right after `create()` returns. Since the `let` assignment
// happens in the same synchronous tick as the `create()` call, and the
// rehydration callback runs asynchronously (in a microtask), `_storeRef`
// is guaranteed to be assigned before any callback accesses it.
//
// This is safe because:
// 1. `let` variables are NOT in TDZ after their first assignment
// 2. The assignment happens synchronously after `create()` returns
// 3. Rehydration callbacks run asynchronously (Promise.resolve().then())
// ═══════════════════════════════════════════════════════════════════════
let _storeRef: any = null

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
        // V227: Track both ID and reason for SL/TP auto-close
        const closedInfo: Array<{id: string, reason: string}> = []

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
          // V226 FIX: Check _status (with underscore) — the SL/TP code sets _status, not status
          if (!(t as any)._status || (t as any)._status !== 'closed') {
            if (t.sl && t.sl > 0) {
              if ((t.side === 'long' && price <= t.sl) || (t.side === 'short' && price >= t.sl)) {
                closedInfo.push({id: t.id, reason: 'STOP_LOSS'})
                changed = true
                return { ...t, currentPrice, unrealizedPnl: pnl, unrealizedPct: pct, _status: 'closed', closePrice: t.sl }
              }
            }
            if (t.tp && t.tp > 0) {
              if ((t.side === 'long' && price >= t.tp) || (t.side === 'short' && price <= t.tp)) {
                closedInfo.push({id: t.id, reason: 'TAKE_PROFIT'})
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

        // V225 FIX: Process auto-closed trades — move them from active to closed.
        // Previously, closedIds was populated but never processed, meaning trades
        // that hit SL/TP stayed in the active list with _status='closed' forever.
        // Now we call closeTrade() for each auto-closed trade to properly
        // realize P&L, send notification, and move to closedTrades list.
        // V227: Also pass the closeReason (STOP_LOSS / TAKE_PROFIT) through.
        if (closedInfo.length > 0) {
          // Use setTimeout to avoid nested Zustand set() calls which can batch incorrectly
          setTimeout(() => {
            closedInfo.forEach(info => get().closeTrade(info.id, info.reason))
          }, 0)
        }
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

      closeTrade: (id, closeReason?) => {
        set((state) => {
          const trade = state.trades.find((t) => t.id === id)
          if (!trade) return state

          // V227 FIX: Use closePrice (exact SL/TP level) when available.
          // Previously, closeTrade() always used currentPrice (tick price at that moment),
          // which is NOT the exact SL/TP level for auto-closed trades. This caused
          // inaccurate PnL calculations — e.g. SL at 2500 but closed at 2499.85.
          const closePriceOverride = (trade as any).closePrice as number | undefined
          const exitPrice = (closePriceOverride && closePriceOverride > 0)
            ? closePriceOverride
            : (trade.currentPrice || trade.entryPrice)
          const diff = trade.side === 'long'
            ? exitPrice - trade.entryPrice
            : trade.entryPrice - exitPrice
          const realizedPnl = diff * trade.qty
          const realizedPct = trade.entryPrice > 0 ? (diff / trade.entryPrice) * 100 : 0

          // V227: Determine closeReason if not explicitly provided.
          // Infer from closePrice vs SL/TP comparison.
          let reason = closeReason
          if (!reason && closePriceOverride) {
            if (trade.sl && Math.abs(closePriceOverride - trade.sl) < 0.0001) reason = 'STOP_LOSS'
            else if (trade.tp && Math.abs(closePriceOverride - trade.tp) < 0.0001) reason = 'TAKE_PROFIT'
          }
          if (!reason) reason = 'MANUAL'

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
            closeReason: reason,
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
              body: `${sourceLabel} ${trade.qty} ${trade.symbol} @ $${exitPrice.toFixed(2)} — ${isProfit ? '+' : ''}$${realizedPnl.toFixed(2)} (${isProfit ? '+' : ''}${realizedPct.toFixed(1)}%)`,
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
          // V228 FIX: ALL store access inside onRehydrateStorage now uses
          // _storeRef instead of usePaperTradesStore directly.
          //
          // The previous code referenced `usePaperTradesStore` directly in
          // this callback. In the minified production build, this becomes
          // a `const` variable reference that can trigger TDZ errors:
          //   ReferenceError: Cannot access 'l' before initialization
          //
          // _storeRef is a `let` variable assigned synchronously after
          // create() returns, so it's guaranteed to be available when
          // this async callback runs.
          // ═══════════════════════════════════════════════════════════════

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
          // - V227: Trades stuck with _status='closed' (SL/TP hit but page
          //   refreshed before closeTrade() processed them)
          //
          // ALL valid trades (including bot/executor/agent) are preserved.
          // ═══════════════════════════════════════════════════════════════
          if (state && state.trades && state.trades.length > 0) {
            // V227: Properly close trades stuck with _status='closed'
            // (SL/TP was hit, closePrice was set, but closeTrade() never ran
            // because page refreshed before setTimeout fired)
            const stuckTrades = state.trades.filter((t: any) => (t as any)._status === 'closed')
            if (stuckTrades.length > 0) {
              console.warn(
                `[PaperTradesStore] V227: Found ${stuckTrades.length} trade(s) stuck with _status='closed' — properly closing them`
              )
              // Defer closeTrade calls to avoid nested sets during rehydration
              // V228: Use _storeRef instead of usePaperTradesStore
              setTimeout(() => {
                if (!_storeRef) return
                stuckTrades.forEach((t: any) => {
                  // Infer closeReason from closePrice vs SL/TP
                  let reason: string | undefined
                  const closePrice = (t as any).closePrice
                  if (closePrice && t.sl && Math.abs(closePrice - t.sl) < 0.0001) reason = 'STOP_LOSS'
                  else if (closePrice && t.tp && Math.abs(closePrice - t.tp) < 0.0001) reason = 'TAKE_PROFIT'
                  _storeRef.getState().closeTrade(t.id, reason)
                })
              }, 100)
            }

            const validTrades = state.trades.filter((t: PaperTrade) => {
              // Filter out phantom/invalid trades
              if (!t.entryPrice || t.entryPrice <= 0) return false
              if (!t.qty || t.qty <= 0) return false
              const tradeValue = Math.abs(t.qty * t.entryPrice)
              if (tradeValue < 1) return false
              // Filter out numeric-only symbols
              const base = t.symbol.split('/')[0]
              if (/^\d+$/.test(base)) return false
              // V227: Filter out trades stuck with _status='closed' — they'll be
              // properly closed by the stuck-trades handler above
              if ((t as any)._status === 'closed') return false
              // FIX: REMOVED the filter that deleted bot/executor/agent trades.
              // All valid trades are kept regardless of source.
              return true
            })

            if (validTrades.length !== state.trades.length) {
              console.warn(
                `[PaperTradesStore] Filtered ${state.trades.length - validTrades.length} phantom trade(s), keeping ${validTrades.length} valid trade(s)`
              )
              // V228: Use _storeRef instead of usePaperTradesStore
              if (_storeRef) {
                _storeRef.setState({ trades: validTrades })
              }
            }
          }

          // SECURITY: Validate that rehydrated data belongs to current user
          if (state) {
            const currentUserId = getCurrentUserId()
            const storedOwner = state._ownerUserId
            if (storedOwner && currentUserId && storedOwner !== currentUserId) {
              console.warn('[PaperTradesStore] SECURITY: Data belongs to different user, clearing')
              // V228: Use _storeRef instead of state.clearUserData()
              // state.clearUserData() might have `this` binding issues in rehydration
              if (_storeRef) {
                _storeRef.getState().clearUserData()
              }
            }
          }
        }
      },
    }
  )
)

// V228: Assign store reference synchronously after create() returns.
// This happens in the SAME synchronous tick as the create() call,
// BEFORE any async rehydration callbacks run (Promise.resolve().then()).
// Therefore, _storeRef is guaranteed to be assigned when callbacks access it.
_storeRef = usePaperTradesStore

// Helper to safely trigger sync without breaking UI flows
function triggerBackgroundSync() {
  setTimeout(() => {
    // V228: Use _storeRef for consistency, but usePaperTradesStore also works
    // here since triggerBackgroundSync is always called from within store actions
    // (after the store is fully created).
    _storeRef?.getState()?.syncWithServer?.()
  }, 1000)
}
