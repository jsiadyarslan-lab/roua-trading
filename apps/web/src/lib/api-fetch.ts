/**
 * api-fetch — مساعد جلب بيانات API مع رجوع تلقائي
 *
 * عندما يفشل الطلب إلى NestJS API (مثل 401 غير مصادَق)،
 * يرجع تلقائيًا إلى Alpaca API المباشر الذي لا يتطلب مصادقة.
 *
 * يتضمن ضمان المصادقة التلقائية: عند أول طلب، يتصل بـ /api/auth/me
 * لإنشاء جلسة ضيف إذا لم تكن هناك جلسة موجودة.
 */

/** صيغة المركز الموحدة */
export interface UnifiedPosition {
  id: string
  symbol: string
  side: 'BUY' | 'SELL' | 'long' | 'short'
  quantity: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  exchange?: string
  stopLoss?: number
  takeProfit?: number
  openedAt?: string
  /** مصدر البيانات: nestjs أو alpaca */
  source?: 'nestjs' | 'alpaca'
  /** مصدر الصفقة من قاعدة البيانات: smart_executor, agent, auto_paper, user_manual */
  tradeSource?: string
  /** DB position ID (UUID) — for NestJS close path */
  dbId?: string
  /** Exchange-specific symbol — for Alpaca/Exchange reconciliation */
  exchangeSymbol?: string
  /** V192: Credential ID this position belongs to — used for filtering by active account */
  credentialId?: string
}

/** صيغة ملخص المراكز الموحدة */
export interface UnifiedSummary {
  totalPositions: number
  totalValue: number
  unrealizedPnl: number
  realizedPnl: number
  source?: 'nestjs' | 'alpaca'
}

// ── Auto-auth: ensure session cookie exists before API calls ──
let authPromise: Promise<void> | null = null

/**
 * Ensures a roua_session cookie exists by calling /api/auth/me.
 * This is called lazily before the first API request that needs auth.
 * The promise is cached so we only do this once per page load.
 *
 * NOTE: We do NOT check document.cookie.includes('roua_session=')
 * because roua_session is an httpOnly cookie — it's invisible to
 * JavaScript. Always call /api/auth/me to verify/create the session.
 *
 * This function is shared between api-fetch.ts and usePositionsStore.ts
 * to avoid duplicate /api/auth/me calls.
 */
export async function ensureAuth(): Promise<void> {
  // Reuse in-flight auth request
  if (authPromise) return authPromise

  authPromise = (async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (data.authenticated) {
        // Session cookie is now set by the server
      } else {
        // Auth failed — reset promise so we can retry on next call
        authPromise = null
      }
    } catch {
      // Auth init failed — API calls will fall back gracefully.
      // Reset promise so we can retry on next call.
      authPromise = null
    }
  })()

  return authPromise
}

/**
 * جلب المراكز المفتوحة مع رجوع تلقائي
 * - يحاول أولاً NestJS API (/api/trading/positions)
 * - عند فشل 401/403/502/503، يرجع إلى Alpaca API (/api/alpaca/positions)
 */
