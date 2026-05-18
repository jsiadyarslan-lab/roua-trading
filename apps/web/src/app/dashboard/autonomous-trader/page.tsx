'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Play, Square, AlertTriangle, Settings2, BarChart3,
  TrendingUp, TrendingDown, Activity, Shield, Clock, Zap,
  RefreshCw, ChevronDown, ChevronUp, Plus, Minus, Cpu,
  DollarSign, Target, Timer, Gauge, Layers, ArrowUpDown,
  AlertCircle, CheckCircle2, XCircle, Pause, Flame,
  RotateCcw, Rocket, PiggyBank, Brain, Eye, BarChart2
} from 'lucide-react'
import { useAgentStore, AgentStatus, StrategyType, MarketRegime, RegimeInfo } from '@/hooks/useAgentStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { fmtPriceLocale } from '@/lib/price-format'

/* ═══════════════════════════════════════════════
   Design Tokens — matching Roua Trading theme
   ═══════════════════════════════════════════════ */
import { T as _T, getPnlColor } from '@/lib/unified-tokens'
const T = {
  ..._T,
  bg3:      '#141824',
  glass:    'rgba(26, 29, 41, 0.65)',
  glow:     'rgba(0,212,255,0.15)',
}

const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ═══════════════════════════════════════════════
   Helper Functions
   ═══════════════════════════════════════════════ */
