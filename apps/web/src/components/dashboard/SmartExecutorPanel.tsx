'use client'

import { useState, useEffect, useCallback } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { getPnlColor } from '@/lib/unified-tokens'

const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  card: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  primary: '#0A84FF',
  accent: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  amber: '#FFB800',
  purple: '#B388FF',
  cyan: '#00D4FF',
  green: '#00FFA3',
  red: '#FF4757',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#8B92A8',
}

interface ExecutorStatus {
  isRunning: boolean
  startedAt: string | null
  totalExecutions: number
  todayExecutions: number
  todayPnL: number
  openPositions: number
  lastCheckAt: string | null
  dailyLossLimitReached: boolean
  lastError: string | null
  activeBriefs: number
}

interface UserExecutorState {
  enabled: boolean
  dailyPnL: number
  dailyTrades: number
  dailyResetAt: string
  lastTradeAt: string | null
  consecutiveLosses: number
  maxOpenPositions: number
  riskPerTradePercent: number
  credentialId?: string
  isPaperTrading: boolean
  routingMode?: 'auto' | 'paper-only'  // V125: auto = route per trade to best credential
}

/**
 * Is this position a phantom trade from degraded/fallback data?
 * Phantom trades have tiny trade values (qty * entryPrice < $1)
 * or near-zero entry prices that indicate fake data.
 */
function isPhantomTrade(pos: any): boolean {
  const entryPrice = Number(pos.entryPrice ?? pos.price ?? pos.openPrice ?? 0)
  const qty = Number(pos.quantity ?? pos.qty ?? pos.size ?? 0)
  const tradeValue = Math.abs(qty * entryPrice)
  // A real position should have trade value >= $1
  // Phantom trades from degraded data show values like $0.00-$0.04
  return entryPrice <= 0 || tradeValue < 1
}

