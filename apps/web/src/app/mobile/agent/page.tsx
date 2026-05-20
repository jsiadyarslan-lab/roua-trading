'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import {
  Cpu, Play, Square, AlertTriangle, DollarSign,
  Activity, Shield, Clock, Loader2, ChevronDown,
  Zap, TrendingUp, Settings2
} from 'lucide-react'

const STRATEGY_LABELS: Record<string, string> = {
  AUTO: 'تلقائي',
  SCALPING: 'سكالبينغ',
  SWING: 'سوينغ',
  GRID: 'شبكة',
  MEAN_REVERSION: 'عودة للمتوسط',
  MOMENTUM_BREAKOUT: 'اختراق الزخم',
  DCA: 'متوسط التكلفة',
  VWAP_RSI: 'VWAP+RSI',
}

const STRATEGY_OPTIONS = Object.entries(STRATEGY_LABELS).map(([key, label]) => ({
  key: key as StrategyType,
  label,
}))

const RISK_PRESETS = [
  { key: 'conservative', label: 'محافظ', maxPosPct: 5, maxDailyLoss: 2, riskPerTrade: 1 },
  { key: 'moderate', label: 'معتدل', maxPosPct: 10, maxDailyLoss: 5, riskPerTrade: 2 },
  { key: 'aggressive', label: 'جريء', maxPosPct: 20, maxDailyLoss: 10, riskPerTrade: 5 },
]

