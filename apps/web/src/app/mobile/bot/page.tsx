'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Bot, Power, Activity, TrendingUp, TrendingDown,
  Target, ShieldAlert, RotateCcw, RefreshCw, Loader2,
  ChevronDown, Zap, Brain, Gauge, Clock
} from 'lucide-react'
import { useBotStore, type BotEngineState } from '@/hooks/useBotStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { ScopedStyle } from '@/components/ScopedStyle'

/* ─── Design Tokens ─── */
const C = {
  accent:  '#00D4FF',
  success: '#32D74B',
  danger:  '#FF453A',
  amber:   '#FFB800',
  text:    '#F0F2F5',
  text2:   'rgba(235,235,245,0.5)',
  bg:      '#1C1C1E',
  border:  'rgba(255,255,255,0.08)',
}
const FONT_AR   = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Strategy Options (synced with backend BotStrategyType) ─── */
const STRATEGIES = [
  { id: 'AUTO',            icon: '🤖', desc: 'اختيار تلقائي لأفضل استراتيجية حسب السوق' },
  { id: 'TREND_FOLLOWING', icon: '📈', desc: 'متابعة الاتجاه القوي مع EMA و MACD' },
  { id: 'MEAN_REVERSION',  icon: '🔄', desc: 'العودة للمتوسط عند الانحرافات الكبيرة' },
  { id: 'BREAKOUT',        icon: '⚡', desc: 'الدخول عند اختراق المستويات مع زخم قوي' },
  { id: 'MOMENTUM',        icon: '🚀', desc: 'التداول مع تدفق الزخم بناءً على معدل التغيير' },
]

/* ─── Status Config ─── */
const STATUS_CONFIG: Record<BotEngineState, { label: string; color: string; glow: string }> = {
  idle:     { label: 'متوقف',     color: C.text2,                           glow: 'transparent' },
  armed:    { label: 'جاهز',      color: C.accent,                          glow: `${C.accent}30` },
  scanning: { label: 'يبحث',     color: C.amber,                           glow: `${C.amber}30` },
  entering: { label: 'يدخل صفقة', color: C.success,                        glow: `${C.success}30` },
  managing: { label: 'يدير',     color: '#0A84FF',                         glow: `rgba(10,132,255,0.3)` },
  exiting:  { label: 'يخرج',     color: C.danger,                          glow: `${C.danger}30` },
  cooldown: { label: 'استراحة',   color: 'rgba(235,235,245,0.35)',         glow: 'rgba(235,235,245,0.1)' },
}

/* ─── Log Type Colors ─── */
const LOG_COLORS: Record<string, string> = {
  info: '#00D4FF',
  buy:  '#32D74B',
  sell: '#FF453A',
  warn: '#FFB800',
}

/* ─── iOS-style Toggle Switch (RTL-safe) ─── */
function IOSSwitch({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={isOn}
      aria-label="تبديل البوت"
      className="relative"
      style={{
        width: 64, height: 36, borderRadius: 18, border: 'none',
        background: isOn ? C.success : 'rgba(120,120,128,0.32)',
        transition: 'background 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer', flexShrink: 0,
        boxShadow: isOn ? `0 0 20px ${C.success}40` : 'none',
      }}
    >
      {/* FIX: Use insetInlineStart (logical property) instead of x+left for RTL-safe thumb positioning */}
      <motion.div
        animate={{ insetInlineStart: isOn ? 32 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: 28, height: 28, borderRadius: 14,
          background: '#FFFFFF',
          position: 'absolute', top: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.1)',
        }}
      />
      {/* ON / OFF labels */}
      <span
        style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          insetInlineEnd: isOn ? 8 : 'auto', insetInlineStart: isOn ? 'auto' : 10,
          fontSize: 10, fontWeight: 800, color: isOn ? '#fff' : 'rgba(255,255,255,0.5)',
          fontFamily: FONT_AR, pointerEvents: 'none',
          transition: 'opacity 0.2s',
        }}
      >
        {isOn ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

/* ─── Stat Card ─── */
function StatCard({
  label, value, color, icon: Icon
}: {
  label: string; value: string; color: string; icon: React.ElementType
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: '14px 12px', borderRadius: 20,
        background: 'rgba(28,28,30,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `0.5px solid ${color}18`,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle glow */}
      <div
        style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          width: 40, height: 20, borderRadius: '50%',
          background: `${color}10`, filter: 'blur(10px)', pointerEvents: 'none',
        }}
      />
      <Icon size={14} color={color} style={{ margin: '0 auto 6px' }} />
      <div style={{ fontSize: 17, fontWeight: 800, color, fontFamily: FONT_MONO }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 2 }}>
        {label}
      </div>
    </motion.div>
  )
}

