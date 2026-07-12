'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Radar,
  RefreshCw,
  Play,
  Square,
  Zap,
  Clock,
  Activity,
  Settings,
  Bell,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  GitBranch,
  Loader2,
  Save,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { COLORS, CARD_STYLE } from '@/lib/admin-ui'
import { useScopedStyle } from '@/hooks/useScopedStyle'

/* ── toast notification ── */
interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

/* ── types ── */
interface MonitorStatus {
  running: boolean
  lastCheck: string | null
  message: string
  agentUrl: string | null
  checkInterval: number
  endpoints: { path: string; label: string }[]
}

interface EndpointHealth {
  path: string
  status: 'healthy' | 'warning' | 'error' | 'checking'
  responseTime: number
  lastChecked: string
}

interface HealthResponse {
  overall: string
  summary: {
    total: number
    healthy: number
    warnings: number
    errors: number
    avgResponseTime: number
  }
  endpoints: EndpointHealth[]
  timestamp: string
  uptime: number
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'healthy': return <CheckCircle2 size={14} color={COLORS.success} />
    case 'warning': return <AlertTriangle size={14} color={COLORS.amber} />
    case 'error': return <XCircle size={14} color={COLORS.danger} />
    default: return <Clock size={14} color={COLORS.muted} />
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'healthy': return COLORS.success
    case 'warning': return COLORS.amber
    case 'error': return COLORS.danger
    default: return COLORS.muted
  }
}

