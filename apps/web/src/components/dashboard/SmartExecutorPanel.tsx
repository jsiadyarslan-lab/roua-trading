'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import T from '@/lib/unified-tokens'
import { getPnlColor } from '@/lib/pnl-utils'

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
  activeCredentialId?: string
  // Legacy fields (for migration display)
  credentialId?: string
  isPaperTrading?: boolean
  isTestnet?: boolean  // V135: Testnet is NOT paper trading
  exchangeName?: string  // V135: Exchange name for display
  routingMode?: string
}

/**
 * Is this position a phantom trade from degraded/fallback data?
 */
function isPhantomTrade(pos: any): boolean {
  const entryPrice = Number(pos.entryPrice ?? pos.price ?? pos.openPrice ?? 0)
  const qty = Number(pos.quantity ?? pos.qty ?? pos.size ?? 0)
  // V431: After LOTS migration, qty is small (0.01-0.50). Use notional value
  // (qty × contractSize × entryPrice) instead of raw qty × entryPrice.
  // Forex: 0.30 lots × 100000 × 1.42 = $42,600 (real position, not phantom)
  // Crypto: 0.001 lots × 1 × 60000 = $60 (real)
  // Phantom: notional < $1 (dust from degraded data)
  const symbol = pos.symbol || ''
  const isCrypto = symbol.includes('/USDT') || symbol.includes('/BTC')
  const contractSize = isCrypto ? 1 : 100000
  const notionalValue = Math.abs(qty * contractSize * entryPrice)
  return entryPrice <= 0 || notionalValue < 1
}

