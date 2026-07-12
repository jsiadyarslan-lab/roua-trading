'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Cpu, Play, Square, AlertTriangle, ExternalLink,
  Activity, Zap, TrendingUp, Clock, Settings2,
} from 'lucide-react'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { getPnlColor, getPnlSign } from '@/lib/pnl-utils'

/* ═══════════════════════════════════════════════
   Design Tokens — Roua Trading dark theme
   ═══════════════════════════════════════════════ */
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */
function getStatusColor(status: AgentStatus | null): string {
  if (!status) return '#6B7280'
  switch (status) {
    case AgentStatus.RUNNING: return '#00FFA3'
    case AgentStatus.PAUSED: return '#FFB800'
    case AgentStatus.STOPPED: return '#9CA3B5'
    case AgentStatus.EMERGENCY_STOP: return '#FF4757'
    case AgentStatus.DAILY_LIMIT_REACHED: return '#FFB800'
    default: return '#6B7280'
  }
}

function getStatusLabel(status: AgentStatus | null, ta: any): string {
  if (!status) return ta('statusIdle')
  switch (status) {
    case AgentStatus.RUNNING: return ta('statusRunning')
    case AgentStatus.PAUSED: return ta('statusPaused')
    case AgentStatus.STOPPED: return ta('statusStopped')
    case AgentStatus.EMERGENCY_STOP: return ta('emergencyStop')
    case AgentStatus.DAILY_LIMIT_REACHED: return ta('statusDailyLimit')
    case AgentStatus.IDLE: return ta('statusIdle')
    default: return status
  }
}

function getStrategyLabel(s: StrategyType, ta: any): string {
  switch (s) {
    case StrategyType.AUTO: return ta('strategyAuto')
    case StrategyType.SCALPING: return ta('strategyScalping')
    case StrategyType.SWING: return ta('strategySwing')
    case StrategyType.GRID: return ta('strategyGrid')
    case StrategyType.MEAN_REVERSION: return ta('strategyMeanReversion')
    case StrategyType.MOMENTUM_BREAKOUT: return ta('strategyMomentumBreakout')
    case StrategyType.DCA: return ta('strategyDCA')
    case StrategyType.VWAP_RSI: return 'VWAP+RSI'
    default: return s
  }
}

function getStrategyAccent(s: StrategyType): string {
  switch (s) {
    case StrategyType.AUTO: return '#FF9F43'
    case StrategyType.SCALPING: return '#059669'
    case StrategyType.SWING: return '#00FFA3'
    case StrategyType.GRID: return '#B388FF'
    case StrategyType.MEAN_REVERSION: return '#FFB800'
    case StrategyType.MOMENTUM_BREAKOUT: return '#FF6B9D'
    case StrategyType.DCA: return '#00B894'
    case StrategyType.VWAP_RSI: return '#A29BFE'
    default: return '#059669'
  }
}

function formatTimeAgo(isoString: string | undefined, tc: any): string {
  if (!isoString) return '—'
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return tc('justNow')
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return tc('minutesAgo', { n: diffMin })
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return tc('hoursAgo', { n: diffHr })
    const diffDay = Math.floor(diffHr / 24)
    return tc('daysAgo', { n: diffDay })
  } catch {
    return '—'
  }
}

/* ═══════════════════════════════════════════════
   AgentControlMini — Compact always-visible widget
   ═══════════════════════════════════════════════ */
