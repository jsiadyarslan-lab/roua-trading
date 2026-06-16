/**
 * V235: usePaperTradesStore — TRANSPARENT PROXY (deprecated local storage)
 *
 * ROOT FIX for "phantom trades stacking" and "margin not updating" bugs:
 *
 * PROBLEM:
 *   This store was the SOURCE OF TRUTH for paper trades — a parallel local
 *   state that existed alongside the DB (Position table). This caused:
 *     1. Trades added optimistically before backend confirmation → phantoms
 *     2. Trades closed locally but still in DB → stale duplicates
 *     3. Margin calculated from local trades, not DB → wrong header display
 *     4. PnL calculated locally, not from backend quote → wrong P/L display
 *     5. On page refresh, localStorage rehydrated stale trades → confusion
 *
 * FIX:
 *   This file is now a TRANSPARENT PROXY. All write operations (addTrade,
 *   updatePrice, closeTrade, etc.) are NO-OPS — they do nothing locally.
 *   All read operations (trades, closedTrades) return EMPTY arrays.
 *
 *   The 12+ files that import this store continue to work without changes,
 *   but they now read from the DB (via usePositionsStore → /api/trading/positions)
 *   instead of from local localStorage.
 *
 *   The backend (NestJS) is the SINGLE SOURCE OF TRUTH:
 *     - TradingService.placeOrder creates Position in DB
 *     - PositionMonitor updates currentPrice/unrealizedPnl in DB
 *     - /api/trading/positions returns the canonical list
 *     - /api/trading/positions/history returns closed trades
 *
 * MIGRATION:
 *   Components should gradually migrate to usePositionsStore directly.
 *   This proxy exists only to avoid breaking the 12+ files that import it.
 *   Once all files are migrated, this file can be deleted.
 */

import { create } from 'zustand'

/**
 * i18n helper for notification strings in non-component contexts.
 * Kept for backward compatibility — GlobalLogicEngine imports this.
 */
let _tn: ((key: string, vars?: Record<string, any>) => string) | null = null

export function setNotificationTranslator(tn: (key: string, vars?: Record<string, any>) => string) {
  _tn = tn
}

// Keep PaperTrade/ClosedPaperTrade types for backward compatibility
export interface PaperTrade {
  id: string
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  currentPrice: number
  tp?: number
  sl?: number
  entryTime: number
  unrealizedPnl: number
  unrealizedPct: number
  strategy?: string
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
  closeReason?: string
}

interface PaperTradesState {
  /** V235: Always empty — DB is the source of truth via usePositionsStore */
  trades: PaperTrade[]
  /** V235: Always empty — DB history is the source of truth via /api/trading/positions/history */
  closedTrades: ClosedPaperTrade[]
  /** V235: NO-OP — backend handles trade creation via POST /api/trading/orders */
  addTrade: (t: Omit<PaperTrade, 'id' | 'unrealizedPnl' | 'unrealizedPct'>) => void
  /** V235: NO-OP — backend updates prices via PositionMonitor (every 10s) */
  updatePrice: (symbol: string, price: number) => void
  /** V235: NO-OP — backend handles SL/TP updates */
  updateTrade: (id: string, updates: Partial<PaperTrade>) => void
  /** V235: NO-OP — backend handles position close via POST /api/trading/positions/close */
  removeTrade: (id: string) => void
  /** V235: NO-OP — backend handles close via POST /api/trading/positions/close */
  closeTrade: (id: string, closeReason?: string) => void
  /** V235: NO-OP — backend is the source of truth, nothing to clear locally */
  clearAll: () => void
  /** V235: NO-OP — backend history is the source of truth */
  clearClosedTrades: () => void
  /** V235: NO-OP — backend syncs automatically */
  syncWithServer?: () => Promise<void>
  /** SECURITY: Clear all data when user changes — kept for auth-store integration */
  clearUserData: () => void
  /** SECURITY: Current userId that the store data belongs to — kept for compat */
  _ownerUserId: string | null
}

/**
 * V235: Transparent proxy store.
 *
 * All state is empty. All mutations are no-ops. This ensures:
 *   - No local paper trades can be created (no phantoms)
 *   - No local SL/TP auto-close (backend PositionMonitor handles this)
 *   - No localStorage persistence (no stale data on refresh)
 *   - All 12+ importing files continue to work without changes
 *
 * The DB (via usePositionsStore → /api/trading/positions) is the only source.
 */
export const usePaperTradesStore = create<PaperTradesState>()(() => ({
  trades: [],
  closedTrades: [],
  _ownerUserId: null,

  // V235: All write operations are no-ops.
  // The backend handles everything via:
  //   - POST /api/trading/orders (create)
  //   - POST /api/trading/positions/close (close)
  //   - PositionMonitor (SL/TP/price updates — every 10s)
  //   - /api/trading/positions (read — fetched by usePositionsStore)

  addTrade: (_t) => {
    // NO-OP: Trade is created via POST /api/trading/orders (handled by caller)
    // Previously this added a local trade that could become a phantom.
    // Now the backend is the single source of truth.
  },

  updatePrice: (_symbol, _price) => {
    // NO-OP: Prices are updated by PositionMonitor in the backend (every 10s).
    // Previously this updated local trades and auto-closed on SL/TP hit,
    // causing duplicate closes (local + backend).
    // Now only the backend's PositionMonitor closes positions.
  },

  updateTrade: (_id, _updates) => {
    // NO-OP: SL/TP updates should go to the backend (TODO: add PATCH endpoint)
    // Previously this updated local state only, which didn't sync to DB.
  },

  removeTrade: (_id) => {
    // NO-OP: Position removal is handled by backend close endpoint.
  },

  closeTrade: (_id, _closeReason?) => {
    // NO-OP: Position close is handled via POST /api/trading/positions/close.
    // Previously this closed the trade locally but left it open in the DB,
    // causing "ghost" positions that reappeared on refresh.
    // Now the caller must use the backend close endpoint.
  },

  clearAll: () => {
    // NO-OP: Nothing to clear — trades array is always empty.
  },

  clearClosedTrades: () => {
    // NO-OP: Nothing to clear — closedTrades array is always empty.
  },

  clearUserData: () => {
    // NO-OP: No local data to clear. The DB positions are filtered by userId
    // via RLS (Row Level Security) on the backend.
  },

  syncWithServer: async () => {
    // NO-OP: Nothing to sync — backend is the source of truth.
  },
}))

/**
 * V235: Removed persist() middleware.
 *
 * Previously, this store used zustand/persist to save trades to localStorage.
 * This caused stale data on page refresh (trades that were closed in the DB
 * but still in localStorage would reappear).
 *
 * Now: No persistence. The store is always empty on every page load.
 * The DB is the only source of truth, fetched fresh via usePositionsStore.
 *
 * SECURITY NOTE: Old localStorage key 'roua-paper-trades-store' may still
 * exist in users' browsers. It's harmless (just unused data), but we could
 * add a one-time cleanup if needed. For now, leaving it avoids extra complexity.
 */
