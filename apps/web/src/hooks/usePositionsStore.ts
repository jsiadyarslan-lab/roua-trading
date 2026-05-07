import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ensureAuth } from '@/lib/api-fetch'
import { useAuthStore } from '@/lib/auth-store'

interface Position {
  id?: string
  symbol: string
  rawSymbol?: string
  side: string
  qty: number
  entryPrice?: number
  avgEntryPrice: number
  currentPrice:  number
  marketValue:   number
  unrealizedPnl: number
  unrealizedPnlPct?: number
  sl?: number
  tp?: number
  stopLoss?: number
  takeProfit?: number
  exchange?: string
  openedAt?: string
  source?: 'nestjs' | 'alpaca'
}

interface PositionsState {
  positions: Position[]
  account: any
  loading: boolean
  error: string | null
  lastUpdate: string | null
  /** Unix timestamp (ms) of last successful fetch — used for staleness detection */
  _cacheTimestamp: number | null
  dataSource: 'nestjs' | 'alpaca' | null
  setPositions: (positions: Position[]) => void
  setAccount: (account: any) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setLastUpdate: (lastUpdate: string | null) => void
  fetchPositions: () => Promise<void>
  fetchAccount: () => Promise<void>
  updatePositionPrice: (symbol: string, price: number) => void
  /** SECURITY: Clear all cached data when user changes */
  clearUserData: () => void
  /** SECURITY: Current userId that the store data belongs to */
  _ownerUserId: string | null
}

/**
 * SECURITY: Get a user-scoped localStorage key to prevent data leakage.
 * Without userId in the key, user B would see user A's cached positions.
 *
 * FIX: This now returns a DYNAMIC key function, not a static string.
 * The old version evaluated once at module load time (before auth was ready),
 * so ALL users shared the 'guest' key.
 */
function getStorageKey(): string {
  try {
    const user = useAuthStore.getState().user
    if (user?.id) return `roua-positions-store:${user.id}`
  } catch { /* Auth store not yet initialized */ }
  // Use a session-unique key to prevent guest-to-guest data leakage
  // Each browser session gets its own key via sessionStorage
  try {
    let sessionId = sessionStorage.getItem('roua-guest-session-id')
    if (!sessionId) {
      sessionId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem('roua-guest-session-id', sessionId)
    }
    return `roua-positions-store:${sessionId}`
  } catch {
    return 'roua-positions-store:guest'
  }
}

/**
 * SECURITY: Get current userId for cache validation.
 * Returns null for guest/unauthenticated users.
 */
function getCurrentUserId(): string | null {
  try {
    const user = useAuthStore.getState().user
    if (user?.id && !user.isGuest) return user.id
  } catch { /* Auth store not yet initialized */ }
  return null
}

/** Track the userId that the store was last hydrated for */
let _lastHydratedUserId: string | null = null

