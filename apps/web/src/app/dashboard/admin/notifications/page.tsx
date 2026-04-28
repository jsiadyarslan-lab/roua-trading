'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  RefreshCw,
  Send,
  MessageSquare,
  Globe,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  Eye,
  EyeOff,
  Users,
  TrendingUp,
  AlertTriangle,
  Activity,
  DollarSign,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react'

/* ── design tokens ── */
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
  purple: '#B388FF',
}

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  padding: 20,
  position: 'relative',
  overflow: 'hidden',
}

/* ── notification events config ── */
const NOTIFICATION_EVENTS = [
  { key: 'new_user', label: 'مستخدم جديد', icon: Users },
  { key: 'subscription_upgrade', label: 'ترقية اشتراك', icon: TrendingUp },
  { key: 'system_error', label: 'خطأ في النظام', icon: AlertTriangle },
  { key: 'performance_alert', label: 'تنبيه الأداء', icon: Activity },
  { key: 'large_trade', label: 'صفقة كبيرة', icon: DollarSign },
  { key: 'system_update', label: 'تحديث النظام', icon: RefreshCwIcon },
]

/* ── types ── */
interface NotifConfig {
  id: string
  type: string
  enabled: boolean
  config: Record<string, string>
  description: string
  lastTriggeredAt: string | null
  triggerCount: number
}

