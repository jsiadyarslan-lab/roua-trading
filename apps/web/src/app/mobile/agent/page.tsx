'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Cpu, Play, Pause, Square, AlertTriangle, Flame,
  Activity, TrendingUp, TrendingDown, Target, Shield, Clock,
  ChevronDown, RefreshCw, Loader2, CheckCircle, XCircle,
  DollarSign, BarChart3, Zap, Brain, RotateCcw, Layers,
  PiggyBank, Rocket, Eye, Settings2
} from 'lucide-react'
import {
  useAgentStore, AgentStatus, StrategyType, MarketRegime,
  type RegimeInfo,
} from '@/hooks/useAgentStore'

/* ─── Design Tokens ─── */
const C = {
  accent:  '#00D4FF',
  success: '#32D74B',
  danger:  '#FF453A',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#F0F2F5',
  text2:   'rgba(235,235,245,0.5)',
  text3:   'rgba(235,235,245,0.25)',
  bg:      '#1C1C1E',
  border:  'rgba(255,255,255,0.08)',
}
const FONT_AR   = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Strategy Data ─── */
const STRATEGIES: Array<{
  id: StrategyType
  icon: React.ElementType
  nameAr: string
  desc: string
  color: string
  tags: string[]
}> = [
  { id: StrategyType.AUTO, icon: Brain, nameAr: 'تلقائي', desc: 'اختيار تلقائي لأفضل استراتيجية حسب ظروف السوق', color: '#FF9F43', tags: ['كشف النظام', 'تبديل ذكي', 'مُوصى به'] },
  { id: StrategyType.SCALPING, icon: Zap, nameAr: 'سكالبينغ', desc: 'صفقات سريعة — أرباح صغيرة متكررة', color: C.accent, tags: ['فريم: 1m-5m', 'TP: 1.5x ATR', 'SL: 1x ATR'] },
  { id: StrategyType.SWING, icon: TrendingUp, nameAr: 'سوينغ', desc: 'صفقات متأرجحة — أرباح أكبر على مدى أيام', color: C.success, tags: ['فريم: 1h-4h', 'TP: 4x ATR', 'SL: 2x ATR'] },
  { id: StrategyType.GRID, icon: Layers, nameAr: 'شبكة', desc: 'شبكة أوامر — ربح من التذبذب', color: C.purple, tags: ['أوامر حدية', 'ربح من التذبذب', 'بدون اتجاه'] },
  { id: StrategyType.MEAN_REVERSION, icon: RotateCcw, nameAr: 'عودة للمتوسط', desc: 'العودة للمتوسط — نسبة فوز عالية', color: C.amber, tags: ['نسبة فوز: 60-70%', 'TP: عند المتوسط', 'SL: 2x ATR'] },
  { id: StrategyType.MOMENTUM_BREAKOUT, icon: Rocket, nameAr: 'اختراق الزخم', desc: 'اختراق الزخم — ربح من الكسور الكبيرة', color: '#FF6B9D', tags: ['اختراقات قوية', 'TP: 3x ATR', 'SL: 1.5x ATR'] },
  { id: StrategyType.DCA, icon: PiggyBank, nameAr: 'متوسط التكلفة', desc: 'متوسط التكلفة — تراكم منتظم وموثوق', color: '#00B894', tags: ['تراكم منتظم', 'نسبة فوز: 70-80%', 'شراء ذكي'] },
  { id: StrategyType.VWAP_RSI, icon: BarChart3, nameAr: 'VWAP + RSI', desc: 'VWAP + RSI — إدخالات عالية الاحتمالية', color: '#A29BFE', tags: ['VWAP + RSI', 'TP: 2.5x ATR', 'إدخالات محترفة'] },
]

