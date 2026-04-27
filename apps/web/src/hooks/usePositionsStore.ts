import { create } from 'zustand'

interface Position {
  symbol: string
  rawSymbol: string
  side: string
  qty: number
  avgEntryPrice: number
  currentPrice:  number
  marketValue:   number
  unrealizedPnl: number
  unrealizedPnlPct: number
  sl?: number
  tp?: number
}

interface PositionsState {
  positions: Position[]
  account: any
  loading: boolean
  error: string | null
  lastUpdate: string | null
  setPositions: (positions: Position[]) => void
  setAccount: (account: any) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setLastUpdate: (lastUpdate: string | null) => void
  fetchPositions: () => Promise<void>
  fetchAccount: () => Promise<void>
  updatePositionPrice: (symbol: string, price: number) => void
}

// ── Auto-auth: ensure session cookie exists before Alpaca API calls ──
let authPromise: Promise<void> | null = null

async function ensureAuth(): Promise<void> {
  // NOTE: We do NOT check document.cookie.includes('roua_session=')
  // because roua_session is an httpOnly cookie — it's invisible to
  // JavaScript. Always call /api/auth/me to verify/create the session.
  if (authPromise) return authPromise

  authPromise = (async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (!data.authenticated) {
        // Auth failed — reset promise so we can retry on next call
        authPromise = null
      }
    } catch {
      // Auth init failed — reset promise so we can retry on next call
      authPromise = null
    }
  })()

  return authPromise
}

export const usePositionsStore = create<PositionsState>((set, get) => ({
  positions: [],
  account: null,
  loading: false,
  error: null,
  lastUpdate: null,
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
      const isLong = p.side === 'long' || p.side === 'LONG'

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
    try {
      // Ensure session cookie exists before making Alpaca API calls
      await ensureAuth()
      const res = await fetch('/api/alpaca/account')
      const j = await res.json()
      if (j.success && j.data) set({ account: j.data })
    } catch {}
  },
  fetchPositions: async () => {
    set({ loading: true, error: null })
    try {
      // Ensure session cookie exists before making Alpaca API calls
      await ensureAuth()
      const res = await fetch('/api/alpaca/positions')
      const j = await res.json()
      if (j.success && Array.isArray(j.data)) {
        set({
          positions: j.data,
          lastUpdate: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
}))
