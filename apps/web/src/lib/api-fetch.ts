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
  try {
    const res = await fetch('/api/alpaca/positions')
    const data = await res.json()

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

    // Alpaca API أيضًا فشل
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
            unrealizedPnl: raw.unrealizedPnl ?? 0,
            realizedPnl: raw.realizedPnl ?? 0,
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
 * - يحاول NestJS API أولاً (لديه منطق إغلاق متقدم)
 * - عند فشل 401، يستخدم Alpaca API مباشرة
 */
export async function closePositionUnified(
  positionId: string,
  quantity?: number,
): Promise<{ success: boolean; error?: string; source: 'nestjs' | 'alpaca' }> {
  // Ensure auth cookie exists before making API calls
  await ensureAuth()

  // المحاولة الأولى: NestJS API
  try {
    const body: Record<string, unknown> = { positionId }
    if (quantity) body.quantity = quantity

    const res = await fetch('/api/trading/positions/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      return { success: true, source: 'nestjs' }
    }

    if (res.status !== 401 && res.status !== 403) {
      const data = await res.json().catch(() => ({}))
      // If NestJS says position is not open, it might still be open on the
      // exchange — fall through to Alpaca fallback instead of hard-failing.
      const isNotOpenError = (data.message || data.error || '').includes('ليس مفتوحاً')
        || (data.message || data.error || '').toLowerCase().includes('not open')
      if (!isNotOpenError) {
        return { success: false, error: data.error || data.message || 'فشل الإغلاق', source: 'nestjs' }
      }
      // Fall through to Alpaca fallback for "not open" errors
    }
  } catch {
    // NestJS غير متاح
  }

  // المحاولة الثانية: Alpaca API مباشرة (positionId = rawSymbol)
  try {
    const res = await fetch(`/api/alpaca/positions/${encodeURIComponent(positionId)}`, {
      method: 'DELETE',
    })
    const data = await res.json()

    if (data.success) {
      return { success: true, source: 'alpaca' }
    }

    return { success: false, error: data.error || 'فشل إغلاق المركز عبر Alpaca', source: 'alpaca' }
  } catch (e: any) {
    return { success: false, error: `خطأ في الاتصال: ${e.message || 'غير معروف'}`, source: 'alpaca' }
  }
}
