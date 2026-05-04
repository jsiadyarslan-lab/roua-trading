'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Cpu, Play, Square, AlertTriangle, ExternalLink,
  Activity, Zap, TrendingUp, Clock, Settings2,
} from 'lucide-react'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'

/* ═══════════════════════════════════════════════
   Design Tokens — Roua Trading dark theme
   ═══════════════════════════════════════════════ */
const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  card: '#1A1D29',
  accent: '#00D4FF',
  green: '#00FFA3',
  red: '#FF4757',
  amber: '#FFB800',
  purple: '#B388FF',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#5A6178',
  border: 'rgba(255,255,255,0.06)',
}

const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */
function getStatusColor(status: AgentStatus | null): string {
  if (!status) return T.text3
  switch (status) {
    case AgentStatus.RUNNING: return T.green
    case AgentStatus.PAUSED: return T.amber
    case AgentStatus.STOPPED: return T.text2
    case AgentStatus.EMERGENCY_STOP: return T.red
    case AgentStatus.DAILY_LIMIT_REACHED: return T.amber
    default: return T.text3
  }
}

function getStatusLabel(status: AgentStatus | null): string {
  if (!status) return 'في الانتظار'
  switch (status) {
    case AgentStatus.RUNNING: return 'يعمل'
    case AgentStatus.PAUSED: return 'متوقف مؤقتاً'
    case AgentStatus.STOPPED: return 'متوقف'
    case AgentStatus.EMERGENCY_STOP: return 'إيقاف طارئ'
    case AgentStatus.DAILY_LIMIT_REACHED: return 'حد يومي'
    case AgentStatus.IDLE: return 'في الانتظار'
    default: return status
  }
}

function getStrategyLabel(s: StrategyType): string {
  switch (s) {
    case StrategyType.AUTO: return 'تلقائي'
    case StrategyType.SCALPING: return 'سكالبينغ'
    case StrategyType.SWING: return 'سوينغ'
    case StrategyType.GRID: return 'شبكة'
    case StrategyType.MEAN_REVERSION: return 'عودة للمتوسط'
    case StrategyType.MOMENTUM_BREAKOUT: return 'اختراق الزخم'
    case StrategyType.DCA: return 'متوسط التكلفة'
    case StrategyType.VWAP_RSI: return 'VWAP+RSI'
    default: return s
  }
}

function getStrategyAccent(s: StrategyType): string {
  switch (s) {
    case StrategyType.AUTO: return '#FF9F43'
    case StrategyType.SCALPING: return T.accent
    case StrategyType.SWING: return T.green
    case StrategyType.GRID: return T.purple
    case StrategyType.MEAN_REVERSION: return '#FFB800'
    case StrategyType.MOMENTUM_BREAKOUT: return '#FF6B9D'
    case StrategyType.DCA: return '#00B894'
    case StrategyType.VWAP_RSI: return '#A29BFE'
    default: return T.accent
  }
}

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return '—'
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'الآن'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `منذ ${diffHr} ساعة`
    const diffDay = Math.floor(diffHr / 24)
    return `منذ ${diffDay} يوم`
  } catch {
    return '—'
  }
}

/* ═══════════════════════════════════════════════
   AgentControlMini — Compact always-visible widget
   ═══════════════════════════════════════════════ */