export default function AdminNotificationsPage() {
  const [configs, setConfigs] = useState<NotifConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  /* Telegram state */
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramTokenVisible, setTelegramTokenVisible] = useState(false)
  const [telegramChatId, setTelegramChatId] = useState('')
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState<'unknown' | 'connected' | 'disconnected' | 'disabled'>('unknown')

  /* Browser state */
  const [browserEnabled, setBrowserEnabled] = useState(false)
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'default'>('default')

  /* Events state */
  const [enabledEvents, setEnabledEvents] = useState<Set<string>>(new Set(['new_user', 'system_error', 'large_trade']))

  /* ── fetch config ── */
  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/dashboard/admin/api/notifications/config')
      if (res.ok) {
        const data = await res.json()
        setConfigs(data.configs || [])

        const telegramConfig = data.configs?.find((c: NotifConfig) => c.type === 'telegram')
        if (telegramConfig) {
          setTelegramEnabled(telegramConfig.enabled)
          setTelegramToken(telegramConfig.config?.botToken || '')
          setTelegramChatId(telegramConfig.config?.chatId || '')
          if (!telegramConfig.enabled) {
            setTelegramStatus('disabled')
          }
        }

        const browserConfig = data.configs?.find((c: NotifConfig) => c.type === 'browser')
        if (browserConfig) {
          setBrowserEnabled(browserConfig.enabled)
        }

        // Load event config
        const eventsConfig = data.configs?.find((c: NotifConfig) => c.type === 'events')
        if (eventsConfig?.config?.enabledEvents) {
          setEnabledEvents(new Set(eventsConfig.config.enabledEvents))
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission)
    }
  }, [fetchConfigs])

  /* ── save config via POST ── */
  const saveConfig = async (type: string, enabled: boolean, config: Record<string, any>) => {
    try {
      await fetch('/dashboard/admin/api/notifications/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, enabled, config }),
      })
    } catch {
      // ignore
    }
  }

  /* ── handle save all ── */
  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')
    try {
      // Save Telegram
      await saveConfig('telegram', telegramEnabled, { botToken: telegramToken, chatId: telegramChatId })
      // Save Browser
      await saveConfig('browser', browserEnabled, { vapidKey: '' })
      // Save Events
      await saveConfig('events', true, { enabledEvents: Array.from(enabledEvents) })

      setSaveMessage('تم حفظ الإعدادات بنجاح ✓')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch {
      setSaveMessage('فشل في حفظ الإعدادات')
    } finally {
      setSaving(false)
    }
  }

  /* ── telegram test ── */
  const handleTestTelegram = async () => {
    setTelegramTesting(true)
    try {
      if (!telegramToken || !telegramChatId) {
        setTelegramStatus('disconnected')
      } else {
        // Attempt real test via Telegram API
        try {
          const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`)
          if (res.ok) {
            const json = await res.json()
            if (json.ok) {
              setTelegramStatus('connected')
            } else {
              setTelegramStatus('disconnected')
            }
          } else {
            setTelegramStatus('disconnected')
          }
        } catch {
          setTelegramStatus('disconnected')
        }
      }
    } finally {
      setTelegramTesting(false)
    }
  }

  /* ── browser permission ── */
  const handleRequestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission()
      setBrowserPermission(permission)
    }
  }

  /* ── toggle event ── */
  const toggleEvent = async (key: string) => {
    const next = new Set(enabledEvents)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setEnabledEvents(next)
    // Save to API immediately
    await saveConfig('events', true, { enabledEvents: Array.from(next) })
  }

  /* ── telegram status label ── */
  const getTelegramStatusLabel = () => {
    if (!telegramEnabled) return { text: 'غير مفعل', color: COLORS.muted }
    switch (telegramStatus) {
      case 'connected': return { text: 'متصل', color: COLORS.success }
      case 'disconnected': return { text: 'غير متصل', color: COLORS.danger }
      default: return { text: 'غير مفحوص', color: COLORS.amber }
    }
  }
  const telegramStatusInfo = getTelegramStatusLabel()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
            إعدادات التنبيهات
          </h1>
          <p style={{ fontSize: 12, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", margin: '4px 0 0' }}>
            تكوين قنوات وأحداث التنبيهات
          </p>
        </div>
        <button
          onClick={fetchConfigs}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
            color: COLORS.accent, fontSize: 12, fontWeight: 600,
            fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <RefreshCw size={14} /> تحديث
        </button>
      </div>

      {/* Telegram Notifications + Browser Push Notifications */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Telegram Notifications Card */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={14} color={COLORS.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>تنبيهات Telegram</span>
            </div>
            <button
              onClick={() => {
                const next = !telegramEnabled
                setTelegramEnabled(next)
                if (!next) setTelegramStatus('disabled')
                else if (telegramStatus === 'disabled') setTelegramStatus('unknown')
              }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {telegramEnabled ? (
                <div style={{ width: 40, height: 22, borderRadius: 11, background: COLORS.success, position: 'relative', transition: 'all 0.2s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, left: 2 }} />
                </div>
              ) : (
                <div style={{ width: 40, height: 22, borderRadius: 11, background: COLORS.muted, position: 'relative', transition: 'all 0.2s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, right: 2 }} />
                </div>
              )}
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Status indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 6,
              background: telegramStatusInfo.color === COLORS.success ? `${COLORS.success}08` :
                telegramStatusInfo.color === COLORS.danger ? `${COLORS.danger}08` :
                telegramStatusInfo.color === COLORS.amber ? `${COLORS.amber}08` :
                'rgba(255,255,255,0.02)',
              border: `1px solid ${telegramStatusInfo.color}20`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: telegramStatusInfo.color,
                boxShadow: telegramStatusInfo.color === COLORS.success ? `0 0 6px ${COLORS.success}` : 'none',
              }} />
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: telegramStatusInfo.color,
                fontFamily: "'Cairo', sans-serif",
              }}>
                {telegramStatusInfo.text}
              </span>
            </div>

            {/* Bot Token */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>
                Bot Token
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={telegramTokenVisible ? 'text' : 'password'}
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="أدخل Bot Token"
                  dir="ltr"
                  style={{
                    width: '100%', padding: '10px 40px 10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => setTelegramTokenVisible(!telegramTokenVisible)}
                  style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: COLORS.muted, padding: 4,
                  }}
                >
                  {telegramTokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Chat ID */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>
                Chat ID
              </label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="أدخل Chat ID"
                dir="ltr"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.text, fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Test connection */}
            <button
              onClick={handleTestTelegram}
              disabled={telegramTesting || !telegramEnabled}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px', borderRadius: 8,
                border: `1px solid ${COLORS.accent}25`,
                background: `${COLORS.accent}08`,
                color: COLORS.accent, fontSize: 12, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif",
                cursor: telegramTesting || !telegramEnabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: telegramTesting || !telegramEnabled ? 0.5 : 1,
              }}
            >
              <Send size={14} />
              {telegramTesting ? 'جارٍ الاختبار...' : 'اختبار الاتصال'}
            </button>
          </div>
        </div>

        {/* Browser Push Notifications Card */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={14} color={COLORS.purple} />
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>تنبيهات المتصفح</span>
            </div>
            <button
              onClick={() => setBrowserEnabled(!browserEnabled)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {browserEnabled ? (
                <div style={{ width: 40, height: 22, borderRadius: 11, background: COLORS.success, position: 'relative', transition: 'all 0.2s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, left: 2 }} />
                </div>
              ) : (
                <div style={{ width: 40, height: 22, borderRadius: 11, background: COLORS.muted, position: 'relative', transition: 'all 0.2s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, right: 2 }} />
                </div>
              )}
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Current permission status */}
            <div style={{
              padding: 14, borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>
                حالة إذن المتصفح
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {browserPermission === 'granted' ? (
                  <CheckCircle2 size={18} color={COLORS.success} />
                ) : browserPermission === 'denied' ? (
                  <XCircle size={18} color={COLORS.danger} />
                ) : (
                  <Bell size={18} color={COLORS.amber} />
                )}
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: browserPermission === 'granted' ? COLORS.success : browserPermission === 'denied' ? COLORS.danger : COLORS.amber,
                  fontFamily: "'Cairo', sans-serif",
                }}>
                  {browserPermission === 'granted' ? 'مسموح' : browserPermission === 'denied' ? 'مرفوض' : 'غير محدد'}
                </span>
              </div>
            </div>

            {/* Request browser permission */}
            <button
              onClick={handleRequestBrowserPermission}
              disabled={browserPermission === 'granted'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px', borderRadius: 8,
                border: `1px solid ${COLORS.purple}25`,
                background: `${COLORS.purple}08`,
                color: COLORS.purple, fontSize: 12, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif",
                cursor: browserPermission === 'granted' ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: browserPermission === 'granted' ? 0.5 : 1,
              }}
            >
              <Bell size={14} />
              {browserPermission === 'granted' ? 'الإذن ممنوح بالفعل' : 'طلب إذن المتصفح'}
            </button>

            {/* Info */}
            <div style={{
              padding: 12, borderRadius: 8,
              background: 'rgba(0,229,255,0.03)',
              border: `1px solid ${COLORS.accent}10`,
            }}>
              <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                تنبيهات المتصفح تظهر كإشعارات سطح المكتب. يجب منح الإذن من المتصفح أولاً لتفعيل هذه الميزة.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Events Card */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Bell size={14} color={COLORS.amber} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, fontFamily: "'Cairo', sans-serif" }}>أحداث التنبيهات</span>
        </div>
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {NOTIFICATION_EVENTS.map((event) => {
            const isEnabled = enabledEvents.has(event.key)
            const EventIcon = event.icon
            return (
              <div
                key={event.key}
                onClick={() => toggleEvent(event.key)}
                style={{
                  padding: 14, borderRadius: 8,
                  background: isEnabled ? 'rgba(0,229,255,0.04)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isEnabled ? COLORS.accent + '25' : COLORS.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EventIcon size={14} color={isEnabled ? COLORS.accent : COLORS.muted} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: isEnabled ? COLORS.text : COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>
                      {event.label}
                    </span>
                  </div>
                  {/* Styled toggle */}
                  <div style={{
                    width: 36, height: 20, borderRadius: 10,
                    background: isEnabled ? COLORS.accent : COLORS.muted + '40',
                    position: 'relative', transition: 'all 0.2s',
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: 8,
                      background: isEnabled ? '#000' : '#666',
                      position: 'absolute', top: 2,
                      left: isEnabled ? 18 : 2,
                      transition: 'all 0.2s',
                    }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Save Configuration Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 24px', borderRadius: 8,
            border: 'none',
            background: COLORS.success,
            color: '#000', fontSize: 13, fontWeight: 700,
            fontFamily: "'Cairo', sans-serif", cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: saving ? 'none' : '0 0 20px rgba(0,230,118,0.15)',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Save size={16} />
          {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </button>
        {saveMessage && (
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: saveMessage.includes('نجاح') ? COLORS.success : COLORS.danger,
            fontFamily: "'Cairo', sans-serif",
          }}>
            {saveMessage}
          </span>
        )}
      </div>

      <style>{`
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 900px) {
          [style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
