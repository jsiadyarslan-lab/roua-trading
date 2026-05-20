'use client'

import { useEffect, useState } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { useBotStore } from '@/hooks/useBotStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import {
  Cpu, Play, Square, Settings2, Activity, DollarSign,
  TrendingUp, Shield, BarChart3, Loader2, ChevronDown, Zap
} from 'lucide-react'

const ENGINE_LABELS: Record<string, { label: string; color: string }> = {
  idle: { label: 'خامل', color: '#8B92A8' },
  armed: { label: 'مستعد', color: '#00D4FF' },
  scanning: { label: 'يفحص', color: '#FFB800' },
  entering: { label: 'يدخل', color: '#00FFA3' },
  managing: { label: 'يدير', color: '#B388FF' },
  exiting: { label: 'يخرج', color: '#FF9F43' },
  cooldown: { label: 'استراحة', color: '#8B92A8' },
}

export default function MobileBotPage() {
  const {
    isOn, engineState, logs, stats, settings,
    setIsOn, updateSettings, syncFromDB, resetAll,
  } = useBotStore()

  const { selectedSymbol } = useSymbolStore()
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => { syncFromDB() }, [syncFromDB])

  const engineInfo = ENGINE_LABELS[engineState] || ENGINE_LABELS.idle

  return (
    <div className="r-page">
      <PageHeader title="المنفذ الذكي" subtitle="محرك تداول ورقي ذكي" />

      {/* Status Card */}
      <Card highlight={isOn}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: isOn ? 'linear-gradient(135deg, #059669, #00D4FF)' : 'rgba(139,146,168,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '0.5px solid rgba(255,255,255,0.08)',
          }}>
            <Cpu size={24} color={isOn ? '#FFF' : '#8B92A8'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>المنفذ الذكي</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: engineInfo.color, boxShadow: `0 0 8px ${engineInfo.color}60` }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: engineInfo.color, fontFamily: 'var(--font-cairo)' }}>{engineInfo.label}</span>
              <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-mono)' }}>• {selectedSymbol}</span>
            </div>
          </div>
          <button
            onClick={() => setIsOn(!isOn)}
            style={{
              padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: isOn ? 'rgba(255,71,87,0.12)' : 'linear-gradient(135deg, #059669, #00D4FF)',
              color: isOn ? '#FF4757' : '#FFF',
              fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-cairo)',
              display: 'flex', alignItems: 'center', gap: 6, touchAction: 'manipulation',
            }}
          >
            {isOn ? <Square size={12} /> : <Play size={12} />}
            {isOn ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <DollarSign size={11} color={stats.profit >= 0 ? '#00FFA3' : '#FF4757'} style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: stats.profit >= 0 ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
              {stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(2)}
            </div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>الربح</div>
          </div>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <BarChart3 size={11} color="#00D4FF" style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{stats.winRate.toFixed(0)}%</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>نسبة الفوز</div>
          </div>
          <div style={{ padding: '8px 6px', borderRadius: 12, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <Activity size={11} color="#B388FF" style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{stats.trades}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginTop: 1 }}>صفقات</div>
          </div>
        </div>
      </Card>

      {/* Settings */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showSettings ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} color="#FF9F43" />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الإعدادات</span>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(255,159,67,0.08)', border: '0.5px solid rgba(255,159,67,0.2)', cursor: 'pointer', touchAction: 'manipulation' }}
          >
            <ChevronDown size={12} color="#FF9F43" style={{ transform: showSettings ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
        </div>

        {showSettings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Risk % */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>مخاطر/صفقة</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {[1, 2, 5].map(v => (
                  <button key={v} onClick={() => updateSettings({ riskPct: v })} style={{
                    padding: '4px 10px', borderRadius: 6, border: `1px solid ${settings.riskPct === v ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    background: settings.riskPct === v ? 'rgba(0,212,255,0.1)' : 'transparent', cursor: 'pointer', touchAction: 'manipulation',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: settings.riskPct === v ? 800 : 600, color: settings.riskPct === v ? '#00D4FF' : '#8B92A8', fontFamily: 'var(--font-mono)' }}>{v}%</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence Limit */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>حد الثقة</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {[50, 65, 80].map(v => (
                  <button key={v} onClick={() => updateSettings({ confLimit: v })} style={{
                    padding: '4px 10px', borderRadius: 6, border: `1px solid ${settings.confLimit === v ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    background: settings.confLimit === v ? 'rgba(0,212,255,0.1)' : 'transparent', cursor: 'pointer', touchAction: 'manipulation',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: settings.confLimit === v ? 800 : 600, color: settings.confLimit === v ? '#00D4FF' : '#8B92A8', fontFamily: 'var(--font-mono)' }}>{v}%</span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Consensus Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={12} color="#B388FF" />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>استخدام توصيات AI</span>
              </div>
              <button
                onClick={() => updateSettings({ useAIConsensus: !settings.useAIConsensus })}
                style={{
                  width: 42, height: 24, borderRadius: 12, position: 'relative', border: 'none',
                  background: settings.useAIConsensus ? '#00D4FF' : 'rgba(255,255,255,0.1)', cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                <div style={{ position: 'absolute', top: 2, insetInlineStart: settings.useAIConsensus ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#FFF', transition: 'inset-inline-start 0.2s' }} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Protection Settings */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Shield size={16} color="#d4af37" />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>الحماية</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>حد الخسارة اليومية</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#FF4757', fontFamily: 'var(--font-mono)' }}>${Math.abs(settings.maxDailyLoss)}</div>
          </div>
          <div style={{ padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>أقصى تراجع</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#FFB800', fontFamily: 'var(--font-mono)' }}>{settings.maxDrawdown}%</div>
          </div>
          <div style={{ padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>وقف خسارة افتراضي</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--font-mono)' }}>{settings.stopLossDefault}%</div>
          </div>
          <div style={{ padding: '8px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>جني أرباح افتراضي</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#00FFA3', fontFamily: 'var(--font-mono)' }}>{settings.takeProfitDefault}%</div>
          </div>
        </div>
      </Card>

      {/* Recent Logs */}
      {logs.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color="#00D4FF" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>السجل</span>
            </div>
            <button onClick={resetAll} style={{ fontSize: 9, fontWeight: 700, color: '#8B92A8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-cairo)' }}>مسح</button>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }} className="r-no-scroll">
            {logs.slice(0, 15).map((log, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0', borderBottom: '0.5px solid rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1 }}>{log.time}</span>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-cairo)', lineHeight: 1.3,
                  color: log.type === 'error' ? '#FF4757' : log.type === 'success' ? '#00FFA3' : log.type === 'warn' ? '#FFB800' : '#8B92A8',
                }}>{log.msg}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
