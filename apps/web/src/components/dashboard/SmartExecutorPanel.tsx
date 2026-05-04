'use client'

import { useState, useEffect, useCallback } from 'react'

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
}

export function SmartExecutorPanel() {
  const [status, setStatus] = useState<ExecutorStatus | null>(null)
  const [userState, setUserState] = useState<UserExecutorState | null>(null)
  const [positions, setPositions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-executor/status')
      const data = await res.json()
      if (data.success) setStatus(data.data)
    } catch {}
  }, [])

  const fetchUserState = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-executor/user/status')
      const data = await res.json()
      if (data.success) {
        setUserState(data.data.user)
        if (data.data.global) setStatus(data.data.global)
      }
    } catch {}
  }, [])

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-executor/positions')
      const data = await res.json()
      if (data.success) setPositions(data.data || [])
    } catch {}
  }, [])

  // Poll every 10 seconds
  useEffect(() => {
    fetchUserState()
    fetchPositions()
    const interval = setInterval(() => {
      fetchUserState()
      fetchPositions()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchUserState, fetchPositions])

  const startExecutor = async () => {
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/smart-executor/start', { method: 'POST' })
      await fetchStatus()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const stopExecutor = async () => {
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/smart-executor/stop', { method: 'POST' })
      await fetchStatus()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const enableUser = async (isPaper: boolean = true) => {
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/smart-executor/user/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaperTrading: isPaper, maxOpenPositions: 5, riskPerTradePercent: 1 }),
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

  const isRunning = status?.isRunning ?? false
  const isEnabled = userState?.enabled ?? false
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
            background: isRunning ? T.success : isEnabled ? T.amber : T.text3,
            boxShadow: isRunning ? `0 0 10px ${T.success}` : 'none',
          }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: T.text }}>المنفذ الذكي</span>
          <span style={{
            fontSize: 6.5, padding: '1px 5px', borderRadius: 4,
            background: isRunning ? 'rgba(0,255,163,0.15)' : isEnabled ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.06)',
            color: isRunning ? T.success : isEnabled ? T.amber : T.text3, fontWeight: 700, fontFamily: 'monospace',
          }}>
            {isRunning ? 'نشط' : isEnabled ? 'مُفعّل' : 'متوقف'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* User enable/disable */}
          {!isEnabled ? (
            <button onClick={() => enableUser(true)} disabled={loading} style={{
              fontSize: 7, minHeight: 22, padding: '3px 8px',
              borderRadius: 5, border: '1px solid rgba(0,255,163,0.3)', cursor: loading ? 'not-allowed' : 'pointer',
              background: 'rgba(0,255,163,0.15)', color: T.success, fontWeight: 700,
            }}>
              تفعيل
            </button>
          ) : (
            <button onClick={disableUser} disabled={loading} style={{
              fontSize: 7, minHeight: 22, padding: '3px 8px',
              borderRadius: 5, border: '1px solid rgba(255,71,87,0.3)', cursor: loading ? 'not-allowed' : 'pointer',
              background: 'rgba(255,71,87,0.15)', color: T.danger, fontWeight: 700,
            }}>
              تعطيل
            </button>
          )}
          {/* Global start/stop */}
          <button
            onClick={() => isRunning ? stopExecutor() : startExecutor()}
            disabled={loading}
            style={{
              fontSize: 8, minHeight: 22, minWidth: 48, padding: '3px 8px',
              borderRadius: 5, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: isRunning ? 'rgba(255,71,87,0.2)' : 'rgba(0,212,255,0.2)',
              color: isRunning ? T.danger : T.cyan, fontWeight: 800,
            }}
          >
            {loading ? '...' : isRunning ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 6,
        borderBottom: '1px solid rgba(0,212,255,0.08)',
      }}>
        <StatBox label="Briefs نشطة" value={activeBriefs.toString()} color={T.cyan} />
        <StatBox label="تنفيذات اليوم" value={todayExecs.toString()} color={T.green} />
        <StatBox label="مراكز مفتوحة" value={(status?.openPositions ?? 0).toString()} color={T.purple} />
        <StatBox label="ر/خ اليوم" value={`$${(userState?.dailyPnL ?? 0).toFixed(2)}`} color={(userState?.dailyPnL ?? 0) >= 0 ? T.success : T.danger} />
        <StatBox label="صفقات اليوم" value={(userState?.dailyTrades ?? 0).toString()} color={T.amber} />
        <StatBox label="خسائر متتالية" value={(userState?.consecutiveLosses ?? 0).toString()} color={(userState?.consecutiveLosses ?? 0) >= 3 ? T.danger : T.text3} />
      </div>

      {/* User Config */}
      {isEnabled && userState && (
        <div style={{
          padding: '5px 8px', borderBottom: '1px solid rgba(0,212,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 7,
        }}>
          <span style={{ color: T.text3 }}>الوضع:</span>
          <span style={{
            padding: '1px 5px', borderRadius: 3,
            background: userState.isPaperTrading ? 'rgba(0,212,255,0.12)' : 'rgba(255,184,0,0.12)',
            color: userState.isPaperTrading ? T.cyan : T.amber, fontWeight: 700,
          }}>
            {userState.isPaperTrading ? 'ورقي' : 'حقيقي'}
          </span>
          <span style={{ color: T.text3 }}>• خطر: {userState.riskPerTradePercent}%</span>
          <span style={{ color: T.text3 }}>• حد المراكز: {userState.maxOpenPositions}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '4px 8px', background: 'rgba(255,71,87,0.1)', borderBottom: '1px solid rgba(255,71,87,0.2)' }}>
          <span style={{ fontSize: 7, color: T.danger }}>{error}</span>
        </div>
      )}

      {/* Positions List */}
      <div style={{
        flex: 1, minHeight: 0, maxHeight: '50vh', overflowY: 'auto',
        padding: 4, background: 'rgba(11,14,20,0.45)',
      }} className="custom-scrollbar">
        {positions.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', opacity: 0.3, fontSize: 9 }}>
            {isEnabled ? 'لا توجد مراكز مفتوحة — ينتفر Briefs من المجلس' : 'فعّل المنفذ الذكي لبدء التداول التلقائي'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {positions.slice(0, 15).map((pos: any) => (
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
                  color: (pos.unrealizedPnl ?? 0) >= 0 ? T.success : T.danger,
                  fontWeight: 800, fontFamily: 'monospace',
                }}>
                  ${(pos.unrealizedPnl ?? 0).toFixed(2)}
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