export function AgentControlMini() {
  const {
    agentState, loading, error,
    fetchStatus, fetchCredentials, startAgent, stopAgent,
    selectedCredentialId, positions, performance,
  } = useAgentStore()

  const [showConfirm, setShowConfirm] = useState(false)

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const isEmergency = status === AgentStatus.EMERGENCY_STOP
  const config = agentState?.config
  const strategy = config?.strategy ?? StrategyType.AUTO
  const isPaperTrading = config?.isPaperTrading ?? !selectedCredentialId
  const statusColor = getStatusColor(status)
  const dailyPnL = agentState?.dailyPnL ?? 0
  const lastSignalAt = agentState?.lastSignalAt
  const lastCycleAt = agentState?.lastCycleAt

  // Fetch on mount + periodic refresh
  useEffect(() => {
    fetchStatus()
    fetchCredentials()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus, fetchCredentials])

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
      dir="rtl"
      style={{
        fontFamily: FONT_AR,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
        borderRadius: 16,
        border: `1px solid ${isRunning ? 'rgba(0,255,163,0.15)' : isEmergency ? 'rgba(255,71,87,0.2)' : 'rgba(0,229,255,0.08)'}`,
        overflow: 'hidden',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* Status LED */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor,
            boxShadow: isRunning ? `0 0 10px ${T.green}, 0 0 20px rgba(0,255,163,0.3)` : `0 0 6px ${statusColor}`,
            animation: isRunning ? 'agentCtrlPulse 2s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />

          {/* Title */}
          <span style={{
            fontSize: 10, fontWeight: 800, color: T.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            وكيل التداول الذاتي
          </span>

          {/* Status Badge */}
          <span style={{
            fontSize: 6.5, padding: '1px 5px', borderRadius: 4,
            background: `${statusColor}18`,
            color: statusColor, fontWeight: 700, fontFamily: FONT_MONO,
            flexShrink: 0,
          }}>
            {getStatusLabel(status)}
          </span>

          {/* Paper Trading Badge */}
          {isPaperTrading && isRunning && (
            <span style={{
              fontSize: 6.5, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(0,212,255,0.10)', color: T.accent,
              fontWeight: 700, fontFamily: FONT_MONO, flexShrink: 0,
            }}>
              ورقي
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
              fontSize: 8, minHeight: 26, minWidth: 54,
              padding: '4px 8px', borderRadius: 7,
              touchAction: 'manipulation', lineHeight: 1,
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            {loading ? (
              <span style={{ animation: 'agentCtrlSpin 1s linear infinite', display: 'inline-block' }}>
                <Activity size={9} />
              </span>
            ) : isRunning ? (
              <Square size={8} />
            ) : (
              <Play size={8} fill="currentColor" />
            )}
            {loading ? '...' : isRunning ? 'إيقاف' : 'تشغيل'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              type="button"
              onClick={() => handleConfirmStop(false)}
              style={{
                fontSize: 7, minHeight: 26, padding: '4px 6px',
                borderRadius: 7, border: '1px solid rgba(255,184,0,0.3)',
                background: 'rgba(255,184,0,0.15)', color: T.amber,
                fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation',
                display: 'flex', alignItems: 'center', gap: 2,
              }}
            >
              <Square size={7} />
              إيقاف
            </button>
            <button
              type="button"
              onClick={() => handleConfirmStop(true)}
              style={{
                fontSize: 7, minHeight: 26, padding: '4px 6px',
                borderRadius: 7, border: '1px solid rgba(255,71,87,0.3)',
                background: 'rgba(255,71,87,0.2)', color: T.red,
                fontWeight: 800, cursor: 'pointer', touchAction: 'manipulation',
                display: 'flex', alignItems: 'center', gap: 2,
                animation: 'agentCtrlPulse 1s ease-in-out infinite',
              }}
            >
              <AlertTriangle size={7} />
              طارئ
            </button>
          </div>
        )}
      </div>

      {/* ── Info Row: Strategy + Last Signal ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px',
        background: 'rgba(5,10,18,0.45)',
        borderBottom: `1px solid rgba(0,229,255,0.08)`,
      }}>
        {/* Strategy */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Zap size={8} color={strategyAccent} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 7, color: T.text3, fontWeight: 600 }}>الاستراتيجية:</span>
          <span style={{ fontSize: 7, fontWeight: 800, color: strategyAccent }}>
            {config ? getStrategyLabel(config.strategy as StrategyType) : '—'}
          </span>
        </div>

        <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Last Signal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={8} color={T.text3} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 7, color: T.text3, fontWeight: 600 }}>آخر إشارة:</span>
          <span style={{ fontSize: 7, fontWeight: 700, color: lastSignalAt ? T.text2 : T.text3 }}>
            {formatTimeAgo(lastSignalAt || lastCycleAt)}
          </span>
        </div>
      </div>

      {/* ── Quick Stats Row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 6,
        borderBottom: `1px solid rgba(0,229,255,0.08)`,
      }}>
        {/* Daily P&L */}
        <div style={{
          padding: 5, textAlign: 'center', minHeight: 30,
          background: 'rgba(255,255,255,0.02)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 7, color: T.text3 }}>ر/خ اليوم</div>
          <div style={{
            fontSize: 10, fontWeight: 800,
            color: dailyPnL >= 0 ? T.green : T.red,
            fontFamily: FONT_MONO, direction: 'ltr', textAlign: 'center',
          }}>
            {Number(dailyPnL) >= 0 ? '+' : ''}{Number(dailyPnL).toFixed(2)}
          </div>
        </div>

        {/* Win Rate */}
        <div style={{
          padding: 5, textAlign: 'center', minHeight: 30,
          background: 'rgba(255,255,255,0.02)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 7, color: T.text3 }}>نسبة الفوز</div>
          <div style={{
            fontSize: 10, fontWeight: 800,
            color: (performance?.winRate ?? 0) >= 50 ? T.green : T.amber,
            fontFamily: FONT_MONO,
          }}>
            {(performance?.winRate ?? 0).toFixed(1)}%
          </div>
        </div>

        {/* Open Positions */}
        <div style={{
          padding: 5, textAlign: 'center', minHeight: 30,
          background: 'rgba(255,255,255,0.02)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 7, color: T.text3 }}>مراكز مفتوحة</div>
          <div style={{
            fontSize: 10, fontWeight: 800, color: positions.length > 0 ? T.accent : T.text3,
            fontFamily: FONT_MONO,
          }}>
            {positions.length}
          </div>
        </div>
      </div>

      {/* ── Compact Positions List (if any) ── */}
      {positions.length > 0 && (
        <div style={{
          padding: '0 6px 4px', maxHeight: 80, overflowY: 'auto',
          background: 'rgba(5,10,18,0.45)',
        }} className="custom-scrollbar">
          {positions.slice(0, 3).map((pos) => (
            <div key={pos.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 5px', borderRadius: 4,
              background: 'rgba(255,255,255,0.02)', marginBottom: 2,
              fontSize: 8,
            }}>
              {pos.side === 'BUY'
                ? <TrendingUp size={8} color={T.green} />
                : <TrendingUp size={8} color={T.red} style={{ transform: 'scaleY(-1)' }} />}
              <span style={{ color: T.text, fontWeight: 700, fontFamily: FONT_MONO }}>{pos.symbol}</span>
              <span style={{ color: pos.side === 'BUY' ? T.green : T.red, fontWeight: 800, fontSize: 7 }}>
                {pos.side === 'BUY' ? 'شراء' : 'بيع'}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{
                color: Number(pos.unrealizedPnl) >= 0 ? T.green : T.red,
                fontWeight: 800, fontFamily: FONT_MONO,
              }}>
                {Number(pos.unrealizedPnl) > 0 ? '+' : ''}{Number(pos.unrealizedPnl).toFixed(2)}
              </span>
            </div>
          ))}
          {positions.length > 3 && (
            <div style={{ fontSize: 7, color: T.text3, textAlign: 'center', padding: '2px 0' }}>
              +{positions.length - 3} أخرى
            </div>
          )}
        </div>
      )}

      {/* ── Footer: Link to Full Settings ── */}
      <Link href="/dashboard/autonomous-trader" style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '6px 8px', borderRadius: 0,
          background: isRunning
            ? 'rgba(0,255,163,0.04)'
            : 'rgba(0,212,255,0.04)',
          borderTop: `1px solid ${isRunning ? 'rgba(0,255,163,0.1)' : 'rgba(0,212,255,0.1)'}`,
          color: isRunning ? T.green : T.accent, fontSize: 9, fontWeight: 700,
          fontFamily: FONT_AR, cursor: 'pointer', transition: 'all 0.15s',
        }}>
          <Settings2 size={9} />
          لوحة التحكم الكاملة
          <ExternalLink size={8} />
        </div>
      </Link>

      {/* ── Error Warning ── */}
      {error && (
        <div style={{
          padding: '4px 8px', background: 'rgba(255,71,87,0.06)',
          borderTop: '1px solid rgba(255,71,87,0.15)',
          fontSize: 7, color: T.red, fontFamily: FONT_AR,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <AlertTriangle size={8} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>
        </div>
      )}

      {/* ── Animations ── */}
      <style>{`
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
      `}</style>
    </div>
  )
}
