'use client'

import { useEffect, useState, useCallback } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import { Cpu, DollarSign, Activity, Shield, ChevronDown, ChevronUp } from 'lucide-react'

const STRATEGY_LABELS: Record<string, string> = {
  AUTO: 'تلقائي', SCALPING: 'سكالبينغ', SWING: 'سوينغ', GRID: 'شبكة',
  MEAN_REVERSION: 'عودة للمتوسط', MOMENTUM_BREAKOUT: 'اختراق الزخم', DCA: 'متوسط التكلفة', VWAP_RSI: 'VWAP+RSI',
}

export default function MobileBotPage() {
  const { agentState, loading, fetchStatus, startAgent, stopAgent, startAutoRefresh, stopAutoRefresh, settings } = useAgentStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [riskPct, setRiskPct] = useState(2)
  const [confidenceLimit, setConfidenceLimit] = useState(60)

  useEffect(() => { fetchStatus(); startAutoRefresh(); return () => stopAutoRefresh() }, [fetchStatus, startAutoRefresh, stopAutoRefresh])

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const strategy = agentState?.config?.strategy ?? StrategyType.AUTO
  const dailyPnL = Number(agentState?.dailyPnL ?? 0)
  const dailyTrades = Number(agentState?.dailyTradesCount ?? 0)
  const consecutiveLosses = Number(agentState?.consecutiveLosses ?? 0)
  const winRate = dailyTrades > 0 ? ((dailyTrades - consecutiveLosses) / dailyTrades * 100) : 0

  const statusColor = isRunning ? '#00FFA3' : status === AgentStatus.EMERGENCY_STOP ? '#FF4757' : '#8B92A8'
  const statusLabel = isRunning ? 'يعمل' : status === AgentStatus.EMERGENCY_STOP ? 'إيقاف طارئ' : 'متوقف'

  const handleToggle = useCallback(async () => {
    if (isRunning) await stopAgent(false)
    else await startAgent(strategy)
  }, [isRunning, strategy, startAgent, stopAgent])

  return (
    <div className="m-page">
      <MobilePageHeader title="المنفذ الذكي" subtitle="تنفيذ ذكي للصفقات" />

      {/* Main toggle card */}
      <IOSCard highlight={isRunning}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: isRunning ? 'linear-gradient(135deg, #059669, #00D4FF)' : 'rgba(139,146,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Cpu size={22} color={isRunning ? '#FFF' : '#8B92A8'} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>المحرك</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor, boxShadow: `0 0 6px ${statusColor}60` }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, fontFamily: "'Cairo', sans-serif" }}>{statusLabel}</span>
              </div>
            </div>
          </div>
          <IOSSwitch value={isRunning} onChange={() => handleToggle()} color="#059669" />
        </div>
        <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>
          الاستراتيجية: <span style={{ color: '#00D4FF', fontWeight: 700 }}>{STRATEGY_LABELS[strategy] || strategy}</span>
        </div>
      </IOSCard>

      {/* Daily stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '0 16px', marginBottom: 12 }}>
        <IOSCard noMargin>
          <div style={{ textAlign: 'center' }}>
            <DollarSign size={14} color={dailyPnL >= 0 ? '#00FFA3' : '#FF4757'} style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: dailyPnL >= 0 ? '#00FFA3' : '#FF4757', fontFamily: "'JetBrains Mono', monospace" }}>{dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الربح</div>
          </div>
        </IOSCard>
        <IOSCard noMargin>
          <div style={{ textAlign: 'center' }}>
            <Activity size={14} color="#00D4FF" style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{dailyTrades}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الصفقات</div>
          </div>
        </IOSCard>
        <IOSCard noMargin>
          <div style={{ textAlign: 'center' }}>
            <Shield size={14} color={winRate >= 50 ? '#B388FF' : '#FF453A'} style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{winRate.toFixed(0)}%</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نسبة الربح</div>
          </div>
        </IOSCard>
      </div>

      {/* Settings panel */}
      <IOSCard>
        <button onClick={() => setSettingsOpen(!settingsOpen)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>الإعدادات</span>
          {settingsOpen ? <ChevronUp size={16} color="#8B92A8" /> : <ChevronDown size={16} color="#8B92A8" />}
        </button>
        {settingsOpen && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نسبة المخاطرة</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>{riskPct}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>حد الثقة</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', fontFamily: "'JetBrains Mono', monospace" }}>{confidenceLimit}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>إيقاف عند حد الخسارة</span>
              <IOSSwitch value={true} onChange={() => {}} color="#059669" />
            </div>
          </div>
        )}
      </IOSCard>

      {/* Trade logs */}
      <IOSCard>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>سجل النشاط</div>
        {agentState ? (
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.8 }}>
            <div>الدورات: {agentState.totalCycles}</div>
            <div>آخر دورة: {agentState.lastCycleAt ? new Date(agentState.lastCycleAt).toLocaleTimeString('ar-EG') : '—'}</div>
            {agentState.lastError && <div style={{ color: '#FF453A' }}>خطأ: {agentState.lastError}</div>}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", textAlign: 'center', padding: 10 }}>لا يوجد نشاط بعد</div>
        )}
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
