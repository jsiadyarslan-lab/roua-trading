import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ensureAuth, isNestJsId } from '@/lib/api-fetch'
import { useAuthStore } from '@/lib/auth-store'
import { calculatePortfolioMargin } from '@/lib/margin-calculator'

interface Position {
  id?: string
  /** DB UUID — used by close buttons to route through NestJS instead of Alpaca */
  dbId?: string
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
  /** V189: Credential ID this position belongs to — used for filtering by active account */
  credentialId?: string
  openedAt?: string
  source?: 'nestjs' | 'alpaca'
  /** Trade source from DB: user_manual, smart_executor, agent, auto_paper */
  tradeSource?: string
}

interface PositionsState {
  positions: Position[]
  account: any
  /** V119: Per-exchange balance breakdown from credentials/balances API */
  exchangeBalances: Array<{
    exchange: string
    label: string
    credentialId: string
    isTestnet: boolean
    equity: number
    /** V189: Actual account balance (without floating PnL) */
    balance?: number
    available: number
    currency: string
    error?: string
    /** V191: Raw error detail for diagnostics */
    errorDetail?: string
    /** V268: Used margin (from MT5 streaming updates) */
    usedMargin?: number
  }>
  /** V175: Active credential ID from user settings — determines which exchange is primary */
  activeCredentialId: string | null
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
  /** FIX: Refresh positions + account after trade execution with staggered retries */
  refreshAfterTrade: () => void
  updatePositionPrice: (symbol: string, price: number) => void
  /** SECURITY: Clear all cached data when user changes */
  clearUserData: () => void
  /** FIX: Remove a single position from cache by id or symbol-side key — used when POSITION_CLOSED notification is received */
  removePosition: (positionIdOrKey: string) => void
  /** V189: Get positions filtered by the active credential — only positions belonging to the active account */
  getActivePositions: () => Position[]
  /** SECURITY: Current userId that the store data belongs to */
  _ownerUserId: string | null
  /** Timestamp-based concurrency guard for fetchPositions */
  _lastFetchStart: number | null
  /** Debounce timestamp for refreshAfterTrade */
  _lastRefreshAfterTrade: number
}

/**
 * SECURITY: Get a user-scoped localStorage key to prevent data leakage.
 *
 * V156 FIX: Previous implementation used a STATIC key ('roua-positions-store')
 * for ALL users, with owner validation via _ownerUserId field. This worked
 * but had a brief window where User B could see User A's data from
 * localStorage rehydration before the owner check cleared it.
 *
 * NEW APPROACH: Use a SEMI-DYNAMIC key that includes the userId when available.
 * During Zustand rehydration (page refresh), if auth store hasn't loaded yet,
 * we fall back to the static key and validate ownership via _ownerUserId.
 * This gives us instant rehydration AND proper isolation.
 *
 * The key format is: `roua-positions-store:${userId}` for authenticated users,
 * or `roua-positions-store` for unauthenticated/guest users (during rehydration).
 */