export function AgentControlMini() {
  useScopedStyle(`
        .agent-control-mini-shell,
        .agent-control-mini-shell * {
          box-sizing: border-box;
        }
        .agent-control-mini-shell button,
        .agent-control-mini-shell select,
        .agent-control-mini-shell input,
        .agent-control-mini-shell [role="button"] {
          -webkit-tap-highlight-color: transparent;
        }
        @keyframes agentCtrlPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes agentCtrlSpin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 767px) {
          .agent-control-mini-shell {
            border-radius: 0;
          }
        }
      `)
  const {
    agentState, loading, error,
    fetchStatus, fetchCredentials, startAgent, stopAgent,
    selectedCredentialId, positions, performance,
    fetchPositions, fetchPerformance,
    startAutoRefresh, stopAutoRefresh
  } = useAgentStore()
  

  const ta = useTranslations('dashboard.autonomousTrader')
  const tc = useTranslations('common')

  const [showConfirm, setShowConfirm] = useState(false)

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const isEmergency = status === AgentStatus.EMERGENCY_STOP
  const config = agentState?.config
  const strategy = config?.strategy ?? StrategyType.AUTO
  const isPaperTrading = config?.isPaperTrading ?? !selectedCredentialId
  const isTestnet = config?.isTestnet ?? false  // V135: Testnet is NOT paper trading
  const exchangeName = config?.exchangeName  // V135: Exchange name for display
  const isLiveMode = !isPaperTrading && !isTestnet  // V135: Real trading with real funds
  const statusColor = getStatusColor(status)
  const dailyPnL = agentState?.dailyPnL ?? 0
  const lastSignalAt = agentState?.lastSignalAt
  const lastCycleAt = agentState?.lastCycleAt
  
  const [currentEvalSymbol, setCurrentEvalSymbol] = useState('BTC/USDT')
  const EVAL_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']

  // Fetch on mount + start coordinated auto-refresh (deduped by store)
  // PERF: Removed duplicate useVisibleInterval — was hitting same endpoints as store's startAutoRefresh
  useEffect(() => {
    fetchStatus()
    fetchCredentials()
    fetchPositions()
    fetchPerformance()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [])

  // Visual-only eval symbol animation — pauses when tab hidden
  useVisibleInterval(() => {
    setCurrentEvalSymbol(prev => {
      const idx = EVAL_SYMBOLS.indexOf(prev)
      return EVAL_SYMBOLS[(idx + 1) % EVAL_SYMBOLS.length]
    })
  }, 3500)

  // Auto-hide confirm dialog after 5s
  useEffect(() => {
    if (showConfirm) {
      const t = setTimeout(() => setShowConfirm(false), 5000)
      return () => clearTimeout(t)
    }
  }, [showConfirm])

  const handleToggle = () => {
    if (isRunning) {
      setShowConfirm(true)
    } else {
      startAgent(strategy)
    }
  }

  const handleConfirmStop = (emergency: boolean) => {
    stopAgent(emergency)
    setShowConfirm(false)
  }

  const strategyAccent = getStrategyAccent(strategy)

  return (
    <div
      className="agent-control-mini-shell"
      dir="auto"
      style={{
        fontFamily: FONT_AR,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
        borderRadius: 'var(--radius-xl)',
        border: `1px solid ${isRunning ? 'rgba(0,255,163,0.15)' : isEmergency ? 'rgba(255,71,87,0.2)' : 'rgba(0,229,255,0.08)'}`,
        overflow: 'visible',
        touchAction: 'manipulation',
        transition: 'border-color 0.3s ease',
        boxShadow: isRunning
          ? '0 0 24px rgba(0,255,163,0.06), inset 0 0 30px rgba(0,255,163,0.02)'
          : isEmergency
            ? '0 0 24px rgba(255,71,87,0.06)'
            : 'none',
      }}
    >
      {/* ── Header Row ── */}
      <div style={{
        padding: '7px 10px 6px',
        background: isRunning
          ? 'linear-gradient(90deg, rgba(0,255,163,0.10), rgba(0,212,255,0.04), transparent)'
          : isEmergency
            ? 'linear-gradient(90deg, rgba(255,71,87,0.10), transparent)'
            : 'linear-gradient(90deg, rgba(0,229,255,0.10), transparent)',
        borderBottom: `1px solid ${isRunning ? 'rgba(0,255,163,0.1)' : 'rgba(0,229,255,0.08)'}`,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {/* Status LED */}
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: statusColor,
            boxShadow: isRunning ? `0 0 12px ${'#00FFA3'}, 0 0 24px rgba(0,255,163,0.3)` : `0 0 8px ${statusColor}`,
            animation: isRunning ? 'agentCtrlPulse 2s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />

          {/* Title */}
          <span style={{
            fontSize: 13, fontWeight: 800, color: '#F0F2F5',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {ta('title')}
          </span>

          {/* Evaluating Heartbeat */}
          {isRunning && (
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 5, 
              background: 'rgba(0,255,163,0.08)', padding: '2px 8px', 
              borderRadius: 'var(--radius-lg)', border: '1px solid rgba(0,255,163,0.15)'
            }}>
              <div style={{ 
                width: 5, height: 5, borderRadius: '50%', background: '#00FFA3',
                boxShadow: `0 0 6px ${'#00FFA3'}`,
                animation: 'agentCtrlPulse 1s ease-in-out infinite'
              }} />
              <span style={{ fontSize: 11, color: '#00FFA3', fontWeight: 700, fontFamily: FONT_MONO }}>
                {currentEvalSymbol}
              </span>
            </div>
          )}

          {/* Status Badge */}
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)',
            background: `${statusColor}18`,
            color: statusColor, fontWeight: 700, fontFamily: FONT_AR,
            flexShrink: 0,
          }}>
            {getStatusLabel(status, ta)}
          </span>

          {/* V135: Trading Mode Badge — show correct mode instead of always "ورقي" */}
          {isRunning && (
            <span
              title={
                isPaperTrading && !isTestnet
                  ? ta('paperTooltip')
                  : isTestnet
                    ? ta('testnetTooltip', { exchange: exchangeName || '...' })
                    : ta('liveTooltip', { exchange: exchangeName || '...' })
              }
              style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)',
                background: isPaperTrading && !isTestnet
                  ? 'rgba(0,212,255,0.10)'
                  : isTestnet
                    ? 'rgba(255,184,0,0.10)'
                    : 'rgba(0,255,163,0.10)',
                color: isPaperTrading && !isTestnet
                  ? '#059669'
                  : isTestnet
                    ? '#FFB800'
                    : '#00FFA3',
                fontWeight: 700, fontFamily: FONT_AR, flexShrink: 0,
                cursor: 'help',
              }}
            >
              {isPaperTrading && !isTestnet
                ? `${ta('paperMode')}${!selectedCredentialId && !config?.isPaperTrading ? ' ⚙' : ''}`
                : isTestnet
                  ? `${tc('demo')}${exchangeName ? ` (${exchangeName})` : ''}`
                  : `${tc('live')}${exchangeName ? ` (${exchangeName})` : ''}`
              }
            </span>
          )}
        </div>

        {/* Toggle Button */}
        {!showConfirm ? (
          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            className={isRunning ? 'btn-danger-active' : 'btn-cyan-active'}
            style={{
              fontSize: 13, minHeight: 36, minWidth: 70,
              padding: '6px 12px', borderRadius: 'var(--radius-lg)',
              touchAction: 'manipulation', lineHeight: 1,
              display: 'flex', alignItems: 'center', gap: 6,
              fontWeight: 900,
            }}
          >
            {loading ? (
              <span style={{ animation: 'agentCtrlSpin 1s linear infinite', display: 'inline-block' }}>
                <Activity size={14} />
              </span>
            ) : isRunning ? (
              <Square size={12} fill="currentColor" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
            {loading ? '...' : isRunning ? ta('stopBtn') : ta('startBtn')}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              type="button"
              onClick={() => handleConfirmStop(false)}
              style={{
                fontSize: 11, minHeight: 36, padding: '6px 12px',
                borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,184,0,0.3)',
                background: 'rgba(255,184,0,0.15)', color: '#FFB800',
                fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Square size={11} />
              {ta('stopBtn')}
            </button>
            <button
              type="button"
              onClick={() => handleConfirmStop(true)}
              style={{
                fontSize: 11, minHeight: 36, padding: '6px 12px',
                borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,71,87,0.3)',
                background: 'rgba(255,71,87,0.2)', color: '#FF4757',
                fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation',
                display: 'flex', alignItems: 'center', gap: 4,
                animation: 'agentCtrlPulse 1s ease-in-out infinite',
              }}
            >
              <AlertTriangle size={11} />
              {ta('emergencyBtn')}
            </button>
          </div>
        )}
      </div>

      {/* ── Info Row: Strategy + Last Signal ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 12px',
        background: 'rgba(5,10,18,0.45)',
        borderBottom: `1px solid rgba(0,229,255,0.08)`,
      }}>
        {/* Strategy */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Zap size={11} color={strategyAccent} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>{ta('strategyLabel')}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: strategyAccent }}>
            {config ? getStrategyLabel(config.strategy as StrategyType, ta) : '—'}
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Last Signal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={11} color={'#6B7280'} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>{ta('lastSignalLabel')}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: lastSignalAt ? '#9CA3B5' : '#6B7280' }}>
            {formatTimeAgo(lastSignalAt || lastCycleAt, tc)}
          </span>
        </div>
      </div>

      {/* ── Quick Stats Row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: 10,
        borderBottom: `1px solid rgba(0,229,255,0.08)`,
      }}>
        {/* Daily P&L */}
        <div style={{
          padding: 8, textAlign: 'center', minHeight: 44,
          background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>{ta('dailyPnL')}</div>
          <div style={{
            fontSize: 13, fontWeight: 800,
            color: dailyPnL > 0 ? '#00FFA3' : dailyPnL < 0 ? '#FF4757' : '#9CA3B5',
            fontFamily: FONT_MONO, direction: 'ltr', textAlign: 'center',
          }}>
            {getPnlSign(Number(dailyPnL))}{Number(dailyPnL).toFixed(2)}
          </div>
        </div>

        {/* Win Rate */}
        <div style={{
          padding: 8, textAlign: 'center', minHeight: 44,
          background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>{ta('winRate')}</div>
          <div style={{
            fontSize: 13, fontWeight: 800,
            color: (performance?.winRate ?? 0) >= 50 ? '#00FFA3' : '#FFB800',
            fontFamily: FONT_MONO,
          }}>
            {(performance?.winRate ?? 0).toFixed(1)}%
          </div>
        </div>

        {/* Open Positions */}
        <div style={{
          padding: 8, textAlign: 'center', minHeight: 44,
          background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>{ta('openPositions')}</div>
          <div style={{
            fontSize: 13, fontWeight: 800, color: positions.length > 0 ? '#059669' : '#6B7280',
            fontFamily: FONT_MONO,
          }}>
            {positions.length}
          </div>
        </div>
      </div>

      {/* ── Compact Positions List (if any) ── */}
      {positions.length > 0 && (
        <div style={{
          padding: '4px 8px 6px', maxHeight: 120, overflowY: 'auto',
          background: 'rgba(5,10,18,0.45)',
        }} className="custom-scrollbar">
          {positions.slice(0, 5).map((pos) => (
            <div key={pos.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px', borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.03)', marginBottom: 4,
              fontSize: 11,
            }}>
              {pos.side === 'BUY'
                ? <TrendingUp size={11} color={'#00FFA3'} />
                : <TrendingUp size={11} color={'#FF4757'} style={{ transform: 'scaleY(-1)' }} />}
              <span style={{ color: '#F0F2F5', fontWeight: 700, fontFamily: FONT_MONO }}>{pos.symbol}</span>
              <span style={{ color: pos.side === 'BUY' ? '#00FFA3' : '#FF4757', fontWeight: 800, fontSize: 11 }}>
                {pos.side === 'BUY' ? tc('buy') : tc('sell')}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{
                color: getPnlColor(Number(pos.unrealizedPnl)),
                fontWeight: 800, fontFamily: FONT_MONO,
              }}>
                {Number(pos.unrealizedPnl) > 0 ? '+' : ''}{Number(pos.unrealizedPnl).toFixed(2)}
              </span>
            </div>
          ))}
          {positions.length > 5 && (
            <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'center', padding: '4px 0' }}>
              {ta('morePositions', { count: positions.length - 5 })}
            </div>
          )}
        </div>
      )}

      {/* ── Footer: Link to Full Dashboard ── */}
      {/* FIX: Use native <a> tag — neither router.push() nor <Link> worked
          reliably inside the widget's scroll container. The click event was
          being intercepted by parent elements. A native <a> tag bypasses
          all JavaScript event handling and uses the browser's built-in
          navigation. Right-click → "Open in new tab" confirmed the href
          was correct, only the left-click (JS navigation) was broken. */}
      <a
        href="/dashboard/autonomous-trader"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px 10px', borderRadius: '0 0 16px 16px',
          width: '100%', border: 'none',
          background: isRunning
            ? 'rgba(0,255,163,0.06)'
            : 'rgba(0,212,255,0.06)',
          borderTop: `1px solid ${isRunning ? 'rgba(0,255,163,0.15)' : 'rgba(0,212,255,0.15)'}`,
          color: isRunning ? '#00FFA3' : '#059669', fontSize: 13, fontWeight: 800,
          fontFamily: FONT_AR, cursor: 'pointer', transition: 'all 0.15s',
          textDecoration: 'none',
        }}
      >
          <Settings2 size={13} />
          {ta('fullDashboard')}
          <ExternalLink size={11} />
      </a>

      {/* ── Error Warning ── */}
      {error && (
        <div style={{
          padding: '4px 8px', background: 'rgba(255,71,87,0.06)',
          borderTop: '1px solid rgba(255,71,87,0.15)',
          fontSize: 11, color: '#FF4757', fontFamily: FONT_AR,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <AlertTriangle size={8} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>
        </div>
      )}

      {/* ── No Agent State Warning (backend offline or not started) ── */}
      {!agentState && !loading && !error && (
        <div style={{
          padding: '6px 8px', background: 'rgba(0,212,255,0.04)',
          borderTop: `1px solid rgba(0,212,255,0.12)`,
          fontSize: 11, color: '#059669', fontFamily: FONT_AR,
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Play size={8} />
            <span style={{ fontWeight: 700 }}>{ta('agentReady')}</span>
          </div>
          <span style={{ color: '#6B7280', fontSize: 11 }}>
            {ta('agentReadyDesc')}
          </span>
        </div>
      )}

      {/* ── End ── */}
    </div>
  )
}