export const usePositionsStore = create<PositionsState>()(
  persist(
    (set, get) => ({
  positions: [],
  account: null,
  loading: false,
  error: null,
  lastUpdate: null,
  _cacheTimestamp: null,
  dataSource: null,
  /** Current userId that the store data belongs to */
  _ownerUserId: null as string | null,
  setPositions: (positions) => set({ positions }),
  setAccount: (account) => set({ account }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),

  /**
   * تحديث سعر المركز الحالي وحساب P&L فوريًا من أسعار السوق المباشرة
   * بدلاً من انتظار التحديث الدوري من Alpaca API (كل 10-15 ثانية)
   */
  updatePositionPrice: (symbol, price) => {
    const normalizedInput = symbol.toUpperCase().replace(/\//g, '')
    const currentPositions = get().positions
    let changed = false

    const positions = currentPositions.map((p) => {
      const normalizedPos = p.symbol.toUpperCase().replace(/\//g, '')
      if (normalizedPos !== normalizedInput) return p

      // لا نحدث إذا كان السعر هو نفسه (تجنب إعادة تصيير غير ضرورية)
      if (Math.abs(p.currentPrice - price) < 0.0001) return p

      const currentPrice = price
      const isLong = p.side === 'long' || p.side === 'LONG' || p.side === 'BUY'

      // حساب P&L غير المحقق
      let unrealizedPnl = 0
      let unrealizedPnlPct = 0
      if (p.avgEntryPrice > 0) {
        const diff = isLong
          ? currentPrice - p.avgEntryPrice
          : p.avgEntryPrice - currentPrice
        unrealizedPnl = diff * p.qty
        unrealizedPnlPct = p.avgEntryPrice > 0 ? (diff / p.avgEntryPrice) * 100 : 0
      }

      const marketValue = currentPrice * p.qty
      changed = true

      return { ...p, currentPrice, unrealizedPnl, unrealizedPnlPct, marketValue }
    })

    if (!changed) return
    set({ positions })
  },
  fetchAccount: async () => {
    await ensureAuth()

    // ── المحاولة الأولى: NestJS API ──
    // يستخدم ملخص المحفظة من NestJS لاشتقاق بيانات الحساب
    try {
      const res = await fetch('/api/trading/positions/summary')
      if (res.ok) {
        const data = await res.json()
        const summary = data.data || data.summary || data

        if (summary && (summary.totalBalance !== undefined || summary.totalExposure !== undefined)) {
          const account = {
            equity: summary.totalBalance || 0,
            cash: (summary.totalBalance || 0) - (summary.totalExposure || 0),
            buyingPower: (summary.totalBalance || 0) - (summary.totalExposure || 0),
            portfolioValue: summary.totalBalance || 0,
            longMarketValue: summary.totalExposure || 0,
            shortMarketValue: 0,
            initialMargin: summary.totalExposure || 0,
            maintenanceMargin: 0,
            unrealizedPnl: summary.unrealizedPnL || 0,
            unrealizedPnlPct: summary.dailyPnLPercent || 0,
            isPaperTrading: true,
            tradingBlocked: false,
            accountBlocked: false,
          }
          set({ account, dataSource: 'nestjs', _cacheTimestamp: Date.now() })
          return
        }
      }
    } catch {
      // NestJS غير متاح — نحاول Alpaca
    }

    // ── المحاولة الثانية: Alpaca API ──
    try {
      const res = await fetch('/api/alpaca/account')
      const j = await res.json()
      if (j.success && j.data) {
        set({ account: j.data, dataSource: 'alpaca', _cacheTimestamp: Date.now() })
        return
      }
    } catch {
      // Alpaca غير متاح أيضاً
    }

    // ── المحاولة الثالثة: حساب من المراكز المحملة ──
    // إذا كانت لدينا مراكز محملة، نحسب بيانات الحساب منها
    const currentPositions = get().positions
    if (currentPositions.length > 0) {
      const totalExposure = currentPositions.reduce((sum, p) => sum + (p.marketValue || p.qty * p.currentPrice), 0)
      const totalUnrealizedPnl = currentPositions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
      const account = {
        equity: totalExposure + totalUnrealizedPnl,
        cash: 0,
        buyingPower: 0,
        portfolioValue: totalExposure,
        longMarketValue: totalExposure,
        shortMarketValue: 0,
        initialMargin: totalExposure,
        maintenanceMargin: 0,
        unrealizedPnl: totalUnrealizedPnl,
        unrealizedPnlPct: totalExposure > 0 ? (totalUnrealizedPnl / totalExposure) * 100 : 0,
        isPaperTrading: true,
        tradingBlocked: false,
        accountBlocked: false,
      }
      set({ account, _cacheTimestamp: Date.now() })
      return
    }

    // ── لا بيانات متاحة — لا نترك account = null ──
    // نضع قيم افتراضية بدل null لتجنب عرض "بانتظار الربط"
    set({
      account: {
        equity: 0,
        cash: 0,
        buyingPower: 0,
        portfolioValue: 0,
        longMarketValue: 0,
        shortMarketValue: 0,
        initialMargin: 0,
        maintenanceMargin: 0,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        isPaperTrading: true,
        tradingBlocked: false,
        accountBlocked: false,
      },
    })
  },
  /**
   * SECURITY: Clear all cached data when user changes.
   * This prevents user B from seeing user A's positions.
   */
  clearUserData: () => {
    set({
      positions: [],
      account: null,
      lastUpdate: null,
      _cacheTimestamp: null,
      dataSource: null,
      error: null,
      _ownerUserId: null,
    })
    // Also remove ALL position-related keys from localStorage
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('roua-positions-store')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
    } catch { /* localStorage unavailable */ }
  },

  fetchPositions: async () => {
    // SECURITY: Verify user hasn't changed — if it has, clear stale data first
    const currentUserId = getCurrentUserId()
    const ownerUserId = get()._ownerUserId
    if (currentUserId && ownerUserId && currentUserId !== ownerUserId) {
      // User changed! Clear stale data from previous user
      get().clearUserData()
    }
    // Track current user as owner of this data
    if (currentUserId) set({ _ownerUserId: currentUserId })

    set({ loading: true, error: null })
    await ensureAuth()

    // ── المحاولة الأولى: NestJS API ──
    try {
      const res = await fetch('/api/trading/positions')
      if (res.ok) {
        const data = await res.json()
        // CRITICAL FIX: Backend returns a plain array [], not { success, data: [] }
        // Handle both shapes: plain array AND { data: [] } or { positions: [] }
        const raw = Array.isArray(data)
          ? data
          : (data.data || data.positions || [])
        if (Array.isArray(raw)) {
          const positions: Position[] = raw.map((p: any) => ({
            id: p.id,
            symbol: p.symbol,
            side: p.side === 'long' ? 'long' : p.side === 'short' ? 'short' : p.side,
            qty: Number(p.quantity ?? p.qty ?? 0),
            entryPrice: Number(p.entryPrice) || Number(p.avgEntryPrice) || 0,
            avgEntryPrice: Number(p.entryPrice) || Number(p.avgEntryPrice) || 0,
            currentPrice: Number(p.currentPrice) ?? 0,
            marketValue: (Number(p.quantity) ?? Number(p.qty) ?? 0) * (Number(p.currentPrice) ?? 0),
            unrealizedPnl: Number(p.unrealizedPnL) || Number(p.unrealizedPnl) || 0,
            sl: Number(p.stopLoss) || Number(p.sl) || undefined,
            tp: Number(p.takeProfit) || Number(p.tp) || undefined,
            stopLoss: Number(p.stopLoss) || undefined,
            takeProfit: Number(p.takeProfit) || undefined,
            exchange: p.exchange,
            openedAt: p.openedAt,
            source: 'nestjs' as const,
          }))
          set({
            positions,
            lastUpdate: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            dataSource: 'nestjs',
            loading: false,
            _cacheTimestamp: Date.now(),
          })
          return
        }
      }
    } catch {
      // NestJS غير متاح — نحاول Alpaca
    }

    // ── المحاولة الثانية: Alpaca API ──
    try {
      const res = await fetch('/api/alpaca/positions')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        set({
          positions: j.data,
          lastUpdate: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          dataSource: 'alpaca',
          loading: false,
          _cacheTimestamp: Date.now(),
        })
      } else {
        set({ error: j.error || 'فشل في جلب المراكز' })
      }
    } catch {
      set({ error: 'خطأ في الشبكة' })
    } finally {
      set({ loading: false })
    }
  },
}),
    {
      /**
       * SECURITY FIX: Dynamic storage key to prevent data leakage.
       * The old `name: getStorageKey()` was evaluated ONCE at module load time
       * (before auth was initialized), so all users shared the same 'guest' key.
       *
       * Now we use a custom storage adapter that dynamically resolves the key
       * on every getItem/setItem call based on the current auth state.
       */
      name: 'roua-positions-store', // Base name — actual key is resolved dynamically
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
      // Only persist account data and positions (not loading/error states)
      partialize: (state) => ({
        account: state.account,
        positions: state.positions,
        lastUpdate: state.lastUpdate,
        dataSource: state.dataSource,
        _cacheTimestamp: state._cacheTimestamp,
        _ownerUserId: state._ownerUserId,
      }),
      // Sync across tabs via storage events & force refresh stale data
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.warn('[PositionsStore] Rehydration failed:', error)
          }

          // SECURITY: Validate that rehydrated data belongs to current user
          // If _ownerUserId doesn't match current auth user, discard the data
          if (state) {
            const currentUserId = getCurrentUserId()
            const storedOwner = state._ownerUserId
            if (storedOwner && currentUserId && storedOwner !== currentUserId) {
              // Data belongs to a different user — clear it!
              console.warn('[PositionsStore] SECURITY: Data belongs to different user, clearing')
              state.clearUserData()
              // Fetch fresh data for the current user
              state.fetchAccount()
              state.fetchPositions()
              return
            }
          }

          // If cached data is stale (older than 5 min), immediately fetch fresh data
          if (state?._cacheTimestamp) {
            const cacheAge = Date.now() - state._cacheTimestamp
            if (cacheAge > 5 * 60 * 1000) {
              console.log('[PositionsStore] Cache is stale (%d ms old), forcing refresh', cacheAge)
              state.fetchAccount()
              state.fetchPositions()
            }
          } else if (state && !state.lastUpdate) {
            // No cache at all — fetch immediately
            state.fetchAccount()
            state.fetchPositions()
          }
        }
      },
    }
  )
)
