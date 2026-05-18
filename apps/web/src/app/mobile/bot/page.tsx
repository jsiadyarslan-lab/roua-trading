'use client'

import { useEffect, useState, useCallback } from 'react'
import { useBotStore, type BotEngineState } from '@/hooks/useBotStore'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { Zap, Settings, Activity, DollarSign, Shield, ChevronLeft, Loader2, AlertCircle } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

const ENGINE_STATE_LABELS: Record<BotEngineState, { label: string; color: string }> = {
  idle: { label: 'خامل', color: C.text2 },
  armed: { label: 'جاهز', color: C.accent },
  scanning: { label: 'يبحث عن فرص', color: C.amber },
  entering: { label: 'يدخل صفقة', color: C.success },
  managing: { label: 'يدير المراكز', color: C.accent },
  exiting: { label: 'يخرج من صفقة', color: C.danger },
  cooldown: { label: 'فترة انتظار', color: C.text2 },
}

const STRATEGY_LABELS: Record<string, string> = {
  AUTO: 'تلقائي',
  SCALPING: 'سكالبينغ',
  SWING: 'سوينغ',
  GRID: 'شبكة',
  MEAN_REVERSION: 'عودة للمتوسط',
  MOMENTUM_BREAKOUT: 'اختراق الزخم',
  DCA: 'متوسط التكلفة',
  VWAP_RSI: 'VWAP + RSI',
}

export default function MobileBotPage() {
  const { isOn, engineState, stats, logs, settings, setIsOn, setEngineState, updateSettings, syncFromDB, settingsSynced } = useBotStore()
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!settingsSynced) syncFromDB()
  }, [settingsSynced, syncFromDB])

  const handleToggle = useCallback((on: boolean) => {
    setIsOn(on)
  }, [setIsOn])

  const stateInfo = ENGINE_STATE_LABELS[engineState] || ENGINE_STATE_LABELS.idle
  const dailyPnl = stats.profit
  const pnlColor = dailyPnl >= 0 ? C.success : C.danger

  return (
    <div className="m-page">
      <MobilePageHeader title="المنفذ الذكي" subtitle="تنفيذ ذكي للصفقات" right={
        <button onClick={() => setShowSettings(!showSettings)} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Settings size={16} color={C.text2} />
        </button>
      } />

      {/* Main Toggle Card */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard highlight={isOn}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: isOn ? `linear-gradient(135deg, ${C.success}, #059669)` : 'rgba(139,146,168,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isOn ? `0 4px 16px rgba(0,255,163,0.2)` : 'none',
              }}>
                <Zap size={24} color={isOn ? '#FFF' : C.text2} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>المنفذ الذكي</div>
                <div style={{ fontSize: 11, color: isOn ? C.success : C.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
                  {isOn ? stateInfo.label : 'متوقف'}
                </div>
              </div>
            </div>
            <IOSSwitch value={isOn} onChange={handleToggle} color={C.success} />
          </div>

          {/* Engine State Indicator */}
          {isOn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: `${stateInfo.color}08`, border: `0.5px solid ${stateInfo.color}18` }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: stateInfo.color, boxShadow: `0 0 8px ${stateInfo.color}60` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: stateInfo.color, fontFamily: "'Cairo', sans-serif" }}>{stateInfo.label}</span>
              <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>— {STRATEGY_LABELS[settings.strategy] || settings.strategy}</span>
            </div>
          )}
        </IOSCard>
      </div>

      {/* Daily Stats */}
      <div style={{ padding: '0 16px', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <IOSCard>
          <div style={{ textAlign: 'center' }}>
            <DollarSign size={12} color={pnlColor} style={{ margin: '0 auto 2px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>{dailyPnl >= 0 ? '+' : ''}{dailyPnl.toFixed(2)}</div>
            <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ربح اليوم</div>
          </div>
        </IOSCard>
        <IOSCard>
          <div style={{ textAlign: 'center' }}>
            <Activity size={12} color={C.accent} style={{ margin: '0 auto 2px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{stats.trades}</div>
            <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>صفقات</div>
          </div>
        </IOSCard>
        <IOSCard>
          <div style={{ textAlign: 'center' }}>
            <Shield size={12} color={stats.winRate >= 50 ? C.success : C.amber} style={{ margin: '0 auto 2px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{stats.winRate.toFixed(0)}%</div>
            <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الربح</div>
          </div>
        </IOSCard>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={{ padding: '0 16px', marginBottom: 12 }}>
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>إعدادات المنفذ</span>
            </div>

            {/* Mode Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif" }}>وضع التداول</div>
                <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ورقي أو حقيقي</div>
              </div>
              <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <button onClick={() => updateSettings({ useAIConsensus: true })} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(0,212,255,0.12)', border: 'none', color: C.accent, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>ورقي</button>
                <button style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: 'none', color: C.text2, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>حقيقي</button>
              </div>
            </div>

            {/* Risk % */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة المخاطرة</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={0.5} max={10} step={0.5} value={settings.riskPct} onChange={e => updateSettings({ riskPct: parseFloat(e.target.value) })} style={{ width: 100, accentColor: C.accent }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: C.accent, fontFamily: "'JetBrains Mono', monospace", minWidth: 30 }}>{settings.riskPct}%</span>
              </div>
            </div>

            {/* Confidence Limit */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>حد الثقة</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={30} max={95} step={5} value={settings.confLimit} onChange={e => updateSettings({ confLimit: parseInt(e.target.value) })} style={{ width: 100, accentColor: C.accent }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: C.accent, fontFamily: "'JetBrains Mono', monospace", minWidth: 30 }}>{settings.confLimit}%</span>
              </div>
            </div>

            {/* Protection Settings */}
            <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 10, marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>الحماية</div>
              {[
                { label: 'حد الخسارة اليومية', key: 'maxDailyLoss' as const, value: settings.maxDailyLoss, suffix: '$' },
                { label: 'أقصى تراجع', key: 'maxDrawdown' as const, value: settings.maxDrawdown, suffix: '%' },
                { label: 'حد المراكز المفتوحة', key: 'maxOpenPositions' as const, value: settings.maxOpenPositions, suffix: '' },
              ].map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{item.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.amber, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}{item.suffix}</span>
                </div>
              ))}
            </div>
          </IOSCard>
        </div>
      )}

      {/* Trade Logs */}
      <div className="m-section">
        <div className="m-section__title">سجل الأنشطة</div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <IOSCard>
          <div style={{ maxHeight: 300, overflowY: 'auto' }} className="m-no-scroll">
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <Activity size={24} color={C.text2} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>لا توجد سجلات بعد</div>
              </div>
            ) : (
              logs.map((log, i) => {
                const typeColor = log.type === 'error' ? C.danger : log.type === 'success' ? C.success : log.type === 'warning' ? C.amber : C.text2
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < logs.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', flexShrink: 0, direction: 'ltr' }}>{log.time}</span>
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
