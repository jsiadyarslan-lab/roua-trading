'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header, Card, Switch, SkelLine } from '@/components/mobile/FluxComponents'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAgentStore } from '@/hooks/useAgentStore'
import {
  Zap, TrendingUp, Brain, Bell, Volume2, Globe, Moon, Info, Shield, ChevronLeft,
  CheckCircle2,
} from 'lucide-react'

/* ═══ Mode Config ═══ */
const MODE_CFG: Record<TradingMode, { icon: typeof Zap; accent: string; label: string; desc: string }> = {
  trader: { icon: Zap, accent: '#00D4FF', label: 'تاجر', desc: 'تداول نشط وصفقات سريعة' },
  investor: { icon: TrendingUp, accent: '#32D74B', label: 'مستثمر', desc: 'استثمار طويل المدى' },
  ai: { icon: Brain, accent: '#A78BFA', label: 'ذكاء اصطناعي', desc: 'تداول ذاتي بالذكاء الاصطناعي' },
}

/* ═══ Settings Toggle Row ═══ */
function SettingRow({ icon, label, desc, value, onChange, color = '#00D4FF' }: {
  icon: React.ReactNode; label: string; desc: string; value: boolean; onChange: (v: boolean) => void; color?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: `${color}10`, border: `0.5px solid ${color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>{label}</div>
          <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{desc}</div>
        </div>
      </div>
      <Switch value={value} onChange={onChange} color={color} />
    </div>
  )
}

/* ═══ Main Page ═══ */
export default function SettingsPage() {
  const mode = useDashboardStore(s => s.mode)
  const setMode = useDashboardStore(s => s.setMode)
  const language = useDashboardStore(s => s.language)
  const toggleLanguage = useDashboardStore(s => s.toggleLanguage)

  const notifSettings = useNotificationStore(s => s.settings)
  const updateNotifSettings = useNotificationStore(s => s.updateSettings)

  const { agentState, fetchStatus, startAutoRefresh, stopAutoRefresh } = useAgentStore()

  // Local state for settings from API
  const [apiSettings, setApiSettings] = useState<Record<string, any>>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Fetch settings from API
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.settings) setApiSettings(data.settings)
        }
      } catch { /* silent */ } finally {
        setSettingsLoading(false)
      }
    }
    load()
  }, [])

  // Fetch agent status for display
  useEffect(() => {
    fetchStatus()
    startAutoRefresh()
    return () => stopAutoRefresh()
  }, [fetchStatus, startAutoRefresh, stopAutoRefresh])

  // Save settings to API
  const saveSetting = useCallback(async (key: string, value: any) => {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { [key]: value } }),
      })
      setApiSettings(prev => ({ ...prev, [key]: value }))
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }, [])

  // Trading mode change handler
  const handleModeChange = useCallback((newMode: TradingMode) => {
    setMode(newMode)
    saveSetting('tradingMode', newMode)
  }, [setMode, saveSetting])

  // Notification toggles
  const handleBrowserNotif = useCallback((v: boolean) => {
    updateNotifSettings({ browserNotifications: v })
    saveSetting('browserNotifications', v)
  }, [updateNotifSettings, saveSetting])

  const handleSoundNotif = useCallback((v: boolean) => {
    updateNotifSettings({ soundEnabled: v })
    saveSetting('soundEnabled', v)
  }, [updateNotifSettings, saveSetting])

  const handleLanguageToggle = useCallback(() => {
    toggleLanguage()
    saveSetting('language', language === 'ar' ? 'en' : 'ar')
  }, [toggleLanguage, language, saveSetting])

  const currentMode = MODE_CFG[mode]
  const ModeIcon = currentMode.icon

  return (
    <div className="f-page">
      <Header title="الإعدادات" subtitle="تخصيص التطبيق" />

      {/* ═══ Trading Mode ═══ */}
      <div className="f-section__title">وضع التداول</div>
      <Card>
        {/* Current mode display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `${currentMode.accent}15`, border: `1px solid ${currentMode.accent}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ModeIcon size={20} color={currentMode.accent} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: currentMode.accent, fontFamily: 'var(--f-cairo)' }}>{currentMode.label}</div>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{currentMode.desc}</div>
          </div>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(MODE_CFG) as TradingMode[]).map(m => {
            const cfg = MODE_CFG[m]
            const MIcon = cfg.icon
            const active = m === mode
            return (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                style={{
                  flex: 1, padding: '10px 6px', borderRadius: 10,
                  background: active ? `${cfg.accent}10` : 'rgba(255,255,255,0.02)',
                  border: active ? `1px solid ${cfg.accent}30` : '0.5px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}
              >
                <MIcon size={18} color={active ? cfg.accent : 'rgba(255,255,255,0.3)'} />
                <span style={{ fontSize: 10, fontWeight: 800, color: active ? cfg.accent : '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{cfg.label}</span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ═══ Notifications ═══ */}
      <div className="f-section__title">الإشعارات</div>
      <Card>
        <SettingRow
          icon={<Bell size={16} color="#00D4FF" />}
          label="إشعارات المتصفح"
          desc="عرض إشعارات على الشاشة"
          value={notifSettings.browserNotifications}
          onChange={handleBrowserNotif}
          color="#00D4FF"
        />
        <SettingRow
          icon={<Volume2 size={16} color="#FFB800" />}
          label="صوت الإشعارات"
          desc="تشغيل صوت عند وصول إشعار"
          value={notifSettings.soundEnabled}
          onChange={handleSoundNotif}
          color="#FFB800"
        />
        <SettingRow
          icon={<Bell size={16} color="#00FFA3" />}
          label="إشعارات الصفقات"
          desc="تنبيه عند تنفيذ صفقة"
          value={notifSettings.tradeAlerts}
          onChange={(v) => { updateNotifSettings({ tradeAlerts: v }); saveSetting('tradeAlerts', v) }}
          color="#00FFA3"
        />
        <SettingRow
          icon={<Brain size={16} color="#B388FF" />}
          label="تنبيهات الذكاء الاصطناعي"
          desc="إشعارات تحليلات AI"
          value={notifSettings.aiAlerts}
          onChange={(v) => { updateNotifSettings({ aiAlerts: v }); saveSetting('aiAlerts', v) }}
          color="#B388FF"
        />
      </Card>

      {/* ═══ Appearance ═══ */}
      <div className="f-section__title">المظهر واللغة</div>
      <Card>
        <SettingRow
          icon={<Moon size={16} color="#8B92A8" />}
          label="الوضع الداكن"
          desc="مظهر داكن (الخيار الوحيد حالياً)"
          value={true}
          onChange={() => {/* dark only for now */ }}
          color="#8B92A8"
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Globe size={16} color="#00D4FF" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>اللغة</div>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{language === 'ar' ? 'العربية' : 'English'}</div>
            </div>
          </div>
          <button
            onClick={handleLanguageToggle}
            style={{
              padding: '6px 14px', borderRadius: 8,
              background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.15)',
              color: '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer',
            }}
          >
            {language === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
      </Card>

      {/* ═══ Agent Status ═══ */}
      <div className="f-section__title">حالة الوكيل</div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={16} color={agentState?.status === 'RUNNING' ? '#00FFA3' : '#8B92A8'} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>
              {agentState?.status === 'RUNNING' ? 'يعمل' : agentState?.status === 'EMERGENCY_STOP' ? 'إيقاف طارئ' : 'متوقف'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: agentState?.status === 'RUNNING' ? '#00FFA3' : '#8B92A8', boxShadow: agentState?.status === 'RUNNING' ? '0 0 6px rgba(0,255,163,0.6)' : 'none' }} />
            <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-mono)' }}>
              {agentState?.dailyPnL !== undefined ? `PnL: ${agentState.dailyPnL >= 0 ? '+' : ''}$${agentState.dailyPnL.toFixed(2)}` : '—'}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>
          {agentState?.config?.strategy ? `الاستراتيجية: ${agentState.config.strategy}` : 'لا يوجد وكيل مُفعّل'}
        </div>
      </Card>

      {/* ═══ About ═══ */}
      <div className="f-section__title">حول التطبيق</div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(179,136,255,0.15))',
            border: '0.5px solid rgba(0,212,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Info size={20} color="#00D4FF" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>رؤى</div>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>منصة ربط الحسابات الذكية</div>
          </div>
        </div>
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>الإصدار</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#FFF', fontFamily: 'var(--f-mono)' }}>2.0.0</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>الوضع</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: currentMode.accent, fontFamily: 'var(--f-cairo)' }}>{currentMode.label}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>اللغة</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>{language === 'ar' ? 'العربية' : 'English'}</span>
          </div>
        </div>
      </Card>

      {/* Saving indicator */}
      {saving && (
        <div style={{
          position: 'fixed', bottom: 'calc(var(--nav-total) + 12px)', left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 10,
          background: 'rgba(0,212,255,0.15)', border: '0.5px solid rgba(0,212,255,0.25)',
          backdropFilter: 'blur(10px)', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <CheckCircle2 size={12} color="#00D4FF" />
          <span style={{ fontSize: 10, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--f-cairo)' }}>تم الحفظ</span>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
