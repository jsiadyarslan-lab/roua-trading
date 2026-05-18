'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAgentStore, AgentStatus, StrategyType, MarketRegime } from '@/hooks/useAgentStore'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { Cpu, Play, Square, AlertTriangle, Activity, DollarSign, TrendingUp, Shield, BarChart3, RefreshCw, Loader2 } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  [AgentStatus.RUNNING]: { label: 'يعمل', color: C.success },
  [AgentStatus.PAUSED]: { label: 'متوقف مؤقتاً', color: C.amber },
  [AgentStatus.STOPPED]: { label: 'متوقف', color: C.text2 },
  [AgentStatus.EMERGENCY_STOP]: { label: 'إيقاف طارئ', color: C.danger },
  [AgentStatus.DAILY_LIMIT_REACHED]: { label: 'حد الخسارة اليومية', color: C.amber },
  [AgentStatus.IDLE]: { label: 'في الانتظار', color: C.text2 },
}

const STRATEGY_LABELS: Record<string, string> = {
  AUTO: 'تلقائي (تكيفي)',
  SCALPING: 'السكالبينغ',
  SWING: 'السوينغ',
  GRID: 'الشبكة',
  MEAN_REVERSION: 'عودة للمتوسط',
  MOMENTUM_BREAKOUT: 'اختراق الزخم',
  DCA: 'متوسط التكلفة',
  VWAP_RSI: 'VWAP + RSI',
}

const REGIME_LABELS: Record<string, string> = {
  [MarketRegime.TRENDING_UP]: 'صعودي',
  [MarketRegime.TRENDING_DOWN]: 'هبوطي',
  [MarketRegime.RANGING]: 'عرضي',
  [MarketRegime.VOLATILE]: 'متقلب',
  [MarketRegime.TRANSITIONAL]: 'انتقالي',
}

const STRATEGY_OPTIONS = [StrategyType.AUTO, StrategyType.SCALPING, StrategyType.SWING, StrategyType.GRID, StrategyType.MEAN_REVERSION, StrategyType.MOMENTUM_BREAKOUT, StrategyType.DCA, StrategyType.VWAP_RSI]