/* ─── Log Entry ─── */
function LogEntry({ time, msg, type }: { time: string; msg: string; type: string }) {
  const color = LOG_COLORS[type] || LOG_COLORS.info
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2"
      style={{
        padding: '8px 10px', borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
        borderInlineEnd: `2px solid ${color}40`,
      }}
    >
      <div
        style={{
          width: 6, height: 6, borderRadius: 3,
          background: color, marginTop: 5, flexShrink: 0,
          boxShadow: `0 0 6px ${color}60`,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 12, color: C.text, fontFamily: FONT_AR,
          lineHeight: 1.5, wordBreak: 'break-word',
        }}>
          {msg}
        </p>
        <p style={{
          fontSize: 9, color: C.text2, fontFamily: FONT_MONO,
          marginTop: 2, direction: 'ltr', textAlign: 'left',
        }}>
          {time}
        </p>
      </div>
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function MobileBotPage() {
  const router = useRouter()

  // ── Store State ──
  const {
    isOn, engineState, logs, stats, settings,
    setIsOn, addLog, resetAll, syncFromDB, updateSettings,
  } = useBotStore()

  const openPositions = usePaperTradesStore((s) => s.trades.filter(t => t.source === 'bot').length)

  // ── Local State ──
  const [showStrategyPicker, setShowStrategyPicker] = useState(false)
  const [showExchangePicker, setShowExchangePicker] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [exchangeCredentials, setExchangeCredentials] = useState<any[]>([])
  const [selectedTradingMode, setSelectedTradingMode] = useState<{isPaper: boolean, credentialId?: string}>({isPaper: true})
  const [executorUserState, setExecutorUserState] = useState<any>(null)

  // ── Log auto-scroll ──
  const logEndRef = useRef<HTMLDivElement>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const displayLogs = logs.slice(0, 20)

  useEffect(() => {
    setHydrated(true)
  }, [])

  // V119: Fetch user's exchange credentials for real trading mode
  useEffect(() => {
    const fetchCreds = async () => {
      try {
        const res = await fetch('/api/portfolio/credentials')
        if (res.ok) {
          const data = await res.json()
          if (data.success && Array.isArray(data.data)) {
            const realCreds = data.data.filter((c: any) => c.exchange !== 'paper-trading' && c.isValid)
            setExchangeCredentials(realCreds)
          }
        }
      } catch { /* non-critical */ }
    }
    fetchCreds()
  }, [])

  // V119: Fetch executor user state to show current mode
  useEffect(() => {
    const fetchUserState = async () => {
      try {
        const res = await fetch('/api/smart-executor/user/status')
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data?.user) {
            setExecutorUserState(data.data.user)
            // Sync local state with server
            if (data.data.user.enabled) {
              setSelectedTradingMode({
                isPaper: data.data.user.isPaperTrading,
                credentialId: data.data.user.credentialId,
              })
            }
          }
        }
      } catch { /* non-critical */ }
    }
    fetchUserState()
    const interval = setInterval(fetchUserState, 15000)
    return () => clearInterval(interval)
  }, [])

  // Fetch real engine status from server periodically
  useEffect(() => {
    const fetchEngineStatus = async () => {
      try {
        const res = await fetch('/api/engine/status')
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.data) {
            const engine = data.data
            if (engine.state) {
              // Sync engine state from server
              useBotStore.getState().setEngineState(engine.state as BotEngineState)
            }
            if (engine.stats) {
              useBotStore.getState().patchStats(engine.stats)
            }
          }
        }
      } catch { /* silent */ }
    }
    fetchEngineStatus()
    const interval = setInterval(fetchEngineStatus, 15000) // 15s polling
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [displayLogs.length])

  // ── Handlers ──
  const handleToggle = useCallback(async () => {
    const newState = !isOn
    setIsOn(newState)

    if (newState) {
      // V119: Use selected trading mode (paper or real exchange)
      const modeLabel = selectedTradingMode.isPaper
        ? 'ورقي (تجريبي)'
        : `حقيقي (${exchangeCredentials.find((c: any) => c.id === selectedTradingMode.credentialId)?.exchange || 'بورصة'})`

      const confirmed = window.confirm(
        selectedTradingMode.isPaper
          ? '⚠️ تداول ورقي تجريبي\n\nهذا سيُفعّل التداول الورقي (محاكاة بأموال وهمية).\nالصفقات المنفّذة ستكون ورقية فقط وليست حقيقية.\nهل تريد المتابعة؟'
          : `⚠️ تداول حقيقي بأموال فعلية\n\nسيتم التداول على بورصتك الحقيقية.\nالصفقات ستكون بأموال حقيقية.\nهل تريد المتابعة؟`
      );
      if (!confirmed) {
        setIsOn(false);
        return;
      }
      // ── Enable bot via backend API with selected mode ──
      addLog(`🟢 جارٍ تشغيل البوت الآلي (${modeLabel}) — إرسال طلب للخادم...`, 'info')
      try {
        const res = await fetch('/api/smart-executor/user/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isPaperTrading: selectedTradingMode.isPaper,
            credentialId: selectedTradingMode.credentialId,
            riskPerTradePercent: settings.riskPct || 1,
            maxOpenPositions: 20,  // V144: Increased from 15 to 20 — global RiskGatekeeper limit
          }),
        })
        const data = await res.json()
        if (res.ok) {
          addLog(`✅ تم تشغيل البوت بنجاح — المحرك نشط (${modeLabel})`, 'info')
          // Update engine state from server response
          if (data.state) {
            useBotStore.getState().setEngineState(data.state as BotEngineState)
          }
          // Send notification
          const { useNotificationStore } = await import('@/hooks/useNotificationStore')
          useNotificationStore.getState().addNotification({
            source: 'bot',
            priority: 'high',
            action: 'INFO',
            title: '🤖 البوت الآلي: تم التشغيل',
            body: `البوت يعمل الآن باستراتيجية ${settings.strategy || 'AUTO'} — وضع: ${modeLabel}`,
          })
        } else {
          addLog(`⚠️ استجابة الخادم: ${data.message || 'خطأ غير معروف'}`, 'warn')
        }
      } catch (err) {
        addLog('⚠️ فشل الاتصال بالخادم — البوت يعمل محلياً فقط', 'warn')
      }
    } else {
      // ── Disable bot via backend API ──
      addLog('🔴 جارٍ إيقاف البوت الآلي — إرسال طلب للخادم...', 'warn')
      try {
        const res = await fetch('/api/smart-executor/user/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await res.json()
        if (res.ok) {
          addLog('✅ تم إيقاف البوت بنجاح', 'warn')
          useBotStore.getState().setEngineState('idle' as BotEngineState)
        } else {
          addLog(`⚠️ استجابة الخادم: ${data.message || 'خطأ غير معروف'}`, 'warn')
        }
      } catch (err) {
        addLog('⚠️ فشل الاتصال بالخادم — تم الإيقاف محلياً فقط', 'warn')
      }
    }
  }, [isOn, setIsOn, addLog, settings, selectedTradingMode, exchangeCredentials])

  const handleResetStats = useCallback(async () => {
    setIsResetting(true)
    // Small delay for tactile feedback
    await new Promise(r => setTimeout(r, 400))
    resetAll()
    addLog('🔄 تم إعادة تعيين إحصائيات البوت', 'info')
    setIsResetting(false)
  }, [resetAll, addLog])

  const handleSyncSettings = useCallback(async () => {
    setIsSyncing(true)
    try {
      await syncFromDB()
      addLog('✅ تم مزامنة الإعدادات من الخادم', 'info')
    } catch {
      addLog('⚠️ فشلت مزامنة الإعدادات', 'warn')
    }
    setIsSyncing(false)
  }, [syncFromDB, addLog])

  const handleStrategyChange = useCallback((strategyId: string) => {
    updateSettings({ strategy: strategyId })
    addLog(`📋 تم تغيير الاستراتيجية إلى: ${strategyId}`, 'info')
    setShowStrategyPicker(false)
  }, [updateSettings, addLog])

  // ── Status Config ──
  const statusCfg = STATUS_CONFIG[engineState] || STATUS_CONFIG.idle

  if (!hydrated) {
    return (
      <div style={{ minHeight: '100%', background: '#000000', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} className="animate-spin" color={C.accent} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%', background: '#000000', direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* ══════════════ Sticky Header ══════════════ */}
      <div
        style={{
          padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 16px',
          background: 'rgba(28, 28, 30, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '0.5px solid rgba(255,255,255,0.1)',
          position: 'sticky', top: 0, zIndex: 50,
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.07)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ArrowRight size={18} color="#FFFFFF" />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
              البوت الآلي
            </h1>
            <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
              تحكم بمحرك التداول الآلي
            </p>
          </div>
          <div
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${C.accent}15`, border: `0.5px solid ${C.accent}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Bot size={18} color={C.accent} />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* ══════════════ Master Toggle Card ══════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            marginTop: 16, padding: '20px 20px 18px', borderRadius: 28,
            background: isOn
              ? 'rgba(28,28,30,0.7)'
              : 'rgba(28,28,30,0.5)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `0.5px solid ${isOn ? `${C.success}20` : C.border}`,
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Animated glow when ON */}
          {isOn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute', top: -40, right: -40,
                width: 120, height: 120, borderRadius: '50%',
                background: `${C.success}12`, filter: 'blur(40px)',
                pointerEvents: 'none',
              }}
            />
          )}

          <div className="flex items-center justify-between" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-center gap-3">
              <motion.div
                animate={{
                  scale: isOn ? [1, 1.15, 1] : 1,
                  rotate: isOn ? [0, 10, -10, 0] : 0,
                }}
                transition={{ duration: 0.5 }}
                style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: isOn ? `${C.success}20` : 'rgba(120,120,128,0.15)',
                  border: `0.5px solid ${isOn ? `${C.success}30` : 'rgba(255,255,255,0.06)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Power size={20} color={isOn ? C.success : 'rgba(255,255,255,0.3)'} />
              </motion.div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                  {isOn ? 'البوت يعمل' : 'البوت متوقف'}
                </p>
                <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
                  {isOn ? 'المحرك نشط ويبحث عن فرص' : 'قم بتشغيل البوت لبدء التداول'}
                </p>
              </div>
            </div>
            <IOSSwitch isOn={isOn} onToggle={handleToggle} />
          </div>

          {/* ── Status Indicator ── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={engineState}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 mt-4"
              style={{
                padding: '8px 14px', borderRadius: 12,
                background: `${statusCfg.color}10`,
                border: `0.5px solid ${statusCfg.color}20`,
              }}
            >
              <motion.div
                animate={isOn && engineState !== 'idle' ? { scale: [1, 1.3, 1] } : {}}
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
              {engineState === 'scanning' && (
                <Loader2 size={12} className="animate-spin" color={C.amber} style={{ marginInlineStart: 'auto' }} />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* ══════════════ V119: Exchange Mode Picker ══════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          style={{
            marginTop: 12, borderRadius: 28,
            background: 'rgba(28,28,30,0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `0.5px solid ${selectedTradingMode.isPaper ? `${C.accent}30` : `${C.amber}30`}`,
            overflow: 'hidden',
          }}
        >
          {/* Exchange Mode Header */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: '14px 18px 10px',
              borderBottom: `0.5px solid ${C.border}`,
            }}
          >
            <div className="flex items-center gap-2">
              <Zap size={14} color={selectedTradingMode.isPaper ? C.accent : C.amber} />
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                وضع التداول
              </span>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 10,
              background: selectedTradingMode.isPaper ? `${C.accent}15` : `${C.amber}15`,
              color: selectedTradingMode.isPaper ? C.accent : C.amber,
              fontFamily: FONT_AR,
            }}>
              {selectedTradingMode.isPaper ? 'ورقي' : 'حقيقي'}
            </span>
          </div>

          {/* Exchange Mode Options */}
          <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Paper Trading Option */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setSelectedTradingMode({ isPaper: true })
                setShowExchangePicker(false)
              }}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 16,
                background: selectedTradingMode.isPaper ? `${C.accent}15` : 'rgba(255,255,255,0.02)',
                border: `0.5px solid ${selectedTradingMode.isPaper ? `${C.accent}40` : C.border}`,
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', textAlign: 'right',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: selectedTradingMode.isPaper ? `${C.accent}20` : 'rgba(255,255,255,0.05)',
                border: `0.5px solid ${selectedTradingMode.isPaper ? `${C.accent}30` : 'rgba(255,255,255,0.06)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>
                📝
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: selectedTradingMode.isPaper ? C.accent : C.text, fontFamily: FONT_AR }}>
                  تداول ورقي
                </p>
                <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 1 }}>
                  محاكاة بأموال وهمية — بدون مخاطر
                </p>
              </div>
              {selectedTradingMode.isPaper && (
                <div style={{ width: 8, height: 8, borderRadius: 4, background: C.accent, boxShadow: `0 0 8px ${C.accent}60` }} />
              )}
            </motion.button>

            {/* Real Exchange Options */}
            {exchangeCredentials.length > 0 ? (
              exchangeCredentials.map((cred: any) => {
                const isSelected = !selectedTradingMode.isPaper && selectedTradingMode.credentialId === cred.id
                return (
                  <motion.button
                    key={cred.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedTradingMode({ isPaper: false, credentialId: cred.id })
                      setShowExchangePicker(false)
                    }}
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: 16,
                      background: isSelected ? `${C.amber}15` : 'rgba(255,255,255,0.02)',
                      border: `0.5px solid ${isSelected ? `${C.amber}40` : C.border}`,
                      display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer', textAlign: 'right',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: isSelected ? `${C.amber}20` : 'rgba(255,255,255,0.05)',
                      border: `0.5px solid ${isSelected ? `${C.amber}30` : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18,
                    }}>
                      💰
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: isSelected ? C.amber : C.text, fontFamily: FONT_AR }}>
                        {cred.exchange} {cred.label ? `(${cred.label})` : ''}
                      </p>
                      <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 1 }}>
                        تداول حقيقي بأموال فعلية {cred.testnet ? '(تجريبي)' : '(إنتاج)'}
                      </p>
                    </div>
                    {isSelected && (
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: C.amber, boxShadow: `0 0 8px ${C.amber}60` }} />
                    )}
                  </motion.button>
                )
              })
            ) : (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/mobile/settings/exchange')}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 16,
                  background: 'rgba(255,255,255,0.02)',
                  border: `0.5px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer', textAlign: 'right',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: `0.5px solid rgba(255,255,255,0.06)'`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  🔗
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text2, fontFamily: FONT_AR }}>
                    ربط بورصة حقيقية
                  </p>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 1, opacity: 0.6 }}>
                    أضف مفاتيح API للتبديل إلى التداول الحقيقي
                  </p>
                </div>
              </motion.button>
            )}
          </div>

          {/* Current Mode Warning */}
          {executorUserState?.enabled && (
            <div style={{
              padding: '8px 16px 12px',
              background: executorUserState.isPaperTrading ? 'rgba(0,212,255,0.06)' : 'rgba(255,184,0,0.06)',
              borderTop: `0.5px solid ${executorUserState.isPaperTrading ? 'rgba(0,212,255,0.15)' : 'rgba(255,184,0,0.15)'}`,
            }}>
              <span style={{ fontSize: 10, color: executorUserState.isPaperTrading ? C.accent : C.amber, fontFamily: FONT_AR, fontWeight: 600 }}>
                {executorUserState.isPaperTrading
                  ? '⚠ البوت يعمل حالياً في وضع ورقي — الصفقات بأموال وهمية'
                  : `⚠ البوت يعمل حالياً في وضع حقيقي على ${exchangeCredentials.find((c: any) => c.id === executorUserState.credentialId)?.exchange || 'البورصة'}`}
              </span>
            </div>
          )}
        </motion.div>

        {/* ══════════════ Stats Grid (2x3) ══════════════ */}
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <StatCard
            label="الصفقات"
            value={String(stats.trades)}
            color={C.accent}
            icon={Activity}
          />
          <StatCard
            label="الأرباح"
            value={`$${stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(2)}`}
            color={stats.profit >= 0 ? C.success : C.danger}
            icon={stats.profit >= 0 ? TrendingUp : TrendingDown}
          />
          <StatCard
            label="نسبة الفوز"
            value={`${stats.winRate}%`}
            color={stats.winRate >= 50 ? C.success : C.amber}
            icon={Target}
          />
          <StatCard
            label="المراكز المفتوحة"
            value={String(openPositions)}
            color="#0A84FF"
            icon={Zap}
          />
          <StatCard
            label="خسارة الجلسة"
            value={`$${Math.abs(stats.sessionLoss).toFixed(2)}`}
            color={stats.sessionLoss < 0 ? C.danger : C.text2}
            icon={ShieldAlert}
          />
          <StatCard
            label="الخسائر"
            value={String(stats.losses)}
            color={stats.losses > 0 ? C.danger : C.text2}
            icon={TrendingDown}
          />
        </div>

        {/* ══════════════ Live Log Stream ══════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          style={{
            marginTop: 16, borderRadius: 28,
            background: 'rgba(28,28,30,0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `0.5px solid ${C.border}`,
            overflow: 'hidden',
          }}
        >
          {/* Log Header */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: '16px 20px 12px',
              borderBottom: `0.5px solid ${C.border}`,
            }}
          >
            <div className="flex items-center gap-2">
              <Activity size={14} color={C.accent} />
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                سجل البوت المباشر
              </span>
            </div>
            <div className="flex items-center gap-1">
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: isOn ? C.success : C.text2,
                }}
              />
              <span style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>
                {isOn ? 'مباشر' : 'متوقف'}
              </span>
            </div>
          </div>

          {/* Log Content */}
          <div
            ref={logContainerRef}
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              padding: '10px 12px',
              /* Custom scrollbar */
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.1) transparent',
            }}
            className="custom-scrollbar"
          >
            {displayLogs.length === 0 ? (
              /* Empty State */
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Bot size={36} color="rgba(255,255,255,0.08)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text2, fontFamily: FONT_AR }}>
                  لا توجد سجلات بعد
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: FONT_AR, marginTop: 4, lineHeight: 1.6 }}>
                  قم بتشغيل البوت لبدء تسجيل النشاط
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {displayLogs.map((log, i) => (
                  <LogEntry key={`${log.time}-${i}`} time={log.time} msg={log.msg} type={log.type} />
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </motion.div>

        {/* ══════════════ Bot Settings Card ══════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{
            marginTop: 16, borderRadius: 28,
            background: 'rgba(28,28,30,0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `0.5px solid ${C.border}`,
            overflow: 'hidden',
          }}
        >
          {/* Settings Header */}
          <div
            className="flex items-center gap-2"
            style={{
              padding: '16px 20px 12px',
              borderBottom: `0.5px solid ${C.border}`,
            }}
          >
            <Gauge size={14} color={C.amber} />
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
              إعدادات البوت
            </span>
          </div>

          <div style={{ padding: '14px 20px 20px' }}>

            {/* ── Strategy Selector ── */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR, marginBottom: 8 }}>
                الاستراتيجية
              </p>
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
                  <span style={{ fontSize: 16 }}>
                    {STRATEGIES.find(s => s.id === settings.strategy)?.icon || '📋'}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                    {settings.strategy || 'AUTO'}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: showStrategyPicker ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={16} color={C.text2} />
                </motion.div>
              </motion.button>

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
                        const isActive = settings.strategy === s.id
                        return (
                          <motion.button
                            key={s.id}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleStrategyChange(s.id)}
                            style={{
                              padding: '10px 14px', borderRadius: 14,
                              background: isActive ? `${C.accent}15` : 'rgba(255,255,255,0.02)',
                              border: `0.5px solid ${isActive ? `${C.accent}30` : C.border}`,
                              display: 'flex', alignItems: 'center', gap: 10,
                              cursor: 'pointer', width: '100%', textAlign: 'right',
                            }}
                          >
                            <span style={{ fontSize: 18 }}>{s.icon}</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: isActive ? C.accent : C.text, fontFamily: FONT_AR }}>
                                {s.id}
                              </p>
                              <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 1 }}>
                                {s.desc}
                              </p>
                            </div>
                            {isActive && (
                              <div style={{ width: 8, height: 8, borderRadius: 4, background: C.accent, boxShadow: `0 0 8px ${C.accent}60` }} />
                            )}
                          </motion.button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Risk Percentage Slider ── */}
            <div style={{ marginBottom: 18 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>نسبة المخاطرة</p>
                <span style={{
                  fontSize: 13, fontWeight: 800, color: C.amber, fontFamily: FONT_MONO,
                  padding: '2px 8px', borderRadius: 8,
                  background: `${C.amber}15`,
                }}>
                  {settings.riskPct}%
                </span>
              </div>
              <div style={{ position: 'relative', direction: 'ltr' }}>
                <input
                  type="range"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={settings.riskPct}
                  onChange={(e) => updateSettings({ riskPct: parseFloat(e.target.value) })}
                  style={{
                    width: '100%', height: 6, borderRadius: 3,
                    background: `linear-gradient(to right, ${C.amber} ${(settings.riskPct / 10) * 100}%, rgba(255,255,255,0.08) ${(settings.riskPct / 10) * 100}%)`,
                    appearance: 'none', WebkitAppearance: 'none',
                    outline: 'none', cursor: 'pointer',
                  }}
                  className="ios-slider"
                />
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_MONO }}>0.5%</span>
                <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_MONO }}>10%</span>
              </div>
            </div>

            {/* ── Confidence Limit Slider ── */}
            <div style={{ marginBottom: 18 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>حد الثقة الأدنى</p>
                <span style={{
                  fontSize: 13, fontWeight: 800, color: C.accent, fontFamily: FONT_MONO,
                  padding: '2px 8px', borderRadius: 8,
                  background: `${C.accent}15`,
                }}>
                  {settings.confLimit}%
                </span>
              </div>
              <div style={{ position: 'relative', direction: 'ltr' }}>
                <input
                  type="range"
                  min={30}
                  max={95}
                  step={5}
                  value={settings.confLimit}
                  onChange={(e) => updateSettings({ confLimit: parseInt(e.target.value) })}
                  style={{
                    width: '100%', height: 6, borderRadius: 3,
                    background: `linear-gradient(to right, ${C.accent} ${((settings.confLimit - 30) / 65) * 100}%, rgba(255,255,255,0.08) ${((settings.confLimit - 30) / 65) * 100}%)`,
                    appearance: 'none', WebkitAppearance: 'none',
                    outline: 'none', cursor: 'pointer',
                  }}
                  className="ios-slider"
                />
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_MONO }}>30%</span>
                <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_MONO }}>95%</span>
              </div>
            </div>

            {/* ── AI Consensus Toggle ── */}
            <div
              className="flex items-center justify-between"
              style={{
                padding: '12px 16px', borderRadius: 16,
                background: settings.useAIConsensus ? `${C.accent}08` : 'rgba(255,255,255,0.02)',
                border: `0.5px solid ${settings.useAIConsensus ? `${C.accent}20` : C.border}`,
                marginBottom: 18,
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: settings.useAIConsensus ? `${C.accent}15` : 'rgba(255,255,255,0.05)',
                  border: `0.5px solid ${settings.useAIConsensus ? `${C.accent}25` : 'rgba(255,255,255,0.06)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Brain size={16} color={settings.useAIConsensus ? C.accent : 'rgba(255,255,255,0.3)'} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                    إجماع AI
                  </p>
                  <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginTop: 1 }}>
                    {settings.useAIConsensus ? 'المجلس يوافق قبل الدخول' : 'تنفيذ بناءً على التحليل الفني فقط'}
                  </p>
                </div>
              </div>
              <IOSSwitch
                isOn={settings.useAIConsensus}
                onToggle={() => updateSettings({ useAIConsensus: !settings.useAIConsensus })}
              />
            </div>

            {/* ── Protection Info Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div
                style={{
                  padding: '12px 14px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.02)',
                  border: `0.5px solid ${C.border}`,
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldAlert size={10} color={C.danger} />
                  <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>
                    الخسارة اليومية القصوى
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.danger, fontFamily: FONT_MONO }}>
                  ${Math.abs(settings.maxDailyLoss).toFixed(0)}
                </p>
              </div>
              <div
                style={{
                  padding: '12px 14px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.02)',
                  border: `0.5px solid ${C.border}`,
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock size={10} color={C.amber} />
                  <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>
                    فترة التهدئة
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.amber, fontFamily: FONT_MONO }}>
                  {settings.maxDrawdown || 60}ث
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══════════════ Quick Actions ══════════════ */}
        <div
          style={{
            marginTop: 16, marginBottom: 24,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          }}
        >
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleResetStats}
            disabled={isResetting}
            style={{
              padding: '14px 16px', borderRadius: 20,
              background: 'rgba(255,69,58,0.08)',
              border: '0.5px solid rgba(255,69,58,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: isResetting ? 'wait' : 'pointer',
              opacity: isResetting ? 0.6 : 1,
            }}
          >
            {isResetting ? (
              <Loader2 size={14} className="animate-spin" color={C.danger} />
            ) : (
              <RotateCcw size={14} color={C.danger} />
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: C.danger, fontFamily: FONT_AR }}>
              إعادة تعيين الإحصائيات
            </span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleSyncSettings}
            disabled={isSyncing}
            style={{
              padding: '14px 16px', borderRadius: 20,
              background: 'rgba(0,212,255,0.08)',
              border: '0.5px solid rgba(0,212,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: isSyncing ? 'wait' : 'pointer',
              opacity: isSyncing ? 0.6 : 1,
            }}
          >
            {isSyncing ? (
              <Loader2 size={14} className="animate-spin" color={C.accent} />
            ) : (
              <RefreshCw size={14} color={C.accent} />
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: FONT_AR }}>
              مزامنة الإعدادات
            </span>
          </motion.button>
        </div>

      </div>

      {/* ══════════════ CSS for iOS-style range slider ══════════════ */}
      <ScopedStyle>{`
        .ios-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #FFFFFF;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(0,0,0,0.1);
          cursor: pointer;
          margin-top: -8px;
          transition: transform 0.15s ease;
        }
        .ios-slider::-webkit-slider-thumb:active {
          transform: scale(1.15);
        }
        .ios-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #FFFFFF;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
          border: none;
        }
        .ios-slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
        }
        .ios-slider::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.08);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</ScopedStyle>
    </div>
  )
}