function formatUSD(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}$${Math.abs(v).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPct(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(1)}%`
}

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
  if (!status) return 'غير مُفعّل'
  switch (status) {
    case AgentStatus.RUNNING: return 'يعمل'
    case AgentStatus.PAUSED: return 'متوقف مؤقتاً'
    case AgentStatus.STOPPED: return 'متوقف'
    case AgentStatus.EMERGENCY_STOP: return 'إيقاف طارئ'
    case AgentStatus.DAILY_LIMIT_REACHED: return 'حد الخسارة اليومية'
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
    case StrategyType.VWAP_RSI: return 'VWAP + RSI'
    default: return s
  }
}

function getStrategyIcon(s: StrategyType) {
  switch (s) {
    case StrategyType.AUTO: return <Brain size={14} />
    case StrategyType.SCALPING: return <Zap size={14} />
    case StrategyType.SWING: return <TrendingUp size={14} />
    case StrategyType.GRID: return <Layers size={14} />
    case StrategyType.MEAN_REVERSION: return <RotateCcw size={14} />
    case StrategyType.MOMENTUM_BREAKOUT: return <Rocket size={14} />
    case StrategyType.DCA: return <PiggyBank size={14} />
    case StrategyType.VWAP_RSI: return <BarChart3 size={14} />
    default: return <Zap size={14} />
  }
}

function getStrategyDesc(s: StrategyType): string {
  switch (s) {
    case StrategyType.AUTO: return 'تلقائي تكيفي — يختار أفضل استراتيجية حسب ظروف السوق'
    case StrategyType.SCALPING: return 'صفقات سريعة — أرباح صغيرة متكررة'
    case StrategyType.SWING: return 'صفقات متأرجحة — أرباح أكبر على مدى أيام'
    case StrategyType.GRID: return 'شبكة أوامر — ربح من التذبذب'
    case StrategyType.MEAN_REVERSION: return 'عودة للمتوسط — نسبة فوز عالية'
    case StrategyType.MOMENTUM_BREAKOUT: return 'اختراق الزخم — ربح من الكسور الكبيرة'
    case StrategyType.DCA: return 'متوسط التكلفة — تراكم منتظم وموثوق'
    case StrategyType.VWAP_RSI: return 'VWAP + RSI — إدخالات عالية الاحتمالية'
    default: return 'استراتيجية تداول'
  }
}

/* ═══════════════════════════════════════════════
   Regime Helper Functions
   ═══════════════════════════════════════════════ */
function getRegimeLabel(regime: MarketRegime): string {
  switch (regime) {
    case MarketRegime.TRENDING_UP: return 'صعودي متجه'
    case MarketRegime.TRENDING_DOWN: return 'هبوطي متجه'
    case MarketRegime.RANGING: return 'نطاق عرضي'
    case MarketRegime.VOLATILE: return 'متقلب'
    case MarketRegime.TRANSITIONAL: return 'انتقالي'
    default: return regime
  }
}

function getRegimeColor(regime: MarketRegime): string {
  switch (regime) {
    case MarketRegime.TRENDING_UP: return '#00FFA3'
    case MarketRegime.TRENDING_DOWN: return '#FF4757'
    case MarketRegime.RANGING: return '#FFB800'
    case MarketRegime.VOLATILE: return '#FF6B9D'
    case MarketRegime.TRANSITIONAL: return '#8B92A8'
    default: return '#8B92A8'
  }
}

function getRegimeIcon(regime: MarketRegime): React.ReactNode {
  switch (regime) {
    case MarketRegime.TRENDING_UP: return <TrendingUp size={18} color="#00FFA3" />
    case MarketRegime.TRENDING_DOWN: return <TrendingDown size={18} color="#FF4757" />
    case MarketRegime.RANGING: return <ArrowUpDown size={18} color="#FFB800" />
    case MarketRegime.VOLATILE: return <Zap size={18} color="#FF6B9D" />
    case MarketRegime.TRANSITIONAL: return <Activity size={18} color="#8B92A8" />
    default: return <Activity size={18} color="#8B92A8" />
  }
}

function getMomentumLabel(dir: string): string {
  switch (dir) {
    case 'UP': return 'صعودي'
    case 'DOWN': return 'هبوطي'
    case 'FLAT': return 'محايد'
    default: return '—'
  }
}

function getVolatilityLabel(level: string): string {
  switch (level) {
    case 'LOW': return 'منخفض'
    case 'MEDIUM': return 'متوسط'
    case 'HIGH': return 'مرتفع'
    case 'EXTREME': return 'شديد'
    default: return '—'
  }
}

function getVolatilityColor(level: string): string {
  switch (level) {
    case 'LOW': return '#00FFA3'
    case 'MEDIUM': return '#FFB800'
    case 'HIGH': return '#FF6B9D'
    case 'EXTREME': return '#FF4757'
    default: return '#8B92A8'
  }
}

function getEMAAlignmentLabel(alignment: string): string {
  switch (alignment) {
    case 'BULLISH': return 'صعودي'
    case 'BEARISH': return 'هبوطي'
    case 'MIXED': return 'مختلط'
    default: return '—'
  }
}

/* ═══════════════════════════════════════════════
   Reusable Components
   ═══════════════════════════════════════════════ */
function GlassCard({ children, style, glow }: { children: React.ReactNode; style?: React.CSSProperties; glow?: string }) {
  return (
    <div style={{
      background: T.glass,
      backdropFilter: 'blur(16px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)${glow ? `, 0 0 30px ${glow}` : ''}`,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

function StatCard({ icon, label, value, subValue, color, mono }: {
  icon: React.ReactNode; label: string; value: string; subValue?: string; color?: string; mono?: boolean
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 10,
      padding: '14px 16px',
      border: `1px solid ${T.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: color || T.accent, display: 'flex' }}>{icon}</span>
        <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text2, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: mono ? FONT_MONO : FONT_AR, fontSize: 18, color: color || T.text, fontWeight: 800, direction: 'ltr', textAlign: 'right' }}>
        {value}
      </div>
      {subValue && (
        <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>{subValue}</div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════ */
export default function AutonomousTraderPage() {
  useScopedStyle(AGENT_CSS)
  const {
    agentState, performance, positions, logs, loading, error,
    fetchStatus, fetchCredentials, startAgent, stopAgent, changeStrategy, updateRiskParams,
    fetchPerformance, fetchPositions, startAutoRefresh, stopAutoRefresh, addLog,
    selectedCredentialId, availableCredentials,
    settings, systemStatus, fetchSettings, updateSettings, fetchSystemStatus, updateSystemSettings,
    regimeInfo, fetchRegimeInfo,
  } = useAgentStore()

  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'performance' | 'settings'>('overview')
  const [showStrategyPicker, setShowStrategyPicker] = useState(false)
  const [confirmEmergency, setConfirmEmergency] = useState(false)
  const [enablingSystem, setEnablingSystem] = useState(false)
  const [enableSystemResult, setEnableSystemResult] = useState<'idle' | 'success' | 'error'>('idle')

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const config = agentState?.config
  const strategy = config?.strategy ?? StrategyType.AUTO
  const hasCredential = !!selectedCredentialId && selectedCredentialId.trim() !== ''
  const isPaperTrading = config?.isPaperTrading ?? false
  const globalAutoTrading = systemStatus?.globalAutoTradingEnabled ?? true

  // ── Initial load & auto-refresh ──
  useEffect(() => {
    fetchStatus()
    fetchCredentials()
    fetchPerformance()
    fetchPositions()
    fetchSettings()
    fetchSystemStatus()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [fetchStatus, fetchCredentials, fetchPerformance, fetchPositions, fetchSettings, fetchSystemStatus, startAutoRefresh, stopAutoRefresh])

  // ── Fetch regime info when AUTO strategy is active ──
  useEffect(() => {
    if (config?.strategy === StrategyType.AUTO && isRunning) {
      const firstSymbol = config?.symbols?.[0] || 'BTC/USDT'
      fetchRegimeInfo(firstSymbol)
    }
  }, [config?.strategy, isRunning, fetchRegimeInfo])

  // ── Tab definitions ──
  const TABS = [
    { id: 'overview' as const, label: 'نظرة عامة', icon: <Bot size={14} /> },
    { id: 'positions' as const, label: 'المراكز', icon: <ArrowUpDown size={14} /> },
    { id: 'performance' as const, label: 'الأداء', icon: <BarChart3 size={14} /> },
    { id: 'settings' as const, label: 'الإعدادات', icon: <Settings2 size={14} /> },
  ]

  return (
    <>
      {/* Scoped styles via useScopedStyle */}
      <div dir="rtl" style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: FONT_AR }}>
        {/* ── Header ── */}
        <div style={{
          padding: '24px 28px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Agent Avatar */}
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: `linear-gradient(135deg, ${isRunning ? '#00FFA3' : T.accent}, ${isRunning ? '#00B894' : '#0A84FF'})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isRunning ? `0 0 24px rgba(0,255,163,0.3)` : `0 0 24px ${T.glow}`,
              transition: 'all 0.4s ease',
            }}>
              <Cpu size={26} color="#000" strokeWidth={2.5} />
            </div>
            <div>
              <h1 style={{ fontFamily: FONT_AR, fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>
                وكيل التداول الذاتي
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                {/* Status LED */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: getStatusColor(status),
                  boxShadow: `0 0 8px ${getStatusColor(status)}`,
                  animation: isRunning ? 'agent-pulse 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: getStatusColor(status) }}>
                  {getStatusLabel(status)}
                </span>
                {isPaperTrading && isRunning && (
                  <span style={{
                    fontFamily: FONT_AR, fontSize: 9, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 6,
                    background: `${T.accent}15`, color: T.accent,
                    border: `1px solid ${T.accent}30`,
                  }}>
                    ورقي
                  </span>
                )}
                {config && (
                  <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginInlineEnd: 8 }}>
                    • {getStrategyLabel(config.strategy as StrategyType)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isRunning && status !== AgentStatus.EMERGENCY_STOP && !agentState && (
              <button
                onClick={() => setShowStrategyPicker(!showStrategyPicker)}
                disabled={loading}
                title={!hasCredential ? 'سيتم التفعيل في وضع التداول الورقي (بدون أموال حقيقية)' : undefined}
                style={{
                  ...btnStyle,
                  background: 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                  color: '#000',
                  fontWeight: 800,
                  padding: '10px 24px',
                  fontSize: 13,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                <Play size={15} />
                {hasCredential ? 'تفعيل الوكيل' : 'تفعيل الوكيل (ورقي)'}
              </button>
            )}
            {isRunning && (
              <>
                <button
                  onClick={() => stopAgent(false)}
                  disabled={loading}
                  style={{
                    ...btnStyle,
                    background: 'rgba(255,255,255,0.08)',
                    color: T.amber,
                    border: `1px solid rgba(255,184,0,0.3)`,
                  }}
                >
                  <Pause size={14} />
                  إيقاف مؤقت
                </button>
                {!confirmEmergency ? (
                  <button
                    onClick={() => setConfirmEmergency(true)}
                    disabled={loading}
                    style={{
                      ...btnStyle,
                      background: 'rgba(255,71,87,0.10)',
                      color: T.red,
                      border: `1px solid rgba(255,71,87,0.3)`,
                    }}
                  >
                    <AlertTriangle size={14} />
                    إيقاف طارئ
                  </button>
                ) : (
                  <button
                    onClick={async () => { await stopAgent(true); setConfirmEmergency(false) }}
                    disabled={loading}
                    style={{
                      ...btnStyle,
                      background: T.red,
                      color: '#fff',
                      fontWeight: 800,
                      animation: 'agent-pulse 1s ease-in-out infinite',
                    }}
                  >
                    <Flame size={14} />
                    تأكيد الإيقاف الطارئ
                  </button>
                )}
              </>
            )}
            {(status === AgentStatus.STOPPED || status === AgentStatus.EMERGENCY_STOP || status === AgentStatus.PAUSED) && !isRunning && agentState && (
              <button
                onClick={() => startAgent(config?.strategy ?? StrategyType.AUTO)}
                disabled={loading}
                style={{
                  ...btnStyle,
                  background: 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                  color: '#000',
                  fontWeight: 800,
                }}
              >
                <Play size={14} />
                إعادة التفعيل
              </button>
            )}
            {/* FIX: Allow restart when daily limit reached — user can override and continue trading */}
            {status === AgentStatus.DAILY_LIMIT_REACHED && !isRunning && agentState && (
              <button
                onClick={() => startAgent(config?.strategy ?? StrategyType.AUTO)}
                disabled={loading}
                style={{
                  ...btnStyle,
                  background: 'linear-gradient(135deg, #FFB800, #FF9F43)',
                  color: '#000',
                  fontWeight: 800,
                }}
              >
                <RotateCcw size={14} />
                تجاوز الحد وإعادة التفعيل
              </button>
            )}
          </div>
        </div>

        {/* ── Strategy Picker Modal ── */}
        {showStrategyPicker && (
          <div style={{
            margin: '16px 28px 0',
            animation: 'fadeInSlideUp 0.25s ease-out',
          }}>
            <GlassCard>
              <div style={{ padding: 20 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, marginBottom: 16, color: T.text }}>
                  اختر استراتيجية التداول
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {/* FIX: SCALPING removed — it belongs to the Smart Executor (المنفذ الذكي), not the Agent */}
                  {[StrategyType.AUTO, StrategyType.SWING, StrategyType.GRID, StrategyType.MEAN_REVERSION, StrategyType.MOMENTUM_BREAKOUT, StrategyType.DCA, StrategyType.VWAP_RSI].map((s) => {
                    const isActive = strategy === s
                    const accentMap: Record<StrategyType, string> = {
                      [StrategyType.AUTO]: '#FF9F43',
                      [StrategyType.SWING]: '#00FFA3',
                      [StrategyType.GRID]: '#B388FF',
                      [StrategyType.MEAN_REVERSION]: '#FFB800',
                      [StrategyType.MOMENTUM_BREAKOUT]: '#FF6B9D',
                      [StrategyType.DCA]: '#00B894',
                      [StrategyType.VWAP_RSI]: '#A29BFE',
                      [StrategyType.SCALPING]: '#00D4FF', // kept for type safety even though removed from UI
                    }
                    const accent = accentMap[s]
                    return (
                      <button
                        key={s}
                        onClick={async () => {
                          if (isRunning) {
                            await changeStrategy(s)
                          } else {
                            await startAgent(s)
                          }
                          setShowStrategyPicker(false)
                        }}
                        style={{
                          background: isActive ? `${accent}15` : 'rgba(255,255,255,0.03)',
                          border: `1.5px solid ${isActive ? accent : T.border}`,
                          borderRadius: 12,
                          padding: '18px 16px',
                          cursor: 'pointer',
                          textAlign: 'right',
                          transition: 'all 0.2s',
                          direction: 'rtl',
                        }}
                        onMouseEnter={e => {
                          if (!isActive) { e.currentTarget.style.borderColor = `${accent}55`; e.currentTarget.style.background = `${accent}08` }
                        }}
                        onMouseLeave={e => {
                          if (!isActive) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ color: accent, display: 'flex' }}>{getStrategyIcon(s)}</span>
                          <span style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: isActive ? accent : T.text }}>
                            {getStrategyLabel(s)}
                          </span>
                        </div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, lineHeight: 1.6 }}>
                          {getStrategyDesc(s)}
                        </div>
                        <div style={{
                          marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap',
                        }}>
                          {s === StrategyType.AUTO && (
                            <>
                              <StrategyTag label="كشف النظام تلقائي" />
                              <StrategyTag label="تبديل ذكي" />
                              <StrategyTag label="مُوصى به" />
                            </>
                          )}
                          {s === StrategyType.SCALPING && (
                            <>
                              <StrategyTag label="فريم: 1m-5m" />
                              <StrategyTag label="TP: 1.5x ATR" />
                              <StrategyTag label="SL: 1x ATR" />
                            </>
                          )}
                          {s === StrategyType.SWING && (
                            <>
                              <StrategyTag label="فريم: 1h-4h" />
                              <StrategyTag label="TP: 4x ATR" />
                              <StrategyTag label="SL: 2x ATR" />
                            </>
                          )}
                          {s === StrategyType.GRID && (
                            <>
                              <StrategyTag label="أوامر حدية" />
                              <StrategyTag label="ربح من التذبذب" />
                              <StrategyTag label="بدون اتجاه" />
                            </>
                          )}
                          {s === StrategyType.MEAN_REVERSION && (
                            <>
                              <StrategyTag label="نسبة فوز: 60-70%" />
                              <StrategyTag label="TP: عند المتوسط" />
                              <StrategyTag label="SL: 2x ATR" />
                            </>
                          )}
                          {s === StrategyType.MOMENTUM_BREAKOUT && (
                            <>
                              <StrategyTag label="اختراقات قوية" />
                              <StrategyTag label="TP: 3x ATR" />
                              <StrategyTag label="SL: 1.5x ATR" />
                            </>
                          )}
                          {s === StrategyType.DCA && (
                            <>
                              <StrategyTag label="تراكم منتظم" />
                              <StrategyTag label="نسبة فوز: 70-80%" />
                              <StrategyTag label="شراء ذكي" />
                            </>
                          )}
                          {s === StrategyType.VWAP_RSI && (
                            <>
                              <StrategyTag label="VWAP + RSI" />
                              <StrategyTag label="TP: 2.5x ATR" />
                              <StrategyTag label="إدخالات محترفة" />
                            </>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* ── Stats Bar ── */}
        <div style={{
          padding: '20px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}>
          <StatCard
            icon={<DollarSign size={13} />}
            label="ربح/خسارة اليوم"
            value={formatUSD(agentState?.dailyPnL)}
            color={(agentState?.dailyPnL ?? 0) > 0 ? T.green : (agentState?.dailyPnL ?? 0) < 0 ? T.red : T.text2}
            mono
          />
          <StatCard
            icon={<Activity size={13} />}
            label="صفقاتك اليوم"
            value={String(agentState?.dailyTradesCount ?? 0)}
            color={T.accent}
          />
          <StatCard
            icon={<Target size={13} />}
            label="نسبة الفوز"
            value={formatPct(performance?.winRate)}
            color={(performance?.winRate ?? 0) >= 50 ? T.green : T.red}
          />
          <StatCard
            icon={<Shield size={13} />}
            label="المراكز المفتوحة"
            value={String(positions.length)}
            subValue={`الحد: ${config?.maxOpenPositions ?? 15}`}  // V143: Changed from 5 to 15
            color={T.purple}
          />
          <StatCard
            icon={<AlertCircle size={13} />}
            label="خسائر متتالية"
            value={String(agentState?.consecutiveLosses ?? 0)}
            color={(agentState?.consecutiveLosses ?? 0) >= 3 ? T.red : T.text2}
          />
          <StatCard
            icon={<Clock size={13} />}
            label="دورات الوكيل"
            value={String(agentState?.totalCycles ?? 0)}
            subValue={agentState?.lastCycleAt ? `آخر دورة: ${new Date(agentState.lastCycleAt).toLocaleTimeString('ar-EG')}` : undefined}
            color={T.text2}
          />
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div style={{
            margin: '0 28px 16px', padding: '12px 18px',
            background: 'rgba(255,71,87,0.10)',
            border: `1px solid rgba(255,71,87,0.25)`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: FONT_AR, fontSize: 12, color: T.red,
          }}>
            <XCircle size={16} />
            {error}
          </div>
        )}

        {/* ── No Credential Info Banner ── */}
        {!hasCredential && !isRunning && (
          <div style={{
            margin: '0 28px 16px', padding: '14px 18px',
            background: 'rgba(0,212,255,0.06)',
            border: `1px solid rgba(0,212,255,0.20)`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: FONT_AR, fontSize: 12, color: T.accent,
          }}>
            <Activity size={16} />
            <span>
              <strong>وضع التداول الورقي</strong> — سيتم تفعيل الوكيل في وضع تجريبي بأموال وهمية. لربط بورصة حقيقية، أضف مفتاح API من صفحة المحفظة.
            </span>
          </div>
        )}

        {/* ── Global Auto Trading Disabled Banner ── */}
        {!globalAutoTrading && (
          <div style={{
            margin: '0 28px 16px', padding: '16px 20px',
            background: 'rgba(255,71,87,0.08)',
            border: `1px solid rgba(255,71,87,0.25)`,
            borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 14,
            fontFamily: FONT_AR,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11,
              background: 'rgba(255,71,87,0.12)',
              border: '1px solid rgba(255,71,87,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <AlertCircle size={22} color={T.red} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.red, marginBottom: 4 }}>
                التداول الذاتي معطّل على مستوى النظام
              </div>
              <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.7 }}>
                وكيل التداول لا يعمل لأن التداول الذاتي معطّل.{' '}
                {systemStatus?.source === 'database'
                  ? 'الإعداد محفوظ في قاعدة البيانات — اضغط الزر لتفعيله فوراً.'
                  : 'الإعداد يأتي من متغيرات البيئة (env) — اضغط الزر لحفظه في قاعدة البيانات وتفعيله.'
                }
              </div>
            </div>
            <button
              onClick={async () => {
                setEnablingSystem(true)
                setEnableSystemResult('idle')
                try {
                  await updateSystemSettings({ autoTradingEnabled: true })
                  setEnableSystemResult('success')
                  setTimeout(() => setEnableSystemResult('idle'), 3000)
                } catch {
                  setEnableSystemResult('error')
                  setTimeout(() => setEnableSystemResult('idle'), 3000)
                }
                setEnablingSystem(false)
              }}
              disabled={enablingSystem}
              style={{
                padding: '10px 24px', borderRadius: 10,
                background: enableSystemResult === 'success' ? T.green
                  : enableSystemResult === 'error' ? T.red
                  : 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                border: 'none', color: '#000',
                fontFamily: FONT_AR, fontSize: 13, fontWeight: 800,
                cursor: enablingSystem ? 'wait' : 'pointer',
                transition: 'all 0.2s', flexShrink: 0,
                opacity: enablingSystem ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {enablingSystem ? <RefreshCw size={14} style={{ animation: 'agent-spin 1s linear infinite' }} />
               : enableSystemResult === 'success' ? <CheckCircle2 size={14} />
               : enableSystemResult === 'error' ? <XCircle size={14} />
               : <Play size={14} />}
              {enablingSystem ? 'جارٍ التفعيل...'
               : enableSystemResult === 'success' ? 'تم التفعيل!'
               : enableSystemResult === 'error' ? 'فشل التفعيل'
               : 'تفعيل الآن'}
            </button>
          </div>
        )}

        {/* ── Emergency Warning Banner ── */}
        {status === AgentStatus.EMERGENCY_STOP && (
          <div style={{
            margin: '0 28px 16px', padding: '14px 18px',
            background: 'rgba(255,71,87,0.12)',
            border: `1px solid rgba(255,71,87,0.3)`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: FONT_AR, fontSize: 13, color: T.red, fontWeight: 700,
            animation: 'agent-pulse 2s ease-in-out infinite',
          }}>
            <AlertTriangle size={18} />
            تم الإيقاف الطارئ — تم إغلاق جميع المراكز. يمكنك إعادة التفعيل عند الاستعداد.
          </div>
        )}

        {/* ── Daily Limit Banner ── */}
        {status === AgentStatus.DAILY_LIMIT_REACHED && (
          <div style={{
            margin: '0 28px 16px', padding: '14px 18px',
            background: 'rgba(255,184,0,0.10)',
            border: `1px solid rgba(255,184,0,0.3)`,
            borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: FONT_AR, fontSize: 13, color: T.amber, fontWeight: 700,
          }}>
            <AlertTriangle size={18} />
            تم بلوغ حد الخسارة اليومية ({config?.maxDailyLossPercent ?? 5}%) — اضغط "تجاوز الحد" للاستمرار، أو انتظر حتى بداية يوم جديد.
          </div>
        )}

        {/* ── Tab Navigation ── */}
        <div style={{
          padding: '0 28px',
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: 20,
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '12px 20px',
                  fontFamily: FONT_AR, fontSize: 12, fontWeight: isActive ? 800 : 500,
                  color: isActive ? T.accent : T.text2,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'positions' && positions.length > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    padding: '1px 6px', borderRadius: 8,
                    background: `${T.accent}20`, color: T.accent,
                    fontFamily: FONT_MONO,
                  }}>{positions.length}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '0 28px 40px' }}>
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'positions' && <PositionsTab />}
          {activeTab === 'performance' && <PerformanceTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </>
  )

  /* ═══════════════════════════════════════════════
     Overview Tab
     ═══════════════════════════════════════════════ */
  function OverviewTab() {
    const [expandedLog, setExpandedLog] = useState(false)
    // FIX: Log filter — allows users to filter by type to reduce clutter
    const [logFilter, setLogFilter] = useState<'all' | 'trade' | 'warning' | 'error' | 'info'>('all')
    const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => {
      if (logFilter === 'trade') return l.type === 'trade' || l.type === 'success'
      if (logFilter === 'warning') return l.type === 'warning'
      if (logFilter === 'error') return l.type === 'error'
      if (logFilter === 'info') return l.type === 'info'
      return true
    })
    const displayLogs = expandedLog ? filteredLogs : filteredLogs.slice(0, 8)

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left Column: Agent Info + Live Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Agent Status Card */}
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={15} color={T.accent} />
                حالة الوكيل
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <InfoRow label="الحالة" value={getStatusLabel(status)} valueColor={getStatusColor(status)} />
                <InfoRow label="الاستراتيجية" value={config ? getStrategyLabel(config.strategy as StrategyType) : '—'} />
                <InfoRow label="مُفعّل منذ" value={agentState?.startedAt ? new Date(agentState.startedAt).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'} />
                <InfoRow label="آخر دورة" value={agentState?.lastCycleAt ? new Date(agentState.lastCycleAt).toLocaleTimeString('ar-EG') : '—'} />
                <InfoRow label="الرموز" value={config?.symbols?.length ? `${config.symbols.length} رمز` : '—'} />
                <InfoRow label="خطر/صفقة" value={config ? `${config.riskPerTradePercent}%` : '—'} />
              </div>

              {/* Safety Badges */}
              <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <SafetyBadge icon={<Shield size={10} />} label="وقف خسارة إلزامي" color={T.green} />
                <SafetyBadge icon={<AlertTriangle size={10} />} label="حد خسارة يومي" color={T.amber} />
                <SafetyBadge icon={<XCircle size={10} />} label="بدون سحب" color={T.red} />
                <SafetyBadge icon={<CheckCircle2 size={10} />} label="تدقيق كامل" color={T.accent} />
              </div>
            </div>
          </GlassCard>

          {/* Current Strategy */}
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color={T.purple} />
                الاستراتيجية النشطة
              </div>
              {config ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ color: T.accent, display: 'flex' }}>{getStrategyIcon(config.strategy as StrategyType)}</span>
                    <span style={{ fontFamily: FONT_AR, fontSize: 16, fontWeight: 900, color: T.text }}>
                      {getStrategyLabel(config.strategy as StrategyType)}
                    </span>
                  </div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, lineHeight: 1.8, marginBottom: 12 }}>
                    {getStrategyDesc(config.strategy as StrategyType)}
                  </div>
                  {/* Strategy Params */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {config.strategy === StrategyType.AUTO && (
                      <>
                        <StrategyTag label="كشف النظام تلقائي" />
                        <StrategyTag label="تبديل ذكي" />
                        <StrategyTag label="مُوصى به" />
                      </>
                    )}
                    {config.strategy === StrategyType.SCALPING && (
                      <>
                        <StrategyTag label={`فريم: ${config.strategyParams?.scalpingTimeframe || '5m'}`} />
                        <StrategyTag label={`TP: ${config.strategyParams?.scalpingTakeProfitPips || '1.5x'} ATR`} />
                        <StrategyTag label={`SL: ${config.strategyParams?.scalpingStopLossPips || '1x'} ATR`} />
                        <StrategyTag label={`سبريد أقصى: ${config.strategyParams?.scalpingMaxSpread || '3'}`} />
                      </>
                    )}
                    {config.strategy === StrategyType.SWING && (
                      <>
                        <StrategyTag label={`فريم: ${config.strategyParams?.swingTimeframe || '4h'}`} />
                        <StrategyTag label={`فترة الاحتفاظ: ${config.strategyParams?.swingHoldingPeriodHours || '72'}س`} />
                        <StrategyTag label={`اتجاه: ${config.strategyParams?.swingTrendLookback || '20'}`} />
                      </>
                    )}
                    {config.strategy === StrategyType.GRID && (
                      <>
                        <StrategyTag label={`مستويات: ${config.strategyParams?.gridLevels || '5'}`} />
                        <StrategyTag label={`تباعد: ${config.strategyParams?.gridSpacingPercent || '1'}%`} />
                        <StrategyTag label={`كمية/مستوى: ${config.strategyParams?.gridQuantityPerLevel || '0.01'}`} />
                      </>
                    )}
                    {config.strategy === StrategyType.MEAN_REVERSION && (
                      <>
                        <StrategyTag label={`RSI شراء: <${config.strategyParams?.meanReversionRsiOversold || '30'}`} />
                        <StrategyTag label={`RSI بيع: >${config.strategyParams?.meanReversionRsiOverbought || '70'}`} />
                        <StrategyTag label={`انحراف: ${config.strategyParams?.meanReversionDeviation || '1.5'}σ`} />
                      </>
                    )}
                    {config.strategy === StrategyType.MOMENTUM_BREAKOUT && (
                      <>
                        <StrategyTag label="اختراقات BB" />
                        <StrategyTag label="زخم RSI + MACD" />
                        <StrategyTag label="SL: 1.5x ATR" />
                      </>
                    )}
                    {config.strategy === StrategyType.DCA && (
                      <>
                        <StrategyTag label={`حجم أساسي: ${config.strategyParams?.dcaBaseMultiplier || '1'}x`} />
                        <StrategyTag label={`خصم RSI: <${config.strategyParams?.dcaDiscountRsi || '40'}`} />
                        <StrategyTag label={`تخطي RSI: >${config.strategyParams?.dcaSkipRsi || '70'}`} />
                      </>
                    )}
                    {config.strategy === StrategyType.VWAP_RSI && (
                      <>
                        <StrategyTag label="VWAP = EMA21" />
                        <StrategyTag label={`RSI شراء: ${config.strategyParams?.vwapRsiBuyMin || '50'}-${config.strategyParams?.vwapRsiBuyMax || '70'}`} />
                        <StrategyTag label={`RSI بيع: ${config.strategyParams?.vwapRsiSellMin || '30'}-${config.strategyParams?.vwapRsiSellMax || '50'}`} />
                      </>
                    )}
                  </div>
                  {isRunning && (
                    <button
                      onClick={() => setShowStrategyPicker(true)}
                      style={{
                        marginTop: 14, ...btnStyle,
                        background: 'rgba(255,255,255,0.06)',
                        color: T.accent,
                        border: `1px solid rgba(0,212,255,0.2)`,
                        fontSize: 11,
                        padding: '8px 16px',
                      }}
                    >
                      تغيير الاستراتيجية
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ fontFamily: FONT_AR, fontSize: 12, color: T.text3, textAlign: 'center', padding: '20px 0' }}>
                  قم بتفعيل الوكيل لاختيار استراتيجية
                </div>
              )}
            </div>
          </GlassCard>

          {/* Regime Info Card — Only when AUTO strategy is active */}
          {config?.strategy === StrategyType.AUTO && (
            <GlassCard glow="rgba(255,159,67,0.08)">
              <div style={{ padding: 20 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Eye size={15} color="#FF9F43" />
                  تحليل النظام (AUTO)
                  <button
                    onClick={() => {
                      const sym = config?.symbols?.[0] || 'BTC/USDT'
                      fetchRegimeInfo(sym)
                    }}
                    style={{
                      ...btnStyle, padding: '4px 10px', fontSize: 10,
                      background: 'rgba(255,255,255,0.06)', color: T.text3,
                      marginInlineEnd: 'auto',
                    }}
                  >
                    <RefreshCw size={10} />
                    تحديث
                  </button>
                </div>

                {regimeInfo ? (
                  <div>
                    {/* Current Regime */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10,
                      background: `${getRegimeColor(regimeInfo.regime)}12`,
                      border: `1px solid ${getRegimeColor(regimeInfo.regime)}30`,
                      marginBottom: 14,
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: `${getRegimeColor(regimeInfo.regime)}20`,
                        border: `1px solid ${getRegimeColor(regimeInfo.regime)}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {getRegimeIcon(regimeInfo.regime)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONT_AR, fontSize: 14, fontWeight: 800, color: getRegimeColor(regimeInfo.regime) }}>
                          {getRegimeLabel(regimeInfo.regime)}
                        </div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>
                          ثقة: {regimeInfo.confidence}% • ADX: {regimeInfo.indicators?.adxProxy?.toFixed(0) || '—'} • زخم: {getMomentumLabel(regimeInfo.indicators?.momentumDirection)}
                        </div>
                      </div>
                    </div>

                    {/* Auto-selected Strategy */}
                    {regimeInfo.currentStrategy && (
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${T.border}`,
                        marginBottom: 12,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>الاستراتيجية المختارة:</span>
                        <span style={{ color: T.accent, display: 'flex' }}>{getStrategyIcon(regimeInfo.currentStrategy)}</span>
                        <span style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, color: T.text }}>
                          {getStrategyLabel(regimeInfo.currentStrategy)}
                        </span>
                      </div>
                    )}

                    {/* Strategy Scores */}
                    {regimeInfo.strategyScores && regimeInfo.strategyScores.length > 0 && (
                      <div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 8 }}>
                          ترتيب الاستراتيجيات
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {regimeInfo.strategyScores.slice(0, 5).map((score, i) => (
                            <div key={score.strategy} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 10px', borderRadius: 6,
                              background: i === 0 ? 'rgba(255,159,67,0.08)' : 'transparent',
                              border: i === 0 ? '1px solid rgba(255,159,67,0.2)' : '1px solid transparent',
                            }}>
                              <span style={{
                                fontFamily: FONT_MONO, fontSize: 9, fontWeight: 800,
                                color: i === 0 ? '#FF9F43' : T.text3,
                                width: 16, textAlign: 'center',
                              }}>#{i + 1}</span>
                              <span style={{ color: i === 0 ? T.accent : T.text3, display: 'flex' }}>{getStrategyIcon(score.strategy)}</span>
                              <span style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? T.text : T.text2, flex: 1 }}>
                                {getStrategyLabel(score.strategy)}
                              </span>
                              <div style={{
                                width: 60, height: 6, borderRadius: 3,
                                background: 'rgba(255,255,255,0.06)',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${score.score}%`, height: '100%', borderRadius: 3,
                                  background: i === 0
                                    ? 'linear-gradient(90deg, #FF9F43, #FFB800)'
                                    : score.score > 50 ? T.accent : T.text3,
                                }} />
                              </div>
                              <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, color: i === 0 ? '#FF9F43' : T.text3, width: 28, textAlign: 'left' }}>
                                {score.score}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Indicators Summary */}
                    <div style={{
                      marginTop: 12, paddingTop: 12,
                      borderTop: `1px solid ${T.border}`,
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: FONT_AR, fontSize: 8, color: T.text3 }}>قوة الاتجاه</div>
                        <div style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 800, color: T.text }}>{regimeInfo.indicators?.trendStrength ?? '—'}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: FONT_AR, fontSize: 8, color: T.text3 }}>تقلب</div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 800, color: getVolatilityColor(regimeInfo.indicators?.volatilityLevel) }}>{getVolatilityLabel(regimeInfo.indicators?.volatilityLevel)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: FONT_AR, fontSize: 8, color: T.text3 }}>EMA</div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 800, color: regimeInfo.indicators?.emaAlignment === 'BULLISH' ? T.green : regimeInfo.indicators?.emaAlignment === 'BEARISH' ? T.red : T.text3 }}>{getEMAAlignmentLabel(regimeInfo.indicators?.emaAlignment)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '20px 0', textAlign: 'center',
                    fontFamily: FONT_AR, fontSize: 11, color: T.text3,
                  }}>
                    <Brain size={24} style={{ marginBottom: 8, opacity: 0.3 }} />
                    <div>اضغط "تحديث" لعرض تحليل النظام الحالي</div>
                    <div style={{ fontSize: 9, marginTop: 4 }}>يحلل الوضع الحالي للسوق ويختار أفضل استراتيجية تلقائياً</div>
                  </div>
                )}
              </div>
            </GlassCard>
          )}
        </div>

        {/* Right Column: Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GlassCard style={{ flex: 1 }}>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Timer size={15} color={T.accent} />
                  سجل الأحداث
                </div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3 }}>
                  {filteredLogs.length} حدث
                </span>
              </div>

              {/* FIX: Log Filter Buttons */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                {([
                  { key: 'all', label: 'الكل', color: T.text3 },
                  { key: 'trade', label: 'صفقات', color: T.purple },
                  { key: 'warning', label: 'تحذيرات', color: T.amber },
                  { key: 'error', label: 'أخطاء', color: T.red },
                  { key: 'info', label: 'معلومات', color: T.accent },
                ] as const).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setLogFilter(f.key)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: `1px solid ${logFilter === f.key ? f.color : 'rgba(255,255,255,0.08)'}`,
                      background: logFilter === f.key ? `${f.color}18` : 'transparent',
                      color: logFilter === f.key ? f.color : T.text3,
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: FONT_AR,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 420, direction: 'ltr' }} className="custom-scrollbar">
                {displayLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: FONT_AR, fontSize: 12, color: T.text3, direction: 'rtl' }}>
                    لا توجد أحداث بعد — فعل الوكيل للبدء
                  </div>
                ) : (
                  displayLogs.map((log, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 8, padding: '8px 10px',
                      borderBottom: i < displayLogs.length - 1 ? `1px solid ${T.border}` : 'none',
                      fontFamily: FONT_AR, fontSize: 11,
                      animation: i === 0 ? 'fadeInSlideUp 0.3s ease-out' : 'none',
                    }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.text3, whiteSpace: 'nowrap', paddingTop: 1 }}>
                        {log.time}
                      </span>
                      <span style={{
                        color: log.type === 'success' ? T.green
                          : log.type === 'error' ? T.red
                          : log.type === 'warning' ? T.amber
                          : log.type === 'trade' ? T.purple
                          : T.text2,
                        direction: 'rtl',
                      }}>
                        {log.msg}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {filteredLogs.length > 8 && (
                <button
                  onClick={() => setExpandedLog(!expandedLog)}
                  style={{
                    ...btnStyle, width: '100', marginTop: 10,
                    background: 'rgba(255,255,255,0.04)', color: T.text3,
                    fontSize: 11, padding: '8px 0', justifyContent: 'center',
                  }}
                >
                  {expandedLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expandedLog ? 'عرض أقل' : `عرض الكل (${filteredLogs.length})`}
                </button>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════
     Positions Tab
     ═══════════════════════════════════════════════ */
  function PositionsTab() {
    if (positions.length === 0) {
      return (
        <GlassCard>
          <div style={{
            padding: '60px 20px', textAlign: 'center',
            fontFamily: FONT_AR, color: T.text3,
          }}>
            <ArrowUpDown size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>لا توجد مراكز مفتوحة</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>سيتم عرض المراكز هنا عندما يفتح الوكيل صفقات</div>
          </div>
        </GlassCard>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {positions.map((pos, i) => {
          const isBuy = pos.side === 'BUY'
          const pnlColor = pos.unrealizedPnl > 0 ? T.green : pos.unrealizedPnl < 0 ? T.red : T.text2
          return (
            <GlassCard key={pos.id}>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Side Indicator */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: isBuy ? 'rgba(0,255,163,0.10)' : 'rgba(255,71,87,0.10)',
                  border: `1px solid ${isBuy ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isBuy ? <TrendingUp size={16} color={T.green} /> : <TrendingDown size={16} color={T.red} />}
                </div>

                {/* Symbol + Strategy */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 800, color: T.text }}>{pos.symbol}</span>
                    <span style={{
                      fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 4,
                      background: isBuy ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
                      color: isBuy ? T.green : T.red,
                    }}>{pos.side}</span>
                    <span style={{
                      fontFamily: FONT_AR, fontSize: 9, padding: '2px 6px', borderRadius: 4,
                      background: `${T.purple}15`, color: T.purple,
                    }}>{getStrategyLabel(pos.strategy as StrategyType)}</span>
                  </div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 3, direction: 'rtl' }}>
                    {pos.reasoning?.substring(0, 80)}{pos.reasoning?.length > 80 ? '...' : ''}
                  </div>
                </div>

                {/* Prices */}
                <div style={{ textAlign: 'left', direction: 'ltr' }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.text }}>
                    {fmtPriceLocale(Number(pos.entryPrice), pos.symbol)}
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3 }}>
                    → {pos.currentPrice ? fmtPriceLocale(Number(pos.currentPrice), pos.symbol) : '—'}
                  </div>
                </div>

                {/* SL/TP */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: FONT_AR, fontSize: 8, color: T.text3 }}>SL</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.red }}>{pos.stopLoss ? fmtPriceLocale(Number(pos.stopLoss), pos.symbol) : '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: FONT_AR, fontSize: 8, color: T.text3 }}>TP</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.green }}>{pos.takeProfit ? fmtPriceLocale(Number(pos.takeProfit), pos.symbol) : '—'}</div>
                    </div>
                  </div>
                </div>

                {/* PnL */}
                <div style={{
                  textAlign: 'left', direction: 'ltr',
                  padding: '8px 14px', borderRadius: 8,
                  background: pos.unrealizedPnl > 0 ? 'rgba(0,255,163,0.08)' : pos.unrealizedPnl < 0 ? 'rgba(255,71,87,0.08)' : 'rgba(139,146,168,0.06)',
                  border: `1px solid ${pos.unrealizedPnl > 0 ? 'rgba(0,255,163,0.15)' : pos.unrealizedPnl < 0 ? 'rgba(255,71,87,0.15)' : 'rgba(139,146,168,0.1)'}`,
                }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 800, color: pnlColor }}>
                    {formatUSD(pos.unrealizedPnl)}
                  </div>
                </div>

                {/* Confidence + Risk */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <MiniGauge value={pos.confidence} max={100} color={T.accent} label="ثقة" />
                    <MiniGauge value={pos.riskScore} max={100} color={T.amber} label="خطر" />
                  </div>
                </div>
              </div>
            </GlassCard>
          )
        })}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════
     Performance Tab
     ═══════════════════════════════════════════════ */
  function PerformanceTab() {
    if (!performance) {
      return (
        <GlassCard>
          <div style={{
            padding: '60px 20px', textAlign: 'center',
            fontFamily: FONT_AR, color: T.text3,
          }}>
            <BarChart3 size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>لا توجد بيانات أداء</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>ستظهر الإحصائيات بعد تنفيذ أول صفقة</div>
          </div>
        </GlassCard>
      )
    }

    const pnlColor = performance.totalPnL > 0 ? T.green : performance.totalPnL < 0 ? T.red : T.text2
    const winRateColor = performance.winRate >= 50 ? T.green : T.red

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Top Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <GlassCard>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginBottom: 8 }}>إجمالي الربح/الخسارة</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 900, color: pnlColor }}>
                {formatUSD(performance.totalPnL)}
              </div>
            </div>
          </GlassCard>
          <GlassCard>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginBottom: 8 }}>نسبة الفوز</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 900, color: winRateColor }}>
                {performance.winRate.toFixed(1)}%
              </div>
              <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 4 }}>
                {performance.winningTrades} فوز / {performance.losingTrades} خسارة
              </div>
            </div>
          </GlassCard>
          <GlassCard>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginBottom: 8 }}>عامل الربح</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 900, color: performance.profitFactor >= 1.5 ? T.green : T.amber }}>
                {performance.profitFactor.toFixed(2)}
              </div>
            </div>
          </GlassCard>
          <GlassCard>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 11, color: T.text3, marginBottom: 8 }}>أقصى تراجع</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 900, color: T.red }}>
                {performance.maxDrawdownPercent.toFixed(1)}%
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text3, marginTop: 4 }}>
                ${Math.abs(performance.maxDrawdown).toLocaleString('en', { maximumFractionDigits: 2 })}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Detailed Metrics */}
        <GlassCard>
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Gauge size={15} color={T.accent} />
              مقاييس تفصيلية
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
              <DetailMetric label="إجمالي الصفقات" value={String(performance.totalTrades)} />
              <DetailMetric label="متوسط الربح" value={formatUSD(performance.averageWin)} color={T.green} />
              <DetailMetric label="متوسط الخسارة" value={formatUSD(performance.averageLoss)} color={T.red} />
              <DetailMetric label="أفضل صفقة" value={formatUSD(performance.bestTrade)} color={T.green} />
              <DetailMetric label="أسوأ صفقة" value={formatUSD(performance.worstTrade)} color={T.red} />
              <DetailMetric label="نسبة شارب" value={performance.sharpeRatio.toFixed(2)} color={performance.sharpeRatio >= 1 ? T.green : T.amber} />
              <DetailMetric label="فوز متتالي" value={String(performance.consecutiveWins)} color={T.green} />
              <DetailMetric label="خسارة متتالية" value={String(performance.consecutiveLosses)} color={T.red} />
              <DetailMetric label="متوسط مدة الاحتفاظ" value={`${Math.round(performance.averageHoldingTime)} دقيقة`} />
            </div>
          </div>
        </GlassCard>

        {/* Win/Loss Visual Bar */}
        <GlassCard>
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 14 }}>
              توزيع الصفقات
            </div>
            <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', direction: 'ltr' }}>
              {performance.totalTrades > 0 && (
                <>
                  <div style={{
                    width: `${(performance.winningTrades / performance.totalTrades) * 100}%`,
                    background: `linear-gradient(90deg, ${T.green}, #00CC82)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800, color: '#000',
                    transition: 'width 0.5s ease',
                  }}>
                    {performance.winningTrades} فوز
                  </div>
                  <div style={{
                    width: `${(performance.losingTrades / performance.totalTrades) * 100}%`,
                    background: `linear-gradient(90deg, #FF6B6B, ${T.red})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800, color: '#fff',
                    transition: 'width 0.5s ease',
                  }}>
                    {performance.losingTrades} خسارة
                  </div>
                </>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════
     Settings Tab — Full Agent Configuration
     ═══════════════════════════════════════════════ */
  function SettingsTab() {
    const [localSettings, setLocalSettings] = useState({
      autoTradingEnabled: settings?.autoTradingEnabled ?? true,
      paperBalance: settings?.paperBalance ?? 10000,
      maxPositionSizePercent: settings?.maxPositionSizePercent ?? config?.maxPositionSizePercent ?? 2,
      maxDailyLossPercent: settings?.maxDailyLossPercent ?? config?.maxDailyLossPercent ?? 5,
      maxOpenPositions: settings?.maxOpenPositions ?? config?.maxOpenPositions ?? 15,  // V143: Changed from 5 to 15
      riskPerTradePercent: settings?.riskPerTradePercent ?? config?.riskPerTradePercent ?? 1.5,
      defaultStrategy: settings?.defaultStrategy ?? 'AUTO',
      scalpingTimeframe: settings?.scalpingTimeframe ?? '5m',
      scalpingTakeProfitPips: settings?.scalpingTakeProfitPips ?? 15,
      scalpingStopLossPips: settings?.scalpingStopLossPips ?? 10,
      scalpingMaxSpread: settings?.scalpingMaxSpread ?? 3,
      swingTimeframe: settings?.swingTimeframe ?? '1h',
      swingHoldingPeriodHours: settings?.swingHoldingPeriodHours ?? 48,
      swingTrendLookback: settings?.swingTrendLookback ?? 50,
      gridLevels: settings?.gridLevels ?? 5,
      gridSpacingPercent: settings?.gridSpacingPercent ?? 0.5,
      gridQuantityPerLevel: settings?.gridQuantityPerLevel ?? 0,
      defaultSymbols: settings?.defaultSymbols ?? ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'],
    })
    const [hasChanges, setHasChanges] = useState(false)
    const [settingsTab, setSettingsTab] = useState<'general' | 'risk' | 'scalping' | 'swing' | 'grid'>('general')

    useEffect(() => {
      if (settings) {
        setLocalSettings({
          autoTradingEnabled: settings.autoTradingEnabled,
          paperBalance: settings.paperBalance,
          maxPositionSizePercent: settings.maxPositionSizePercent,
          maxDailyLossPercent: settings.maxDailyLossPercent,
          maxOpenPositions: settings.maxOpenPositions,
          riskPerTradePercent: settings.riskPerTradePercent,
          defaultStrategy: settings.defaultStrategy,
          scalpingTimeframe: settings.scalpingTimeframe,
          scalpingTakeProfitPips: settings.scalpingTakeProfitPips,
          scalpingStopLossPips: settings.scalpingStopLossPips,
          scalpingMaxSpread: settings.scalpingMaxSpread,
          swingTimeframe: settings.swingTimeframe,
          swingHoldingPeriodHours: settings.swingHoldingPeriodHours,
          swingTrendLookback: settings.swingTrendLookback,
          gridLevels: settings.gridLevels,
          gridSpacingPercent: settings.gridSpacingPercent,
          gridQuantityPerLevel: settings.gridQuantityPerLevel ?? 0,
          defaultSymbols: settings.defaultSymbols,
        })
      }
    }, [settings])

    const handleSettingChange = (key: string, value: any) => {
      setLocalSettings(prev => ({ ...prev, [key]: value }))
      setHasChanges(true)
    }

    const handleSave = async () => {
      await updateSettings({
        autoTradingEnabled: localSettings.autoTradingEnabled,
        paperBalance: localSettings.paperBalance,
        maxPositionSizePercent: localSettings.maxPositionSizePercent,
        maxDailyLossPercent: localSettings.maxDailyLossPercent,
        maxOpenPositions: localSettings.maxOpenPositions,
        riskPerTradePercent: localSettings.riskPerTradePercent,
        defaultStrategy: localSettings.defaultStrategy,
        scalpingTimeframe: localSettings.scalpingTimeframe,
        scalpingTakeProfitPips: localSettings.scalpingTakeProfitPips,
        scalpingStopLossPips: localSettings.scalpingStopLossPips,
        scalpingMaxSpread: localSettings.scalpingMaxSpread,
        swingTimeframe: localSettings.swingTimeframe,
        swingHoldingPeriodHours: localSettings.swingHoldingPeriodHours,
        swingTrendLookback: localSettings.swingTrendLookback,
        gridLevels: localSettings.gridLevels,
        gridSpacingPercent: localSettings.gridSpacingPercent,
        gridQuantityPerLevel: localSettings.gridQuantityPerLevel || null,
        defaultSymbols: localSettings.defaultSymbols,
      })
      setHasChanges(false)
    }

    // System status banner
    const globalAutoTrading = systemStatus?.globalAutoTradingEnabled ?? true
    const settingSource = systemStatus?.source ?? 'env_var'

    const SETTINGS_TABS = [
      { id: 'general' as const, label: 'عام', icon: <Settings2 size={12} /> },
      { id: 'risk' as const, label: 'المخاطر', icon: <Shield size={12} /> },
      { id: 'scalping' as const, label: 'سكالبينغ', icon: <Zap size={12} /> },
      { id: 'swing' as const, label: 'سوينغ', icon: <TrendingUp size={12} /> },
      { id: 'grid' as const, label: 'شبكة', icon: <Layers size={12} /> },
    ]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* System Status Banner — Global Auto Trading Toggle */}
        <GlassCard>
          <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: globalAutoTrading ? 'rgba(0,255,163,0.10)' : 'rgba(255,71,87,0.10)',
                border: `1px solid ${globalAutoTrading ? 'rgba(0,255,163,0.20)' : 'rgba(255,71,87,0.20)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {globalAutoTrading
                  ? <CheckCircle2 size={18} color={T.green} />
                  : <AlertCircle size={18} color={T.red} />
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, color: globalAutoTrading ? T.green : T.red, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {globalAutoTrading ? 'التداول الذاتي مفعّل' : 'التداول الذاتي معطّل'}
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 6,
                    background: settingSource === 'database' ? `${T.accent}15` : `${T.amber}15`,
                    color: settingSource === 'database' ? T.accent : T.amber,
                    fontFamily: FONT_AR, fontWeight: 600,
                  }}>
                    {settingSource === 'database' ? 'من قاعدة البيانات' : 'من متغيرات البيئة'}
                  </span>
                </div>
                <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 3 }}>
                  {globalAutoTrading
                    ? 'يمكن تفعيل الوكيل — الإعدادات محفوظة في قاعدة البيانات ويمكن التحكم بها من هنا'
                    : 'يجب تفعيل التداول الذاتي أولاً لكي يعمل الوكيل — اضغط الزر للتفعيل'
                  }
                </div>
              </div>
            </div>
            <button
              onClick={() => updateSystemSettings({ autoTradingEnabled: !globalAutoTrading })}
              style={{
                minWidth: 80, padding: '10px 20px', borderRadius: 10,
                background: globalAutoTrading
                  ? 'rgba(255,71,87,0.10)'
                  : 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                border: globalAutoTrading ? '1px solid rgba(255,71,87,0.25)' : 'none',
                color: globalAutoTrading ? T.red : '#000',
                fontFamily: FONT_AR, fontSize: 12, fontWeight: 800,
                cursor: 'pointer', transition: 'all 0.2s',
                flexShrink: 0,
              }}
            >
              {globalAutoTrading ? 'إيقاف' : 'تفعيل'}
            </button>
          </div>
        </GlassCard>

        {/* Settings Sub-tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                background: settingsTab === tab.id ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${settingsTab === tab.id ? 'rgba(0,212,255,0.3)' : T.border}`,
                color: settingsTab === tab.id ? T.accent : T.text2,
                fontFamily: FONT_AR, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* General Settings */}
        {settingsTab === 'general' && (
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings2 size={15} color={T.accent} />
                إعدادات عامة
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Auto Trading Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text }}>تفعيل التداول الذاتي</div>
                    <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 2 }}>السماح للوكيل بتنفيذ الصفقات تلقائياً</div>
                  </div>
                  <button
                    onClick={() => handleSettingChange('autoTradingEnabled', !localSettings.autoTradingEnabled)}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: localSettings.autoTradingEnabled ? T.green : 'rgba(255,255,255,0.1)',
                      border: 'none', cursor: 'pointer',
                      position: 'relative', transition: 'all 0.2s',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 9,
                      background: '#fff',
                      position: 'absolute', top: 3,
                      left: localSettings.autoTradingEnabled ? 23 : 3,
                      transition: 'all 0.2s',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>

                {/* Default Strategy */}
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>الاستراتيجية الافتراضية</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      // FIX: SCALPING removed — it belongs to the Smart Executor
                      { value: 'AUTO', label: 'تلقائي', icon: <Brain size={12} /> },
                      { value: 'SWING', label: 'سوينغ', icon: <TrendingUp size={12} /> },
                      { value: 'GRID', label: 'شبكة', icon: <Layers size={12} /> },
                    ].map(s => (
                      <button
                        key={s.value}
                        onClick={() => { handleSettingChange('defaultStrategy', s.value); setSettingsTab(s.value.toLowerCase() as any) }}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '10px 12px', borderRadius: 8,
                          background: localSettings.defaultStrategy === s.value ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${localSettings.defaultStrategy === s.value ? 'rgba(0,212,255,0.3)' : T.border}`,
                          color: localSettings.defaultStrategy === s.value ? T.accent : T.text2,
                          fontFamily: FONT_AR, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >
                        {s.icon}
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paper Balance */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text }}>رصيد التداول الورقي</div>
                      <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3 }}>الرصيد الافتراضي عند عدم وجود محفظة</div>
                    </div>
                    <div style={{
                      fontFamily: FONT_MONO, fontSize: 16, fontWeight: 900, color: T.green,
                      padding: '4px 12px', borderRadius: 8,
                      background: `${T.green}12`, border: `1px solid ${T.green}30`,
                      direction: 'ltr',
                    }}>
                      ${localSettings.paperBalance.toLocaleString()}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={100000}
                    step={100}
                    value={localSettings.paperBalance}
                    onChange={(e) => handleSettingChange('paperBalance', parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: T.green, height: 4, cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 9, color: T.text3, direction: 'ltr' }}>
                    <span>$100</span>
                    <span>$100,000</span>
                  </div>
                </div>

                {/* Default Symbols */}
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>الرموز الافتراضية</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {localSettings.defaultSymbols.map((sym: string) => (
                      <span key={sym} style={{
                        fontFamily: FONT_MONO, fontSize: 10,
                        padding: '4px 10px', borderRadius: 6,
                        background: 'rgba(0,212,255,0.08)',
                        border: '1px solid rgba(0,212,255,0.2)',
                        color: T.accent,
                      }}>
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Risk Settings */}
        {settingsTab === 'risk' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <GlassCard>
              <div style={{ padding: 20 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={15} color={T.amber} />
                  معلمات المخاطر
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <RiskSlider
                    label="حجم المركز الأقصى"
                    subLabel="نسبة مئوية من رأس المال لكل صفقة"
                    value={localSettings.maxPositionSizePercent}
                    min={0.5} max={10} step={0.5} unit="%" color={T.accent}
                    onChange={(v) => handleSettingChange('maxPositionSizePercent', v)}
                  />
                  <RiskSlider
                    label="حد الخسارة اليومية"
                    subLabel="يُوقف الوكيل تلقائياً عند بلوغه"
                    value={localSettings.maxDailyLossPercent}
                    min={1} max={20} step={0.5} unit="%" color={T.red}
                    onChange={(v) => handleSettingChange('maxDailyLossPercent', v)}
                  />
                  <RiskSlider
                    label="عدد المراكز المفتوحة الأقصى"
                    subLabel="أقصى عدد صفقات متزامنة"
                    value={localSettings.maxOpenPositions}
                    min={1} max={20} step={1} unit="" color={T.purple}  // V143: max increased from 15 to 20
                    onChange={(v) => handleSettingChange('maxOpenPositions', v)}
                  />
                  <RiskSlider
                    label="نسبة المخاطرة لكل صفقة"
                    subLabel="نسبة رأس المال المُخاطَر"
                    value={localSettings.riskPerTradePercent}
                    min={0.5} max={5} step={0.25} unit="%" color={T.green}
                    onChange={(v) => handleSettingChange('riskPerTradePercent', v)}
                  />
                </div>
              </div>
            </GlassCard>

            {/* Safety Rules */}
            <GlassCard>
              <div style={{ padding: 20 }}>
                <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={15} color={T.red} />
                  قواعد السلامة
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { icon: <Shield size={13} />, title: 'وقف خسارة إلزامي', desc: 'لا يمكن فتح صفقة بدون تحديد وقف الخسارة', color: T.green },
                    { icon: <DollarSign size={13} />, title: 'حد خسارة يومي', desc: 'إيقاف تلقائي عند تجاوز الحد المحدد', color: T.amber },
                    { icon: <XCircle size={13} />, title: 'بدون سحب', desc: 'الوكيل لا يملك صلاحية السحب — تداول فقط', color: T.red },
                    { icon: <CheckCircle2 size={13} />, title: 'تدقيق كامل', desc: 'كل قرار يتم تسجيله في سجل المراجعة', color: T.accent },
                    { icon: <AlertTriangle size={13} />, title: 'خسائر متتالية', desc: '5 خسائر متتالية → إيقاف مؤقت تلقائي', color: T.amber },
                    { icon: <Flame size={13} />, title: 'إيقاف طارئ', desc: 'إغلاق فوري لجميع المراكز عند الطوارئ', color: T.red },
                    { icon: <RefreshCw size={13} />, title: 'نسبة مخاطرة/عائد', desc: 'الحد الأدنى 1:1.5 — لا صفقات بأقل من ذلك', color: T.accent },
                    { icon: <ArrowUpDown size={13} />, title: 'بدون تكرار', desc: 'مركز واحد فقط لكل رمز', color: T.purple },
                  ].map((rule, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 10, padding: '10px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 8, border: `1px solid ${T.border}`,
                    }}>
                      <span style={{ color: rule.color, display: 'flex', marginTop: 1 }}>{rule.icon}</span>
                      <div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 11, fontWeight: 700, color: T.text }}>{rule.title}</div>
                        <div style={{ fontFamily: FONT_AR, fontSize: 10, color: T.text3, marginTop: 2 }}>{rule.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Scalping Settings */}
        {settingsTab === 'scalping' && (
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color={T.amber} />
                معلمات السكالبينغ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>الإطار الزمني</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['1m', '3m', '5m', '15m', '30m'].map(tf => (
                      <button
                        key={tf}
                        onClick={() => handleSettingChange('scalpingTimeframe', tf)}
                        style={{
                          padding: '8px 14px', borderRadius: 8,
                          background: localSettings.scalpingTimeframe === tf ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${localSettings.scalpingTimeframe === tf ? 'rgba(255,184,0,0.3)' : T.border}`,
                          color: localSettings.scalpingTimeframe === tf ? T.amber : T.text2,
                          fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
                <RiskSlider
                  label="جني الأرباح (نقاط)" subLabel="الهدف الأقصى للصفقة"
                  value={localSettings.scalpingTakeProfitPips} min={5} max={50} step={1} unit="" color={T.green}
                  onChange={(v) => handleSettingChange('scalpingTakeProfitPips', v)}
                />
                <RiskSlider
                  label="وقف الخسارة (نقاط)" subLabel="الحد الأقصى للخسارة في الصفقة"
                  value={localSettings.scalpingStopLossPips} min={3} max={30} step={1} unit="" color={T.red}
                  onChange={(v) => handleSettingChange('scalpingStopLossPips', v)}
                />
                <RiskSlider
                  label="الفرق الأقصى (سبيريد)" subLabel="أقصى فرق مسموح بين العرض والطلب"
                  value={localSettings.scalpingMaxSpread} min={1} max={20} step={1} unit="" color={T.amber}
                  onChange={(v) => handleSettingChange('scalpingMaxSpread', v)}
                />
              </div>
            </div>
          </GlassCard>
        )}

        {/* Swing Settings */}
        {settingsTab === 'swing' && (
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={15} color={T.accent} />
                معلمات السوينغ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ fontFamily: FONT_AR, fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>الإطار الزمني</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['15m', '30m', '1h', '4h', '1d'].map(tf => (
                      <button
                        key={tf}
                        onClick={() => handleSettingChange('swingTimeframe', tf)}
                        style={{
                          padding: '8px 14px', borderRadius: 8,
                          background: localSettings.swingTimeframe === tf ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${localSettings.swingTimeframe === tf ? 'rgba(0,212,255,0.3)' : T.border}`,
                          color: localSettings.swingTimeframe === tf ? T.accent : T.text2,
                          fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
                <RiskSlider
                  label="فترة الاحتفاظ (ساعات)" subLabel="المدة المتوقعة للاحتفاظ بالصفقة"
                  value={localSettings.swingHoldingPeriodHours} min={4} max={168} step={4} unit="ساعة" color={T.accent}
                  onChange={(v) => handleSettingChange('swingHoldingPeriodHours', v)}
                />
                <RiskSlider
                  label="فترة الاتجاه (شمعات)" subLabel="عدد الشمعات لتحليل الاتجاه"
                  value={localSettings.swingTrendLookback} min={10} max={100} step={5} unit="" color={T.purple}
                  onChange={(v) => handleSettingChange('swingTrendLookback', v)}
                />
              </div>
            </div>
          </GlassCard>
        )}

        {/* Grid Settings */}
        {settingsTab === 'grid' && (
          <GlassCard>
            <div style={{ padding: 20 }}>
              <div style={{ fontFamily: FONT_AR, fontSize: 13, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={15} color={T.purple} />
                معلمات الشبكة
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <RiskSlider
                  label="عدد المستويات" subLabel="عدد نقاط الشراء/البيع في الشبكة"
                  value={localSettings.gridLevels} min={2} max={20} step={1} unit="" color={T.purple}
                  onChange={(v) => handleSettingChange('gridLevels', v)}
                />
                <RiskSlider
                  label="المسافة بين المستويات" subLabel="النسبة المئوية بين كل مستوى"
                  value={localSettings.gridSpacingPercent} min={0.1} max={5} step={0.1} unit="%" color={T.accent}
                  onChange={(v) => handleSettingChange('gridSpacingPercent', v)}
                />
                <RiskSlider
                  label="الكمية لكل مستوى" subLabel="0 = حساب تلقائي حسب المخاطر"
                  value={localSettings.gridQuantityPerLevel} min={0} max={1} step={0.001} unit="" color={T.green}
                  onChange={(v) => handleSettingChange('gridQuantityPerLevel', v)}
                />
              </div>
            </div>
          </GlassCard>
        )}

        {/* Save Button */}
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              width: '100%',
              ...btnStyle,
              background: 'linear-gradient(135deg, #00FFC6, #0A84FF)',
              color: '#000', fontWeight: 800,
              padding: '14px 20px',
              justifyContent: 'center',
              fontSize: 13,
            }}
          >
            <CheckCircle2 size={16} />
            حفظ جميع الإعدادات
          </button>
        )}
      </div>
    )
  }
}

/* ═══════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════ */

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: '#8B92A8' }}>{label}</span>
      <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 700, color: valueColor || '#F0F2F5' }}>{value}</span>
    </div>
  )
}

function SafetyBadge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 8px', borderRadius: 6,
      background: `${color}10`, border: `1px solid ${color}25`,
      fontFamily: "'Cairo', sans-serif", fontSize: 9, fontWeight: 700, color,
    }}>
      {icon}
      {label}
    </div>
  )
}

function StrategyTag({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
      padding: '3px 8px', borderRadius: 4,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      color: '#8B92A8',
    }}>{label}</span>
  )
}

function MiniGauge({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ width: 44, textAlign: 'center' }}>
      <div style={{
        height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden', marginBottom: 3,
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color, borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color, fontWeight: 700 }}>{value}</div>
      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 7, color: '#5A6178' }}>{label}</div>
    </div>
  )
}

function DetailMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: '#8B92A8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 800, color: color || '#F0F2F5', direction: 'ltr', textAlign: 'right' }}>{value}</div>
    </div>
  )
}

function RiskSlider({ label, subLabel, value, min, max, step, unit, color, onChange }: {
  label: string; subLabel: string; value: number; min: number; max: number; step: number; unit: string; color: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, fontWeight: 700, color: '#F0F2F5' }}>{label}</div>
          <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: '#5A6178' }}>{subLabel}</div>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 900, color,
          padding: '4px 12px', borderRadius: 8,
          background: `${color}12`, border: `1px solid ${color}30`,
          direction: 'ltr',
        }}>
          {value}{unit}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          accentColor: color,
          height: 4,
          cursor: 'pointer',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5A6178', direction: 'ltr' }}>
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Shared Button Style
   ═══════════════════════════════════════════════ */
const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  fontFamily: "'Cairo', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  transition: 'all 0.2s',
  outline: 'none',
}

/* ═══════════════════════════════════════════════
   CSS Keyframes
   ═══════════════════════════════════════════════ */
const AGENT_CSS = `
@keyframes agent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes agent-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes fadeInSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeInSlideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid rgba(0,0,0,0.3);
  box-shadow: 0 0 8px rgba(0,0,0,0.3);
}
input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid rgba(0,0,0,0.3);
}

@media (max-width: 768px) {
  .agent-stats-grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}
`