export function SmartExecutorPanel() {
  const t = useTranslations('dashboard.executor')
  const tc = useTranslations('common')
  const [status, setStatus] = useState<ExecutorStatus | null>(null)
  const [userState, setUserState] = useState<UserExecutorState | null>(null)
  const [positions, setPositions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  useEffect(() => {
    fetchUserState()
    fetchPositions()
  }, [fetchUserState, fetchPositions])

  // Poll every 10s
  useVisibleInterval(() => { fetchUserState(); fetchPositions() }, 10000)

  // Symbol Monitoring Animation
  useVisibleInterval(() => {
    setCurrentMonitoredSymbol(prev => {
      const idx = MONITORED_SYMBOLS.indexOf(prev)
      return MONITORED_SYMBOLS[(idx + 1) % MONITORED_SYMBOLS.length]
    })
  }, 4000)

  // One-time phantom purge on load
  useEffect(() => {
    fetch('/api/smart-executor/purge-phantoms', { method: 'POST' }).catch(() => {})
  }, [])

  // ═══════════════════════════════════════════════════
  // V126: SIMPLE enable/disable. No modes, no routing.
  // The user selected their account in settings.
  // This panel just enables or disables the executor.
  // ═══════════════════════════════════════════════════
  const enableExecutor = async () => {
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/smart-executor/user/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      await fetchUserState()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const disableExecutor = async () => {
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

  const isActive = userState?.enabled ?? false
  const activeBriefs = status?.activeBriefs ?? 0
  const todayExecs = status?.todayExecutions ?? 0
  // Get the active credential ID (V126: activeCredentialId, legacy: credentialId)
  const activeCredId = userState?.activeCredentialId || (userState as any)?.credentialId

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
      borderRadius: 'var(--radius-xl)', border: '1px solid rgba(0,212,255,0.08)',
      overflow: 'hidden', fontFamily: "var(--font-ar)",
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
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: T.text }}>{t('title')}</span>

          {/* Monitoring Heartbeat */}
          {isActive && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(0,255,163,0.05)', padding: '1px 6px',
              borderRadius: 'var(--radius-lg)', border: '1px solid rgba(0,255,163,0.1)'
            }}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%', background: T.success,
                boxShadow: `0 0 5px ${T.success}`,
                animation: 'agentCtrlPulse 1s ease-in-out infinite'
              }} />
              <span style={{ fontSize: 'var(--text-xs)', color: T.success, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {t('monitoring')} {currentMonitoredSymbol}
              </span>
            </div>
          )}

          <span style={{
            fontSize: 'var(--text-xs)', padding: '1px 5px', borderRadius: 'var(--radius-sm)',
            background: isActive ? 'rgba(0,255,163,0.15)' : 'rgba(255,255,255,0.06)',
            color: isActive ? T.success : T.text3, fontWeight: 700, fontFamily: "var(--font-mono)",
          }}>
            {isActive ? t('active') : t('inactive')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {!isActive ? (
            <button onClick={enableExecutor} disabled={loading} style={{
              fontSize: 'var(--text-xs)', minHeight: 20, padding: '2px 8px',
              borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,255,163,0.3)', cursor: loading ? 'not-allowed' : 'pointer',
              background: 'rgba(0,255,163,0.15)', color: T.success, fontWeight: 800,
            }}>
              {loading ? '...' : t('activate')}
            </button>
          ) : (
            <button onClick={disableExecutor} disabled={loading} style={{
              fontSize: 'var(--text-xs)', minHeight: 20, padding: '2px 8px',
              borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,71,87,0.3)', cursor: loading ? 'not-allowed' : 'pointer',
              background: 'rgba(255,71,87,0.15)', color: T.danger, fontWeight: 700,
            }}>
              {loading ? '...' : t('deactivate')}
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 6,
        borderBottom: '1px solid rgba(0,212,255,0.08)',
      }}>
        <StatBox label={t('activeBriefs')} value={activeBriefs.toString()} color={T.cyan} />
        <StatBox label={t('executorExecutions')} value={todayExecs.toString()} color={T.green} />
        <StatBox label={t('openPositions')} value={(status?.openPositions ?? 0).toString()} color={T.purple} />
        <StatBox label={t('dailyPnL')} value={`$${Number(userState?.dailyPnL ?? 0).toFixed(2)}`} color={getPnlColor(Number(userState?.dailyPnL ?? 0))} />
        <StatBox label={t('yourTradesToday')} value={(userState?.dailyTrades ?? 0).toString()} color={T.amber} />
        <StatBox label={t('consecutiveLosses')} value={(userState?.consecutiveLosses ?? 0).toString()} color={(userState?.consecutiveLosses ?? 0) >= 3 ? T.danger : T.text3} />
      </div>

      {/* V135: Active Account Banner — shows live/testnet/paper mode */}
      <div style={{
        padding: '5px 8px', borderBottom: '1px solid rgba(0,212,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-xs)',
        background: isActive ? 'rgba(0,255,163,0.04)' : 'transparent',
      }}>
        <span style={{ color: T.text3 }}>{t('account')}:</span>
        {isActive && activeCredId ? (
          <span style={{
            padding: '1px 6px', borderRadius: 'var(--radius-xs)',
            background: userState?.isTestnet
              ? 'rgba(255,184,0,0.15)'
              : userState?.isPaperTrading
                ? 'rgba(0,212,255,0.10)'
                : 'rgba(0,255,163,0.15)',
            color: userState?.isTestnet
              ? T.amber
              : userState?.isPaperTrading
                ? T.accent
                : T.success,
            fontWeight: 700,
            border: userState?.isTestnet
              ? '1px solid rgba(255,184,0,0.3)'
              : userState?.isPaperTrading
                ? '1px solid rgba(0,212,255,0.2)'
                : '1px solid rgba(0,255,163,0.3)',
          }}>
            {userState?.isTestnet
              ? `${t('testnet')}${userState?.exchangeName ? ` (${userState.exchangeName})` : ''}`
              : userState?.isPaperTrading
                ? t('paper')
                : `${t('live')}${userState?.exchangeName ? ` (${userState.exchangeName})` : ''}`
            }
          </span>
        ) : isActive ? (
          <span style={{
            padding: '1px 6px', borderRadius: 'var(--radius-xs)',
            background: 'rgba(255,184,0,0.15)', color: T.amber, fontWeight: 700,
            border: '1px solid rgba(255,184,0,0.3)',
          }}>
            {t('chooseAccount')}
          </span>
        ) : (
          <span style={{ color: T.text3, fontSize: 'var(--text-xs)' }}>
            {t('activateAndChoose')}
          </span>
        )}
        {isActive && (
          <>
            <span style={{ color: T.text3 }}>• {t('risk')}: {userState?.riskPerTradePercent}%</span>
            <span style={{ color: T.text3 }}>• {t('positionLimitLabel')}: {userState?.maxOpenPositions}</span>
          </>
        )}
      </div>

      {/* Backend Offline Banner */}
      {backendOffline && (
        <div style={{ padding: '4px 8px', background: 'rgba(255,184,0,0.1)', borderBottom: '1px solid rgba(255,184,0,0.2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: T.amber }}>{t('serverUnavailableBanner')}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '4px 8px', background: 'rgba(255,71,87,0.1)', borderBottom: '1px solid rgba(255,71,87,0.2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: T.danger }}>{error}</span>
        </div>
      )}

      {/* Positions List */}
      <div style={{
        flex: 1, minHeight: 0, maxHeight: '50vh', overflowY: 'auto',
        padding: 4, background: 'rgba(11,14,20,0.45)',
      }} className="custom-scrollbar">
        {positions.length === 0 ? (
          <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {isActive && status?.activeBriefs === 0 && (
              <div style={{ fontSize: 'var(--text-xs)', color: T.amber, textAlign: 'center', opacity: 0.8 }}>
                {t('awaitingBriefs')}
              </div>
            )}
            {isActive && (status?.activeBriefs ?? 0) > 0 && (
              <div style={{ fontSize: 'var(--text-xs)', color: T.cyan, textAlign: 'center', opacity: 0.8 }}>
                {t('activeBriefScanning', { count: status?.activeBriefs ?? 0 })}
              </div>
            )}
            {isActive && status?.lastError && (
              <div style={{ fontSize: 'var(--text-xs)', color: T.danger, textAlign: 'center', padding: '2px 4px', background: 'rgba(255,71,87,0.08)', borderRadius: 'var(--radius-sm)' }}>
                ⚠ {status.lastError}
              </div>
            )}
            {!isActive && (
              <div style={{ padding: 12, textAlign: 'center', opacity: 0.4, fontSize: 'var(--text-xs)' }}>
                {t('activateToStart')}
              </div>
            )}
            {isActive && !status?.lastError && (status?.activeBriefs ?? 0) === 0 && (
              <div style={{ padding: 6, textAlign: 'center', opacity: 0.3, fontSize: 'var(--text-xs)' }}>
                {t('noOpenPositions')}
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
                padding: '5px 6px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.02)', fontSize: 'var(--text-xs)',
              }}>
                <span style={{ color: pos.side === 'BUY' ? T.success : T.danger, fontWeight: 800, minWidth: 22 }}>
                  {pos.side === 'BUY' ? tc('buy') : tc('sell')}
                </span>
                <span style={{ color: T.text, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{pos.symbol}</span>
                <div style={{ flex: 1 }} />
                <span style={{
                  color: getPnlColor(Number(pos.unrealizedPnl ?? 0)),
                  fontWeight: 800, fontFamily: "var(--font-mono)",
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
      background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)',
    }}>
      <div style={{ fontSize: 'var(--text-xs)', color: T.text3 }}>{label}</div>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color }}>{value}</div>
    </div>
  )
}
