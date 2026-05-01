'use client'

import { useState, useEffect, useCallback } from 'react'
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
  X as XIcon,
  Plus,
  Loader2,
} from 'lucide-react'
import { COLORS, CARD_STYLE } from '@/lib/admin-ui'

interface ApiKeyEntry {
  id: string
  exchange: string
  keyPreview: string
  isActive: boolean
  lastValidated: string | null
  visible: boolean
}

interface BotConfig {
  autoTrading: boolean
  maxPositionSize: string
  maxDailyLoss: string
  strategy: string
  refreshInterval: string
  cooldownPeriod: string
}

interface RiskConfig {
  maxDrawdown: string
  stopLossDefault: string
  takeProfitDefault: string
  riskPerTrade: string
  maxOpenPositions: string
  leverageLimit: string
}

interface PlatformConfig {
  maintenanceMode: boolean
  registrationOpen: boolean
  demoMode: boolean
  notificationsEnabled: boolean
  autoLogout: string
  sessionTimeout: string
}

const DEFAULT_BOT_CONFIG: BotConfig = {
  autoTrading: false,
  maxPositionSize: '10000',
  maxDailyLoss: '2000',
  strategy: 'Scalp AI',
  refreshInterval: '30',
  cooldownPeriod: '60',
}

const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxDrawdown: '15',
  stopLossDefault: '2',
  takeProfitDefault: '4',
  riskPerTrade: '1',
  maxOpenPositions: '5',
  leverageLimit: '3',
}