/* ─── Status Config ─── */
const STATUS_CONFIG: Record<string, { label: string; color: string; glow: string }> = {
  RUNNING:            { label: 'يعمل',     color: C.success, glow: `${C.success}30` },
  IDLE:               { label: 'في الانتظار', color: C.text2,  glow: 'transparent' },
  PAUSED:             { label: 'متوقف مؤقتاً', color: C.amber,  glow: `${C.amber}30` },
  STOPPED:            { label: 'متوقف',    color: C.text2,  glow: 'transparent' },
  EMERGENCY_STOP:     { label: 'إيقاف طارئ', color: C.danger, glow: `${C.danger}30` },
  DAILY_LIMIT_REACHED:{ label: 'حد الخسارة اليومية', color: C.amber, glow: `${C.amber}30` },
}

/* ─── Regime Helpers ─── */
const REGIME_LABELS: Record<string, string> = {
  TRENDING_UP: 'صعودي متجه',
  TRENDING_DOWN: 'هبوطي متجه',
  RANGING: 'نطاق عرضي',
  VOLATILE: 'متقلب',
  TRANSITIONAL: 'انتقالي',
}
const REGIME_COLORS: Record<string, string> = {
  TRENDING_UP: C.success,
  TRENDING_DOWN: C.danger,
  RANGING: C.amber,
  VOLATILE: '#FF6B9D',
  TRANSITIONAL: 'rgba(235,235,245,0.5)',
}

