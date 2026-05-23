'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import { useEffect, useCallback } from 'react'
import { Cpu, DollarSign, Activity, Shield, ChevronLeft } from 'lucide-react'

export default function TradePage() {
  const router = useRouter()
  const t = useTranslations('mobile.trade')
  const tc = useTranslations('common')
  const { agentState, loading, fetchStatus, startAgent, stopAgent, startAutoRefresh, stopAutoRefresh } = useAgentStore()
  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const strategy = agentState?.config?.strategy ?? StrategyType.AUTO
  const dailyPnL = Number(agentState?.dailyPnL ?? 0)
  const dailyTrades = Number(agentState?.dailyTradesCount ?? 0)
  const consecutiveLosses = Number(agentState?.consecutiveLosses ?? 0)
  const isPaper = agentState?.config?.isPaperTrading ?? false

  useEffect(() => { fetchStatus(); startAutoRefresh(); return () => stopAutoRefresh() }, [fetchStatus, startAutoRefresh, stopAutoRefresh])

  const statusColor = isRunning ? '#00FFA3' : status === AgentStatus.EMERGENCY_STOP ? '#FF4757' : status === AgentStatus.DAILY_LIMIT_REACHED ? '#FFB800' : '#8B92A8'
  const statusLabel = isRunning ? t('statusRunning') : status === AgentStatus.EMERGENCY_STOP ? t('statusEmergencyStop') : status === AgentStatus.DAILY_LIMIT_REACHED ? t('statusLossLimit') : t('statusWaiting')

  const STRAT: Record<string, string> = {
    AUTO: t('strategyAuto'),
    SWING: t('strategySwing'),
    GRID: t('strategyGrid'),
    MEAN_REVERSION: t('strategyMeanRevert'),
    MOMENTUM_BREAKOUT: t('strategyBreakout'),
    DCA: t('strategyDCA'),
    VWAP_RSI: t('strategyVwapRsi'),
  }

  const handleToggle = useCallback(async () => { if (isRunning) await stopAgent(false); else await startAgent(strategy) }, [isRunning, strategy, startAgent, stopAgent])

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('agentTitle')}</span>
      </div>

      <div className="m-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: isRunning ? 'linear-gradient(135deg, #FF9F43, #A259FF)' : 'rgba(139,146,168,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Cpu size={20} color={isRunning ? '#FFF' : '#8B92A8'} /></div>
            <div><div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('agentTitle')}</div><div style={{ fontSize: 10, color: '#FF9F43', fontFamily: 'var(--cairo)', fontWeight: 700 }}>{t('agentDesc')}</div></div>
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderRadius: 12, background: `${statusColor}08`, border: `0.5px solid ${statusColor}18`, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, fontFamily: 'var(--cairo)' }}>{statusLabel}</span>
            {isPaper && isRunning && <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5, background: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '0.5px solid rgba(0,212,255,0.2)', fontFamily: 'var(--cairo)' }}>{tc('paper')}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{STRAT[strategy] || strategy}</span>
            <button onClick={handleToggle} disabled={loading} style={{ padding: '4px 12px', borderRadius: 8, background: isRunning ? 'rgba(255,71,87,0.1)' : 'linear-gradient(135deg, #00FFC6, #0A84FF)', border: isRunning ? '0.5px solid rgba(255,71,87,0.2)' : 'none', color: isRunning ? '#FF4757' : '#000', fontSize: 9, fontWeight: 800, fontFamily: 'var(--cairo)', cursor: 'pointer' }}>{isRunning ? tc('off') : tc('on')}</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}><DollarSign size={11} color={dailyPnL >= 0 ? '#00FFA3' : '#FF4757'} style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 13, fontWeight: 800, color: dailyPnL >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--mono)' }}>{dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{t('dailyProfit')}</div></div>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}><Activity size={11} color="#00D4FF" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--mono)' }}>{dailyTrades}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{t('trades')}</div></div>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}><Shield size={11} color={consecutiveLosses >= 3 ? '#FF4757' : '#B388FF'} style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 13, fontWeight: 800, color: consecutiveLosses >= 3 ? '#FF4757' : '#FFF', fontFamily: 'var(--mono)' }}>{consecutiveLosses}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{t('consecutiveLosses')}</div></div>
        </div>
      </div>
    </div>
  )
}