const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  maintenanceMode: false,
  registrationOpen: true,
  demoMode: false,
  notificationsEnabled: true,
  autoLogout: '30',
  sessionTimeout: '24',
}

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // API Keys State — fetched from DB
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [showAddKeyModal, setShowAddKeyModal] = useState(false)
  const [newKeyForm, setNewKeyForm] = useState({ exchange: '', apiKey: '', apiSecret: '', label: '' })
  const [addKeyLoading, setAddKeyLoading] = useState(false)

  // Bot Config
  const [botConfig, setBotConfig] = useState<BotConfig>(DEFAULT_BOT_CONFIG)

  // Risk Management
  const [riskConfig, setRiskConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG)

  // Platform Settings
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG)

  // Fetch settings from API on load
  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/dashboard/admin/api/settings')
      if (res.ok) {
        const data = await res.json()
        if (data.botConfig) setBotConfig(data.botConfig)
        if (data.riskConfig) setRiskConfig(data.riskConfig)
        if (data.platformConfig) setPlatformConfig(data.platformConfig)
        if (data.apiKeys && data.apiKeys.length > 0) {
          setApiKeys(data.apiKeys.map((k: any) => ({
            id: k.id,
            exchange: k.exchange,
            keyPreview: k.keyPreview,
            isActive: k.isActive,
            lastValidated: k.lastValidated,
            visible: false,
          })))
        } else {
          setApiKeys([])
        }
        if (data.error) {
          setLoadError(data.error)
        }
      } else {
        setLoadError('فشل في جلب الإعدادات من الخادم')
      }
    } catch {
      setLoadError('⚠️ فشل الاتصال بالخادم')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Save handler — actually calls POST API
  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/dashboard/admin/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botConfig, riskConfig, platformConfig }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSaved(true)
          setTimeout(() => setSaved(false), 3000)
        } else {
          setSaveError(data.error || 'فشل في حفظ الإعدادات')
        }
      } else {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error || 'فشل في حفظ الإعدادات')
      }
    } catch {
      setSaveError('⚠️ فشل الاتصال بالخادم أثناء الحفظ')
    }
    setSaving(false)
  }

  const toggleKeyVisibility = (id: string) => {
    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, visible: !k.visible } : k))
  }

  // Add API key handler (saves locally for now — marked as "under development")
  const handleAddKey = async () => {
    if (!newKeyForm.exchange || !newKeyForm.apiKey) return

    setAddKeyLoading(true)
    // For now, just add locally with a note that this is under development
    // In a full implementation, this would call an API to encrypt and store the key
    const newKey: ApiKeyEntry = {
      id: `local-${Date.now()}`,
      exchange: newKeyForm.exchange,
      keyPreview: `${newKeyForm.apiKey.substring(0, 2).toUpperCase()}••••••••${newKeyForm.apiKey.substring(newKeyForm.apiKey.length - 4).toUpperCase()}`,
      isActive: true,
      lastValidated: null,
      visible: false,
    }
    setApiKeys(prev => [...prev, newKey])
    setShowAddKeyModal(false)
    setNewKeyForm({ exchange: '', apiKey: '', apiSecret: '', label: '' })
    setAddKeyLoading(false)
  }

  const formatLastValidated = (dateStr: string | null) => {
    if (!dateStr) return 'لم يتم التحقق'
    try {
      const diff = Date.now() - new Date(dateStr).getTime()
      const minutes = Math.floor(diff / 60000)
      if (minutes < 60) return `منذ ${minutes} دقيقة`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `منذ ${hours} ساعة`
      const days = Math.floor(hours / 24)
      return `منذ ${days} يوم`
    } catch {
      return 'لم يتم التحقق'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Load Error Banner */}
      {loadError && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: `${COLORS.amber}10`,
          border: `1px solid ${COLORS.amber}30`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertTriangle size={16} color={COLORS.amber} />
          <span style={{ fontSize: 12, color: COLORS.amber, fontFamily: "'Cairo', sans-serif" }}>
            {loadError} — يتم استخدام القيم الافتراضية
          </span>
        </div>
      )}

      {/* Save Error Banner */}
      {saveError && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: `${COLORS.danger}10`,
          border: `1px solid ${COLORS.danger}30`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertTriangle size={16} color={COLORS.danger} />
          <span style={{ fontSize: 12, color: COLORS.danger, fontFamily: "'Cairo', sans-serif" }}>
            {saveError}
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>إعدادات النظام</h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>إدارة المفاتيح والتكوين والمخاطر</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={fetchSettings}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
              color: COLORS.accent, fontSize: 12, fontWeight: 600,
              fontFamily: "'Cairo', sans-serif", cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 20px', borderRadius: 8,
              border: `1px solid ${COLORS.success}25`,
              background: saved ? `${COLORS.success}15` : `${COLORS.success}08`,
              color: COLORS.success, fontSize: 12, fontWeight: 600,
              fontFamily: "'Cairo', sans-serif", cursor: saving ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saving ? 'جارٍ الحفظ...' : saved ? 'تم الحفظ' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ ...CARD_STYLE, padding: 40, textAlign: 'center' }}>
          <Loader2 size={24} color={COLORS.accent} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>جارٍ تحميل الإعدادات...</div>
        </div>
      ) : (
        <>
          {/* API Keys */}
          <div style={{ ...CARD_STYLE, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Key size={14} color={COLORS.accent} />
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>مفاتيح API</span>
            </div>

            {apiKeys.length > 0 ? (
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
                      <span style={{ fontSize: 9, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{formatLastValidated(key.lastValidated)}</span>
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
              </div>
            ) : (
              <div style={{
                padding: 20, borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${COLORS.border}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                  لا توجد مفاتيح API مسجلة في النظام
                </div>
                <div style={{ fontSize: 9, color: COLORS.amber, fontFamily: "'Cairo', sans-serif" }}>
                  ميزة إدارة المفاتيح قيد التطوير
                </div>
              </div>
            )}

            <button
              onClick={() => setShowAddKeyModal(true)}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '10px', borderRadius: 8,
                border: `1px dashed ${COLORS.border}`,
                background: 'transparent',
                color: COLORS.accent, fontSize: 11, fontFamily: "'Cairo', sans-serif",
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Plus size={14} />
              إضافة مفتاح API جديد
            </button>
          </div>

          {/* Bot Configuration */}
          <div style={{ ...CARD_STYLE, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Bot size={14} color={COLORS.amber} />
              <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>تكوين البوت</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { key: 'autoTrading', label: 'الربط التلقائي', type: 'toggle' as const },
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
                { key: 'leverageLimit', label: 'حد الرافعة المالية على الحسابات المربوطة (x)' },
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
        </>
      )}

      {/* Add API Key Modal */}
      {showAddKeyModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16,
        }}>
          <div style={{
            ...CARD_STYLE,
            padding: 24,
            maxWidth: 480,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={16} color={COLORS.accent} />
                <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>إضافة مفتاح API جديد</span>
              </div>
              <button
                onClick={() => setShowAddKeyModal(false)}
                style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', padding: 4 }}
              >
                <XIcon size={18} />
              </button>
            </div>

            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: `${COLORS.amber}08`,
              border: `1px solid ${COLORS.amber}20`,
              marginBottom: 16,
            }}>
              <span style={{ fontSize: 10, color: COLORS.amber, fontFamily: "'Cairo', sans-serif" }}>
                ⚠️ ميزة قيد التطوير — سيتم حفظ المفتاح محلياً فقط
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>المنصة / وسطاء الربط</label>
                <select
                  value={newKeyForm.exchange}
                  onChange={e => setNewKeyForm(prev => ({ ...prev, exchange: e.target.value }))}
                  style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 12,
                    fontFamily: "'Cairo', sans-serif",
                    outline: 'none',
                  }}
                >
                  <option value="" style={{ background: '#1A1D29', color: COLORS.muted }}>اختر المنصة...</option>
                  <option value="Alpaca" style={{ background: '#1A1D29', color: COLORS.text }}>Alpaca</option>
                  <option value="Binance" style={{ background: '#1A1D29', color: COLORS.text }}>Binance</option>
                  <option value="Twelve Data" style={{ background: '#1A1D29', color: COLORS.text }}>Twelve Data</option>
                  <option value="Coinbase" style={{ background: '#1A1D29', color: COLORS.text }}>Coinbase</option>
                  <option value="Interactive Brokers" style={{ background: '#1A1D29', color: COLORS.text }}>Interactive Brokers</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>API Key</label>
                <input
                  type="text"
                  value={newKeyForm.apiKey}
                  onChange={e => setNewKeyForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="أدخل مفتاح API..."
                  style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                  dir="ltr"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>API Secret</label>
                <input
                  type="password"
                  value={newKeyForm.apiSecret}
                  onChange={e => setNewKeyForm(prev => ({ ...prev, apiSecret: e.target.value }))}
                  placeholder="أدخل المفتاح السري..."
                  style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                  dir="ltr"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>تسمية (اختياري)</label>
                <input
                  type="text"
                  value={newKeyForm.label}
                  onChange={e => setNewKeyForm(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="مثال: الحساب المربوط الرئيسي"
                  style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 12,
                    fontFamily: "'Cairo', sans-serif",
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => setShowAddKeyModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px', borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    background: 'transparent',
                    color: COLORS.muted, fontSize: 12, fontFamily: "'Cairo', sans-serif",
                    cursor: 'pointer',
                  }}
                >
                  إلغاء
                </button>
                <button
                  onClick={handleAddKey}
                  disabled={!newKeyForm.exchange || !newKeyForm.apiKey || addKeyLoading}
                  style={{
                    flex: 1,
                    padding: '10px', borderRadius: 8,
                    border: `1px solid ${COLORS.success}25`,
                    background: `${COLORS.success}10`,
                    color: COLORS.success, fontSize: 12, fontWeight: 600,
                    fontFamily: "'Cairo', sans-serif",
                    cursor: (!newKeyForm.exchange || !newKeyForm.apiKey || addKeyLoading) ? 'not-allowed' : 'pointer',
                    opacity: (!newKeyForm.exchange || !newKeyForm.apiKey || addKeyLoading) ? 0.5 : 1,
                  }}
                >
                  {addKeyLoading ? 'جارٍ الإضافة...' : 'إضافة المفتاح'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 767px) {
          .admin-settings-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