export default function MobileAgentPage() {
  const { agentState, positions, logs, loading, regimeInfo, performance, fetchStatus, startAgent, stopAgent, changeStrategy, fetchRegimeInfo, startAutoRefresh, stopAutoRefresh } = useAgentStore()
  const [showStrategyPicker, setShowStrategyPicker] = useState(false)

  useEffect(() => {
    fetchStatus()
    fetchRegimeInfo()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [fetchStatus, fetchRegimeInfo, startAutoRefresh, stopAutoRefresh])

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const currentStrategy = agentState?.config?.strategy ?? StrategyType.AUTO
  const dailyPnL = Number(agentState?.dailyPnL ?? 0)
  const dailyTrades = Number(agentState?.dailyTradesCount ?? 0)
  const consecutiveLosses = Number(agentState?.consecutiveLosses ?? 0)
  const totalCycles = Number(agentState?.totalCycles ?? 0)
  const isPaper = agentState?.config?.isPaperTrading ?? false

  const statusConfig = STATUS_CONFIG[status ?? AgentStatus.IDLE] ?? STATUS_CONFIG[AgentStatus.IDLE]

  const handleToggle = useCallback(async () => {
    if (isRunning) await stopAgent(false)
    else await startAgent(currentStrategy)
  }, [isRunning, currentStrategy, startAgent, stopAgent])

  const handleStrategyChange = useCallback(async (s: StrategyType) => {
    if (isRunning) {
      await changeStrategy(s)
    }
    setShowStrategyPicker(false)
  }, [isRunning, changeStrategy])

  const pnlColor = dailyPnL >= 0 ? C.success : C.danger
  const winRate = performance?.winRate ?? 0
  const totalTrades = performance?.totalTrades ?? 0

  return (
    <div className="m-page">
      <MobilePageHeader title="وكيل التداول المستقل" subtitle="تداول ذاتي بالذكاء الاصطناعي" />

      {/* Status Card */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard highlight={isRunning}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: isRunning ? `linear-gradient(135deg, #FF9F43, #A259FF)` : 'rgba(139,146,168,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isRunning ? '0 4px 16px rgba(255,159,67,0.2)' : 'none',
              }}>
                <Cpu size={24} color={isRunning ? '#FFF' : C.text2} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>الوكيل المستقل</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: statusConfig.color, boxShadow: `0 0 6px ${statusConfig.color}60` }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusConfig.color, fontFamily: "'Cairo', sans-serif" }}>{statusConfig.label}</span>
                  {isPaper && isRunning && <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(0,212,255,0.1)', color: C.accent, border: '0.5px solid rgba(0,212,255,0.2)', fontFamily: "'Cairo', sans-serif" }}>ورقي</span>}
                </div>
              </div>
            </div>
            <button onClick={handleToggle} disabled={loading} style={{
              padding: '8px 18px', borderRadius: 10,
              background: isRunning ? 'rgba(255,71,87,0.12)' : `linear-gradient(135deg, #00FFC6, #0A84FF)`,
              border: isRunning ? '0.5px solid rgba(255,71,87,0.2)' : 'none',
              color: isRunning ? C.danger : '#000',
              fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : isRunning ? <Square size={12} /> : <Play size={12} />}
              {isRunning ? 'إيقاف' : 'تشغيل'}
            </button>
          </div>

          {/* Regime Info */}
          {regimeInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)', marginBottom: 8 }}>
              <BarChart3 size={14} color={C.accent} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نظام السوق:</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{REGIME_LABELS[regimeInfo.regime] || regimeInfo.regime}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>({regimeInfo.confidence.toFixed(0)}%)</span>
            </div>
          )}
        </IOSCard>
      </div>

      {/* Strategy Picker */}
      <div className="m-section">
        <div className="m-section__title">الاستراتيجية</div>
      </div>
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard onClick={() => setShowStrategyPicker(!showStrategyPicker)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color={C.accent} />
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{STRATEGY_LABELS[currentStrategy] || currentStrategy}</span>
            </div>
            <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>اضغط للتغيير</span>
          </div>
        </IOSCard>

        {showStrategyPicker && (
          <div style={{ marginTop: 8 }}>
            <IOSCard>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {STRATEGY_OPTIONS.map(s => (
                  <button key={s} onClick={() => handleStrategyChange(s)} style={{
                    padding: '8px 6px', borderRadius: 8,
                    background: currentStrategy === s ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.02)',
                    border: currentStrategy === s ? '0.5px solid rgba(0,212,255,0.3)' : `0.5px solid ${C.border}`,
                    color: currentStrategy === s ? C.accent : C.text2,
                    fontSize: 10, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                    cursor: 'pointer', textAlign: 'center',
                  }}>
                    {STRATEGY_LABELS[s]}
                  </button>
                ))}
              </div>
            </IOSCard>
          </div>
        )}
      </div>

      {/* Daily Stats */}
      <div style={{ padding: '0 16px', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <IOSCard>
          <div style={{ textAlign: 'center' }}>
            <DollarSign size={12} color={pnlColor} style={{ margin: '0 auto 2px' }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>{dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}</div>
            <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ربح اليوم</div>
          </div>
        </IOSCard>
        <IOSCard>
          <div style={{ textAlign: 'center' }}>
            <Activity size={12} color={C.accent} style={{ margin: '0 auto 2px' }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{dailyTrades}</div>
            <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>صفقات اليوم</div>
          </div>
        </IOSCard>
        <IOSCard>
          <div style={{ textAlign: 'center' }}>
            <Shield size={12} color={consecutiveLosses >= 3 ? C.danger : C.text} style={{ margin: '0 auto 2px' }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: consecutiveLosses >= 3 ? C.danger : C.text, fontFamily: "'JetBrains Mono', monospace" }}>{consecutiveLosses}</div>
            <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>خسائر متتالية</div>
          </div>
        </IOSCard>
      </div>

      {/* Open Positions */}
      {positions.length > 0 && (
        <>
          <div className="m-section">
            <div className="m-section__title">المراكز المفتوحة ({positions.length})</div>
          </div>
          <div style={{ padding: '0 16px', marginBottom: 12 }}>
            <IOSCard>
              <div style={{ maxHeight: 200, overflowY: 'auto' }} className="m-no-scroll">
                {positions.map((pos, i) => {
                  const pnl = pos.unrealizedPnl
                  const posColor = pnl >= 0 ? C.success : C.danger
                  return (
                    <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < positions.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{pos.symbol}</div>
                        <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{pos.side === 'BUY' ? 'شراء' : 'بيع'} · {STRATEGY_LABELS[pos.strategy] || pos.strategy}</div>
                      </div>
                      <div style={{ textAlign: 'left', direction: 'ltr' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: posColor, fontFamily: "'JetBrains Mono', monospace" }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</div>
                        <div style={{ fontSize: 9, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>Qty: {pos.quantity}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </IOSCard>
          </div>
        </>
      )}

      {/* Performance */}
      {totalTrades > 0 && (
        <div style={{ padding: '0 16px', marginBottom: 12 }}>
          <IOSCard>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>الأداء الإجمالي</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: winRate >= 50 ? C.success : C.amber, fontFamily: "'JetBrains Mono', monospace" }}>{winRate.toFixed(1)}%</div>
                <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الربح</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{totalTrades}</div>
                <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>إجمالي الصفقات</div>
              </div>
            </div>
          </IOSCard>
        </div>
      )}

      {/* Action Logs */}
      <div className="m-section">
        <div className="m-section__title">سجل العمليات</div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <IOSCard>
          <div style={{ maxHeight: 250, overflowY: 'auto' }} className="m-no-scroll">
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Activity size={24} color={C.text2} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد سجلات بعد</div>
              </div>
            ) : (
              logs.slice(0, 30).map((log, i) => {
                const typeColor = log.type === 'error' ? C.danger : log.type === 'success' ? C.success : log.type === 'warning' ? C.amber : log.type === 'trade' ? C.accent : C.text2
                return (
                  <div key={i} style={{ display: 'flex', gap: 6, padding: '5px 0', borderBottom: i < Math.min(logs.length, 30) - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.text2, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', flexShrink: 0, direction: 'ltr' }}>{log.time}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: typeColor, fontFamily: "'Cairo', sans-serif", lineHeight: 1.4 }}>{log.msg}</span>
                  </div>
                )
              })
            )}
          </div>
        </IOSCard>
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
