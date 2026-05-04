'use client'

import { useState } from 'react'
import { Bot, Brain, ScanSearch, Sparkles, Waves, Cpu, Swords, Landmark } from 'lucide-react'
import { BotMini } from '@/components/dashboard/BotMini'
import { AgentControlMini } from '@/components/dashboard/AgentControlMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { BotCommandCenter } from '@/components/dashboard/BotCommandCenter'
import { AICouncilPanel } from '@/components/dashboard/AICouncilPanel'
import { StrategicCouncilPanel } from '@/components/dashboard/StrategicCouncilPanel'
import { SmartExecutorPanel } from '@/components/dashboard/SmartExecutorPanel'
import { MultiTfScannerMini } from '@/components/dashboard/MultiTfScannerMini'
import { useDecisionFlow } from '@/hooks/useDecisionFlow'
import { useTabAlertStore, type TabId } from '@/hooks/useTabAlertStore'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'

const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  bg3: '#16181A',
  card: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(0,212,255,0.12)',
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

export function RightPanelLayout({ quotes: _quotes }: { quotes: any }) {
  const [active, setActive] = useState('executor')
  const { selectedSymbol, scanner, council, engineState } = useDecisionFlow()
  const { alerts, clearAlert } = useTabAlertStore()

  // Clear alerts when user opens a tab
  const handleTabClick = (tabId: string) => {
    setActive(tabId)
    clearAlert(tabId as TabId)
  }

  const agentState = useAgentStore(state => state.agentState)
  const agentStatus = agentState?.status ?? null
  const isAgentRunning = agentStatus === AgentStatus.RUNNING

  const TABS = [
    { id: 'executor', label: 'المنفذ', accent: T.cyan, icon: Swords, subtitle: 'المنفذ الذكي' },
    { id: 'strategic', label: 'المجلس', accent: T.purple, icon: Landmark, subtitle: 'المجلس الاستراتيجي' },
    { id: 'trader', label: 'الوكيل', accent: isAgentRunning ? T.success : T.amber, icon: Cpu, subtitle: 'وكيل التداول الذاتي' },
    { id: 'council', label: 'AI', accent: T.accent, icon: Brain, subtitle: 'إجماع الذكاء الاصطناعي' },
    { id: 'scanner', label: 'السكانر', accent: T.amber, icon: ScanSearch, subtitle: 'اكتشاف الفرص' },
    { id: 'signals', label: 'إشارات', accent: T.green, icon: Sparkles, subtitle: 'التحويل للتنفيذ' },
  ]
  const activeTab = TABS.find((tab) => tab.id === active) || TABS[0]
  const headlineMap = {
    executor: 'المنفذ الذكي يراقب Briefs',
    strategic: 'المجلس الاستراتيجي يوزن الأدلة',
    trader: isAgentRunning ? 'الوكيل ينفذ الصفقات' : 'الوكيل في الانتظار',
    council: council?.recommendation ? `إجماع AI يميل إلى ${council.recommendation}` : 'إجماع الذكاء الاصطناعي',
    scanner: scanner ? `${scanner.pair} تحت المجهر` : 'السكانر يفتش عن فرصة',
    signals: 'الإشارات الجاهزة للتنفيذ',
  } as const

  const headline = headlineMap[active as keyof typeof headlineMap] ?? 'مركز القرار التشغيلي'

  return (
    <div
      className="dash-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        maxHeight: '100%',
        background: 'rgba(26, 29, 41, 0.65)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        position: 'relative',
      }}
    >
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at top right, ${activeTab.accent}06, transparent 40%)`,
      }} />

      <div
        style={{
          padding: '6px 10px 5px',
          borderBottom: `1px solid rgba(0, 212, 255, 0.10)`,
          background: `linear-gradient(90deg, ${activeTab.accent}15, rgba(255,255,255,0.01))`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
          zIndex: 1,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: activeTab.accent,
                  boxShadow: `0 0 10px ${activeTab.accent}66`,
                }}
              />
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                مركز القرار التشغيلي
              </div>
            </div>
            <div style={{ marginTop: 2, fontSize: 7.5, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
              {headline}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
            <div
              style={{
                fontSize: 8,
                color: activeTab.accent,
                background: `${activeTab.accent}12`,
                border: `1px solid ${activeTab.accent}25`,
                borderRadius: 999,
                padding: '2px 6px',
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: 'nowrap',
              }}
            >
              {activeTab.label}
            </div>
            <div style={{ fontSize: 7, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
              {selectedSymbol}
            </div>
          </div>
        </div>

      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '3px 5px',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.02)',
          borderBottom: `1px solid rgba(0, 212, 255, 0.08)`,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {TABS.map(t => {
          const isActive = active === t.id
          const Icon = t.icon
          const alert = alerts[t.id as TabId] ?? null
          const hasAlert = alert !== null && alert.count > 0
          const alertCount = alert?.count || 0
          const alertColor = alert?.color || t.accent

          return (
            <button
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              className="decision-center-tab"
              title={t.label}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 22,
                padding: '2px 2px',
                background: isActive ? `${t.accent}18` : hasAlert ? `${alertColor}06` : 'rgba(255,255,255,0.035)',
                border: `1px solid ${isActive ? `${t.accent}55` : hasAlert ? `${alertColor}35` : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 5,
                color: isActive ? T.text : T.text3,
                cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif",
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                boxShadow: isActive
                  ? `0 0 0 1px ${t.accent}20 inset, 0 0 8px ${t.accent}08`
                  : hasAlert
                    ? `0 0 0 1px ${alertColor}10 inset`
                    : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Alert badge */}
              {hasAlert && !isActive && (
                <div style={{
                  position: 'absolute',
                  top: 1,
                  left: 1,
                  minWidth: 8,
                  height: 8,
                  borderRadius: 999,
                  background: alertColor,
                  color: '#000',
                  fontSize: 5,
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 6px ${alertColor}80`,
                  animation: 'tab-alert-pulse 2s ease-in-out infinite',
                  zIndex: 2,
                }}>
                  {alertCount > 9 ? '9+' : alertCount}
                </div>
              )}

              <Icon size={8} color={isActive ? t.accent : hasAlert ? alertColor : '#93A7C3'} />
              <span style={{ fontSize: 6, fontWeight: isActive ? 800 : 600, lineHeight: 1, color: isActive ? T.text : hasAlert ? alertColor : '#AEC0D6', whiteSpace: 'nowrap' }}>{t.label}</span>
            </button>
          )
        })}
      </div>

      <style>{`
        @keyframes tab-alert-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        .decision-center-tab:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 4px 16px rgba(0,212,255,0.15), 0 0 0 1px rgba(0,212,255,0.12) inset !important;
          border-color: rgba(0,212,255,0.35) !important;
          background-image: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,212,255,0.04)) !important;
        }
        .decision-center-tab:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
      `}</style>

      {/* Agent Control Widget — only visible in the Agent tab */}
      {active === 'trader' && (
        <div style={{ flexShrink: 0, padding: '4px 4px 0', position: 'relative', zIndex: 1 }}>
          <AgentControlMini />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
          background: '#0B0E14',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            height: '100%',
            overflowY: 'auto',
            borderRadius: 10,
            border: `1px solid rgba(0,212,255,0.10)`,
            background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,13,20,0.98))',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 40px rgba(0,0,0,0.26)`,
          }}
          className="custom-scrollbar"
        >
        {active === 'executor' && <SmartExecutorPanel />}
        {active === 'strategic' && <StrategicCouncilPanel />}
        {active === 'trader' && <AgentMini />}
        {active === 'council' && <AICouncilPanel />}
        {active === 'scanner' && <ScannerMini />}
        {active === 'signals' && <BotCommandCenter />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Agent Mini — Compact autonomous trader widget
   ═══════════════════════════════════════════════ */
function AgentMini() {
  const { agentState, performance, positions, loading, fetchStatus, fetchCredentials, startAgent, stopAgent, changeStrategy, fetchPerformance, fetchPositions, selectedCredentialId, availableCredentials } = useAgentStore()
  const [strategy, setStrategy] = useState<StrategyType>(StrategyType.AUTO)

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const config = agentState?.config
  const hasCredential = !!selectedCredentialId && selectedCredentialId.trim() !== ''

  // Fetch agent data + credentials on mount
  useState(() => {
    fetchStatus()
    fetchPerformance()
    fetchPositions()
    fetchCredentials()
  })

  const strategyLabels: Record<string, string> = { AUTO: 'تلقائي', SCALPING: 'سكالبينغ', SWING: 'سوينغ', GRID: 'شبكة', MEAN_REVERSION: 'عودة للمتوسط', MOMENTUM_BREAKOUT: 'اختراق الزخم', DCA: 'متوسط التكلفة', VWAP_RSI: 'VWAP+RSI' }
  const statusLabels: Record<string, string> = {
    IDLE: 'في الانتظار', RUNNING: 'يعمل', PAUSED: 'متوقف مؤقتاً',
    STOPPED: 'متوقف', EMERGENCY_STOP: 'إيقاف طارئ', DAILY_LIMIT_REACHED: 'حد الخسارة اليومية',
  }
  const statusColor = isRunning ? T.success : status === AgentStatus.PAUSED ? T.amber : status === AgentStatus.EMERGENCY_STOP ? T.danger : T.text3

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
            background: statusColor,
            boxShadow: isRunning ? `0 0 10px ${T.success}` : 'none',
          }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: T.text }}>وكيل التداول الذاتي</span>
          <span style={{
            fontSize: 6.5, padding: '1px 5px', borderRadius: 4,
            background: isRunning ? 'rgba(0,255,163,0.15)' : 'rgba(255,255,255,0.06)',
            color: statusColor, fontWeight: 700, fontFamily: 'monospace',
          }}>
            {statusLabels[status || 'IDLE'] || 'غير مُفعّل'}
          </span>
        </div>
        <button
          onClick={() => isRunning ? stopAgent(false) : startAgent(strategy as any)}
          disabled={loading}
          style={{
            fontSize: 8, minHeight: 26, minWidth: 54, padding: '4px 8px',
            borderRadius: 7, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: isRunning ? 'rgba(255,71,87,0.2)' : 'rgba(0,212,255,0.2)',
            color: isRunning ? T.danger : T.cyan, fontWeight: 800,
          }}
        >
          {loading ? '...' : isRunning ? 'إيقاف' : 'تشغيل'}
        </button>
      </div>

      {/* Strategy Picker */}
      {!isRunning && (
        <div style={{ display: 'flex', gap: 3, padding: '4px 6px', background: '#0B0E14', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
          {([StrategyType.AUTO, StrategyType.SCALPING, StrategyType.SWING, StrategyType.GRID, StrategyType.MEAN_REVERSION, StrategyType.MOMENTUM_BREAKOUT, StrategyType.DCA, StrategyType.VWAP_RSI]).map(s => (
            <button key={s} onClick={() => setStrategy(s)} style={{
              flex: '1 1 calc(33% - 3px)', minHeight: 20, padding: '3px 5px', fontSize: 7,
              background: strategy === s ? 'rgba(0,212,255,0.14)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${strategy === s ? 'rgba(0,212,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6, color: strategy === s ? T.cyan : T.text3, cursor: 'pointer',
            }}>
              {strategyLabels[s]}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: 6,
        borderBottom: '1px solid rgba(0,212,255,0.08)',
      }}>
        <div style={{ padding: 5, textAlign: 'center', minHeight: 30, background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
          <div style={{ fontSize: 7, color: T.text3 }}>ر/خ اليوم</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: Number(agentState?.dailyPnL ?? 0) >= 0 ? T.success : T.danger }}>
            ${Number(agentState?.dailyPnL ?? 0).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: 5, textAlign: 'center', minHeight: 30, background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
          <div style={{ fontSize: 7, color: T.text3 }}>نسبة الفوز</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: (performance?.winRate ?? 0) >= 50 ? T.success : T.amber }}>
            {(performance?.winRate ?? 0).toFixed(1)}%
          </div>
        </div>
        <div style={{ padding: 5, textAlign: 'center', minHeight: 30, background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
          <div style={{ fontSize: 7, color: T.text3 }}>مراكز مفتوحة</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.cyan }}>{positions.length}</div>
        </div>
      </div>

      {/* Active Strategy Info */}
      {config && (
        <div style={{ padding: '4px 8px', borderBottom: '1px solid rgba(0,212,255,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 7, color: T.text3 }}>الاستراتيجية:</span>
          <span style={{ fontSize: 8, fontWeight: 800, color: T.cyan }}>{strategyLabels[config.strategy] || config.strategy}</span>
          <span style={{ fontSize: 7, color: T.text3 }}>• خطر/صفقة: {config.riskPerTradePercent}%</span>
          <span style={{ fontSize: 7, color: T.text3 }}>• {config.symbols?.length || 0} رمز</span>
        </div>
      )}

      {/* Positions List */}
      <div style={{
        flex: 1, minHeight: 0, maxHeight: '40vh', overflowY: 'auto',
        padding: 4, background: 'rgba(11,14,20,0.45)',
      }} className="custom-scrollbar">
        {positions.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', opacity: 0.3, fontSize: 9, fontFamily: "'Cairo', sans-serif" }}>
            {isRunning ? 'لا توجد مراكز مفتوحة حالياً' : 'فعل الوكيل لبدء التداول'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {positions.slice(0, 10).map((pos, i) => (
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
                <span style={{ color: Number(pos.unrealizedPnl) >= 0 ? T.success : T.danger, fontWeight: 800, fontFamily: 'monospace' }}>
                  ${Number(pos.unrealizedPnl).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