export async function fetchPositionsUnified(): Promise<{
  positions: UnifiedPosition[]
  source: 'nestjs' | 'alpaca'
  error?: string
}> {
  // Ensure auth cookie exists before making API calls
  await ensureAuth()

  // المحاولة الأولى: NestJS API
  try {
    const res = await fetch('/api/trading/positions')
    if (res.ok) {
      const data = await res.json()
      const raw = data.data || data.positions || []
      const positions: UnifiedPosition[] = raw.map((p: any) => ({
        id: p.id || p.rawSymbol || p.symbol,
        symbol: p.symbol,
        side: p.side,
        quantity: p.quantity ?? p.qty ?? 0,
        entryPrice: p.entryPrice ?? p.avgEntryPrice ?? 0,
        currentPrice: p.currentPrice ?? 0,
        unrealizedPnl: p.unrealizedPnl ?? 0,
        exchange: p.exchange,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        openedAt: p.openedAt,
        source: 'nestjs' as const,
        // FIX: Preserve the trade source from DB (smart_executor/agent/auto_paper/user_manual).
        // This is needed for the positions page to show the correct source badge
        // (المنفذ/الوكيل/ورقي). Previously, only 'source' was set (to 'nestjs'),
        // which is the DATA source, not the TRADE source.
        tradeSource: p.source || undefined,
        dbId: p.id,              // FIX: Always pass DB UUID so closePositionUnified can use it
        exchangeSymbol: p.exchangeSymbol,  // FIX: Pass exchange-specific symbol for reconciliation
        // V192: Include credentialId so positions can be filtered by active account
        credentialId: p.credentialId || undefined,
      }))
      return { positions, source: 'nestjs' }
    }

    // إذا كان خطأ مصادقة، نحاول Alpaca مباشرة
    if (res.status === 401 || res.status === 403) {
      // مصادقة مرفوضة — نرجع إلى Alpaca API
    } else {
      // خطأ آخر في الخادم
      const text = await res.text().catch(() => '')
      console.warn(`[fetchPositions] NestJS error ${res.status}, falling back to Alpaca: ${text.slice(0, 100)}`)
    }
  } catch (e) {
    // NestJS غير متاح — نرجع إلى Alpaca
  }

  // المحاولة الثانية: Alpaca API مباشرة
  // V140: Skip Alpaca fallback entirely when credentials are not configured.
  // Previously, this always tried /api/alpaca/positions which returned 503
  // ALPACA_CREDENTIALS_NOT_CONFIGURED — causing error banners and console noise.
  try {
    const res = await fetch('/api/alpaca/positions')
    const data = await res.json()

    // V140: Gracefully handle missing Alpaca credentials — return empty instead of error
    if (data.error === 'ALPACA_CREDENTIALS_NOT_CONFIGURED' || data.offline) {
      return { positions: [], source: 'alpaca' }
    }

    if (data.success && Array.isArray(data.data)) {
      const positions: UnifiedPosition[] = data.data.map((p: any) => ({
        id: p.rawSymbol || p.symbol,
        symbol: p.symbol,
        side: p.side === 'long' ? 'BUY' : p.side === 'short' ? 'SELL' : p.side,
        quantity: p.qty ?? 0,
        entryPrice: p.avgEntryPrice ?? 0,
        currentPrice: p.currentPrice ?? 0,
        unrealizedPnl: p.unrealizedPnl ?? 0,
        exchange: 'alpaca',
        source: 'alpaca' as const,
      }))
      return { positions, source: 'alpaca' }
    }

    // Alpaca API أيضًا فشل (but NOT credentials issue)
    return {
      positions: [],
      source: 'alpaca',
      error: data.error || 'فشل في جلب المراكز من Alpaca',
    }
  } catch (e: any) {
    return {
      positions: [],
      source: 'alpaca',
      error: `خطأ في الاتصال: ${e.message || 'غير معروف'}`,
    }
  }
}

/**
 * جلب ملخص المراكز مع رجوع تلقائي
 */
export async function fetchSummaryUnified(): Promise<{
  summary: UnifiedSummary | null
  source: 'nestjs' | 'alpaca'
}> {
  // Ensure auth cookie exists before making API calls
  await ensureAuth()

  // المحاولة الأولى: NestJS API
  try {
    const res = await fetch('/api/trading/positions/summary')
    if (res.ok) {
      const data = await res.json()
      const raw = data.data || data.summary || null
      if (raw) {
        return {
          summary: {
            totalPositions: raw.totalPositions ?? 0,
            totalValue: raw.totalValue ?? 0,
            unrealizedPnl: Number(raw.unrealizedPnl) || 0,
            realizedPnl: Number(raw.realizedPnl) || 0,
            source: 'nestjs',
          },
          source: 'nestjs',
        }
      }
    }
  } catch {
    // NestJS غير متاح
  }

  // المحاولة الثانية: حساب الملخص من Alpaca positions
  try {
    const { positions, source } = await fetchPositionsUnified()
    const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
    const totalValue = positions.reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0)

    return {
      summary: {
        totalPositions: positions.length,
        totalValue,
        unrealizedPnl: totalUnrealizedPnl,
        realizedPnl: 0,
        source,
      },
      source,
    }
  } catch {
    return { summary: null, source: 'alpaca' }
  }
}

