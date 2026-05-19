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
    available: number
    currency: string
    error?: string
  }>
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
  /** SECURITY: Current userId that the store data belongs to */
  _ownerUserId: string | null
  /** Timestamp-based concurrency guard for fetchPositions */
  _lastFetchStart: number | null
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

    // Merge: Use incoming data but preserve real-time price if it's fresher
    // The real-time price from Binance WS is more accurate than the API price
    const hasLivePriceUpdate = existing.currentPrice > 0 &&
      Math.abs(existing.currentPrice - inc.currentPrice) > 0.0001 &&
      existing.source === 'nestjs' && inc.source === 'nestjs'

    result.push({
      ...inc,
      // Preserve the live price update from GlobalLogicEngine if it's more recent
      currentPrice: hasLivePriceUpdate ? existing.currentPrice : inc.currentPrice,
      unrealizedPnl: hasLivePriceUpdate ? existing.unrealizedPnl : inc.unrealizedPnl,
      unrealizedPnlPct: hasLivePriceUpdate ? existing.unrealizedPnlPct : inc.unrealizedPnlPct,
      marketValue: hasLivePriceUpdate ? existing.marketValue : inc.marketValue,
      // FIX: Preserve dbId from existing position if incoming doesn't have it.
      // When Alpaca data overwrites NestJS data in the merge, the incoming
      // position from Alpaca has no dbId (undefined), overwriting the existing
      // dbId from NestJS. This caused close buttons to fall through to Alpaca
      // (which returns 404 for DB-only positions like paper-trading/Binance Testnet).
      dbId: inc.dbId || existing.dbId || undefined,
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
  loading: false,
  error: null,
  lastUpdate: null,
  _cacheTimestamp: null,
  dataSource: null,
  /** Current userId that the store data belongs to */
  _ownerUserId: null as string | null,
  _lastFetchStart: null as number | null,
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
   * - Immediate fetch (positions + account)
   * - Delayed fetch after 2s (exchange settlement)
   * - Final fetch after 5s (catch slow exchanges)
   *
   * CRITICAL FIX: Each delayed wave resets `loading = false` before fetching
   * to bypass the concurrency guard in fetchPositions. Previously, if the
   * first wave took > 2s, the second wave was silently skipped because
   * `if (get().loading) return` blocked it.
   */
  refreshAfterTrade: () => {
    // Immediate fetch — show the new position/balance ASAP
    // FIX: Reset the dedup timestamp so this fetch isn't blocked
    set({ _lastFetchStart: 0 } as any)
    Promise.all([
      get().fetchPositions(),
      get().fetchAccount(),
    ]).catch((err) => {
      console.warn('[PositionsStore] refreshAfterTrade immediate failed:', err)
    })

    // Delayed fetch #1 — exchange settlement (2 seconds)
    setTimeout(() => {
      set({ _lastFetchStart: 0, loading: false } as any)
      Promise.all([
        get().fetchPositions(),
        get().fetchAccount(),
      ]).catch((err) => {
        console.warn('[PositionsStore] refreshAfterTrade wave 2 failed:', err)
      })
    }, 2000)

    // Delayed fetch #2 — slow exchanges (5 seconds)
    setTimeout(() => {
      set({ _lastFetchStart: 0, loading: false } as any)
      Promise.all([
        get().fetchPositions(),
        get().fetchAccount(),
      ]).catch((err) => {
        console.warn('[PositionsStore] refreshAfterTrade wave 3 failed:', err)
      })
    }, 5000)
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
    const currentPositions = get().positions
    let changed = false

    const positions = currentPositions.map((p) => {
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
      const positionsMarketValue = positions.reduce(
        (sum, p) => sum + Math.abs(Number(p.marketValue || p.qty * p.currentPrice || 0)),
        0,
      )
      const positionsUnrealizedPnl = positions.reduce(
        (sum, p) => sum + (p.unrealizedPnl || 0),
        0,
      )
      const cash = Number(currentAccount.cash) || 0
      const newEquity = cash + positionsUnrealizedPnl
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
      if (isRealExchange && isBackendMarginFresh && backendMargin > 0) {
        // TIER 1: Real exchange margin — AUTHORITATIVE
        // Exchange knows the user's actual leverage setting
        initialMargin = backendMargin
      } else if (clientMargin > 0) {
        // TIER 2: Client-side calculation (user-configured leverage for paper trading)
        initialMargin = clientMargin
      } else if (isBackendMarginFresh && backendMargin > 0) {
        // TIER 3: Fresh backend margin (paper trading backend calc)
        initialMargin = backendMargin
      } else if (currentMargin > 0) {
        // TIER 4: Preserve existing margin — don't reset to 0!
        initialMargin = currentMargin
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
    // هذا هو المصدر الرئيسي لأرصدة البورصات المرتبطة بالمستخدم
    try {
      const res = await fetch('/api/portfolio/credentials/balances')
      // V154 FIX: If session expired (401), STOP — don't fall through to $10,000 fallback
      if (checkAuthResponse(res)) return
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data && data.data.exchanges?.length > 0) {
          const { totalEquityUsd, totalAvailableUsd, totalUsedMargin, exchanges } = data.data
          // V162: Backend now provides these flags to prevent the shared balance bug
          const allRealExchangesFailed = data.data.allRealExchangesFailed === true
          const backendHasRealCredentials = data.data.hasRealCredentials === true

          const isTestnet = exchanges.some((e: any) => e.isTestnet)
          const hasDecryptionError = exchanges.some((e: any) => e.error)
          const hasRealCredentials = backendHasRealCredentials || exchanges.some(
            (e: any) => e.exchange !== 'paper-trading'
          )

          // ═══════════════════════════════════════════════════════════════
          // V162 CRITICAL FIX: Don't silently show paper balance as total.
          //
          // ROOT CAUSE of $12,342.85 shared balance bug:
          //   1. Binance balance ALWAYS fails from Railway (IP blocked / timeout)
          //   2. Backend returns: Binance=0(error) + paperEquity → total includes paper
          //   3. Frontend used to show total (which = paper only) → ALL users
          //      with failed Binance see the same paper trading balance
          //   4. Smart Executor creates identical positions for all users
          //      → same $10,000 base + same PnL = same $12,342.85 for everyone
          //
          // FIX: When ALL real exchanges fail for a user who HAS real credentials,
          // DON'T use paper trading balance as the displayed total.
          // Instead, show 0 with a clear error indicator.
          // Paper-only users (no real exchange) continue to see their paper balance.
          // ═══════════════════════════════════════════════════════════════
          const realExchangesSuccess = exchanges.filter(
            (e: any) => e.exchange !== 'paper-trading' && !e.error && e.equity > 0
          )
          const realExchangesFailed = exchanges.filter(
            (e: any) => e.exchange !== 'paper-trading' && (e.error || e.equity <= 0)
          )
          const paperExchange = exchanges.find(
            (e: any) => e.exchange === 'paper-trading'
          )

          let adjustedTotalEquityUsd = totalEquityUsd
          let adjustedTotalAvailableUsd = totalAvailableUsd
          let adjustedTotalUsedMargin = totalUsedMargin
          // V162: Track whether we're showing an error state instead of real balance
          let exchangeUnavailable = false

          // V162: Use the backend's allRealExchangesFailed flag when available,
          // otherwise compute it from the exchange results
          const allRealFailed = allRealExchangesFailed || 
            (hasRealCredentials && realExchangesFailed.length > 0 && realExchangesSuccess.length === 0)

          if (allRealFailed) {
            // V170.2 FIX: Real exchanges failed, but user still needs to see their balance.
            //
            // OLD V162 BEHAVIOR (too aggressive): Set everything to $0 → user sees
            // empty dashboard with no explanation. This was meant to prevent the
            // "shared balance" bug but the root cause is now fixed (V136: Smart Executor
            // no longer auto-enabled for all users, each user has own paper balance).
            //
            // NEW BEHAVIOR: Show the paper-trading balance as a FALLBACK, but set
            // exchangeUnavailable=true so the UI can show a clear warning:
            //   "⚠️ حساب Binance غير متاح — الرصيد المعروض هو تداول تجريبي"
            // This way the user sees their balance AND understands why it might differ
            // from their real exchange account.
            console.warn(
              `[PositionsStore] ALL ${realExchangesFailed.length} real exchange balance(s) FAILED. ` +
              `Falling back to paper-trading balance with warning. ` +
              `Failed: [${realExchangesFailed.map((e: any) => e.exchange).join(', ')}]`
            )
            exchangeUnavailable = true
            // V170.2: Use paper-trading balance as fallback (user's own, not shared)
            if (paperExchange && paperExchange.equity > 0) {
              adjustedTotalEquityUsd = paperExchange.equity
              adjustedTotalAvailableUsd = paperExchange.available || 0
              adjustedTotalUsedMargin = paperExchange.usedMargin || 0
            }
            // If no paper balance available either, leave as backend totals (may be 0)
          } else if (realExchangesSuccess.length > 0) {
            // At least one real exchange succeeded — backend totals exclude
            // paper trading when real credentials exist.
            adjustedTotalEquityUsd = totalEquityUsd
            adjustedTotalAvailableUsd = totalAvailableUsd
            adjustedTotalUsedMargin = totalUsedMargin
          } else {
            // No real exchange credentials — paper trading only.
            // This is the user's actual balance, so show it.
            adjustedTotalEquityUsd = paperExchange?.equity || totalEquityUsd
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
          const currentPositions = get().positions
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

          if (hasOnlyPaperExchanges && adjustedTotalEquityUsd <= 0) {
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
            // V147 FIX: Backend now returns equity = balance + unrealizedPnL for paper-trading.
            // Do NOT add positionsUnrealizedPnl again — it would double-count the P&L!
            // For paper: effectiveEquity = totalEquityUsd (already includes PnL from backend)
            // effectiveCash = raw balance (equity - PnL)
            effectiveEquity = adjustedTotalEquityUsd  // Already = balance + PnL
            effectiveCash = adjustedTotalEquityUsd - positionsUnrealizedPnl  // Raw balance without PnL
          } else if (exchangeUnavailable) {
            // V170.2: Real exchange failed, but we have paper balance as fallback.
            // exchangeUnavailable=true tells the UI to show a warning banner.
            // Use adjustedTotalEquityUsd (which now contains paper balance from V170.2 fix).
            effectiveEquity = adjustedTotalEquityUsd > 0 ? adjustedTotalEquityUsd + positionsUnrealizedPnl : 0
            effectiveCash = adjustedTotalEquityUsd > 0 ? adjustedTotalEquityUsd - positionsUnrealizedPnl : 0
          } else {
            // V140B: For real accounts, equity = totalBalance + unrealizedPnl
            // (totalEquityUsd from real exchanges is wallet balance, NOT including PnL)
            effectiveEquity = adjustedTotalEquityUsd + positionsUnrealizedPnl
            effectiveCash = adjustedTotalEquityUsd  // Total wallet balance (free + used)
          }

          const account = {
            equity: effectiveEquity,
            cash: effectiveCash,
            buyingPower: Math.max(0, effectiveEquity - usedMargin),
            portfolioValue: effectiveEquity,
            longMarketValue: positionsMarketValue > 0 ? positionsMarketValue : (adjustedTotalEquityUsd - adjustedTotalAvailableUsd),
            shortMarketValue: 0,
            initialMargin: usedMargin,
            maintenanceMargin: 0,
            unrealizedPnl: positionsUnrealizedPnl,
            unrealizedPnlPct: adjustedTotalEquityUsd > 0 ? (positionsUnrealizedPnl / adjustedTotalEquityUsd) * 100 : 0,
            isPaperTrading: isTestnet,
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
            // V153: Mark whether margin came from real exchange API
            // If true, updatePositionPrice() should trust it over client-side calc
            isRealExchangeMargin: hasRealExchanges && realExchangeMargin > 0,
            // V162: Flag for UI to show "Exchange unavailable" indicator
            // instead of silently showing wrong/paper balance
            exchangeUnavailable,
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
      const staleAccount = get().account
      if (staleAccount?.isPaperTrading === true || staleAccount?.exchangeUnavailable === true) {
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
          // V152 FIX: cash should NOT subtract totalExposure (full notional).
          // totalExposure = qty × price which is the full position value, NOT margin.
          // Subtracting it made cash negative, which broke equity calculations.
          // For paper trading: cash = the raw balance (equity - PnL)
          const rawBalance = (summary.totalBalance || 0) - (summary.unrealizedPnL || 0)
          const account = {
            equity: summary.totalBalance || 0,
            cash: rawBalance > 0 ? rawBalance : (summary.totalBalance || 0),
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
      const staleAccount = get().account
      if (staleAccount?.isPaperTrading === true || staleAccount?.exchangeUnavailable === true) {
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
      const res = await fetch('/api/trading/positions')
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