export default function AdminMonitorPage() {
  useScopedStyle(`@keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 900px) {
          [style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }`)

  const [status, setStatus] = useState<MonitorStatus | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [checkInterval, setCheckInterval] = useState(60)
  const [alertThreshold, setAlertThreshold] = useState(2000)
  const [telegramToggle, setTelegramToggle] = useState(false)

  /* Control button states */
  const [agentActionLoading, setAgentActionLoading] = useState<'start' | 'stop' | null>(null)
  const [agentDeployed, setAgentDeployed] = useState<boolean | null>(null)

  /* Settings saving state */
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')

  /* Toast notifications */
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const tn = useTranslations('notifications.admin')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/monitor/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        setCheckInterval(data.checkInterval || 60)
        setAgentDeployed(!!data.agentUrl)
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchHealth = useCallback(async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } catch {
      // ignore
    } finally {
      setChecking(false)
      setLoading(false)
    }
  }, [])

  /* Load settings from API on mount */
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/monitor/settings')
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setCheckInterval(data.settings.checkInterval ?? 60)
          setAlertThreshold(data.settings.alertThreshold ?? 2000)
          setTelegramToggle(data.settings.telegramEnabled ?? false)
        }
      }
    } catch {
      // ignore — use defaults
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      await fetchStatus()
      await fetchSettings()
      await fetchHealth()
    }
    init()
    const interval = setInterval(() => {
      fetchStatus()
      fetchHealth()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus, fetchHealth, fetchSettings])

  /* ── Agent control handlers ── */
  const handleAgentAction = async (action: 'start' | 'stop') => {
    setAgentActionLoading(action)
    try {
      const res = await fetch('/api/admin/monitor/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()

      if (data.agentDeployed === false) {
        addToast(tn('monitorNotPublished'), 'error')
        setAgentDeployed(false)
      } else if (data.success) {
        addToast(data.message || (action === 'start' ? tn('agentStarted') : tn('agentStopped')), 'success')
        // Refresh status after a short delay
        setTimeout(() => fetchStatus(), 2000)
      } else {
        addToast(data.error || tn('commandFailed'), 'error')
      }
    } catch {
      addToast(tn('serverError'), 'error')
    } finally {
      setAgentActionLoading(null)
    }
  }

  /* ── Save settings handler ── */
  const handleSaveSettings = async () => {
    setSettingsSaving(true)
    setSettingsMessage('')
    try {
      const res = await fetch('/api/admin/monitor/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkInterval,
          alertThreshold,
          telegramEnabled: telegramToggle,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSettingsMessage(tn('settingsSavedSuccess'))
        addToast(tn('settingsSaved'), 'success')
      } else {
        setSettingsMessage(data.error || tn('settingsSaveFailed'))
        addToast(data.error || tn('settingsSaveFailed'), 'error')
      }
    } catch {
      setSettingsMessage(tn('serverError'))
      addToast(tn('serverError'), 'error')
    } finally {
      setSettingsSaving(false)
      setTimeout(() => setSettingsMessage(''), 3000)
    }
  }

  const formatDate = (iso: string | null) => {
  

    if (!iso) return 'لم يتم بعد'
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `منذ ${mins} دقيقة`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `منذ ${hours} ساعة`
    return d.toLocaleDateString('ar-SA')
  }

  /* Merge monitor endpoints with health data */
  const monitoredEndpoints = status?.endpoints?.map(ep => {
    const healthEp = health?.endpoints?.find(h => h.path === ep.path)
    return {
      path: ep.path,
      label: ep.label,
      status: healthEp?.status || 'checking',
      responseTime: healthEp?.responseTime || 0,
    }
  }) || health?.endpoints?.map(ep => ({
    path: ep.path,
    label: ep.path,
    status: ep.status,
    responseTime: ep.responseTime,
  })) || []

  const healthyCount = monitoredEndpoints.filter(e => e.status === 'healthy').length
  const warningCount = monitoredEndpoints.filter(e => e.status === 'warning').length
  const errorCount = monitoredEndpoints.filter(e => e.status === 'error').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
          maxWidth: 420, width: '90%',
        }}>
          {toasts.map(toast => (
            <div key={toast.id} style={{
              padding: '12px 16px', borderRadius: 'var(--radius-md)',
              background: toast.type === 'success' ? `${COLORS.success}15` :
                toast.type === 'error' ? `${COLORS.danger}15` : `${COLORS.accent}15`,
              border: `1px solid ${
                toast.type === 'success' ? COLORS.success + '40' :
                toast.type === 'error' ? COLORS.danger + '40' : COLORS.accent + '40'
              }`,
              color: toast.type === 'success' ? COLORS.success :
                toast.type === 'error' ? COLORS.danger : COLORS.accent,
              fontSize: 'var(--text-sm)', fontWeight: 600,
              fontFamily: "var(--font-ar)",
              display: 'flex', alignItems: 'center', gap: 8,
              backdropFilter: 'blur(12px)',
            }}>
              {toast.type === 'success' && <CheckCircle2 size={16} />}
              {toast.type === 'error' && <XCircle size={16} />}
              {toast.type === 'info' && <AlertTriangle size={16} />}
              {toast.message}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)", margin: 0 }}>
            وكيل المراقبة
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: COLORS.muted, fontFamily: "var(--font-ar)", margin: '4px 0 0' }}>
            لوحة تحكم وكيل المراقبة التلقائي
          </p>
        </div>
        <button
          onClick={() => { fetchStatus(); fetchHealth() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 'var(--radius-md)',
            border: `1px solid ${COLORS.border}`, background: 'rgba(0,229,255,0.06)',
            color: COLORS.accent, fontSize: 'var(--text-sm)', fontWeight: 600,
            fontFamily: "var(--font-ar)", cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <RefreshCw size={14} /> تحديث
        </button>
      </div>

      {/* Agent not deployed warning */}
      {agentDeployed === false && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: `${COLORS.amber}10`,
          border: `1px solid ${COLORS.amber}30`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} color={COLORS.amber} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: COLORS.amber, fontFamily: "var(--font-ar)" }}>
            وكيل المراقبة غير منشور — قم بتعيين MONITOR_AGENT_URL في متغيرات البيئة ونشر الوكيل على Railway أولاً
          </span>
        </div>
      )}

      {/* Agent Status Card + Control Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Agent Status Card */}
        <div style={{ ...CARD_STYLE, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            {/* Pulsing status dot */}
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: status?.running ? COLORS.success : COLORS.danger,
              boxShadow: `0 0 12px ${status?.running ? COLORS.success : COLORS.danger}`,
              animation: status?.running ? 'pulse 2s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)" }}>
                {status?.running ? 'الوكيل يعمل' : 'الوكيل متوقف'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: status?.running ? COLORS.success : COLORS.muted, fontFamily: "var(--font-ar)", marginTop: 2 }}>
                {status?.message || 'لا توجد معلومات'}
              </div>
            </div>
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--radius-lg)',
              background: status?.running ? `${COLORS.success}15` : `${COLORS.danger}15`,
              border: `1px solid ${status?.running ? COLORS.success + '30' : COLORS.danger + '30'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Radar size={22} color={status?.running ? COLORS.success : COLORS.danger} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{
              padding: 10, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>آخر فحص</div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: COLORS.text, fontFamily: "var(--font-ar)", marginTop: 2 }}>
                {formatDate(status?.lastCheck || null)}
              </div>
            </div>
            <div style={{
              padding: 10, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)" }}>إجمالي نقاط النهاية</div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: COLORS.text, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                {monitoredEndpoints.length}
              </div>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div style={{ ...CARD_STYLE, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Settings size={14} color={COLORS.accent} />
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)" }}>التحكم بالوكيل</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Start Agent */}
            <button
              onClick={() => handleAgentAction('start')}
              disabled={agentActionLoading !== null}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 'var(--radius-md)',
                border: `1px solid ${COLORS.success}25`,
                background: `${COLORS.success}08`,
                color: COLORS.success, fontSize: 'var(--text-sm)', fontWeight: 700,
                fontFamily: "var(--font-ar)", cursor: agentActionLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: agentActionLoading ? 0.6 : 1,
              }}
            >
              {agentActionLoading === 'start' ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
              {agentActionLoading === 'start' ? 'جارٍ التشغيل...' : 'تشغيل الوكيل'}
            </button>
            <div style={{
              fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)",
              textAlign: 'center', marginTop: -4,
            }}>
              يحتاج نشر الوكيل على Railway أولاً
            </div>

            {/* Stop Agent */}
            <button
              onClick={() => handleAgentAction('stop')}
              disabled={agentActionLoading !== null}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 'var(--radius-md)',
                border: `1px solid ${COLORS.danger}25`,
                background: `${COLORS.danger}08`,
                color: COLORS.danger, fontSize: 'var(--text-sm)', fontWeight: 700,
                fontFamily: "var(--font-ar)", cursor: agentActionLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: agentActionLoading ? 0.6 : 1,
              }}
            >
              {agentActionLoading === 'stop' ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Square size={16} />}
              {agentActionLoading === 'stop' ? 'جارٍ الإيقاف...' : 'إيقاف الوكيل'}
            </button>

            {/* Immediate Check */}
            <button
              onClick={fetchHealth}
              disabled={checking}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 'var(--radius-md)',
                border: `1px solid ${COLORS.accent}25`,
                background: `${COLORS.accent}08`,
                color: COLORS.accent, fontSize: 'var(--text-sm)', fontWeight: 700,
                fontFamily: "var(--font-ar)", cursor: checking ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: checking ? 0.6 : 1,
              }}
            >
              <Zap size={16} /> {checking ? 'جارٍ الفحص...' : 'فحص فوري'}
            </button>
          </div>
        </div>
      </div>

      {/* Endpoint Health Summary mini-cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {[
          { label: 'سليم', value: healthyCount, color: COLORS.success, icon: CheckCircle2 },
          { label: 'تحذير', value: warningCount, color: COLORS.amber, icon: AlertTriangle },
          { label: 'خطأ', value: errorCount, color: COLORS.danger, icon: XCircle },
          { label: 'إجمالي', value: monitoredEndpoints.length, color: COLORS.accent, icon: Activity },
        ].map((card, i) => {
          const CardIcon = card.icon
          return (
            <div key={i} style={{ ...CARD_STYLE, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--radius-md)',
                background: `${card.color}15`,
                border: `1px solid ${card.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CardIcon size={14} color={card.color} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: card.color, fontFamily: "var(--font-mono)", lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)", marginTop: 2 }}>{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Monitored Endpoints List + Agent Configuration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Endpoints List */}
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Activity size={14} color={COLORS.accent} />
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)" }}>نقاط النهاية المراقبة</span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted, fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)' }}>
                جارٍ التحميل...
              </div>
            ) : monitoredEndpoints.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: COLORS.muted, fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)' }}>
                لا توجد نقاط نهاية مراقبة
              </div>
            ) : (
              monitoredEndpoints.map((ep, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${COLORS.border}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flexShrink: 0 }}>
                    {getStatusIcon(ep.status)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)", color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">
                      {ep.path}
                    </div>
                    {ep.label && ep.label !== ep.path && (
                      <div style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)", marginTop: 1 }}>{ep.label}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)",
                    color: getStatusColor(ep.status),
                    flexShrink: 0,
                  }}>
                    {ep.responseTime}ms
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agent Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...CARD_STYLE, padding: 0 }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Settings size={14} color={COLORS.amber} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)" }}>إعدادات الوكيل</span>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Check interval */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: COLORS.muted, fontFamily: "var(--font-ar)", marginBottom: 6 }}>
                  فاصل الفحص (ثانية)
                </label>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={checkInterval}
                  onChange={(e) => setCheckInterval(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 'var(--text-sm)',
                    fontFamily: "var(--font-mono)",
                    outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Alert threshold */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: COLORS.muted, fontFamily: "var(--font-ar)", marginBottom: 6 }}>
                  عتبة التنبيه (ميلي ثانية)
                </label>
                <input
                  type="number"
                  min={100}
                  max={30000}
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 'var(--text-sm)',
                    fontFamily: "var(--font-mono)",
                    outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Telegram notifications toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 12, borderRadius: 'var(--radius-md)',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bell size={14} color={telegramToggle ? COLORS.accent : COLORS.muted} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: COLORS.text, fontFamily: "var(--font-ar)" }}>تنبيهات تلغرام</span>
                </div>
                <button
                  onClick={() => setTelegramToggle(!telegramToggle)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {telegramToggle ? (
                    <div style={{ width: 36, height: 20, borderRadius: 'var(--radius-lg)', background: COLORS.accent, position: 'relative', transition: 'all 0.2s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 'var(--radius-md)', background: '#fff', position: 'absolute', top: 2, left: 2 }} />
                    </div>
                  ) : (
                    <div style={{ width: 36, height: 20, borderRadius: 'var(--radius-lg)', background: COLORS.muted, position: 'relative', transition: 'all 0.2s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 'var(--radius-md)', background: '#fff', position: 'absolute', top: 2, right: 2 }} />
                    </div>
                  )}
                </button>
              </div>

              {/* Save Settings Button */}
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaving}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px', borderRadius: 'var(--radius-md)',
                  border: `1px solid ${COLORS.accent}25`,
                  background: `${COLORS.accent}08`,
                  color: COLORS.accent, fontSize: 'var(--text-sm)', fontWeight: 600,
                  fontFamily: "var(--font-ar)",
                  cursor: settingsSaving ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: settingsSaving ? 0.6 : 1,
                }}
              >
                {settingsSaving ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Save size={14} />
                )}
                {settingsSaving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
              </button>
              {settingsMessage && (
                <div style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                  color: settingsMessage.includes('نجاح') ? COLORS.success : COLORS.danger,
                  fontFamily: "var(--font-ar)",
                  textAlign: 'center',
                }}>
                  {settingsMessage}
                </div>
              )}
            </div>
          </div>

          {/* Railway Deployment Info Card */}
          <div style={{ ...CARD_STYLE, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <ExternalLink size={14} color={COLORS.purple} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: COLORS.text, fontFamily: "var(--font-ar)" }}>نشر على Railway</span>
            </div>
            <div style={{
              padding: 14, borderRadius: 'var(--radius-md)',
              background: 'rgba(179,136,255,0.04)',
              border: `1px solid ${COLORS.purple}15`,
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: COLORS.muted, fontFamily: "var(--font-ar)", lineHeight: 1.8, marginBottom: 10 }}>
                قم بربط المستودع على Railway لنشر الوكيل
              </div>
              <a
                href="https://github.com/jsiadyarslan-lab/roua-monitor"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: `${COLORS.purple}10`,
                  border: `1px solid ${COLORS.purple}25`,
                  color: COLORS.purple, fontSize: 'var(--text-xs)', fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                  width: 'fit-content',
                }}
              >
                <GitBranch size={14} />
                jsiadyarslan-lab/roua-monitor
              </a>
              <div style={{ marginTop: 10 }}>
                <a
                  href="https://railway.app/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text, fontSize: 'var(--text-xs)', fontWeight: 600,
                    fontFamily: "var(--font-ar)",
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <ExternalLink size={12} /> لوحة تحكم Railway
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped styles via useScopedStyle */}</div>
  )
}