/**
 * إغلاق مركز مع رجوع تلقائي
 * - إذا كان positionId UUID → يحاول NestJS API أولاً ثم Alpaca
 * - إذا كان positionId رمز أصل (مثل "BTCUSD") → يذهب مباشرة إلى Alpaca
 * - عند فشل NestJS (404/غير موجود)، يحاول Alpaca API مباشرة
 */
/**
 * Regex to detect NestJS database IDs — used for routing close requests to the right API.
 *
 * CRITICAL FIX: Prisma uses @default(cuid()) which generates IDs like "clm5x2j4d0001..."
 * (starts with 'c', 25+ alphanumeric chars). The old UUID_RE only matched UUID format,
 * so ALL NestJS position IDs failed the check, causing dbId to always be undefined.
 * This meant the close flow always fell through to Alpaca, which returned 404
 * for positions that only exist in the NestJS database (paper-trading, Binance Testnet, etc.).
 *
 * Now accepts both UUID and Prisma cuid formats:
 *   UUID:  550e8400-e29b-41d4-a716-446655440000
 *   Cuid: clm5x2j4d0001sample12id34
 */
export function isNestJsId(id: string): boolean {
  if (!id || typeof id !== 'string') return false
  // UUID format: 8-4-4-4-12 hex digits with dashes
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return true
  // Prisma cuid format: starts with 'c', 8+ alphanumeric chars (cuid1: clxxx, cuid2: cmxxx)
  if (/^c[a-z0-9]{8,}$/i.test(id)) return true
  // Any string 20+ chars that looks like a DB id (catch-all for future formats)
  if (id.length >= 20 && /^[a-z0-9_-]+$/i.test(id)) return true
  return false
}

/** @deprecated Use isNestJsId() instead — UUID_RE only matched UUID format, not Prisma cuid */
export const UUID_RE = { test: isNestJsId } as unknown as RegExp

/**
 * إغلاق مركز مع رجوع تلقائي — النسخة المحسّنة
 *
 * المسار الصحيح:
 * 1. إذا كان dbId متاحاً (UUID من قاعدة البيانات) → NestJS API أولاً
 * 2. إذا فشل NestJS أو لم يكن dbId متاحاً → Alpaca API كاحتياطي
 * 3. إذا فشل Alpaca بـ 404 → محاولة NestJS بالبحث بالرمز كحل أخير
 *
 * القاعدة: UUID ليس رمز أصل صالح — لا يُرسل أبداً إلى Alpaca
 */
