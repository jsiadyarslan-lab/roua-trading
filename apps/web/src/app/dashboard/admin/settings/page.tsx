'use client'

import { useState } from 'react'
import {
  Settings,
  Key,
  Bot,
  Shield,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Globe,
  Bell,
} from 'lucide-react'

const COLORS = {
  bg: '#0B0E14',
  card: '#111318',
  accent: '#00E5FF',
  success: '#00E676',
  danger: '#FF5252',
  amber: '#FFB800',
  text: '#F0F2F5',
  muted: '#8B92A8',
  border: 'rgba(0,229,255,0.08)',
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  position: 'relative',
  overflow: 'hidden',
}

interface ApiKeyEntry {
  id: string
  exchange: string
  keyPreview: string
  isActive: boolean
  lastValidated: string
  visible: boolean
}

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false)

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([
    { id: '1', exchange: 'Alpaca', keyPreview: 'PK••••••••3F2A', isActive: true, lastValidated: 'منذ ساعة', visible: false },
    { id: '2', exchange: 'Binance', keyPreview: 'BN••••••••8D4C', isActive: true, lastValidated: 'منذ 3 ساعات', visible: false },
    { id: '3', exchange: 'Twelve Data', keyPreview: 'TD••••••••1A7B', isActive: false, lastValidated: 'لم يتم التحقق', visible: false },
  ])

  // Bot Config
  const [botConfig, setBotConfig] = useState({
    autoTrading: true,
    maxPositionSize: '10000',
    maxDailyLoss: '2000',
    strategy: 'Scalp AI',
    refreshInterval: '30',
    cooldownPeriod: '60',
  })

  // Risk Management
  const [riskConfig, setRiskConfig] = useState({
    maxDrawdown: '15',
    stopLossDefault: '2',
    takeProfitDefault: '4',
    riskPerTrade: '1',
    maxOpenPositions: '5',
    leverageLimit: '3',
  })

  // Platform Settings
  const [platformConfig, setPlatformConfig] = useState({
    maintenanceMode: false,
    registrationOpen: true,
    demoMode: false,
    notificationsEnabled: true,
    autoLogout: '30',
    sessionTimeout: '24',
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const toggleKeyVisibility = (id: string) => {
    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, visible: !k.visible } : k))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>إعدادات النظام</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>إدارة المفاتيح والتكوين والمخاطر</p>
        </div>
        <button
          onClick={handleSave}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 8,
            border: `1px solid ${COLORS.success}25`,
            background: saved ? `${COLORS.success}15` : `${COLORS.success}08`,
            color: COLORS.success, fontSize: 12, fontWeight: 600,
            fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? 'تم الحفظ' : 'حفظ التغييرات'}
        </button>
      </div>

      {/* API Keys */}
      <div style={{ ...CARD_STYLE, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Key size={14} color={COLORS.accent} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>مفاتيح API</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apiKeys.map(key => (
            <div key={key.id} style={{
              padding: '12px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: key.isActive ? `${COLORS.success}10` : `${COLORS.muted}10`,
                  border: `1px solid ${key.isActive ? COLORS.success + '25' : COLORS.muted + '25'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Key size={14} color={key.isActive ? COLORS.success : COLORS.muted} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>{key.exchange}</div>
                  <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: COLORS.muted }} dir="ltr">
                    {key.visible ? key.keyPreview.replace(/•/g, 'X') : key.keyPreview}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{key.lastValidated}</span>
                <button
                  onClick={() => toggleKeyVisibility(key.id)}
                  style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', padding: 4 }}
                  aria-label={key.visible ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
                >
                  {key.visible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: key.isActive ? COLORS.success : COLORS.muted,
                  boxShadow: key.isActive ? `0 0 4px ${COLORS.success}` : 'none',
                }} />
              </div>
            </div>
          ))}
          <button style={{
            padding: '10px', borderRadius: 8,
            border: `1px dashed ${COLORS.border}`,
            background: 'transparent',
            color: COLORS.muted, fontSize: 11, fontFamily: "'Cairo', sans-serif",
            cursor: 'pointer', transition: 'all 0.2s',
          }}>
            + إضافة مفتاح API جديد
          </button>
        </div>
      </div>

      {/* Bot Configuration */}
      <div style={{ ...CARD_STYLE, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Bot size={14} color={COLORS.amber} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>تكوين البوت</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'autoTrading', label: 'التداول التلقائي', type: 'toggle' as const },
            { key: 'strategy', label: 'الاستراتيجية', type: 'select' as const, options: ['Scalp AI', 'Swing Master', 'DCA Pro', 'Grid Bot'] },
            { key: 'maxPositionSize', label: 'الحد الأقصى لحجم المركز ($)', type: 'number' as const },
            { key: 'maxDailyLoss', label: 'الحد الأقصى للخسارة اليومية ($)', type: 'number' as const },
            { key: 'refreshInterval', label: 'فاصل التحديث (ثانية)', type: 'number' as const },
            { key: 'cooldownPeriod', label: 'فترة التبريد (ثانية)', type: 'number' as const },
          ].map(field => (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{field.label}</label>
              {field.type === 'toggle' ? (
                <button
                  onClick={() => setBotConfig(prev => ({ ...prev, [field.key]: !prev[field.key as keyof typeof prev] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${botConfig[field.key as keyof typeof botConfig] ? COLORS.success + '25' : COLORS.border}`,
                    background: botConfig[field.key as keyof typeof botConfig] ? `${COLORS.success}08` : 'rgba(255,255,255,0.03)',
                    color: botConfig[field.key as keyof typeof botConfig] ? COLORS.success : COLORS.muted,
                    fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                  }}
                >
                  {botConfig[field.key as keyof typeof botConfig] ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {botConfig[field.key as keyof typeof botConfig] ? 'مفعّل' : 'معطّل'}
                </button>
              ) : field.type === 'select' ? (
                <select
                  value={botConfig[field.key as keyof typeof botConfig] as string}
                  onChange={e => setBotConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 11,
                    fontFamily: "'Cairo', sans-serif",
                    outline: 'none',
                  }}
                >
                  {field.options?.map(opt => (
                    <option key={opt} value={opt} style={{ background: '#1A1D29', color: COLORS.text }}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={botConfig[field.key as keyof typeof botConfig] as string}
                  onChange={e => setBotConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                  dir="ltr"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Risk Management */}
      <div style={{ ...CARD_STYLE, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Shield size={14} color={COLORS.danger} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>إدارة المخاطر</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'maxDrawdown', label: 'الحد الأقصى للسحب (%)' },
            { key: 'stopLossDefault', label: 'وقف الخسارة الافتراضي (%)' },
            { key: 'takeProfitDefault', label: 'جني الأرباح الافتراضي (%)' },
            { key: 'riskPerTrade', label: 'المخاطرة لكل صفقة (%)' },
            { key: 'maxOpenPositions', label: 'الحد الأقصى للمراكز المفتوحة' },
            { key: 'leverageLimit', label: 'حد الرافعة المالية (x)' },
          ].map(field => (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{field.label}</label>
              <input
                type="number"
                value={riskConfig[field.key as keyof typeof riskConfig]}
                onChange={e => setRiskConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text, fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none',
                }}
                dir="ltr"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Platform Settings */}
      <div style={{ ...CARD_STYLE, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Globe size={14} color={COLORS.accent} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>إعدادات المنصة</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'maintenanceMode', label: 'وضع الصيانة', type: 'toggle' as const, icon: AlertTriangle, color: COLORS.amber },
            { key: 'registrationOpen', label: 'التسجيل مفتوح', type: 'toggle' as const, icon: Globe, color: COLORS.accent },
            { key: 'demoMode', label: 'الوضع التجريبي', type: 'toggle' as const, icon: Bot, color: COLORS.muted },
            { key: 'notificationsEnabled', label: 'الإشعارات', type: 'toggle' as const, icon: Bell, color: COLORS.success },
            { key: 'autoLogout', label: 'تسجيل خروج تلقائي (دقيقة)', type: 'number' as const },
            { key: 'sessionTimeout', label: 'مدة الجلسة (ساعة)', type: 'number' as const },
          ].map(field => (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{field.label}</label>
              {field.type === 'toggle' ? (
                <button
                  onClick={() => setPlatformConfig(prev => ({ ...prev, [field.key]: !prev[field.key as keyof typeof prev] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${platformConfig[field.key as keyof typeof platformConfig] ? (field.color || COLORS.success) + '25' : COLORS.border}`,
                    background: platformConfig[field.key as keyof typeof platformConfig] ? `${field.color || COLORS.success}08` : 'rgba(255,255,255,0.03)',
                    color: platformConfig[field.key as keyof typeof platformConfig] ? (field.color || COLORS.success) : COLORS.muted,
                    fontSize: 11, fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                  }}
                >
                  {platformConfig[field.key as keyof typeof platformConfig] ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {platformConfig[field.key as keyof typeof platformConfig] ? 'مفعّل' : 'معطّل'}
                </button>
              ) : (
                <input
                  type="number"
                  value={platformConfig[field.key as keyof typeof platformConfig] as string}
                  onChange={e => setPlatformConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                  dir="ltr"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .admin-settings-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