export function SmartExecutorPanel() {
  const [status, setStatus] = useState<ExecutorStatus | null>(null)
  const [userState, setUserState] = useState<UserExecutorState | null>(null)
  const [positions, setPositions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)
  const [exchangeCredentials, setExchangeCredentials] = useState<any[]>([])
  const [riskWarningAcknowledged, setRiskWarningAcknowledged] = useState(false)
  const [acknowledgedLoading, setAcknowledgedLoading] = useState(false)
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | undefined>(undefined)

  const [backendOffline, setBackendOffline] = useState(false)
  const [currentMonitoredSymbol, setCurrentMonitoredSymbol] = useState('BTC/USDT')
  const MONITORED_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'EUR/USD', 'XAU/USD', 'AAPL']

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-executor/status')
      const data = await res.json()
      if (data.success) {
        setStatus(data.data)
        setBackendOffline(false)
      } else if (data.offline || res.status === 502) {
        setBackendOffline(true)
      }
    } catch {
      setBackendOffline(true)
    }
  }, [])

  const fetchUserState = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-executor/user/status')
      const data = await res.json()
      if (data.success) {
        setUserState(data.data.user)
        if (data.data.global) setStatus(data.data.global)
        setBackendOffline(false)
      } else if (data.offline || res.status === 502) {
        setBackendOffline(true)
      }
    } catch {
      setBackendOffline(true)
    }
  }, [])

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-executor/positions')
      const data = await res.json()
      if (data.success) {
        // ═══════════════════════════════════════════════════
        // CLIENT-SIDE PHANTOM FILTER: Double-check that no
        // phantom trades slip through. The backend also filters,
        // but this is a safety net.
        // ═══════════════════════════════════════════════════
        const realPositions = (data.data || []).filter((pos: any) => !isPhantomTrade(pos))
        setPositions(realPositions)
        setBackendOffline(false)
      } else if (data.offline || res.status === 502) {
        setBackendOffline(true)
      }
    } catch {
      setBackendOffline(true)
    }
  }, [])

  // ── SUSTAINABLE FIX: Load riskWarningAcknowledged from user settings (DB) ──
  // Previously used localStorage (session-only, not synced across devices).
  // Now: read from /api/settings which persists to the Setting table.
  // This is the same source of truth the backend reads via _loadUserRiskSettings().
  const loadRiskAcknowledged = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        if (data.settings?.riskWarningAcknowledged === 'true' || data.settings?.riskWarningAcknowledged === true) {
          setRiskWarningAcknowledged(true)
        }
      }
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    fetchUserState()
    fetchPositions()
    fetchExchangeCredentials()
    loadRiskAcknowledged()
  }, [fetchUserState, fetchPositions, loadRiskAcknowledged])

  // FIX V118: Fetch user's exchange credentials to determine trading mode.
  // If user has a valid real exchange credential (Binance, etc.), they should
  // be able to trade on it — not forced into paper trading.
  const fetchExchangeCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          // Filter to real exchanges only (not paper-trading)
          const realCredentials = data.data.filter((c: any) => c.exchange !== 'paper-trading' && c.isValid)
          setExchangeCredentials(realCredentials)
        }
      }
    } catch { /* non-critical */ }
  }, [])
  // Poll every 10s — pauses when tab hidden
  useVisibleInterval(() => { fetchUserState(); fetchPositions() }, 10000)

  // Symbol Monitoring Animation (Visual Only) — pauses when tab hidden
  useVisibleInterval(() => {
    setCurrentMonitoredSymbol(prev => {
      const idx = MONITORED_SYMBOLS.indexOf(prev)
      return MONITORED_SYMBOLS[(idx + 1) % MONITORED_SYMBOLS.length]
    })
  }, 4000)

  // FIX: Removed auto-recovery based on global isRunning flag.
  // Previously, if the global isRunning was true but userState was null,
  // it would auto-enable. But isRunning is GLOBAL — it could be true
  // because ANOTHER user started it, not this user.
  // Each user must manually click "تفعيل" to enable their executor.

  // NOTE: Auto-enable removed intentionally.
  // Every user MUST manually click "تفعيل" to enable paper trading.
  // Auto-enabling caused phantom trades across all user sessions.

  // ═══════════════════════════════════════════════════
  // ONE-TIME PHANTOM PURGE: On first load, request the
  // backend to delete all phantom positions from the
  // database. This cleans up old phantom trades that
  // were created before the data quality gate fix.
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    const purgePhantoms = async () => {
      try {
        await fetch('/api/smart-executor/purge-phantoms', { method: 'POST' })
      } catch { /* Silent — best effort cleanup */ }
    }
    purgePhantoms()
  }, [])

  // ═══════════════════════════════════════════════════
  // LOCALSTORAGE CLEANUP: Remove all paper trades from
  // localStorage that were created from phantom data.
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('roua-paper-trades')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => {
        try {
          const raw = localStorage.getItem(key)
          if (!raw) return
          const parsed = JSON.parse(raw)
          const trades = parsed?.state?.trades || []
          const validTrades = trades.filter((trade: any) => {
            const entryPrice = Number(trade.entryPrice || 0)
            const qty = Number(trade.qty || 0)
            const tradeValue = Math.abs(qty * entryPrice)
            return entryPrice > 0 && tradeValue >= 1
          })
          if (validTrades.length !== trades.length) {
            parsed.state.trades = validTrades
            localStorage.setItem(key, JSON.stringify(parsed))
            console.warn(`[SmartExecutor] Cleaned ${trades.length - validTrades.length} phantom trades from localStorage`)
          }
        } catch { /* Invalid JSON — skip */ }
      })
    } catch { /* localStorage unavailable */ }
  }, [])

  // FIX: Removed global startExecutor/stopExecutor functions.
  // These called /api/smart-executor/start and /stop which are GLOBAL
  // operations — any user clicking "stop" would kill the executor
  // for ALL users. Now only per-user enable/disable is available.

  // ═══════════════════════════════════════════════════════════════
  // V125 SUSTAINABLE ARCHITECTURE: Multi-account auto-routing.
  //
  // No more "paper vs real" binary choice. ONE click to enable
  // the executor, and it automatically routes each trade to the
  // best available credential:
  //   - BTC/USDT → Binance (real or testnet)
  //   - AAPL → Alpaca
  //   - EUR/USD → paper (no forex exchange connected)
  //
  // The user can still force paper-only mode if they want.
  // ═══════════════════════════════════════════════════════════════
  const enableUser = async (routingMode: 'auto' | 'paper-only' = 'auto', credentialId?: string) => {
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/smart-executor/user/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routingMode,
          credentialId,
          // Backend reads risk settings from Setting table — no hardcoded values
        }),
      })
      await fetchUserState()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const disableUser = async () => {
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/smart-executor/user/disable', { method: 'POST' })
      await fetchUserState()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // FIX: Use per-user state as the primary status indicator instead of global isRunning.
  // isRunning was a GLOBAL flag — it showed the same status for all users.
  // userState?.enabled is per-user — each user sees their own status.
  const isActive = userState?.enabled ?? false  // Per-user: is THIS user's executor active?
  const activeBriefs = status?.activeBriefs ?? 0
  const todayExecs = status?.todayExecutions ?? 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
      borderRadius: 16, border: '1px solid rgba(0,212,255,0.08)',
      overflow: 'hidden', fontFamily: "'Cairo', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '7px 10px 6px',
        background: 'linear-gradient(90deg, rgba(0,212,255,0.12), transparent)',
        borderBottom: '1px solid rgba(0,212,255,0.08)',
        display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isActive ? T.success : T.text3,
            boxShadow: isActive ? `0 0 10px ${T.success}, 0 0 20px rgba(0,255,163,0.4)` : 'none',
            animation: isActive ? 'agentCtrlPulse 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: T.text }}>المنفذ الذكي</span>

          {/* Monitoring Heartbeat */}
          {isActive && (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 4, 
              background: 'rgba(0,255,163,0.05)', padding: '1px 6px', 
              borderRadius: 10, border: '1px solid rgba(0,255,163,0.1)'
            }}>
              <div style={{ 
                width: 4, height: 4, borderRadius: '50%', background: T.success,
                boxShadow: `0 0 5px ${T.success}`,
                animation: 'agentCtrlPulse 1s ease-in-out infinite'
              }} />
              <span style={{ fontSize: 7, color: T.success, fontWeight: 700, fontFamily: 'monospace' }}>
                MONITORING: {currentMonitoredSymbol}
              </span>
            </div>
          )}

          <span style={{
            fontSize: 6.5, padding: '1px 5px', borderRadius: 4,
            background: isActive ? 'rgba(0,255,163,0.15)' : 'rgba(255,255,255,0.06)',
            color: isActive ? T.success : T.text3, fontWeight: 700, fontFamily: 'monospace',
          }}>
            {isActive ? 'نشط' : 'متوقف'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* FIX V118: Exchange-aware activation buttons.
              If user has real exchange credentials, show option to trade on real exchange.
              If no real credentials, show paper trading only. */}
          {!isActive ? (
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {/* ═══════════════════════════════════════════════════
                  V125: ONE primary button — "تفعيل تلقائي"
                  Routes each trade to the best credential automatically.
                  No more "ورقي/حقيقي" binary choice.
              ═══════════════════════════════════════════════════ */}
              <button onClick={() => enableUser('auto')} disabled={loading} style={{
                fontSize: 7, minHeight: 20, padding: '2px 8px',
                borderRadius: 5, border: '1px solid rgba(0,255,163,0.3)', cursor: loading ? 'not-allowed' : 'pointer',
                background: 'rgba(0,255,163,0.15)', color: T.success, fontWeight: 800,
              }}>
                {loading ? '...' : 'تفعيل تلقائي'}
              </button>
              {/* Paper-only option for testing */}
              <button onClick={() => enableUser('paper-only')} disabled={loading} style={{
                fontSize: 7, minHeight: 20, padding: '2px 8px',
                borderRadius: 5, border: '1px solid rgba(0,212,255,0.3)', cursor: loading ? 'not-allowed' : 'pointer',
                background: 'rgba(0,212,255,0.08)', color: T.cyan, fontWeight: 700,
              }}>
                {loading ? '...' : 'ورقي فقط'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {/* V119: Show active mode + switch option even when running */}
              <button
                onClick={async () => {
                  // Switch mode: disable then re-enable with different mode
                  await disableUser()
                }}
                disabled={loading}
                style={{
                  fontSize: 7, minHeight: 20, padding: '2px 8px',
                  borderRadius: 5, border: '1px solid rgba(255,71,87,0.3)', cursor: loading ? 'not-allowed' : 'pointer',
                  background: 'rgba(255,71,87,0.15)', color: T.danger, fontWeight: 700,
                }}
              >
                {loading ? '...' : 'إيقاف وتغيير'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 6,
        borderBottom: '1px solid rgba(0,212,255,0.08)',
      }}>
        <StatBox label="Briefs نشطة" value={activeBriefs.toString()} color={T.cyan} />
        <StatBox label="تنفيذات المنفذ" value={todayExecs.toString()} color={T.green} />
        <StatBox label="مراكز مفتوحة" value={(status?.openPositions ?? 0).toString()} color={T.purple} />
        <StatBox label="ر/خ اليوم" value={`$${Number(userState?.dailyPnL ?? 0).toFixed(2)}`} color={getPnlColor(Number(userState?.dailyPnL ?? 0))} />
        <StatBox label="صفقاتك اليوم" value={(userState?.dailyTrades ?? 0).toString()} color={T.amber} />
        <StatBox label="خسائر متتالية" value={(userState?.consecutiveLosses ?? 0).toString()} color={(userState?.consecutiveLosses ?? 0) >= 3 ? T.danger : T.text3} />
      </div>

      {/* V125: Exchange Mode Banner — shows auto-routing status */}
      <div style={{
        padding: '5px 8px', borderBottom: '1px solid rgba(0,212,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 7,
        background: isActive
          ? ((userState?.routingMode === 'paper-only') ? 'rgba(0,212,255,0.04)' : 'rgba(0,255,163,0.04)')
          : 'transparent',
      }}>
        <span style={{ color: T.text3 }}>الوضع:</span>
        {isActive && userState ? (
          <>
            <span style={{
              padding: '1px 6px', borderRadius: 3,
              background: (userState.routingMode === 'paper-only') ? 'rgba(0,212,255,0.15)' : 'rgba(0,255,163,0.15)',
              color: (userState.routingMode === 'paper-only') ? T.cyan : T.success, fontWeight: 700,
              border: `1px solid ${(userState.routingMode === 'paper-only') ? 'rgba(0,212,255,0.3)' : 'rgba(0,255,163,0.3)'}`,
            }}>
              {(userState.routingMode === 'paper-only') ? '📝 ورقي فقط' : '⚡ تلقائي — كل الحسابات'}
            </span>
            {userState.routingMode !== 'paper-only' && exchangeCredentials.length > 0 && (
              <span style={{
                padding: '1px 6px', borderRadius: 3,
                background: 'rgba(255,184,0,0.1)', color: T.amber, fontWeight: 700,
                border: '1px solid rgba(255,184,0,0.2)',
              }}>
                {exchangeCredentials.length} بورصة: {exchangeCredentials.map((c: any) => {
                  const isTestnet = c.testnet || c.exchange?.includes('test')
                  return isTestnet ? `🧪${c.exchange}` : `💰${c.exchange}`
                }).join(' ')}
              </span>
            )}
            <span style={{ color: T.text3 }}>• خطر: {userState.riskPerTradePercent}%</span>
            <span style={{ color: T.text3 }}>• حد المراكز: {userState.maxOpenPositions}</span>
          </>
        ) : (
          <span style={{ color: T.text3, fontSize: 6.5 }}>
            تفعيل تلقائي يوجه كل صفقة للحساب المناسب تلقائياً
          </span>
        )}
      </div>

      {/* Paper Trading Warning — more prominent */}
      {isActive && userState?.isPaperTrading && (
        <div style={{
          padding: '4px 8px', background: 'rgba(0,212,255,0.06)', borderBottom: '1px solid rgba(0,212,255,0.12)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ fontSize: 7, color: T.cyan, fontWeight: 600 }}>⚠ تداول ورقي تجريبي — أموال وهمية وليست حقيقية</span>
          {exchangeCredentials.length > 0 && (
            <span style={{ fontSize: 6, color: T.amber, fontWeight: 600, opacity: 0.8 }}>
              (لديك بورصة حقيقية متصلة — اضغط "إيقاف وتغيير" للتبديل)
            </span>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUSTAINABLE FIX: Three-tier warning system.

          1. TESTNET accounts: Informational badge only. No dismissal needed
             because testnet = fake money. No risk to user.

          2. REAL accounts, NOT acknowledged: Prominent warning with two actions:
             - "إعدادات المخاطر" → navigates to settings page (opens in same tab)
             - "تم التحقق ✓" → persists acknowledgement to DB via /api/settings.
               This is the SAME Setting table the backend reads via
               _loadUserRiskSettings(). Once acknowledged, the warning
               disappears PERMANENTLY (until user resets it in settings).

          3. REAL accounts, acknowledged: No warning shown. The user has
             confirmed they understand the risks.

          Previous implementation used localStorage (session-only, lost on
          refresh, not synced across devices). Now uses DB (permanent,
          synced, backend-readable).
      ═══════════════════════════════════════════════════════════════ */}
      {isActive && !userState?.isPaperTrading && userState && (() => {
        const activeCred = exchangeCredentials.find((c: any) => c.id === userState.credentialId)
        const isTestnet = activeCred?.testnet || activeCred?.exchange?.includes('test') || activeCred?.exchange?.includes('Testnet')

        // Tier 1: Testnet — informational only, no action needed
        if (isTestnet) {
          return (
            <div style={{
              padding: '4px 8px', background: 'rgba(0,212,255,0.06)', borderBottom: '1px solid rgba(0,212,255,0.12)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ fontSize: 7, color: T.cyan, fontWeight: 600 }}>🧪 بيئة تجريبية (Testnet) — أموال وهمية للاختبار</span>
            </div>
          )
        }

        // Tier 2: Real account, already acknowledged — no warning
        if (riskWarningAcknowledged) {
          return null
        }

        // Tier 3: Real account, NOT acknowledged — show warning with actions
        return (
          <div style={{
            padding: '4px 8px', background: 'rgba(255,184,0,0.08)', borderBottom: '1px solid rgba(255,184,0,0.15)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 7, color: T.amber, fontWeight: 600 }}>⚠ تداول حقيقي بأموال فعلية</span>
            <button
              onClick={() => window.location.href = '/dashboard/settings'}
              style={{
                fontSize: 6.5, color: T.amber, fontWeight: 700,
                background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.25)',
                borderRadius: 3, padding: '1px 6px', cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif", textDecoration: 'none',
              }}
            >
              إعدادات المخاطر
            </button>
            <button
              onClick={async () => {
                if (acknowledgedLoading) return
                setAcknowledgedLoading(true)
                try {
                  // SUSTAINABLE: Persist to DB, not localStorage.
                  // This is the SAME key the backend reads via _loadUserRiskSettings().
                  await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      settings: { riskWarningAcknowledged: 'true' },
                    }),
                  })
                  setRiskWarningAcknowledged(true)
                } catch {
                  // Fallback: dismiss locally even if DB save fails
                  setRiskWarningAcknowledged(true)
                } finally {
                  setAcknowledgedLoading(false)
                }
              }}
              disabled={acknowledgedLoading}
              style={{
                fontSize: 6.5, color: T.success, fontWeight: 700,
                background: 'rgba(0,255,163,0.1)', border: '1px solid rgba(0,255,163,0.2)',
                borderRadius: 3, padding: '1px 6px', cursor: acknowledgedLoading ? 'not-allowed' : 'pointer',
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {acknowledgedLoading ? '...' : 'تم التحقق ✓'}
            </button>
          </div>
        )
      })()}

      {/* Backend Offline Banner */}
      {backendOffline && (
        <div style={{ padding: '4px 8px', background: 'rgba(255,184,0,0.1)', borderBottom: '1px solid rgba(255,184,0,0.2)' }}>
          <span style={{ fontSize: 7, color: T.amber }}>⚠ الخادم غير متاح — يُعاد الاتصال تلقائياً</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '4px 8px', background: 'rgba(255,71,87,0.1)', borderBottom: '1px solid rgba(255,71,87,0.2)' }}>
          <span style={{ fontSize: 7, color: T.danger }}>{error}</span>
        </div>
      )}

      {/* Positions List — only shows REAL positions, phantom trades filtered out */}
      <div style={{
        flex: 1, minHeight: 0, maxHeight: '50vh', overflowY: 'auto',
        padding: 4, background: 'rgba(11,14,20,0.45)',
      }} className="custom-scrollbar">
        {positions.length === 0 ? (
          <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Diagnostic: show why no positions / why not executing */}
            {isActive && status?.activeBriefs === 0 && (
              <div style={{ fontSize: 7, color: T.amber, textAlign: 'center', opacity: 0.8 }}>
                ⏳ ينتظر Briefs من المجلس الاستراتيجي...
              </div>
            )}
            {isActive && (status?.activeBriefs ?? 0) > 0 && (
              <div style={{ fontSize: 7, color: T.cyan, textAlign: 'center', opacity: 0.8 }}>
                🔍 {status?.activeBriefs} Brief نشط — يفحص شروط الدخول كل 2 ثانية
              </div>
            )}
            {isActive && status?.lastError && (
              <div style={{ fontSize: 6.5, color: T.danger, textAlign: 'center', padding: '2px 4px', background: 'rgba(255,71,87,0.08)', borderRadius: 4 }}>
                ⚠ {status.lastError}
              </div>
            )}
            {!isActive && (
              <div style={{ padding: 12, textAlign: 'center', opacity: 0.4, fontSize: 9 }}>
                فعّل المنفذ الذكي لبدء التداول التلقائي
              </div>
            )}
            {isActive && !status?.lastError && (status?.activeBriefs ?? 0) === 0 && (
              <div style={{ padding: 6, textAlign: 'center', opacity: 0.3, fontSize: 8 }}>
                لا توجد مراكز مفتوحة
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {positions
              .filter((pos: any) => !isPhantomTrade(pos))
              .slice(0, 15)
              .map((pos: any) => (
              <div key={pos.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 6px', borderRadius: 4,
                background: 'rgba(255,255,255,0.02)', fontSize: 8,
              }}>
                <span style={{ color: pos.side === 'BUY' ? T.success : T.danger, fontWeight: 800, minWidth: 22 }}>
                  {pos.side === 'BUY' ? 'شراء' : 'بيع'}
                </span>
                <span style={{ color: T.text, fontWeight: 700, fontFamily: 'monospace' }}>{pos.symbol}</span>
                <div style={{ flex: 1 }} />
                <span style={{
                  color: getPnlColor(Number(pos.unrealizedPnl ?? 0)),
                  fontWeight: 800, fontFamily: 'monospace',
                }}>
                  ${Number(pos.unrealizedPnl ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: 5, textAlign: 'center', minHeight: 30,
      background: 'rgba(255,255,255,0.02)', borderRadius: 6,
    }}>
      <div style={{ fontSize: 7, color: T.text3 }}>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}