function getStorageKey(): string {
  try {
    const user = useAuthStore.getState().user
    if (user?.id && !user.isGuest) return `roua-positions-store:${user.id}`
  } catch { /* Auth store not yet initialized */ }
  return 'roua-positions-store' // Fallback for rehydration before auth loads
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

async function resolveCurrentUserId(): Promise<string | null> {
  let userId = getCurrentUserId()
  if (userId) return userId

  await ensureAuth()
  userId = getCurrentUserId()
  if (userId) return userId

  try {
    await useAuthStore.getState().refreshUser()
  } catch { /* Auth refresh failed; caller will handle as unauthenticated */ }

  return getCurrentUserId()
}

/** Track the userId that the store was last hydrated for */
let _lastHydratedUserId: string | null = null

/**
 * FIX: Merge positions instead of replacing them entirely.
 * This prevents the "dancing" effect where positions flicker
 * because multiple polling intervals replace the entire array.
 *
 * Strategy:
 * - If a position with the same id exists, update only changed fields
 * - If a position doesn't exist, add it
 * - If an existing position is no longer in the new data, remove it
 * - Preserve real-time price updates (currentPrice, unrealizedPnl) from market data
 *
 * FIX V115: When incoming is empty, we now distinguish between:
 *   1. Authoritative empty (API returned 200 with []) → remove positions from that source
 *   2. Non-authoritative empty (no API data available) → preserve current positions
 * Previously, ALL empty responses preserved current positions, causing closed
 * positions to persist in the UI forever when the backend said "0 open positions".
 */
function mergePositions(
  current: Position[],
  incoming: Position[],
  options?: { source?: 'nestjs' | 'alpaca'; authoritativeEmpty?: boolean },
): Position[] {
  // ═══════════════════════════════════════════════════════════════
  // FIX V115: Handle authoritative empty responses.
  // When the API successfully returns 0 positions for a source,
  // it means ALL positions from that source are genuinely CLOSED.
  // We should remove them from the store instead of preserving them.
  //
  // Previously, this code was:
  //   if (incoming.length === 0) return current
  // Which kept closed positions visible forever when the backend
  // said "0 open positions". This is the root cause of the bug
  // where 3 out of 4 positions close but 1 stays visible — the
  // backend says 0, but the frontend keeps the old data.
  // ═══════════════════════════════════════════════════════════════
  if (incoming.length === 0) {
    if (options?.authoritativeEmpty && options?.source) {
      // API confirmed: 0 positions from this source → remove all from that source
      // But keep positions from OTHER sources (e.g., Alpaca positions while NestJS says 0)
      const filtered = current.filter(p => p.source !== options.source)
      return filtered
    }
    // Non-authoritative empty (e.g., network error, no data available)
    // Preserve current positions — we don't know if they're closed or just unavailable
    return current
  }

  if (current.length === 0) return incoming

  const currentMap = new Map<string, Position>()
  for (const p of current) {
    const key = p.id || `${p.symbol}-${p.side}-${p.exchange}`
    currentMap.set(key, p)
  }

  const result: Position[] = []
  const seenKeys = new Set<string>()

  for (const inc of incoming) {
    const key = inc.id || `${inc.symbol}-${inc.side}-${inc.exchange}`
    seenKeys.add(key)

    const existing = currentMap.get(key)
    if (!existing) {
      // New position — add it
      result.push(inc)
      continue
    }

    // ═══════════════════════════════════════════════════════════════
    // FIX: P&L DANCE PREVENTION
    // The backend (fetchPositions) returns currentPrice and unrealizedPnl
    // calculated from stale REST API prices (3-10s cache). Meanwhile,
    // updatePositionPrice() updates these fields from live market data
    // (Binance WS for crypto, REST polling for forex/gold/stocks).
    //
    // Without this protection, every fetchPositions() call overwrites
    // live prices with stale backend prices, causing P&L to "dance":
    //   $47 (live) → $12 (stale backend) → $48 (live) → $11 (stale)
    //
    // Solution: ALWAYS preserve currentPrice, unrealizedPnl,
    // unrealizedPnlPct, and marketValue from the existing position
    // if they've been updated by the live price path (non-zero).
    //
    // The backend should only provide STATIC data (entryPrice, quantity,
    // side, stopLoss, takeProfit) — dynamic price fields come from
    // the live market data pipeline (WS + polling → GlobalLogicEngine).
    // ═══════════════════════════════════════════════════════════════
    const hasLivePrice = existing.currentPrice > 0

    result.push({
      ...inc,
      // ═══ LIVE PRICE PROTECTION ═══
      // Always preserve live-updated price fields from the frontend.
      // The backend price is always stale (3-10s cache for crypto,
      // 5-10min cache for forex/gold/stocks). The frontend price comes
      // from Binance WS (~100ms for crypto) or REST polling, and is
      // always fresher or at worst equally stale.
      //
      // Exception: if existing.currentPrice is 0 (initial load / no
      // price data yet), use the backend price as initial value.
      currentPrice: hasLivePrice ? existing.currentPrice : inc.currentPrice,
      unrealizedPnl: hasLivePrice ? existing.unrealizedPnl : inc.unrealizedPnl,
      unrealizedPnlPct: hasLivePrice ? existing.unrealizedPnlPct : inc.unrealizedPnlPct,
      marketValue: hasLivePrice ? existing.marketValue : inc.marketValue,
      // FIX: Preserve dbId from existing position if incoming doesn't have it.
      // When Alpaca data overwrites NestJS data in the merge, the incoming
      // position from Alpaca has no dbId (undefined), overwriting the existing
      // dbId from NestJS. This caused close buttons to fall through to Alpaca
      // (which returns 404 for DB-only positions like paper-trading/Binance Testnet).
      dbId: inc.dbId || existing.dbId || undefined,
      // V189: Preserve credentialId from existing or incoming (for active account filtering)
      credentialId: inc.credentialId || existing.credentialId || undefined,
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // FIX: CLOSED POSITIONS REMOVAL
  // When incoming is non-empty, positions that exist in current
  // but NOT in incoming should be evaluated:
  //   - If opened < 60 seconds ago: KEEP (API may not have settled yet)
  //   - If opened >= 60 seconds ago: REMOVE (position was closed)
  //
  // Previously, ALL positions from current that weren't in incoming
  // were kept forever. This caused closed positions to persist in
  // the UI even after the Smart Executor or user closed them.
  // The API only returns OPEN positions, so if a position is
  // missing from a non-empty response, it's genuinely closed.
  //
  // Grace period of 60 seconds protects against the edge case
  // where a trade just opened and the API hasn't registered it yet.
  // ═══════════════════════════════════════════════════════════════
  // FIX V115: Reduced grace period from 60s to 15s. The 60s grace period
  // was too long — positions that were just closed by the user would remain
  // visible for a full minute before disappearing. 15s is enough for the
  // edge case where a trade just opened and the API hasn't registered it yet,
  // but short enough that closed positions don't linger.
  const GRACE_PERIOD_MS = 15 * 1000 // 15 seconds
  const now = Date.now()

  for (const [key, pos] of currentMap) {
    if (!seenKeys.has(key)) {
      // Check if this position was recently opened (within grace period)
      const openedAt = pos.openedAt ? new Date(pos.openedAt).getTime() : 0
      const ageMs = openedAt > 0 ? now - openedAt : Infinity

      if (ageMs < GRACE_PERIOD_MS) {
        // Recently opened — API might not have it yet. Keep it.
        result.push(pos)
      }
      // else: Position was closed (not in API response + older than grace period)
      // → DON'T add it back. It's genuinely closed.
    }
  }

  return result
}

export const usePositionsStore = create<PositionsState>()(
  persist(
    (set, get) => ({
  positions: [],
  account: null,
  exchangeBalances: [],
  /** V175: Active credential from user settings */
  activeCredentialId: null as string | null,
  loading: false,
  error: null,
  lastUpdate: null,
  _cacheTimestamp: null,
  dataSource: null,
  /** Current userId that the store data belongs to */
  _ownerUserId: null as string | null,
  _lastFetchStart: null as number | null,
  _lastRefreshAfterTrade: 0 as number,
  setPositions: (positions) => set({ positions }),
  setAccount: (account) => set({ account }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLastUpdate: (lastUpdate) => set({ lastUpdate }),

  /**
   * FIX: Refresh positions and account balance after a trade is executed.
   * Uses staggered fetches to ensure the exchange has time to settle.
   *
   * Problem: After a trade (manual or automated), the account balance and
   * positions list don't update because:
   * 1. No WebSocket push for balance updates (WS disabled by default)
   * 2. Polling interval is too slow
   * 3. Only Execution Panel calls fetchAccount() after trade
   *
   * Solution: This method is called from EVERY place a trade is opened/closed.
   * It does:
   * - Immediate fetch (positions + account) — debounced if called within 3s
   * - Delayed fetch after 3s (exchange settlement)
   * - GlobalLogicEngine handles ongoing refreshes (8s active / 20s idle)
   *
   * PERF: Reduced from 3 waves (0s+2s+5s = 6 API calls) to 2 waves (0s+3s = 4 API calls).
   * The 5s wave was redundant — GlobalLogicEngine already polls positions every 8s.
   * Added debounce: if called within 3s of a previous call, skip the immediate wave
   * to prevent burst API calls when multiple WebSocket events fire simultaneously
   * (e.g., POSITION_CLOSED + balance_update + trade_executed all call this).
   *
   * CRITICAL FIX: Each delayed wave resets `loading = false` before fetching
   * to bypass the concurrency guard in fetchPositions.
   */
  refreshAfterTrade: () => {
    const now = Date.now()
    const lastRefresh = (get() as any)._lastRefreshAfterTrade || 0
    const DEBOUNCE_MS = 3000

    // Update timestamp for debounce tracking
    set({ _lastRefreshAfterTrade: now } as any)

    // Debounced immediate fetch — skip if called within 3s of previous call
    if (now - lastRefresh >= DEBOUNCE_MS) {
      set({ _lastFetchStart: 0 } as any)
      Promise.all([
        get().fetchPositions(),
        get().fetchAccount(),
      ]).catch((err) => {
        console.warn('[PositionsStore] refreshAfterTrade immediate failed:', err)
      })
    }

    // Delayed fetch — exchange settlement (3 seconds)
    // This catches positions that take a moment to settle on the exchange
    setTimeout(() => {
      set({ _lastFetchStart: 0, loading: false } as any)
      Promise.all([
        get().fetchPositions(),
        get().fetchAccount(),
      ]).catch((err) => {
        console.warn('[PositionsStore] refreshAfterTrade wave 2 failed:', err)
      })
    }, 3000)
  },

  /**
   * تحديث سعر المركز الحالي وحساب P&L فوريًا من أسعار السوق المباشرة
   * بدلاً من انتظار التحديث الدوري من Alpaca API (كل 10-15 ثانية)
   *
   * FIX: Now also updates account.equity in real-time:
   *   equity = cash + sum(positions.marketValue) + sum(positions.unrealizedPnl)
   * This ensures the balance shown on the dashboard changes as positions gain/lose value.
   */
  updatePositionPrice: (symbol, price) => {
    // FIX V139: Normalize USD→USDT for matching. Positions from SmartExecutor
    // use BTC/USDT format, but quotes may arrive as BTC/USD from Binance WS.
    // Without this, positions with BTC/USDT never match BTC/USD quotes → frozen P&L.
    const normalizedInput = symbol.toUpperCase().replace(/\//g, '').replace(/USD$/, 'USDT')
    // V197 FIX: Use all positions for the map (we need to update matching positions),
    // but compute PnL/metrics from ONLY active positions to avoid mixing MT5 with paper.
    const allPositions = get().positions
    let changed = false

    const positions = allPositions.map((p) => {
      const normalizedPos = p.symbol.toUpperCase().replace(/\//g, '').replace(/USD$/, 'USDT')
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

    // ═══════════════════════════════════════════════════════════════
    // FIX V140E: LIVE EQUITY UPDATE — CORRECT FORMULA
    // When a position price changes, recalculate account equity.
    //
    // CRITICAL: cash = totalEquityUsd (total wallet balance = free + used).
    // The "used" portion IS the position margin. So positionsMarketValue
    // is ALREADY included in cash. Adding it again would double-count.
    //
    // WRONG (old): equity = cash + marketValue + PnL
    //   $18,834 + $2,457 + $13 = $21,304 ← DOUBLE-COUNTED!
    //
    // CORRECT: equity = cash + PnL
    //   $18,834 + $13 = $18,847 ← matches fetchAccount!
    //
    // We still track longMarketValue = positionsMarketValue for display,
    // but we do NOT add it to equity.
    // ═══════════════════════════════════════════════════════════════
    // FIX V148B: Real-time price update should NEVER change initialMargin.
    // The margin is ONLY set by fetchAccount() from the backend, which uses
    // the leverage-aware calculateMargin() function. The real-time update
    // should only change equity-related fields that depend on current price.
    //
    // BUG: Previously, updatePositionPrice() would spread currentAccount
    // which included the OLD initialMargin from localStorage (e.g., $19,548
    // which is the full notional, not the real margin). Even though we
    // tried to "preserve" the previous margin, the previous margin was
    // the WRONG value from localStorage. This caused:
    //   1. fetchAccount() sets initialMargin to correct ~$390
    //   2. updatePositionPrice() fires and OVERWRITES with $19,548 from localStorage
    //   3. User sees: briefly correct → immediately wrong again
    //
    // FIX: Store margin in a separate _backendMargin field that is ONLY
    // set by fetchAccount(). updatePositionPrice() reads from this field
    // and never overwrites it.
    // ═══════════════════════════════════════════════════════════════
    const currentAccount = get().account
    if (currentAccount) {
      // V197 FIX: Compute metrics from ONLY active positions to avoid mixing
      // MT5 balance/equity with paper-trading PnL. Previously, positions.reduce()
      // summed ALL positions (MT5 + paper), so:
      //   - MT5 equity (from MetaAPI) was correct
      //   - But positionsMarketValue and positionsUnrealizedPnl included paper positions
      //   - This caused "Position value: $12,457" when only $2,457 was from MT5
      const activePositions = get().activeCredentialId
        ? get().getActivePositions()
        : positions
      const positionsMarketValue = activePositions.reduce(
        (sum, p) => sum + Math.abs(Number(p.marketValue || p.qty * p.currentPrice || 0)),
        0,
      )
      // V196 FIX: For real exchanges (MT5), equity already includes PnL from MetaAPI.
      // Do NOT recalculate equity from client-side positions — that overwrites the
      // real equity with cash + mixed PnL (paper + real).
      const isRealExchangeActive = !!(currentAccount as any).isRealExchangeMargin
      const positionsUnrealizedPnl = activePositions.reduce(
        (sum, p) => sum + (p.unrealizedPnl || 0),
        0,
      )
      const cash = Number(currentAccount.cash) || 0
      const newEquity = isRealExchangeActive
        ? Number(currentAccount.equity) // MT5 equity from MetaAPI already includes PnL
        : cash + positionsUnrealizedPnl   // Paper trading: compute from positions
      // ═══════════════════════════════════════════════════════════════
      // V153 FIX: CORRECT MARGIN PRIORITY IN REAL-TIME UPDATES
      //
      // ARCHITECTURE: Platform only CONNECTS accounts. Leverage is set by exchange.
      //
      // For REAL exchanges: Exchange margin is authoritative. The _backendMargin
      //   from fetchAccount() contains the exchange's actual margin (balance.used.USDT).
      //   This is TIER 1 when fresh and from a real exchange.
      //
      // For PAPER TRADING: Client-side calculation with user-configured leverage.
      //   This is TIER 1 when no real exchange margin is available.
      //
      // PRIORITY:
      //   1. Fresh exchange margin (from _backendMargin, real exchange only)
      //   2. Client-side calculation (user-configured leverage for paper trading)
      //   3. Preserve current initialMargin
      // ═══════════════════════════════════════════════════════════════
      const backendMargin = Number((currentAccount as any)._backendMargin) || 0
      const marginVersion = Number((currentAccount as any)._marginVersion) || 0
      const isRealExchange = !!(currentAccount as any).isRealExchangeMargin
      const MARGIN_STALE_MS = 120_000 // 2 minutes
      const isBackendMarginFresh = marginVersion > 0 && (Date.now() - marginVersion) < MARGIN_STALE_MS
      // Client-side margin with user-configured leverage (for paper trading)
      const clientMargin = positions.length > 0
        ? calculatePortfolioMargin(positions).usedMargin
        : 0
      const currentMargin = Number(currentAccount.initialMargin) || 0

      let initialMargin: number
      // V263: ALWAYS use backend margin first (both real AND paper).
      // Previously, paper trading used clientMargin (TIER 2) which
      // calculates margin with different leverage than the backend.
      // This caused the "dancing" between $34 and $338 every 2s:
      //   - fetchAccount (30s): sets backendMargin (correct)
      //   - updatePositionPrice (2s): overrides with clientMargin (different leverage)
      if (isBackendMarginFresh && backendMargin > 0) {
        // TIER 1: Backend margin — AUTHORITATIVE (both real and paper)
        initialMargin = backendMargin
      } else if (currentMargin > 0) {
        // TIER 2: Preserve existing margin — don't reset to 0!
        initialMargin = currentMargin
      } else if (clientMargin > 0) {
        // TIER 3: Client-side calculation (fallback if no backend margin)
        initialMargin = clientMargin
      } else {
        initialMargin = 0
      }
      const freeMargin = Math.max(0, newEquity - initialMargin)

      set({
        positions,
        account: {
          ...currentAccount,
          equity: newEquity,
          longMarketValue: positionsMarketValue,
          unrealizedPnl: positionsUnrealizedPnl,
          unrealizedPnlPct: cash > 0 ? (positionsUnrealizedPnl / cash) * 100 : 0,
          initialMargin,
          maintenanceMargin: 0,
          buyingPower: Math.max(0, freeMargin),
          portfolioValue: newEquity,
          // V151: PRESERVE _backendMargin and _marginVersion — NEVER overwrite them!
          // These are ONLY set by fetchAccount(). Previously, this line overwrote
          // _backendMargin with 0 when the heuristic failed, causing the flickering loop.
          _backendMargin: backendMargin,
          _marginVersion: marginVersion,
          // V151: Also store client-side margin for debugging
          _clientMargin: clientMargin,
        } as any,
      })
    } else {
      set({ positions })
    }
  },
  fetchAccount: async () => {
    // V154 FIX: Verify user hasn't changed — same as fetchPositions().
    // Without this, if user A logs out and user B logs in on the same browser,
    // user B briefly sees user A's balance from localStorage rehydration.
    const currentUserId = await resolveCurrentUserId()
    const ownerUserId = get()._ownerUserId
    if (currentUserId && ownerUserId && currentUserId !== ownerUserId) {
      // User changed! Clear stale data from previous user
      get().clearUserData()
    }
    // Track current user as owner of this data
    if (currentUserId) set({ _ownerUserId: currentUserId } as any)

    // V175: Fetch activeCredentialId from user settings so the dashboard
    // knows which exchange account to prioritize for the main balance display.
    // Without this, the dashboard shows aggregated or paper balance even when
    // the user has set MT5 (or another exchange) as their active account.
    try {
      const settingsRes = await fetch('/api/settings')
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        const newActiveCredId = settingsData?.settings?.activeCredentialId || null
        const currentActiveCredId = get().activeCredentialId
        if (newActiveCredId !== currentActiveCredId) {
          console.log(`[PositionsStore] V175: activeCredentialId changed: ${currentActiveCredId?.slice(0,8) || 'null'} → ${newActiveCredId?.slice(0,8) || 'null'}`)
          set({ activeCredentialId: newActiveCredId } as any)
          // V210 CRITICAL FIX: Re-fetch positions with the new credentialId!
          // Without this, the store keeps positions from the old account and
          // getActivePositions() filters them by the NEW credentialId → empty list.
          // The user sees "لا توجد مراكز مفتوحة" even though the new account has positions.
          console.log(`[PositionsStore] V210: Re-fetching positions with new credentialId=${newActiveCredId?.slice(0,8) || 'null'}`)
          // Clear old positions first to avoid showing stale data from the previous account
          set({ positions: [], _lastFetchStart: 0 } as any)
          get().fetchPositions().catch((err: any) => {
            console.warn('[PositionsStore] V210: Re-fetch after credentialId change failed:', err)
          })
        }
      }
    } catch (err) {
      // Settings fetch failed — keep existing activeCredentialId
      console.warn('[PositionsStore] V175: Failed to fetch settings:', err)
    }

    // V154/V166 FIX: Handle auth-blocked responses — don't fall through to paper fallback.
    // Previously, when the backend returned 401 (expired session), fetchAccount()
    // silently fell through all try/catch blocks and showed $10,000 to every user.
    // Now we stop on 401/403 so guest or invalid sessions cannot show a shared
    // paper/demo balance after the real credentials endpoint refuses access.
    const checkAuthResponse = (res: Response) => {
      if (res.status === 401 || res.status === 403) {
        console.warn(`[PositionsStore] fetchAccount: Got ${res.status} — auth blocked. NOT showing paper fallback.`)
        return true // auth failed — don't use fallback
      }
      return false
    }

    // ── المحاولة الأولى: أرصدة بيانات الاعتماد (Binance, KuCoin, OKX, etc.) ──
    // V262: If active credential is paper-trading, skip the slow multi-exchange
    // balance fetch and use the fast paper balance from DB directly.
    // The old code called /api/portfolio/credentials/balances which fetches
    // balances from ALL exchanges (including MT5 which times out at 3s,
    // and Binance which is rate-limited) → 5-10s delay on every refresh.
    const activeCredId = get().activeCredentialId
    const activeExchange = get().exchangeBalances.find((e: any) => e.credentialId === activeCredId)
    if (activeExchange?.exchange === 'paper-trading' || (!activeExchange && !activeCredId)) {
      // Paper trading: use fast DB-based balance from positions summary
      try {
        const summaryRes = await fetch('/api/trading/positions/summary')
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json()
          const summary = summaryData.data || summaryData
          const paperBalance = summary?.paperBalance ?? 10000
          const usedMargin = summary?.usedMargin ?? 0
          const unrealizedPnl = summary?.totalUnrealizedPnl ?? 0
          // V262.2: paperBalance from backend = displayedBalance (DB + usedMargin)
          // cash = displayedBalance (true wallet, what the user sees as "Balance")
          // equity = displayedBalance + unrealizedPnl
          // available = displayedBalance - usedMargin + unrealizedPnl = cash - usedMargin + PnL
          const account = {
            cash: paperBalance, // displayedBalance (already includes usedMargin from backend)
            equity: paperBalance + unrealizedPnl,
            buyingPower: Math.max(0, paperBalance - usedMargin + unrealizedPnl),
            initialMargin: usedMargin,
            unrealizedPnl,
            isPaperTrading: true,
            activeCredentialId: activeCredId,
            _backendMargin: usedMargin,
            _marginVersion: Date.now(),
            isRealExchangeMargin: false,
          }
          set({ account, dataSource: 'nestjs', _cacheTimestamp: Date.now() })
          return
        }
      } catch {
        // Fall through to slow path if summary endpoint fails
      }
    }

    // Non-paper or summary failed: use the slow multi-exchange path
    try {
      const res = await fetch('/api/portfolio/credentials/balances')
      // V154 FIX: If session expired (401), STOP — don't fall through to $10,000 fallback
      if (checkAuthResponse(res)) return
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data && data.data.exchanges?.length > 0) {
          const { totalEquityUsd, totalAvailableUsd, totalUsedMargin, exchanges } = data.data
          // V221: Backend now provides totalBalanceUsd (true balance without floating PnL)
          const totalBalanceUsd = (data.data as any).totalBalanceUsd ?? totalEquityUsd
          // V162: Backend now provides these flags to prevent the shared balance bug
          const allRealExchangesFailed = data.data.allRealExchangesFailed === true
          const backendHasRealCredentials = data.data.hasRealCredentials === true

          // V184 FIX: Exclude paper-trading from isTestnet check.
          // Paper-trading ALWAYS has isTestnet=true, which made isTestnet ALWAYS true,
          // causing isPaperTrading = true even when the user has a real MT5 account.
          // Now: isTestnet only reflects real exchange testnet status (e.g., Binance Testnet).
          const isTestnet = exchanges.some((e: any) => e.isTestnet && e.exchange !== 'paper-trading')
          const hasDecryptionError = exchanges.some((e: any) => e.error)
          const hasRealCredentials = backendHasRealCredentials || exchanges.some(
            (e: any) => e.exchange !== 'paper-trading'
          )

          // ═══════════════════════════════════════════════════════════════
          // V162 CRITICAL FIX: Don't silently show paper balance as total.
          // V175 OVERRIDE: Respect activeCredentialId — when user has set
          // a specific exchange (like MT5) as active, prioritize its balance.
          //
          // ROOT CAUSE of "ورقي" shown when MT5 is active:
          //   1. User sets MT5 as active in Settings → activeCredentialId saved
          //   2. Dashboard fetches ALL exchange balances
          //   3. If Binance fails → allRealExchangesFailed=true
          //   4. Dashboard falls back to paper-trading and shows "ورقي" badge
          //   5. Even though MT5 balance succeeded, it's ignored!
          //
          // FIX: If activeCredentialId points to an exchange that succeeded,
          // use THAT exchange's balance as the primary balance. Don't fall
          // back to paper just because OTHER exchanges failed.
          // ═══════════════════════════════════════════════════════════════
          const realExchangesSuccess = exchanges.filter(
            // V185: Stale balance (_stale=true) with equity > 0 counts as success
            (e: any) => e.exchange !== 'paper-trading' && ((!e.error || (e as any)._stale) && e.equity > 0)
          )
          const realExchangesFailed = exchanges.filter(
            // V185: Stale balance is NOT a failure — it's usable cached data
            (e: any) => e.exchange !== 'paper-trading' && (e.error && !(e as any)._stale) && e.equity <= 0
          )
          const paperExchange = exchanges.find(
            (e: any) => e.exchange === 'paper-trading'
          )

          // V175: Find the active exchange balance
          const activeCredId = get().activeCredentialId
          const activeExchange = activeCredId
            ? exchanges.find((e: any) => e.credentialId === activeCredId)
            : null
          // V185: Stale balance (from MT5 cache) is still usable — treat as "succeeded"
          // as long as it has equity > 0. This prevents falling back to paper trading
          // when MetaAPI is temporarily down (503/timeout).
          const isStaleButValid = activeExchange && (activeExchange as any)._stale === true && (activeExchange as any).equity > 0
          const activeExchangeSucceeded = activeExchange && (
            (!activeExchange.error && (activeExchange as any).equity > 0) ||
            isStaleButValid
          )

          // V176/V184: Debug logging — understand why dashboard might not show active account
          const _activeCredInfo = activeExchange
            ? `${(activeExchange as any).exchange}/credId=${(activeExchange as any).credentialId?.slice(0,8)}/eq=$${(activeExchange as any).equity}/err=${(activeExchange as any).error || 'none'}`
            : 'NOT_FOUND'
          console.log(
            `[PositionsStore] V184: Balance debug:\n` +
            `  activeCredId=${activeCredId?.slice(0,8) || 'NULL'}\n` +
            `  activeExchange=${_activeCredInfo}\n` +
            `  activeSucceeded=${activeExchangeSucceeded}\n` +
            `  isTestnet=${isTestnet}\n` +
            `  isPaperTrading=${isTestnet && !activeExchangeSucceeded}\n` +
            `  exchanges=[${exchanges.map((e: any) => `${e.exchange}($${(e as any).equity || 0}${(e as any).error ? ',ERR:' + (e as any).error?.substring(0,40) : ''})`).join(', ')}]`
          )
          // V184: Warn if activeCredentialId is set but the matching exchange failed
          if (activeCredId && !activeExchange) {
            console.warn(
              `[PositionsStore] V184: ⚠️ activeCredentialId=${activeCredId?.slice(0,8)} NOT found in exchange balances! ` +
              `Available credentialIds: [${exchanges.map((e: any) => e.credentialId?.slice(0,8)).join(', ')}]. ` +
              `This usually means the credential was deleted or the ID format changed.`
            )
            // V185: Clear stale activeCredentialId that doesn't match any exchange
            try {
              await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: { activeCredentialId: '' } }),
              })
              console.log(`[PositionsStore] V185: Cleared stale activeCredentialId`)
              set({ activeCredentialId: null } as any)
            } catch {}
          }
          if (activeCredId && activeExchange && !activeExchangeSucceeded) {
            // V185: Check if the active exchange has a stale/cached balance (from MetaAPI cache)
            const isStaleBalance = (activeExchange as any)._stale === true
            const staleEquity = (activeExchange as any).equity || 0
            if (isStaleBalance && staleEquity > 0) {
              console.log(
                `[PositionsStore] V185: Active exchange "${(activeExchange as any).exchange}" has STALE balance ` +
                `(equity=$${staleEquity}, from ${new Date((activeExchange as any)._staleTimestamp).toLocaleTimeString()}). ` +
                `Using stale balance as primary instead of falling back to paper.`
              )
            } else {
              console.warn(
                `[PositionsStore] V184: ⚠️ Active exchange "${(activeExchange as any).exchange}" FAILED: ` +
                `equity=$${(activeExchange as any).equity}, error="${(activeExchange as any).error || 'none'}". ` +
                `Dashboard will fall back to paper trading.`
              )
            }
          }

          let adjustedTotalEquityUsd = totalEquityUsd
          let adjustedTotalAvailableUsd = totalAvailableUsd
          let adjustedTotalUsedMargin = totalUsedMargin
          // V162: Track whether we're showing an error state instead of real balance
          let exchangeUnavailable = false

          // V203: Check if we have stale real account data from a previous fetch.
          // This is used when the active real exchange fails — instead of falling
          // back to paper trading balance, we use the stale real data (better UX).
          const prevAccount = get().account
          const hasStaleRealData = prevAccount && (prevAccount as any)._lastStreamUpdate
            && (Date.now() - (prevAccount as any)._lastStreamUpdate < 300_000) // Within 5 minutes
            && prevAccount.equity > 0

          // V162: Use the backend's allRealExchangesFailed flag when available,
          // otherwise compute it from the exchange results
          const allRealFailed = allRealExchangesFailed ||
            (hasRealCredentials && realExchangesFailed.length > 0 && realExchangesSuccess.length === 0)

          // V175: If the user's active exchange succeeded, use it as primary
          // even if other real exchanges failed. This fixes the case where
          // Binance fails but MT5 (which is the active account) works fine.
          // V189: Use `balance` (without floating PnL) instead of `equity` for MT5 accounts
          let adjustedTotalBalanceUsd = totalBalanceUsd  // V221: True balance from backend (not equity!)
          if (activeExchangeSucceeded) {
            // The active exchange (e.g., MT5) succeeded — use its balance as primary
            // V189: Prefer `balance` field over `equity` — balance is the real deposited amount
            // without unrealized PnL. For MT5: balance ≠ equity. For crypto: balance = equity.
            const activeBal = (activeExchange as any).balance ?? (activeExchange as any).equity  // V221: Use ?? not || (0 is valid balance)
            adjustedTotalEquityUsd = (activeExchange as any).equity
            adjustedTotalBalanceUsd = activeBal
            adjustedTotalAvailableUsd = (activeExchange as any).available || 0
            adjustedTotalUsedMargin = (activeExchange as any).usedMargin || 0
            exchangeUnavailable = false
            console.log(
              `[PositionsStore] V189: Active exchange "${(activeExchange as any).exchange}" ` +
              `(credentialId=${activeCredId?.slice(0, 8)}...) succeeded with ` +
              `balance=$${adjustedTotalBalanceUsd.toFixed(2)}, equity=$${adjustedTotalEquityUsd.toFixed(2)}. ` +
              `Using balance as primary display value.`
            )
          } else if (activeCredId && activeExchange && !activeExchangeSucceeded) {
            // V189/V203 CRITICAL FIX: User chose an active exchange but it FAILED.
            // DO NOT silently fall back to paper trading!
            // Instead, show the active exchange as "offline".
            // V203 FIX: Use PREVIOUS account data if available (stale but real),
            // NOT paper trading balance. This prevents showing $10,000 paper balance
            // when the user's MT5 account is temporarily offline.
            console.warn(
              `[PositionsStore] V203: Active exchange "${(activeExchange as any).exchange}" FAILED ` +
              `(error: ${(activeExchange as any).error || 'unknown'}). ` +
              `Showing as offline — NOT falling back to paper balance.`
            )
            exchangeUnavailable = true
            // V203: Try to use previous account data first (stale but from the real account)
            if (hasStaleRealData) {
              // Use stale real account data — better than paper balance
              adjustedTotalEquityUsd = prevAccount.equity
              adjustedTotalBalanceUsd = prevAccount.cash
              adjustedTotalAvailableUsd = prevAccount.buyingPower
              adjustedTotalUsedMargin = prevAccount.initialMargin
              console.log(`[PositionsStore] V203: Using stale real data (equity=$${prevAccount.equity}) instead of paper balance`)
            } else if (paperExchange && paperExchange.equity > 0) {
              // V203: Only use paper balance as last resort, clearly marked as fallback
              adjustedTotalEquityUsd = paperExchange.equity
              adjustedTotalAvailableUsd = paperExchange.available || 0
              adjustedTotalUsedMargin = paperExchange.usedMargin || 0
            } else if (totalEquityUsd > 0) {
              adjustedTotalEquityUsd = totalEquityUsd
              adjustedTotalAvailableUsd = totalAvailableUsd
              adjustedTotalUsedMargin = totalUsedMargin
            } else {
              // V203: Show $0 with offline indicator — NOT $10,000 paper fallback
              adjustedTotalEquityUsd = 0
              adjustedTotalAvailableUsd = 0
              adjustedTotalUsedMargin = 0
            }
          } else if (allRealFailed) {
            // V170.2 FIX: Real exchanges failed, but user still needs to see their balance.
            console.warn(
              `[PositionsStore] ALL ${realExchangesFailed.length} real exchange balance(s) FAILED. ` +
              `Falling back to paper-trading balance with warning. ` +
              `Failed: [${realExchangesFailed.map((e: any) => e.exchange).join(', ')}]`
            )
            exchangeUnavailable = true
            if (paperExchange && paperExchange.equity > 0) {
              adjustedTotalEquityUsd = paperExchange.equity
              adjustedTotalBalanceUsd = (paperExchange as any).balance || paperExchange.equity
              adjustedTotalAvailableUsd = paperExchange.available || 0
              adjustedTotalUsedMargin = paperExchange.usedMargin || 0
            } else if (totalEquityUsd > 0) {
              adjustedTotalEquityUsd = totalEquityUsd
              adjustedTotalBalanceUsd = totalBalanceUsd  // V221: Use totalBalanceUsd (not totalEquityUsd!)
              adjustedTotalAvailableUsd = totalAvailableUsd
              adjustedTotalUsedMargin = totalUsedMargin
            } else {
              console.warn('[PositionsStore] No paper balance and no backend total — using $10,000 default')
              adjustedTotalEquityUsd = 10000
              adjustedTotalBalanceUsd = 10000
              adjustedTotalAvailableUsd = 10000
              adjustedTotalUsedMargin = 0
            }
          } else if (realExchangesSuccess.length > 0) {
            // At least one real exchange succeeded — backend totals exclude
            // paper trading when real credentials exist.
            adjustedTotalEquityUsd = totalEquityUsd
            adjustedTotalBalanceUsd = totalBalanceUsd  // V221: Use totalBalanceUsd from backend
            adjustedTotalAvailableUsd = totalAvailableUsd
            adjustedTotalUsedMargin = totalUsedMargin
          } else {
            // No real exchange credentials — paper trading only.
            adjustedTotalEquityUsd = paperExchange?.equity || totalEquityUsd
            adjustedTotalBalanceUsd = (paperExchange as any)?.balance ?? adjustedTotalEquityUsd  // V221: Use ?? not || (0 is valid)
            adjustedTotalAvailableUsd = paperExchange?.available || totalAvailableUsd
            adjustedTotalUsedMargin = paperExchange?.usedMargin || totalUsedMargin
          }

          // ═══════════════════════════════════════════════════════════════
          // FIX: Compute longMarketValue and initialMargin from positions,
          // not from totalEquityUsd. Previously:
          //   longMarketValue = totalEquityUsd  ← WRONG (shows balance, not position value)
          //   initialMargin = totalEquityUsd - totalAvailableUsd ← WRONG (0 for paper)
          // This caused the dashboard to show:
          //   "Position value: $10,000" (= balance, not actual positions)
          //   "Margin amount: $0.00" (because available ≈ equity for paper)
          //   "Free margin: $10,000" (= equity - 0 margin)
          // Now: We calculate from actual loaded positions in the store.
          // ═══════════════════════════════════════════════════════════════
          // V196 FIX: Use getActivePositions() to avoid mixing MT5 balance with paper PnL
          const currentPositions = get().activeCredentialId
            ? get().getActivePositions()
            : get().positions
          const positionsMarketValue = currentPositions.reduce(
            (sum, p) => sum + Math.abs(Number(p.marketValue || p.qty * p.currentPrice || 0)),
            0,
          )
          const positionsUnrealizedPnl = currentPositions.reduce(
            (sum, p) => sum + (p.unrealizedPnl || 0),
            0,
          )
          // V153 FIX: CORRECT MARGIN PRIORITY — Exchange margin first for real accounts
          //
          // ARCHITECTURE: The platform only CONNECTS accounts. Leverage is set by
          // the broker/exchange, NOT by the platform. So:
          //
          // For REAL exchanges: The exchange API provides actual usedMargin
          //   (balance.used.USDT for spot, futures margin for futures accounts).
          //   This is AUTHORITATIVE — it reflects the user's actual leverage on Binance.
          //
          // For PAPER TRADING: Client-side calculation using user-configured leverage
          //   (from AgentSettings.paperForexLeverage, paperGoldLeverage, paperCryptoLeverage).
          //   This is a simulation — the user chooses their preferred leverage.
          //
          // PRIORITY:
          //   1. If user has REAL exchange with margin > 0: Use exchange margin (authoritative)
          //   2. If user has positions + paper trading: Client-side calc (user-configured leverage)
          //   3. Backend totalUsedMargin (may be wrong for no-slash symbols)
          //   4. totalEquityUsd - totalAvailableUsd (rough fallback)
          const hasRealExchanges = exchanges.some((e: any) => e.exchange !== 'paper-trading')
          const realExchangeMargin = exchanges
            .filter((e: any) => e.exchange !== 'paper-trading')
            .reduce((sum: number, e: any) => sum + (e.usedMargin || 0), 0)

          let usedMargin: number
          if (hasRealExchanges && realExchangeMargin > 0) {
            // TIER 1: Real exchange margin — AUTHORITATIVE
            // The exchange knows the user's actual leverage and calculates margin correctly
            usedMargin = realExchangeMargin
          } else if (currentPositions.length > 0) {
            // TIER 2: Client-side calculation for paper trading or missing exchange margin
            // Uses user-configured leverage (forex, gold, crypto) from AgentSettings
            const clientCalc = calculatePortfolioMargin(currentPositions)
            usedMargin = clientCalc.usedMargin
          } else if (adjustedTotalUsedMargin > 0) {
            // TIER 3: Backend margin — use when no positions loaded locally
            usedMargin = adjustedTotalUsedMargin
          } else if (adjustedTotalEquityUsd - adjustedTotalAvailableUsd > 0) {
            // TIER 4: Rough difference — only for real exchanges
            usedMargin = adjustedTotalEquityUsd - adjustedTotalAvailableUsd
          } else {
            usedMargin = 0
          }

          // ═══════════════════════════════════════════════════════════════
          // FIX V140B: CORRECT BALANCE/EQUITY CALCULATION
          //
          // In trading:
          //   Balance = total wallet balance (free + used/margin) from exchange
          //   Equity  = Balance + unrealized P&L
          //   P&L     = Equity - Balance
          //
          // Previously:
          //   cash = totalAvailableUsd (free only, NOT including used margin)
          //   equity = totalAvailableUsd + positionsMarketValue + unrealizedPnl
          //   This made equity - cash = positionMarketValue + PnL (NOT just PnL!)
          //   User saw: Balance $16,383, Equity $18,856, P&L $11.93
          //   Gap = $2,472 but P&L = $11.93 → CONFUSING
          //
          // Now:
          //   cash = totalEquityUsd (total wallet balance = free + used)
          //   equity = totalEquityUsd + positionsUnrealizedPnl
          //   This way: equity - cash = P&L (consistent!)
          //   User sees: Balance $18,844, Equity $18,856, P&L $12 ✓
          // ═══════════════════════════════════════════════════════════════
          // V163 CRITICAL FIX: Use .every() NOT .some()!
          // .some() was TRUE for users with BOTH real+paper exchanges,
          // causing the $10,000 paper balance fallback to override
          // the exchangeUnavailable flag. This meant users with a
          // FAILED Binance account still saw the paper balance ($12,342.85)
          // instead of the "Exchange unavailable" error.
          // .every() = TRUE only when user has ONLY paper trading.
          const hasOnlyPaperExchanges = exchanges.every((e: any) => e.exchange === 'paper-trading')
          // V158: Use adjustedTotalEquityUsd which properly handles failed exchange balances
          let effectiveEquity = adjustedTotalEquityUsd
          let effectiveCash = adjustedTotalEquityUsd  // V140B: Use total balance, not just available

          // V175: When the active exchange succeeded, use its balance directly.
          // For MT5: accountInfo.equity already includes floating PnL from MetaAPI,
          // so we should NOT add positionsUnrealizedPnl again (would double-count).
          // For Binance/CCXT: equity from fetchBalance may or may not include PnL
          // depending on spot vs futures. To keep it safe, when using the active
          // exchange's balance, we trust the exchange's own equity number.
          // V189: Use `balance` field from backend — for MT5, this is the real
          // deposited balance (without floating PnL). For crypto: balance = equity.
          if (activeExchangeSucceeded) {
            // Active exchange (e.g., MT5) — equity already includes PnL from MetaAPI
            effectiveEquity = adjustedTotalEquityUsd
            // V189: Use the `balance` field from the active exchange.
            // For MT5: balance = real wallet balance (without unrealized PnL)
            // For crypto: balance = equity (no separate balance concept)
            effectiveCash = adjustedTotalBalanceUsd
            if (effectiveCash <= 0) effectiveCash = adjustedTotalEquityUsd
          } else if (hasOnlyPaperExchanges && adjustedTotalEquityUsd <= 0) {
            // FIX: Paper trading — use default paper balance from agent settings
            // or $10,000 as the standard paper trading balance.
            // This prevents the agent/bot from seeing $0 and refusing to trade.
            try {
              const settingsRes = await fetch('/api/agent/trader/settings')
              const settingsData = await settingsRes.json()
              if (settingsData.success && settingsData.data?.paperBalance > 0) {
                effectiveEquity = settingsData.data.paperBalance + positionsUnrealizedPnl
                effectiveCash = settingsData.data.paperBalance
              } else {
                effectiveEquity = 10000 + positionsUnrealizedPnl
                effectiveCash = 10000
              }
            } catch {
              effectiveEquity = 10000 + positionsUnrealizedPnl
              effectiveCash = 10000
            }
          } else if (hasOnlyPaperExchanges) {
            // V183 FIX: Backend now returns paperBalance with margin ADDED BACK.
            // ──────────────────────────────────────────────────────────────────
            // Previously (V175), paperBalance was the DB value (margin already deducted).
            // Now (V183), paperBalance = DB value + usedMargin = true wallet balance.
            //
            // Balance  = paperBalance (true wallet balance, stable — margin NOT deducted)
            // Equity   = paperBalance + unrealizedPnL  (changes with price)
            // Free Margin = Balance - usedMargin + unrealizedPnL
            // Used Margin = sum of (entryNotional / leverage) for all open positions
            // P/L     = unrealizedPnL
            // ──────────────────────────────────────────────────────────────────
            const paperBalanceFromAPI = (paperExchange as any)?.paperBalance
            if (paperBalanceFromAPI > 0) {
              effectiveCash   = paperBalanceFromAPI                           // Balance = true wallet balance (margin included)
              effectiveEquity = paperBalanceFromAPI + positionsUnrealizedPnl  // Equity = Balance + floating PnL
            } else {
              // V221: Fallback — use adjustedTotalBalanceUsd (true balance from backend)
              effectiveCash   = adjustedTotalBalanceUsd
              effectiveEquity = adjustedTotalBalanceUsd + positionsUnrealizedPnl
            }
          } else if (exchangeUnavailable) {
            // V171: Real exchange failed, but we have paper balance as fallback.
            // exchangeUnavailable=true tells the UI to show a warning banner.
            // V183: paperBalance from API now includes margin (added back by backend).
            if (adjustedTotalEquityUsd > 0) {
              // Use paperExchange paperBalance if available (V183: margin already added back)
              const paperBalanceFallback = (paperExchange as any)?.paperBalance
              if (paperBalanceFallback > 0) {
                effectiveCash   = paperBalanceFallback
                effectiveEquity = paperBalanceFallback + positionsUnrealizedPnl
              } else {
                effectiveEquity = adjustedTotalEquityUsd
                effectiveCash = adjustedTotalEquityUsd - positionsUnrealizedPnl
              }
            } else {
              // Safety net: should never reach here with V171 backend fix
              effectiveEquity = 10000 + positionsUnrealizedPnl
              effectiveCash = 10000
            }
          } else {
            // V221 FIX: For real accounts, separate Balance from Equity properly.
            //
            // IMPORTANT: MT5 equity already includes floating PnL from the broker.
            // So for MT5 accounts, we should NOT add positionsUnrealizedPnl again.
            // For crypto exchanges (Binance), equity = balance (no floating PnL concept).
            //
            // Balance = actual deposited funds + realized P&L (no floating PnL)
            // Equity  = Balance + unrealized PnL
            //
            // The backend now sends totalBalanceUsd separately from totalEquityUsd,
            // so we can use adjustedTotalBalanceUsd for the true balance display.
            const hasMT5 = realExchangesSuccess.some((e: any) =>
              ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'].includes((e.exchange || '').toLowerCase())
            )

            if (hasMT5) {
              // MT5 equity already includes PnL from the broker — don't double-count
              effectiveEquity = adjustedTotalEquityUsd
              effectiveCash = adjustedTotalBalanceUsd  // True balance without floating PnL
            } else {
              // Crypto exchanges: equity = balance (no separate concept)
              // Add positionsUnrealizedPnl to get true equity
              effectiveEquity = adjustedTotalEquityUsd + positionsUnrealizedPnl
              effectiveCash = adjustedTotalBalanceUsd  // True balance
            }
          }

          const account = {
            equity: effectiveEquity,
            balance: effectiveCash,  // V424: True balance (without floating PnL) — separate from equity
            cash: effectiveCash,
            buyingPower: Math.max(0, effectiveEquity - usedMargin),
            portfolioValue: effectiveEquity,
            longMarketValue: positionsMarketValue > 0 ? positionsMarketValue : (adjustedTotalEquityUsd - adjustedTotalAvailableUsd),
            shortMarketValue: 0,
            initialMargin: usedMargin,
            maintenanceMargin: 0,
            unrealizedPnl: positionsUnrealizedPnl,
            unrealizedPnlPct: adjustedTotalEquityUsd > 0 ? (positionsUnrealizedPnl / adjustedTotalEquityUsd) * 100 : 0,
            // V189 FIX: isPaperTrading logic — respect user's active account choice!
            // OLD BUG: When MT5 was set as active but MetaAPI failed, isPaperTrading
            // was computed as `isTestnet && !activeExchangeSucceeded` → true.
            // This made the dashboard show "ورقي" (paper) even though the user
            // explicitly chose MT5 as their active account.
            //
            // NEW LOGIC: If the user has set activeCredentialId to a real exchange
            // (MT5, Binance, etc.), we should NEVER mark it as paper trading.
            // isPaperTrading should only be true when:
            //   1. No activeCredentialId is set AND only paper trading exists
            //   2. The active credential IS paper-trading
            // When MetaAPI fails, the dashboard should show "MT5 (offline)" 
            // NOT "ورقي" — the exchangeUnavailable flag handles the offline UI.
            isPaperTrading: activeCredId
              ? (activeExchange?.exchange === 'paper-trading')  // V189: If user chose an account, only paper if it IS paper
              : (isTestnet && !activeExchangeSucceeded),        // No active choice: use old logic
            tradingBlocked: false,
            accountBlocked: false,
            // V148B: Store the backend's leverage-aware margin separately.
            // This field is ONLY set by fetchAccount() and NEVER overwritten
            // by updatePositionPrice(). The real-time update reads this field
            // to prevent the old wrong margin from localStorage from being
            // preserved when prices update.
            // V150: Also store _marginVersion timestamp so updatePositionPrice()
            // can detect stale _backendMargin from localStorage (older than 60s).
            _backendMargin: usedMargin,
            _marginVersion: Date.now(),
            // V153/V203: Mark whether margin came from real exchange API
            // If true, updatePositionPrice() should trust it over client-side calc.
            // V203 FIX: When the active exchange is a real exchange (MT5/Binance/etc) but
            // it's currently offline, we should STILL mark isRealExchangeMargin=true if:
            //   - The user's activeCredentialId points to a non-paper exchange
            //   - OR we have stale real data from a previous successful fetch
            // This prevents the margin from being recalculated with paper-trading leverage
            // when the real exchange is temporarily offline.
            isRealExchangeMargin: (hasRealExchanges && realExchangeMargin > 0)
              || activeExchangeSucceeded
              || (activeCredId && activeExchange && activeExchange.exchange !== 'paper-trading')
              || (hasStaleRealData && prevAccount && (prevAccount as any).isRealExchangeMargin),
            // V162: Flag for UI to show "Exchange unavailable" indicator
            // instead of silently showing wrong/paper balance
            exchangeUnavailable,
            // V175: Store which exchange is the active/primary one
            // V189: Show active exchange name EVEN WHEN it failed — the UI needs
            // to know the user chose MT5 so it shows "MT5 (offline)" not "ورقي"
            activeExchangeName: activeCredId && activeExchange
              ? (activeExchange as any).exchange
              : (activeExchangeSucceeded ? (activeExchange as any).exchange : null),
            activeCredentialId: activeCredId,
            // V185: Mark if the active exchange balance is stale (from cache)
            isStaleBalance: isStaleButValid ? true : false,
            // V193: Mark if MetaAPI is completely down (TOKEN_MISSING or all methods failed)
            metaapiDown: activeExchange ? !!(activeExchange as any)._metaapiDown : false,
            metaapiError: activeExchange ? ((activeExchange as any)._metaapiError || (activeExchange as any).errorDetail || undefined) : undefined,
          }
          set({ account, exchangeBalances: exchanges, dataSource: 'nestjs', _cacheTimestamp: Date.now() })

          // V170.2: Don't return early when exchangeUnavailable — we now show
          // paper balance as fallback with a warning banner. The old code
          // returned early, which prevented wallet data from loading.
          // if (exchangeUnavailable) { return }

          // ═══════════════════════════════════════════════════════════════
          // FIX: REMOVED wallet asset "positions" creation.
          // Previously, this code created fake "positions" from exchange
          // wallet assets (like USDT balance) with avgEntryPrice=0.
          // These wallet assets are NOT trading positions — they're just
          // holdings. They confused users who thought they had open trades.
          // Wallet asset info is now ONLY shown in the wallet/portfolio
          // pages, not in the positions/trades widget.
          // ═══════════════════════════════════════════════════════════════

          // ═══════════════════════════════════════════════════════════════
          // FIX: Accept the result if the API call succeeded.
          // For paper-trading: We've already set effectiveEquity above.
          // For real accounts: Accept even if equity is 0 temporarily.
          // ═══════════════════════════════════════════════════════════════
          const hasDecryptionError2 = exchanges.some((e: any) => e.error)
          const hasValidData = effectiveEquity > 0 || hasOnlyPaperExchanges || !hasDecryptionError2
          if (hasValidData) {
            return
          }
          if (!hasRealCredentials) {
            return
          }
        }
      }
    } catch {
      // بيانات الاعتماد غير متاحة — نحاول المصادر الأخرى
    }

    // ── المحاولة الثانية: NestJS Trading API ──
    // Do not use paper-trading position summary as an account-balance fallback
    // for authenticated users. The dashboard balance must come from
    // /portfolio/credentials/balances; otherwise a real/testnet exchange outage
    // can still be masked by the same simulated paper portfolio value.
    if (currentUserId) {
      console.warn('[PositionsStore] fetchAccount: Credentials balance unavailable for authenticated user — not using trading summary fallback.')
      // V171 FIX: Do NOT set account:null when backend fails temporarily.
      // Setting account:null causes $0.00 display, which is worse than showing
      // stale data. The user sees a brief flash of $0 every time the backend
      // has a transient error (DB timeout, Binance IP-blocked, etc.).
      // Instead, keep the stale account — the next successful fetch will update it.
      // Only set null if there's genuinely no previous data at all.
      const staleAccount = get().account
      if (!staleAccount) {
        set({
          account: null,
          exchangeBalances: [],
          dataSource: null,
          _cacheTimestamp: Date.now(),
        })
      }
      return
    }

    try {
      const res = await fetch('/api/trading/positions/summary')
      // V154 FIX: If session expired (401), STOP
      if (checkAuthResponse(res)) return
      if (res.ok) {
        const data = await res.json()
        const summary = data.data || data.summary || data

        if (summary && (summary.totalBalance !== undefined || summary.totalExposure !== undefined)) {
          // V153 FIX: Client-side margin with user-configured leverage for paper trading.
          // This NestJS path is for paper trading — use client-side calculation.
          let margin = 0
          const fallbackPos = get().positions
          if (fallbackPos.length > 0) {
            // TIER 1: Client-side calculation with user-configured leverage
            margin = calculatePortfolioMargin(fallbackPos).usedMargin
          } else if (summary.usedMargin > 0) {
            // TIER 2: Backend margin — use only when no positions loaded
            margin = summary.usedMargin
          }
          // V221 FIX: totalBalance from backend is now the TRUE balance (not balance + exposure).
          // Old code: totalBalance = baseBalance + totalExposure (nonsensical, added $108K notional).
          // New code: totalBalance = baseBalance (actual account balance).
          // Equity = Balance + UnrealizedPnL
          const trueBalance = summary.totalBalance || 0
          const trueEquity = trueBalance + (summary.unrealizedPnL || 0)
          const account = {
            equity: trueEquity,
            cash: trueBalance,
            buyingPower: Math.max(0, (summary.totalBalance || 0) - margin),
            portfolioValue: summary.totalBalance || 0,
            longMarketValue: summary.totalExposure || 0,
            shortMarketValue: 0,
            initialMargin: margin,
            maintenanceMargin: 0,
            unrealizedPnl: summary.unrealizedPnL || 0,
            unrealizedPnlPct: summary.dailyPnLPercent || 0,
            isPaperTrading: true,
            tradingBlocked: false,
            accountBlocked: false,
            _backendMargin: summary.usedMargin || 0,
            _marginVersion: Date.now(),
          }
          set({ account, exchangeBalances: [], dataSource: 'nestjs', _cacheTimestamp: Date.now() })
          return
        }
      }
    } catch {
      // NestJS غير متاح — نحاول Alpaca
    }

    // ── المحاولة الثالثة: Alpaca API ──
    try {
      const res = await fetch('/api/alpaca/account')
      // V154 FIX: If session expired (401), STOP
      if (checkAuthResponse(res)) return
      const j = await res.json()
      if (j.success && j.data) {
        set({ account: j.data, dataSource: 'alpaca', _cacheTimestamp: Date.now() })
        return
      }
    } catch {
      // Alpaca غير متاح أيضاً
    }

    // ── المحاولة الرابعة: حساب من المراكز المحملة ──
    // V154 FIX: Try to fetch the user's actual paper balance from settings
    // instead of hardcoding $10,000. This is the LAST source before the
    // final fallback. If the settings fetch also fails (e.g. 401), we
    // skip this attempt entirely to avoid showing the wrong balance.
    //
    // CRITICAL: Do not use this local paper fallback for authenticated users.
    // When a real/testnet exchange balance request fails, this branch made the
    // UI rebuild the same paper balance from local positions, so users still
    // saw the same number even after the exchange fallback was blocked above.
    if (currentUserId) {
      console.warn('[PositionsStore] fetchAccount: Skipping local paper balance fallback for authenticated user.')
      // V171 FIX: Same as above — don't null out account on transient failures.
      const staleAccount = get().account
      if (!staleAccount) {
        set({
          account: null,
          exchangeBalances: [],
          dataSource: null,
          _cacheTimestamp: Date.now(),
        })
      }
      return
    }

    const fallbackPositions = get().positions
    if (fallbackPositions.length > 0) {
      const totalExposure = fallbackPositions.reduce((sum, p) => sum + (p.marketValue || p.qty * p.currentPrice), 0)
      const totalUnrealizedPnl = fallbackPositions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
      const estimatedMargin = calculatePortfolioMargin(fallbackPositions).usedMargin

      // V154 FIX: Try to get the user's actual paper balance from API
      // instead of hardcoding $10,000 for ALL users
      let paperBalance = 10000 // Default for NEW users only
      try {
        const settingsRes = await fetch('/api/agent/trader/settings')
        if (!settingsRes.ok) {
          // V154: If auth failed, don't show stale/guest balance
          if (checkAuthResponse(settingsRes)) return
        } else {
          const settingsData = await settingsRes.json()
          if (settingsData.success && settingsData.data?.paperBalance > 0) {
            paperBalance = settingsData.data.paperBalance
          }
        }
      } catch {
        // Settings unavailable — use default paper balance (new users)
      }

      const equity = paperBalance + totalUnrealizedPnl
      const account = {
        equity,
        cash: paperBalance,
        buyingPower: Math.max(0, equity - estimatedMargin),
        portfolioValue: equity,
        longMarketValue: totalExposure,
        shortMarketValue: 0,
        initialMargin: estimatedMargin,
        maintenanceMargin: 0,
        unrealizedPnl: totalUnrealizedPnl,
        unrealizedPnlPct: totalExposure > 0 ? (totalUnrealizedPnl / totalExposure) * 100 : 0,
        isPaperTrading: true,
        tradingBlocked: false,
        accountBlocked: false,
        _backendMargin: estimatedMargin,
        _marginVersion: Date.now(),
        _clientMargin: estimatedMargin,
      }
      set({ account, _cacheTimestamp: Date.now() })
      return
    }

    // ── لا بيانات متاحة — لا نترك account = null ──
    // V157 FIX: STRONGER protection against the $10,000 fallback.
    //
    // PROBLEM: When ALL API sources fail (NestJS down, session expired, etc.),
    // the old code set $10,000 as the balance for EVERY user. Since all users
    // got the same fallback, it LOOKED like they all had the same balance.
    //
    // NEW RULES:
    // 1. If we have existing account data (from a previous successful fetch),
    //    KEEP IT — don't overwrite with $10,000
    // 2. If the user is authenticated (has a userId), they are NOT a new user.
    //    Don't show $10,000 — just keep whatever data we have (even null)
    // 3. Only show $10,000 for truly new users (no userId, no prior data)
    const existingAccount = get().account
    // currentUserId is already defined at the top of fetchAccount() (line 487)
    if (existingAccount && (existingAccount.equity > 0 || existingAccount.cash > 0)) {
      // We have existing data — don't overwrite with $10,000 default
      console.warn('[PositionsStore] fetchAccount: All API sources failed but existing account data exists — keeping it')
      return
    }

    // V157: If user is authenticated, they should NOT see $10,000 fallback.
    // Their real balance fetch failed — showing $10,000 would make it look
    // like all users have the same balance. Better to show nothing (null)
    // and let the next polling cycle try again.
    if (currentUserId) {
      console.warn('[PositionsStore] fetchAccount: All API sources failed for authenticated user — NOT showing $10,000 fallback. Will retry on next poll.')
      return
    }

    // Only for truly anonymous users with no prior data — show default paper balance
    const finalPositions = get().positions
    const finalPnl = finalPositions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
    const DEFAULT_NEW_USER_BALANCE = 10000

    set({
      account: {
        equity: DEFAULT_NEW_USER_BALANCE + finalPnl,
        balance: DEFAULT_NEW_USER_BALANCE,  // V424: True balance without PnL
        cash: DEFAULT_NEW_USER_BALANCE,
        buyingPower: DEFAULT_NEW_USER_BALANCE,
        portfolioValue: DEFAULT_NEW_USER_BALANCE + finalPnl,
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
   * FIX: Remove a single position from the cache immediately.
   * Called when a POSITION_CLOSED notification is received from the Smart Executor,
   * so the user sees the position disappear right away — instead of waiting for
   * the next polling cycle or having to click "Close All".
   *
   * Matches by: id, dbId, or symbol-side-exchange composite key.
   */
  removePosition: (positionIdOrKey: string) => {
    const currentPositions = get().positions
    const filtered = currentPositions.filter((p) => {
      const pId = p.id || p.dbId || ''
      const pKey = `${p.symbol}-${p.side}-${p.exchange}`
      return pId !== positionIdOrKey && pKey !== positionIdOrKey && p.dbId !== positionIdOrKey
    })
    if (filtered.length !== currentPositions.length) {
      set({ positions: filtered })
    }
  },
  /**
   * V189: Get positions filtered by the active credential.
   * When the user switches to a specific account (e.g., MT5), the portfolio
   * should show ONLY that account's positions — not positions from all accounts.
   *
   * Logic:
   * - If activeCredentialId is set AND the position has a credentialId:
   *   - Return only positions where position.credentialId === activeCredentialId
   * - If activeCredentialId is set but position has no credentialId:
   *   - For paper-trading exchange: include if activeCredentialId points to paper-trading
   *   - For other positions: include them (legacy compatibility — positions without credentialId)
   * - If no activeCredentialId is set: return all positions (default behavior)
   */
  getActivePositions: () => {
    const { positions, activeCredentialId } = get()
    if (!activeCredentialId) return positions  // No active account set — show all

    return positions.filter((p) => {
      // Position has credentialId — direct match
      if (p.credentialId) {
        return p.credentialId === activeCredentialId
      }
      // Position without credentialId — include if it's from the same exchange type
      // as the active credential. This handles legacy positions that don't have
      // credentialId mapped yet.
      const activeExchangeBalances = get().exchangeBalances
      const activeBal = activeExchangeBalances.find((e: any) => e.credentialId === activeCredentialId)
      if (activeBal && p.exchange === activeBal.exchange) {
        return true
      }
      // Paper-trading positions: include only if the active credential is paper-trading
      if (p.exchange === 'paper-trading' && activeBal?.exchange === 'paper-trading') {
        return true
      }
      // Legacy: include positions without credentialId and matching exchange
      if (!p.credentialId && !activeBal) {
        return true
      }
      return false
    })
  },
  /**
   * SECURITY: Clear all cached data when user changes.
   * This prevents user B from seeing user A's positions.
   */
  clearUserData: () => {
    // V156 FIX: Immediately clear all state AND localStorage to prevent
    // any brief window where User B sees User A's data after logout/login.
    const ownerUserId = get()._ownerUserId
    set({
      positions: [],
      account: null,
      exchangeBalances: [],
      activeCredentialId: null,  // V189: Also clear active credential
      lastUpdate: null,
      _cacheTimestamp: null,
      dataSource: null,
      error: null,
      _ownerUserId: null,
      _lastFetchStart: null,
    })
    // Remove ALL position store keys from localStorage (both static and user-scoped)
    try {
      localStorage.removeItem('roua-positions-store')
      // Also remove user-scoped keys: roua-positions-store:${userId}
      if (ownerUserId) {
        localStorage.removeItem(`roua-positions-store:${ownerUserId}`)
      }
      // Clean up any other user-scoped keys that might exist
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
    const currentUserId = await resolveCurrentUserId()
    const ownerUserId = get()._ownerUserId
    if (currentUserId && ownerUserId && currentUserId !== ownerUserId) {
      // User changed! Clear stale data from previous user
      get().clearUserData()
    }
    // Track current user as owner of this data
    if (currentUserId) set({ _ownerUserId: currentUserId })

    // FIX: Use timestamp-based concurrency guard instead of boolean.
    // The old `if (get().loading) return` was too aggressive — it blocked
    // ALL fetches while any fetch was in progress, including legitimate
    // refresh attempts after a trade. If a fetch took > 2s, the staggered
    // refreshAfterTrade retries were all silently dropped.
    // Now: Only block if a fetch started less than 1 second ago (dedup),
    // but allow fetches after 1s even if the previous one is still running.
    const lastFetchStart = get()._lastFetchStart || 0
    const DEDUP_INTERVAL_MS = 1000
    if (Date.now() - lastFetchStart < DEDUP_INTERVAL_MS) return
    set({ _lastFetchStart: Date.now() } as any)

    set({ loading: true, error: null })

    // ── المحاولة الأولى: NestJS API ──
    try {
      // V209: Pass credentialId to API for server-side filtering by active account.
      // Previously, ALL positions were fetched and filtered client-side only.
      // Now the API also filters, so the response only includes relevant positions.
      const activeCredId = get().activeCredentialId
      const credParam = activeCredId ? `?credentialId=${encodeURIComponent(activeCredId)}` : ''
      const res = await fetch(`/api/trading/positions${credParam}`)
      if (res.ok) {
        const data = await res.json()
        const raw = Array.isArray(data)
          ? data
          : (data.data || data.positions || [])
        if (Array.isArray(raw)) {
          // FIX: Filter out phantom positions with invalid data
          // This is the LAST line of defense — even if the backend somehow
          // returns phantom positions, they'll be filtered out here.
          const filteredRaw = raw.filter((p: any) => {
            // FIX: Skip null/undefined elements from API response
            if (!p) return false
            // Skip positions with missing symbol
            if (!p.symbol) return false
            const qty = Number(p.quantity ?? p.qty ?? 0)
            const entryPrice = Number(p.entryPrice) || Number(p.avgEntryPrice) || 0
            // Skip positions with zero or negative entry price (phantom)
            if (entryPrice <= 0 && qty > 0) return false
            // Skip positions with zero quantity
            if (qty <= 0) return false
            // FIX: REMOVED paper-trading filter! Paper trading positions are REAL positions
            // created by the Smart Executor and Agent. The old filter removed ALL paper-trading
            // positions, making them invisible in the UI. Users trade in paper mode by default,
            // so removing them means NO positions are ever shown.
            // The source filter (smart_executor/agent/auto_paper) is also removed — these are
            // legitimate trade sources, not phantom trades.
            // Skip positions with trade value < $1 (dust/phantom)
            if (qty * entryPrice < 1) return false
            // Skip positions where symbol is numeric or invalid
            if (/^\d+$/.test(p.symbol?.split('/')[0] || '')) return false
            return true
          })

          const positions: Position[] = filteredRaw.map((p: any) => ({
            // FIX: Add fallback chain for id (same as Alpaca path)
            id: p.id || p.asset_id || p._id || p.symbol,
            // FIX: Always preserve the DB ID separately so close buttons
            // can route through NestJS instead of falling through to Alpaca.
            // Without dbId, positions from NestJS that get displayed in
            // AlpacaPositions.tsx fall through to the Alpaca close endpoint,
            // which returns 404 for DB-only positions.
            // CRITICAL: Use isNestJsId() instead of UUID regex — Prisma uses
            // cuid() not uuid(), so IDs like "clm5x2j4d0001..." must be recognized.
            dbId: p.id && isNestJsId(p.id)
              ? p.id
              : undefined,
            symbol: p.symbol,
            // FIX: Normalize side from DB enum (BUY/SELL) to UI convention (long/short).
            // The Prisma schema uses OrderSide enum (BUY/SELL), but the UI checks
            // for 'long'/'short' to show شراء/بيع. Without this normalization,
            // positions from the API with side='BUY' fall through to the else
            // branch and show as 'بيع' (sell) — which is WRONG.
            side: p.side === 'long' || p.side === 'BUY' ? 'long'
               : p.side === 'short' || p.side === 'SELL' ? 'short'
               : p.side,
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
            // V189: Preserve credentialId so positions can be filtered by active account
            credentialId: p.credentialId || p.exchangeCredentialId || undefined,
            openedAt: p.openedAt,
            source: 'nestjs' as const,
            // FIX: Preserve the trade source from DB (user_manual/smart_executor/agent/auto_paper)
            // This is needed to show the correct source badge (ورقي/المنفذ/الوكيل) in the UI.
            tradeSource: p.source || undefined,
          }))

          // FIX V115: Use merge with source info so that empty responses
          // from NestJS properly remove closed positions instead of preserving them.
          // When NestJS returns 0 positions, it's authoritative — all NestJS
          // positions are genuinely closed.
          const currentPositions = get().positions
          const merged = mergePositions(currentPositions, positions, {
            source: 'nestjs',
            authoritativeEmpty: true,
          })

          set({
            positions: merged,
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
        // FIX: Validate, filter, and normalize Alpaca positions — same as NestJS path.
        // Previously, raw j.data was stored directly, which could contain
        // null/undefined elements or objects with missing fields. This caused
        // "Cannot read properties of undefined (reading 'id')" crashes in
        // AlpacaPositions.tsx when iterating positions.
        const filteredData = j.data.filter((p: any) => {
          // Skip null/undefined elements from API
          if (!p) return false
          // Skip positions with missing symbol
          if (!p.symbol) return false
          // Skip positions with zero/negative qty
          const qty = Number(p.qty ?? p.quantity ?? 0)
          if (qty <= 0) return false
          // Skip phantom positions with near-zero entry price
          const entryPrice = Number(p.avgEntryPrice ?? p.entryPrice ?? 0)
          if (entryPrice <= 0 && qty > 0) return false
          // Skip dust positions (trade value < $1)
          if (qty * entryPrice < 1) return false
          return true
        })

        const positions: Position[] = filteredData.map((p: any) => ({
          id: p.id || p.rawSymbol || p.symbol,
          symbol: p.symbol,
          rawSymbol: p.rawSymbol,
          side: p.side === 'long' || p.side === 'BUY' ? 'long' : p.side === 'short' || p.side === 'SELL' ? 'short' : p.side,
          qty: Number(p.qty ?? 0),
          entryPrice: Number(p.avgEntryPrice ?? p.entryPrice ?? 0),
          avgEntryPrice: Number(p.avgEntryPrice ?? p.entryPrice ?? 0),
          currentPrice: Number(p.currentPrice ?? 0),
          marketValue: Number(p.marketValue ?? (Number(p.qty ?? 0) * Number(p.currentPrice ?? 0))),
          unrealizedPnl: Number(p.unrealizedPnl ?? 0),
          unrealizedPnlPct: Number(p.unrealizedPnlPct ?? 0),
          sl: Number(p.stopLoss) || Number(p.sl) || undefined,
          tp: Number(p.takeProfit) || Number(p.tp) || undefined,
          stopLoss: Number(p.stopLoss) || undefined,
          takeProfit: Number(p.takeProfit) || undefined,
          exchange: 'alpaca',
          credentialId: p.credentialId || undefined,  // V189: For filtering by active account
          source: 'alpaca' as const,
        }))

        // FIX V115: Use mergePositions with source info so that empty responses
        // from Alpaca properly remove closed positions instead of preserving them.
        const currentPositions = get().positions
        const merged = mergePositions(currentPositions, positions, {
          source: 'alpaca',
          authoritativeEmpty: true,
        })

        set({
          positions: merged,
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
       * STORAGE CONFIG: User-scoped key with owner validation.
       *
       * V156 FIX: Previously used a STATIC key for ALL users, with _ownerUserId
       * validation. This had a brief window where User B could see User A's data
       * from localStorage rehydration before the owner check cleared it.
       *
       * Now using a SEMI-DYNAMIC key that includes userId when available.
       * During Zustand rehydration (page refresh), if auth store hasn't loaded,
       * we fall back to the static key and validate ownership via _ownerUserId.
       */
      name: getStorageKey(),
      storage: createJSONStorage(() => localStorage),
      // Only persist account data and positions (not loading/error states)
      // V189 CRITICAL FIX: activeCredentialId MUST be persisted!
      // Without it, every page refresh loses the user's active account choice,
      // and the dashboard falls back to paper trading. This was THE root cause
      // of the "dashboard still shows ورقي after 10+ activation attempts" bug.
      partialize: (state) => ({
        account: state.account,
        positions: state.positions,
        lastUpdate: state.lastUpdate,
        dataSource: state.dataSource,
        _cacheTimestamp: state._cacheTimestamp,
        _ownerUserId: state._ownerUserId,
        // V189: Persist activeCredentialId and exchangeBalances for account switching
        activeCredentialId: state.activeCredentialId,
        exchangeBalances: state.exchangeBalances,
      }),
      // Sync across tabs via storage events & force refresh stale data
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.warn('[PositionsStore] Rehydration failed:', error)
          }

          if (!state) return

          // ═══════════════════════════════════════════════════════════════
          // V148B FIX: Clear stale/incorrect margin from localStorage.
          // Old cached data had initialMargin = full notional (e.g., $19,548)
          // instead of leverage-aware margin (~$390). When rehydrating,
          // if initialMargin > equity, it's definitely the wrong value.
          // Reset it to 0 so the real-time update doesn't preserve it,
          // and fetchAccount() will set the correct value from the backend.
          // ═══════════════════════════════════════════════════════════════
          if (state.account) {
            const accEquity = Number(state.account.equity) || 0
            const accMargin = Number(state.account.initialMargin) || 0
            // V149 FIX: Extended guard — clear margin if it's unreasonable.
            // Previously only checked margin > equity (e.g., $20K margin on $10K equity).
            // But even margin > 80% of equity is suspicious for leveraged accounts
            // (forex at 50:1 means margin should be ~4% of notional, not 80% of equity).
            // If margin seems wrong, clear it so fetchAccount() will set the correct value.
            if (accMargin > accEquity && accEquity > 0) {
              console.warn(
                `[PositionsStore] V149: Clearing stale margin $${accMargin} > equity $${accEquity} — was full notional, not real margin`
              )
              state.account.initialMargin = 0
              ;(state.account as any)._backendMargin = 0
              ;(state.account as any)._marginVersion = 0
            } else if (accMargin > 0 && accEquity > 0 && accMargin > accEquity * 0.8) {
              // V149: If margin > 80% of equity, it's likely the wrong value.
              // Real margin for forex (50:1) should be ~2% of equity, and for
              // crypto (1:1) it could be up to ~50% if all equity is in one position.
              // 80%+ is almost certainly a full-notional value, not real margin.
              console.warn(
                `[PositionsStore] V149: Clearing suspicious margin $${accMargin} > 80% of equity $${accEquity} — likely full notional, not real margin`
              )
              state.account.initialMargin = 0
              ;(state.account as any)._backendMargin = 0
              ;(state.account as any)._marginVersion = 0
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // SECURITY: Validate that rehydrated data belongs to current user.
          // Since we use a STATIC localStorage key, we must check that
          // the stored data belongs to the current user. If not, clear it.
          // ═══════════════════════════════════════════════════════════════
          const currentUserId = getCurrentUserId()
          const storedOwner = state._ownerUserId

          if (storedOwner && currentUserId && storedOwner !== currentUserId) {
            console.warn('[PositionsStore] SECURITY: Data belongs to different user, clearing')
            state.clearUserData()
            // After clearing, fetch fresh data for the new user
            setTimeout(() => {
              state.fetchPositions()
              state.fetchAccount()
            }, 100)
            return
          }

          // ═══════════════════════════════════════════════════════════════
          // FIX: Keep rehydrated positions! They provide INSTANT display
          // while the API fetch runs in the background.
          //
          // Previous code nuked ALL positions on every rehydration,
          // causing a flash of empty positions on every page refresh.
          // Now: positions from localStorage are shown immediately,
          // then updated when the API response arrives.
          //
          // Stale detection: If positions are older than 5 minutes,
          // we still show them but mark them for priority refresh.
          // ═══════════════════════════════════════════════════════════════
          if (state.positions && state.positions.length > 0) {
            const cacheTimestamp = state._cacheTimestamp || 0
            const ageMs = Date.now() - cacheTimestamp
            const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

            if (ageMs > STALE_THRESHOLD_MS || cacheTimestamp === 0) {
              console.log(
                `[PositionsStore] Showing ${state.positions.length} cached position(s) (age: ${Math.round(ageMs / 1000)}s) while fetching fresh data...`
              )
            } else {
              console.log(
                `[PositionsStore] Preserving ${state.positions.length} fresh position(s) (age: ${Math.round(ageMs / 1000)}s)`
              )
            }
          }

          // Always fetch fresh data in the background to update stale positions.
          // The mergePositions() function will cleanly merge API data with
          // the rehydrated positions, keeping the most accurate data.
          state.fetchPositions()
          state.fetchAccount()
        }
      },
    }
  )
)