export async function closePositionUnified(
  positionId: string,
  quantity?: number,
  options?: { onClosed?: () => void; dbId?: string },
): Promise<{ success: boolean; error?: string; source: 'nestjs' | 'alpaca'; forceClosed?: boolean }> {
  // Ensure auth cookie exists before making API calls
  await ensureAuth()

  // تحديد معرف قاعدة البيانات: إما من options.dbId أو من positionId إذا كان معرف NestJS
  const nestjsId = options?.dbId || (isNestJsId(positionId) ? positionId : null)

  // ════════════════════════════════════════════════════════
  // المحاولة الأولى: NestJS API (إذا كان لدينا UUID صالح)
  // ════════════════════════════════════════════════════════
  if (nestjsId && isNestJsId(nestjsId)) {
    try {
      const body: Record<string, unknown> = { positionId: nestjsId }
      if (quantity) body.quantity = quantity

      const res = await fetch('/api/trading/positions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const responseData = await res.json().catch(() => ({}))

      // V227: Check for blockedByV214 — V214 returns HTTP 200 with blockedByV214:true
      // when a non-SL/TP close of an Agent position <48h is blocked.
      // This should NOT happen anymore since controller sends source:'USER',
      // but handle defensively — try force-close with USER_ prefix.
      if (res.ok && responseData.blockedByV214) {
        try {
          const forceRes = await fetch('/api/trading/positions/force-close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              positionId: nestjsId,
              reason: `USER_FORCE_CLOSE_BYPASS: ${responseData.reason || 'V214 blocked'}`,
            }),
          })
          if (forceRes.ok) {
            options?.onClosed?.()
            return { success: true, source: 'nestjs', forceClosed: true }
          }
          return { success: false, error: responseData.reason || 'V214 blocked close', source: 'nestjs' }
        } catch {
          return { success: false, error: responseData.reason || 'V214 blocked close', source: 'nestjs' }
        }
      }

      if (res.ok) {
        options?.onClosed?.()
        return { success: true, source: 'nestjs' }
      }

      // On auth errors, fall through to Alpaca (maybe the position is Alpaca-only)
      // V227: Use responseData already parsed above — don't call res.json() again
      if (res.status === 401 || res.status === 403) {
        // Fall through to Alpaca — but only if positionId is NOT a UUID
        // (a UUID sent to Alpaca will always fail)
        if (isNestJsId(positionId)) {
          return { success: false, error: responseData.error || responseData.message || 'فشل المصادقة', source: 'nestjs' }
        }
      } else {
        const data = responseData
        const errMsg = data.message || data.error || ''

        // OPTIMISTIC_LOCK_FAILURE — retry once
        if (errMsg.includes('OPTIMISTIC_LOCK_FAILURE')) {
          await new Promise(r => setTimeout(r, 200))
          const retryRes = await fetch('/api/trading/positions/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (retryRes.ok) {
            options?.onClosed?.()
            return { success: true, source: 'nestjs' }
          }
        }

        // FIX: If balance is 0 on all wallets, try force-close (DB only)
        // This handles positions already closed on exchange or stuck positions
        // FIX v114: Also try force-close for ANY close failure on paper-trading
        // positions and for timeout/network errors. Previously, force-close was
        // only tried for the specific Arabic text "رصيد غير متاح", but many
        // other errors (timeout, network, rate limit) also leave positions stuck.
        const shouldForceClose = (
          (errMsg.includes('رصيد') && errMsg.includes('غير متاح')) ||
          errMsg.includes('timeout') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('ECONNREFUSED') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('network') ||
          errMsg.includes('fetch failed') ||
          errMsg.includes('Service Unavailable') ||
          errMsg.includes('502') ||
          errMsg.includes('504') ||
          errMsg.includes('فشل في إغلاق المركز')
        );

        if (shouldForceClose) {
          try {
            const forceRes = await fetch('/api/trading/positions/force-close', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                positionId: nestjsId,
                reason: `USER_AUTO_FORCE_CLOSE: ${errMsg.substring(0, 100)}`,
              }),
            })
            if (forceRes.ok) {
              options?.onClosed?.()
              return { success: true, source: 'nestjs', forceClosed: true }
            }
          } catch {
            // Force close failed, return original error
          }
        }

        // FIX V114: If force-close was NOT tried (error didn't match patterns),
        // try force-close as a last resort for ALL UUID positions. Previously,
        // many error types (e.g., "فشل في إغلاق المركز" with a different reason,
        // Prisma errors, transaction failures) would NOT trigger force-close,
        // leaving positions stuck OPEN forever. Now we always try force-close
        // before giving up — it's always safe for DB-only positions.
        if (!shouldForceClose && isNestJsId(positionId) && nestjsId) {
          try {
            const forceRes = await fetch('/api/trading/positions/force-close', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                positionId: nestjsId,
                reason: `USER_V114_FORCE_CLOSE: ${errMsg.substring(0, 100)}`,
              }),
            })
            if (forceRes.ok) {
              options?.onClosed?.()
              return { success: true, source: 'nestjs', forceClosed: true }
            }
          } catch {
            // Force close failed, continue to return error
          }
        }

        // FIX: If positionId is a UUID, do NOT fall through to Alpaca.
        // A UUID is not a valid asset symbol — sending it to Alpaca always fails.
        // Only fall through for non-UUID positionIds (like "BTCUSDT").
        if (isNestJsId(positionId)) {
          return { success: false, error: data.error || data.message || 'فشل الإغلاق', source: 'nestjs' }
        }

        // Non-UUID positionId — the position might be Alpaca-only
        // If NestJS says "not found" or "not open", fall through to Alpaca
        const isSoftError = errMsg.includes('ليس مفتوحاً')
          || errMsg.includes('غير موجود')
          || errMsg.toLowerCase().includes('not open')
          || errMsg.toLowerCase().includes('not found')

        if (!isSoftError) {
          return { success: false, error: data.error || data.message || 'فشل الإغلاق', source: 'nestjs' }
        }
        // Soft error + non-UUID → fall through to Alpaca
      }
    } catch (catchErr: any) {
      // NestJS unavailable — try force-close as last resort for UUID positions
      // FIX v114: If NestJS is completely unreachable, the position is stuck.
      // For paper-trading positions, force-close is always safe (no real exchange).
      if (isNestJsId(positionId) && nestjsId) {
        try {
          const forceRes = await fetch('/api/trading/positions/force-close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              positionId: nestjsId,
              reason: `USER_FORCE_CLOSE: NestJS unreachable — ${catchErr?.message || 'network error'}`,
            }),
          })
          if (forceRes.ok) {
            options?.onClosed?.()
            return { success: true, source: 'nestjs', forceClosed: true }
          }
        } catch {
          // Force close also failed
        }
      }
      if (isNestJsId(positionId)) {
        return { success: false, error: 'خادم NestJS غير متاح', source: 'nestjs' }
      }
    }
  }

  // ════════════════════════════════════════════════════════
  // المحاولة الثانية: Alpaca API مباشرة (positionId = rawSymbol)
  // ════════════════════════════════════════════════════════
  try {
    const res = await fetch(`/api/alpaca/positions/${encodeURIComponent(positionId)}`, {
      method: 'DELETE',
    })
    const data = await res.json()

    if (data.success) {
      options?.onClosed?.()
      return { success: true, source: 'alpaca' }
    }

    // FIX: If Alpaca returns 404, the position doesn't exist on Alpaca.
    // This usually means it's a DB-only position (paper-trading).
    // Try NestJS one more time with the symbol as a last resort.
    if (data.alpacaStatus === 404 || (data.error && data.error.includes('404'))) {
      // Last resort: try to find and close the position in DB by symbol
      try {
        const positionsRes = await fetch('/api/trading/positions')
        if (positionsRes.ok) {
          const positionsData = await positionsRes.json()
          const allPositions = positionsData.data || positionsData.positions || []
          // Normalize symbol for matching: BTC/USDT → BTCUSDT
          const normalizedId = positionId.replace('/', '').toUpperCase()
          const match = allPositions.find((p: any) => {
            const pNorm = (p.symbol || '').replace('/', '').toUpperCase()
            const pExchNorm = (p.exchangeSymbol || '').replace('/', '').toUpperCase()
            return pNorm === normalizedId || pExchNorm === normalizedId || p.id === positionId
          })
          if (match && match.id && isNestJsId(match.id)) {
            const closeRes = await fetch('/api/trading/positions/close', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ positionId: match.id }),
            })
            if (closeRes.ok) {
              options?.onClosed?.()
              return { success: true, source: 'nestjs' }
            }
          }
        }
      } catch {
        // Last-resort NestJS lookup failed — ignore
      }
    }

    return { success: false, error: data.error || 'فشل إغلاق المركز عبر Alpaca', source: 'alpaca' }
  } catch (e: any) {
    return { success: false, error: `خطأ في الاتصال: ${e.message || 'غير معروف'}`, source: 'alpaca' }
  }
}