export default function MobileAgentPage() {
  const {
    agentState, loading, fetchStatus, startAgent, stopAgent,
    changeStrategy, updateRiskParams, startAutoRefresh, stopAutoRefresh,
  } = useAgentStore()

  const account = usePositionsStore(s => s.account)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)

  const [showStrategyPicker, setShowStrategyPicker] = useState(false)
  const [showRiskPanel, setShowRiskPanel] = useState(false)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    fetchStatus()
    fetchAccount()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [fetchStatus, fetchAccount, startAutoRefresh, stopAutoRefresh])

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const strategy = agentState?.config?.strategy ?? StrategyType.AUTO
  const dailyPnL = Number(agentState?.dailyPnL ?? 0)
  const dailyTrades = Number(agentState?.dailyTradesCount ?? 0)
  const consecutiveLosses = Number(agentState?.consecutiveLosses ?? 0)
  const totalCycles = Number(agentState?.totalCycles ?? 0)
  const isPaper = agentState?.config?.isPaperTrading ?? false
  const maxPosPct = agentState?.config?.maxPositionSizePercent ?? 10
  const maxDailyLoss = agentState?.config?.maxDailyLossPercent ?? 5
  const riskPerTrade = agentState?.config?.riskPerTradePercent ?? 2
  const lastCycle = agentState?.lastCycleAt ?? null
  const lastError = agentState?.lastError ?? null

  const statusColor = isRunning ? '#00FFA3'
    : status === AgentStatus.EMERGENCY_STOP ? '#FF4757'
    : status === AgentStatus.DAILY_LIMIT_REACHED ? '#FFB800'
    : status === AgentStatus.PAUSED ? '#B388FF'
    : '#8B92A8'

  const statusLabel = isRunning ? 'يعمل'
    : status === AgentStatus.EMERGENCY_STOP ? 'إيقاف طارئ'
    : status === AgentStatus.DAILY_LIMIT_REACHED ? 'حد الخسارة اليومية'
    : status === AgentStatus.PAUSED ? 'متوقف مؤقتاً'
    : 'في الانتظار'

  const handleToggle = useCallback(async () => {
    if (isRunning) {
      setStopping(true)
      try { await stopAgent(false) } finally { setStopping(false) }
    } else {
      await startAgent(strategy)
    }
  }, [isRunning, strategy, startAgent, stopAgent])

  const handleEmergencyStop = useCallback(async () => {
    setStopping(true)
    try { await stopAgent(true) } finally { setStopping(false) }
  }, [stopAgent])

  const handleStrategyChange = useCallback(async (s: StrategyType) => {
    setShowStrategyPicker(false)
    if (s !== strategy) {
      await changeStrategy(s)
    }
  }, [strategy, changeStrategy])

  const handleRiskPreset = useCallback(async (preset: typeof RISK_PRESETS[number]) => {
    setShowRiskPanel(false)
    await updateRiskParams({
      maxPositionSizePercent: preset.maxPosPct,
      maxDailyLossPercent: preset.maxDailyLoss,
      riskPerTradePercent: preset.riskPerTrade,
    })
  }, [updateRiskParams])

  const equity = Number(account?.equity ?? 0) || 0
  const buyingPower = Number(account?.buying_power ?? 0) || 0

  return (
    <div className="r-page">
      <PageHeader title="الوكيل المستقل" subtitle="تداول ذاتي بالذكاء الاصطناعي" />

      {/* Status Card */}
      <Card highlight={isRunning}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: isRunning ? 'linear-gradient(135deg, #FF9F43, #A259FF)' : 'rgba(139,146,168,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '0.5px solid rgba(255,255,255,0.08)',
          }}>
            <Cpu size={24} color={isRunning ? '#FFF' : '#8B92A8'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الوكيل المستقل</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}60` }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor, fontFamily: 'var(--font-cairo)' }}>{statusLabel}</span>
              {isPaper && isRunning && (
                <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '0.5px solid rgba(0,212,255,0.2)', fontFamily: 'var(--font-cairo)' }}>ورقي</span>
              )}
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={loading || stopping}
            style={{
              padding: '8px 20px', borderRadius: 10, border: 'none', cursor: loading || stopping ? 'wait' : 'pointer',
              background: isRunning ? 'rgba(255,71,87,0.12)' : 'linear-gradient(135deg, #00FFC6, #0A84FF)',
              color: isRunning ? '#FF4757' : '#000',
              fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-cairo)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading || stopping ? <Loader2 size={14} className="r-anim-spin" /> : isRunning ? <Square size={12} /> : <Play size={12} />}
            {isRunning ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>

        {/* Error Alert */}
        {lastError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,71,87,0.08)', border: '0.5px solid rgba(255,71,87,0.2)', marginBottom: 10 }}>
            <AlertTriangle size={14} color="#FF4757" />
            <span style={{ fontSize: 10, color: '#FF4757', fontFamily: 'var(--font-cairo)', fontWeight: 600, flex: 1 }}>{lastError}</span>
          </div>
        )}

        {/* Daily Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <DollarSign size={11} color={dailyPnL >= 0 ? '#00FFA3' : '#FF4757'} style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: dailyPnL >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
              {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}
            </div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>ربح اليوم</div>
          </div>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <Activity size={11} color="#00D4FF" style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{dailyTrades}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>صفقات اليوم</div>
          </div>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <Shield size={11} color={consecutiveLosses >= 3 ? '#FF4757' : '#B388FF'} style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: consecutiveLosses >= 3 ? '#FF4757' : '#FFF', fontFamily: 'var(--font-mono)' }}>{consecutiveLosses}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>خسائر متتالية</div>
          </div>
        </div>

        {lastCycle && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'center' }}>
            <Clock size={10} color="#8B92A8" />
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>
              آخر دورة: {new Date(lastCycle).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-mono)' }}>•</span>
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{totalCycles} دورة</span>
          </div>
        )}
      </Card>

      {/* Strategy Selector */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="#FF9F43" />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الاستراتيجية</span>
          </div>
          <button
            onClick={() => { setShowStrategyPicker(!showStrategyPicker); setShowRiskPanel(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8,
              background: 'rgba(255,159,67,0.08)', border: '0.5px solid rgba(255,159,67,0.2)',
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#FF9F43', fontFamily: 'var(--font-cairo)' }}>
              {STRATEGY_LABELS[strategy] || strategy}
            </span>
            <ChevronDown size={12} color="#FF9F43" />
          </button>
        </div>

        {showStrategyPicker && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            {STRATEGY_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => handleStrategyChange(opt.key)}
                style={{
                  padding: '8px 10px', borderRadius: 10, border: `1px solid ${strategy === opt.key ? 'rgba(255,159,67,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  background: strategy === opt.key ? 'rgba(255,159,67,0.1)' : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer', touchAction: 'manipulation', textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: strategy === opt.key ? 800 : 600, color: strategy === opt.key ? '#FF9F43' : '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Risk Management */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} color="#B388FF" />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>إدارة المخاطر</span>
          </div>
          <button
            onClick={() => { setShowRiskPanel(!showRiskPanel); setShowStrategyPicker(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8,
              background: 'rgba(179,136,255,0.08)', border: '0.5px solid rgba(179,136,255,0.2)',
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: '#B388FF', fontFamily: 'var(--font-mono)' }}>{maxPosPct}%</span>
            <ChevronDown size={12} color="#B388FF" />
          </button>
        </div>

        {/* Current Risk Display */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: showRiskPanel ? 10 : 0 }}>
          <div style={{ padding: '6px', borderRadius: 8, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{maxPosPct}%</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>حد المركز</div>
          </div>
          <div style={{ padding: '6px', borderRadius: 8, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{maxDailyLoss}%</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>خسارة يومية</div>
          </div>
          <div style={{ padding: '6px', borderRadius: 8, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{riskPerTrade}%</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>مخاطر/صفقة</div>
          </div>
        </div>

        {/* Risk Presets */}
        {showRiskPanel && (
          <div style={{ display: 'flex', gap: 6 }}>
            {RISK_PRESETS.map(preset => (
              <button
                key={preset.key}
                onClick={() => handleRiskPreset(preset)}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 10, border: `1px solid rgba(179,136,255,${maxPosPct === preset.maxPosPct ? '0.4' : '0.1'})`,
                  background: maxPosPct === preset.maxPosPct ? 'rgba(179,136,255,0.1)' : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer', touchAction: 'manipulation', textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: maxPosPct === preset.maxPosPct ? 800 : 600, color: maxPosPct === preset.maxPosPct ? '#B388FF' : '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{preset.label}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Account Info */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TrendingUp size={16} color="#00D4FF" />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الحساب</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>رأس المال</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
              ${equity.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>قوة الشراء</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
              ${buyingPower.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </Card>

      {/* Emergency Stop */}
      {isRunning && (
        <button
          onClick={handleEmergencyStop}
          disabled={stopping}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '14px 0', borderRadius: 12, border: '1px solid rgba(255,71,87,0.3)',
            background: 'rgba(255,71,87,0.08)', cursor: stopping ? 'wait' : 'pointer',
            margin: '0 var(--space-lg)', boxSizing: 'border-box', touchAction: 'manipulation',
          }}
        >
          {stopping ? <Loader2 size={16} className="r-anim-spin" color="#FF4757" /> : <AlertTriangle size={16} color="#FF4757" />}
          <span style={{ fontSize: 13, fontWeight: 800, color: '#FF4757', fontFamily: 'var(--font-cairo)' }}>إيقاف طارئ</span>
        </button>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