/* ─── iOS Switch ─── */
function IOSSwitch({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 64, height: 36, borderRadius: 18, border: 'none',
        background: isOn ? C.success : 'rgba(120,120,128,0.32)',
        transition: 'background 0.3s', cursor: 'pointer', flexShrink: 0,
        boxShadow: isOn ? `0 0 20px ${C.success}40` : 'none',
        position: 'relative',
      }}
    >
      <motion.div
        animate={{ x: isOn ? 28 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: 28, height: 28, borderRadius: 14,
          background: '#FFFFFF', position: 'absolute', top: 4, left: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}

/* ─── Stat Card ─── */
function StatCard({ label, value, color, icon: Icon }: {
  label: string; value: string; color: string; icon: React.ElementType
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        padding: '14px 12px', borderRadius: 20,
        background: 'rgba(28,28,30,0.6)',
        backdropFilter: 'blur(12px)',
        border: `0.5px solid ${color}18`,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
        width: 40, height: 20, borderRadius: '50%',
        background: `${color}10`, filter: 'blur(10px)', pointerEvents: 'none',
      }} />
      <Icon size={14} color={color} style={{ margin: '0 auto 6px' }} />
      <div style={{ fontSize: 17, fontWeight: 800, color, fontFamily: FONT_MONO }}>{value}</div>
      <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 2 }}>{label}</div>
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function MobileAgentPage() {
  const router = useRouter()
  const {
    agentState, performance, positions, logs, loading, error,
    fetchStatus, fetchCredentials, startAgent, stopAgent, changeStrategy,
    fetchPerformance, fetchPositions, startAutoRefresh, stopAutoRefresh,
    fetchSettings, fetchSystemStatus, regimeInfo, fetchRegimeInfo,
  } = useAgentStore()

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const config = agentState?.config
  const strategy = config?.strategy ?? StrategyType.AUTO
  const isPaperTrading = config?.isPaperTrading ?? false

  const [showStrategyPicker, setShowStrategyPicker] = useState(false)
  const [confirmEmergency, setConfirmEmergency] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // ── Load data on mount ──
  useEffect(() => { setHydrated(true) }, [])

  useEffect(() => {
    if (!hydrated) return
    fetchStatus()
    fetchCredentials()
    fetchPerformance()
    fetchPositions()
    fetchSettings()
    fetchSystemStatus()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [hydrated, fetchStatus, fetchCredentials, fetchPerformance, fetchPositions, fetchSettings, fetchSystemStatus, startAutoRefresh, stopAutoRefresh])

  // ── Fetch regime info when AUTO strategy ──
  useEffect(() => {
    if (config?.strategy === StrategyType.AUTO && isRunning) {
      fetchRegimeInfo(config?.symbols?.[0] || 'BTC/USDT')
    }
  }, [config?.strategy, isRunning, fetchRegimeInfo])

  // ── Handlers ──
  const handleStart = useCallback(async (s: StrategyType) => {
    await startAgent(s)
    setShowStrategyPicker(false)
  }, [startAgent])

  const handleStop = useCallback(async () => {
    await stopAgent(false)
    setConfirmEmergency(false)
  }, [stopAgent])

  const handleEmergency = useCallback(async () => {
    await stopAgent(true)
    setConfirmEmergency(false)
  }, [stopAgent])

  const handleChangeStrategy = useCallback(async (s: StrategyType) => {
    if (isRunning) {
      await changeStrategy(s)
    } else {
      await startAgent(s)
    }
    setShowStrategyPicker(false)
  }, [isRunning, changeStrategy, startAgent])

  const statusCfg = STATUS_CONFIG[status ?? 'IDLE'] ?? STATUS_CONFIG.IDLE
  const currentStrategyData = STRATEGIES.find(s => s.id === strategy) ?? STRATEGIES[0]
  const displayLogs = logs.slice(0, 25)

  if (!hydrated) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} className="animate-spin" color={C.accent} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', paddingBottom: 24 }}>

      {/* ═══ Sticky Header ═══ */}
      <div style={{
        padding: '24px 20px 16px',
        background: 'rgba(28,28,30,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.07)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
              وكيل التداول الذاتي
            </h1>
            <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
              تحكم بوكيل التداول المستقل
            </p>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${C.accent}15`, border: `0.5px solid ${C.accent}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Cpu size={18} color={C.accent} />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* ═══ Master Toggle Card ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 16, padding: '20px 20px 18px', borderRadius: 28,
            background: isRunning ? 'rgba(28,28,30,0.7)' : 'rgba(28,28,30,0.5)',
            backdropFilter: 'blur(20px)',
            border: `0.5px solid ${isRunning ? `${C.success}20` : C.border}`,
            position: 'relative', overflow: 'hidden',
          }}
        >
          {isRunning && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{
                position: 'absolute', top: -40, right: -40,
                width: 120, height: 120, borderRadius: '50%',
                background: `${C.success}12`, filter: 'blur(40px)', pointerEvents: 'none',
              }}
            />
          )}

          <div className="flex items-center justify-between" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ scale: isRunning ? [1, 1.15, 1] : 1 }}
                transition={{ duration: 0.5 }}
                style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: isRunning ? `${C.success}20` : 'rgba(120,120,128,0.15)',
                  border: `0.5px solid ${isRunning ? `${C.success}30` : 'rgba(255,255,255,0.06)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Cpu size={20} color={isRunning ? C.success : 'rgba(255,255,255,0.3)'} />
              </motion.div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                  {isRunning ? 'الوكيل يعمل' : 'الوكيل متوقف'}
                </p>
                <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
                  {isRunning ? 'يحلل السوق وينفذ الصفقات' : 'فعّل الوكيل لبدء التداول'}
                </p>
              </div>
            </div>
            {!isRunning && status !== AgentStatus.EMERGENCY_STOP && !agentState && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowStrategyPicker(!showStrategyPicker)}
                disabled={loading}
                style={{
                  padding: '10px 20px', borderRadius: 14,
                  background: 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                  border: 'none', color: '#000', fontWeight: 800,
                  fontSize: 12, fontFamily: FONT_AR, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Play size={14} />
                تفعيل
              </motion.button>
            )}
            {isRunning && (
              <IOSSwitch isOn={isRunning} onToggle={handleStop} />
            )}
            {(status === AgentStatus.STOPPED || status === AgentStatus.PAUSED) && agentState && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => startAgent(config?.strategy ?? StrategyType.AUTO)}
                disabled={loading}
                style={{
                  padding: '10px 20px', borderRadius: 14,
                  background: 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                  border: 'none', color: '#000', fontWeight: 800,
                  fontSize: 12, fontFamily: FONT_AR, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Play size={14} />
                إعادة التفعيل
              </motion.button>
            )}
          </div>

          {/* Status Indicator */}
          <AnimatePresence mode="wait">
            <motion.div
              key={status ?? 'null'}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 mt-4"
              style={{
                padding: '8px 14px', borderRadius: 12,
                background: `${statusCfg.color}10`,
                border: `0.5px solid ${statusCfg.color}20`,
              }}
            >
              <motion.div
                animate={isRunning ? { scale: [1, 1.3, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: statusCfg.color,
                  boxShadow: `0 0 8px ${statusCfg.glow}`,
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: statusCfg.color, fontFamily: FONT_AR }}>
                {statusCfg.label}
              </span>
              {isPaperTrading && isRunning && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}30`,
                  fontFamily: FONT_AR,
                }}>ورقي</span>
              )}
              {config && (
                <span style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginRight: 8 }}>
                  {currentStrategyData.nameAr}
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Emergency Stop */}
          {isRunning && (
            <div style={{ marginTop: 12 }}>
              {!confirmEmergency ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setConfirmEmergency(true)}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 12,
                    background: 'rgba(255,69,58,0.08)',
                    border: `0.5px solid rgba(255,69,58,0.15)`,
                    color: C.danger, fontSize: 12, fontWeight: 700,
                    fontFamily: FONT_AR, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <AlertTriangle size={14} />
                  إيقاف طارئ
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleEmergency}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12,
                    background: C.danger, border: 'none',
                    color: '#fff', fontSize: 13, fontWeight: 800,
                    fontFamily: FONT_AR, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Flame size={16} />
                  تأكيد الإيقاف الطارئ
                </motion.button>
              )}
            </div>
          )}

          {/* Emergency Warning */}
          {status === AgentStatus.EMERGENCY_STOP && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 12,
              background: 'rgba(255,69,58,0.10)', border: `0.5px solid rgba(255,69,58,0.25)`,
              fontSize: 12, color: C.danger, fontWeight: 700, fontFamily: FONT_AR,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={14} />
              تم الإيقاف الطارئ — أُغلقت جميع المراكز
            </div>
          )}

          {/* Daily Limit */}
          {status === AgentStatus.DAILY_LIMIT_REACHED && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 12,
              background: 'rgba(255,184,0,0.10)', border: `0.5px solid rgba(255,184,0,0.25)`,
              fontSize: 12, color: C.amber, fontWeight: 700, fontFamily: FONT_AR,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={14} />
              تم بلوغ حد الخسارة اليومية
            </div>
          )}
        </motion.div>

        {/* ═══ Stats Grid (2x3) ═══ */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <StatCard
            label="ربح/خسارة اليوم"
            value={`${(agentState?.dailyPnL ?? 0) >= 0 ? '+' : ''}$${Math.abs(agentState?.dailyPnL ?? 0).toFixed(2)}`}
            color={(agentState?.dailyPnL ?? 0) >= 0 ? C.success : C.danger}
            icon={DollarSign}
          />
          <StatCard
            label="صفقات اليوم"
            value={String(agentState?.dailyTradesCount ?? 0)}
            color={C.accent}
            icon={Activity}
          />
          <StatCard
            label="نسبة الفوز"
            value={`${(performance?.winRate ?? 0).toFixed(1)}%`}
            color={(performance?.winRate ?? 0) >= 50 ? C.success : C.amber}
            icon={Target}
          />
          <StatCard
            label="المراكز المفتوحة"
            value={String(positions.length)}
            color={C.purple}
            icon={Shield}
          />
          <StatCard
            label="خسائر متتالية"
            value={String(agentState?.consecutiveLosses ?? 0)}
            color={(agentState?.consecutiveLosses ?? 0) >= 3 ? C.danger : C.text2}
            icon={TrendingDown}
          />
          <StatCard
            label="دورات الوكيل"
            value={String(agentState?.totalCycles ?? 0)}
            color={C.text2}
            icon={Clock}
          />
        </div>

        {/* ═══ Strategy Card ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            marginTop: 16, borderRadius: 28,
            background: 'rgba(28,28,30,0.6)',
            backdropFilter: 'blur(20px)',
            border: `0.5px solid ${C.border}`,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 20px 12px', borderBottom: `0.5px solid ${C.border}` }}>
            <div className="flex items-center gap-2">
              <Zap size={14} color={C.purple} />
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                الاستراتيجية
              </span>
            </div>
          </div>

          <div style={{ padding: '14px 20px 20px' }}>
            {/* Strategy Selector */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowStrategyPicker(!showStrategyPicker)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 16,
                background: 'rgba(255,255,255,0.04)',
                border: `0.5px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${currentStrategyData.color}15`,
                  border: `0.5px solid ${currentStrategyData.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {(() => { const Ic = currentStrategyData.icon; return <Ic size={18} color={currentStrategyData.color} /> })()}
                </span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                    {currentStrategyData.nameAr}
                  </p>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 1 }}>
                    {currentStrategyData.desc}
                  </p>
                </div>
              </div>
              <motion.div animate={{ rotate: showStrategyPicker ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={16} color={C.text2} />
              </motion.div>
            </motion.button>

            {/* Strategy Picker */}
            <AnimatePresence>
              {showStrategyPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: 'hidden', marginTop: 8 }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {STRATEGIES.map((s) => {
                      const isActive = strategy === s.id
                      const Ic = s.icon
                      return (
                        <motion.button
                          key={s.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleChangeStrategy(s.id)}
                          style={{
                            padding: '12px 14px', borderRadius: 14,
                            background: isActive ? `${s.color}15` : 'rgba(255,255,255,0.02)',
                            border: `0.5px solid ${isActive ? `${s.color}30` : C.border}`,
                            display: 'flex', alignItems: 'center', gap: 10,
                            cursor: 'pointer', width: '100%', textAlign: 'right',
                          }}
                        >
                          <span style={{
                            width: 32, height: 32, borderRadius: 10,
                            background: `${s.color}12`,
                            border: `0.5px solid ${s.color}25`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Ic size={16} color={s.color} />
                          </span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: isActive ? s.color : C.text, fontFamily: FONT_AR }}>
                              {s.nameAr}
                            </p>
                            <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 1 }}>
                              {s.desc}
                            </p>
                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                              {s.tags.map(t => (
                                <span key={t} style={{
                                  fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                                  background: `${s.color}10`, color: s.color,
                                  fontFamily: FONT_AR,
                                }}>{t}</span>
                              ))}
                            </div>
                          </div>
                          {isActive && (
                            <div style={{
                              width: 8, height: 8, borderRadius: 4,
                              background: s.color, boxShadow: `0 0 8px ${s.color}60`,
                              flexShrink: 0,
                            }} />
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ═══ Market Regime (AUTO only) ═══ */}
        {strategy === StrategyType.AUTO && regimeInfo && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 16, borderRadius: 28,
              background: 'rgba(28,28,30,0.6)',
              backdropFilter: 'blur(20px)',
              border: `0.5px solid ${C.border}`,
              overflow: 'hidden', padding: '16px 20px',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} color={C.purple} />
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                نظام السوق
              </span>
            </div>
            <div className="flex items-center gap-3" style={{
              padding: '12px 16px', borderRadius: 16,
              background: `${REGIME_COLORS[regimeInfo.regime] ?? C.text2}10`,
              border: `0.5px solid ${REGIME_COLORS[regimeInfo.regime] ?? C.text2}20`,
            }}>
              {regimeInfo.regime === MarketRegime.TRENDING_UP && <TrendingUp size={20} color={C.success} />}
              {regimeInfo.regime === MarketRegime.TRENDING_DOWN && <TrendingDown size={20} color={C.danger} />}
              {regimeInfo.regime === MarketRegime.RANGING && <RotateCcw size={20} color={C.amber} />}
              {regimeInfo.regime === MarketRegime.VOLATILE && <Zap size={20} color="#FF6B9D" />}
              {regimeInfo.regime === MarketRegime.TRANSITIONAL && <Activity size={20} color={C.text2} />}
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: REGIME_COLORS[regimeInfo.regime] ?? C.text, fontFamily: FONT_AR }}>
                  {REGIME_LABELS[regimeInfo.regime] ?? regimeInfo.regime}
                </p>
                <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>
                  ثقة: {(regimeInfo.confidence ?? 0).toFixed(0)}% • قوة الاتجاه: {(regimeInfo.indicators?.trendStrength ?? 0).toFixed(0)}%
                </p>
              </div>
            </div>
            {regimeInfo.strategyScores && regimeInfo.strategyScores.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {regimeInfo.strategyScores.slice(0, 3).map((sc, i) => {
                  const sData = STRATEGIES.find(s => s.id === sc.strategy)
                  return (
                    <div key={i} className="flex items-center justify-between" style={{
                      padding: '6px 10px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                    }}>
                      <span style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
                        {sData?.nameAr ?? sc.strategy}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: (sc.score ?? 0) >= 60 ? C.success : C.amber, fontFamily: FONT_MONO }}>
                        {sc.score}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ Open Positions ═══ */}
        {positions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 16, borderRadius: 28,
              background: 'rgba(28,28,30,0.6)',
              backdropFilter: 'blur(20px)',
              border: `0.5px solid ${C.border}`,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px 12px', borderBottom: `0.5px solid ${C.border}` }}>
              <div className="flex items-center gap-2">
                <Shield size={14} color={C.purple} />
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                  المراكز المفتوحة
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 8,
                  background: `${C.accent}20`, color: C.accent, fontFamily: FONT_MONO,
                }}>{positions.length}</span>
              </div>
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {positions.slice(0, 5).map((pos, i) => {
                const isBuy = pos.side === 'BUY'
                const pnlColor = pos.unrealizedPnl >= 0 ? C.success : C.danger
                const sData = STRATEGIES.find(s => s.id === pos.strategy)
                return (
                  <div key={pos.id} style={{
                    padding: '10px 12px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.02)',
                    border: `0.5px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: isBuy ? `${C.success}12` : `${C.danger}12`,
                      border: `0.5px solid ${isBuy ? `${C.success}25` : `${C.danger}25`}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {isBuy ? <TrendingUp size={16} color={C.success} /> : <TrendingDown size={16} color={C.danger} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>{pos.symbol}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${isBuy ? C.success : C.danger}15`, color: isBuy ? C.success : C.danger, fontFamily: FONT_AR }}>
                          {isBuy ? 'شراء' : 'بيع'}
                        </span>
                        {sData && (
                          <span style={{ fontSize: 8, color: C.text2, fontFamily: FONT_AR }}>{sData.nameAr}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 2 }}>
                        ثقة: {pos.confidence}% • SL: {pos.stopLoss ? `$${pos.stopLoss.toFixed(2)}` : '—'} • TP: {pos.takeProfit ? `$${pos.takeProfit.toFixed(2)}` : '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'start' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: pnlColor, fontFamily: FONT_MONO }}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* ═══ Live Log Stream ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            marginTop: 16, borderRadius: 28,
            background: 'rgba(28,28,30,0.6)',
            backdropFilter: 'blur(20px)',
            border: `0.5px solid ${C.border}`,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 20px 12px', borderBottom: `0.5px solid ${C.border}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} color={C.accent} />
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                  سجل الوكيل المباشر
                </span>
              </div>
              <div className="flex items-center gap-1">
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  style={{ width: 6, height: 6, borderRadius: 3, background: isRunning ? C.success : C.text2 }}
                />
                <span style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>
                  {isRunning ? 'مباشر' : 'متوقف'}
                </span>
              </div>
            </div>
          </div>
          <div style={{
            maxHeight: 300, overflowY: 'auto', padding: '10px 12px',
            scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
          }}>
            {displayLogs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Cpu size={36} color="rgba(255,255,255,0.08)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text2, fontFamily: FONT_AR }}>لا توجد سجلات بعد</p>
                <p style={{ fontSize: 11, color: C.text3, fontFamily: FONT_AR, marginTop: 4 }}>فعّل الوكيل لبدء تسجيل النشاط</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {displayLogs.map((log, i) => {
                  const color = log.type === 'success' ? C.success : log.type === 'error' ? C.danger : log.type === 'warning' ? C.amber : log.type === 'trade' ? C.accent : C.accent
                  return (
                    <motion.div
                      key={`${log.time}-${i}`}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      style={{
                        padding: '8px 10px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.02)',
                        borderRight: `2px solid ${color}40`,
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                      }}
                    >
                      <div style={{
                        width: 6, height: 6, borderRadius: 3,
                        background: color, marginTop: 5, flexShrink: 0,
                        boxShadow: `0 0 6px ${color}60`,
                      }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, color: C.text, fontFamily: FONT_AR, lineHeight: 1.5, wordBreak: 'break-word' }}>{log.msg}</p>
                        <p style={{ fontSize: 9, color: C.text2, fontFamily: FONT_MONO, marginTop: 2, direction: 'ltr', textAlign: 'left' }}>{log.time}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* ═══ Performance Card ═══ */}
        {performance && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: 16, borderRadius: 28,
              background: 'rgba(28,28,30,0.6)',
              backdropFilter: 'blur(20px)',
              border: `0.5px solid ${C.border}`,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px 12px', borderBottom: `0.5px solid ${C.border}` }}>
              <div className="flex items-center gap-2">
                <BarChart3 size={14} color={C.success} />
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                  الأداء
                </span>
              </div>
            </div>
            <div style={{ padding: '14px 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>إجمالي الصفقات</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: FONT_MONO, marginTop: 2 }}>{performance.totalTrades}</p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>نسبة الفوز</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: performance.winRate >= 50 ? C.success : C.danger, fontFamily: FONT_MONO, marginTop: 2 }}>{performance.winRate.toFixed(1)}%</p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>إجمالي الربح</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: performance.totalPnL >= 0 ? C.success : C.danger, fontFamily: FONT_MONO, marginTop: 2 }}>
                    {performance.totalPnL >= 0 ? '+' : ''}${Math.abs(performance.totalPnL).toFixed(2)}
                  </p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>عامل الربح</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: (performance.profitFactor ?? 0) >= 1 ? C.success : C.danger, fontFamily: FONT_MONO, marginTop: 2 }}>
                    {(performance.profitFactor ?? 0).toFixed(2)}
                  </p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>أقصى خسارة</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: C.danger, fontFamily: FONT_MONO, marginTop: 2 }}>
                    -{(performance.maxDrawdownPercent ?? 0).toFixed(1)}%
                  </p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>شارب</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: FONT_MONO, marginTop: 2 }}>
                    {(performance.sharpeRatio ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ Error Banner ═══ */}
        {error && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 16,
            background: 'rgba(255,69,58,0.10)', border: `0.5px solid rgba(255,69,58,0.25)`,
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, color: C.danger, fontFamily: FONT_AR,
          }}>
            <XCircle size={16} />
            {error}
          </div>
        )}

      </div>

      {/* ═══ CSS ═══ */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  )
}
