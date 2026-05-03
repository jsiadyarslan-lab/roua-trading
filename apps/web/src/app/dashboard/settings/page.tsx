'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, Shield, Key, Bell, User, Palette, Moon, Sun,
  Mail, Eye, Volume2, Bot, Brain, Radar, BarChart3,
  ChevronLeft, Globe, Zap, Clock, Target, LineChart,
  AlertTriangle, Fingerprint, Lock, Smartphone, Database,
  TrendingUp, Cpu, MessageSquare, Activity, Sliders,
  CheckCircle2, ExternalLink, LogOut, UserCircle, Monitor,
  Wifi, Trash2, Download, Upload, RefreshCw, CreditCard,
  Crown, Star, Sparkles
} from 'lucide-react'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAuthStore } from '@/lib/auth-store'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { hasPermission, getPermissions, ROLE_INFO, type Role, type Permission } from '@/lib/permissions'
import { T as SharedT } from '@/lib/unified-tokens'

const T = { ...SharedT, pink: '#f472b6', text4: '#475569' }

/* ─── Toggle Switch ─── */
function Toggle({ checked, onChange, color, size = 'md', ariaLabel }: {
  checked: boolean; onChange: () => void; color: string; size?: 'sm' | 'md'; ariaLabel?: string
}) {
  const s = size === 'sm' ? { w: 34, h: 18, dot: 13, r: 9 } : { w: 40, h: 22, dot: 16, r: 11 }
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      style={{
        width: s.w, height: s.h, borderRadius: s.r, border: 'none', cursor: 'pointer',
        background: checked ? `${color}25` : T.surface,
        position: 'relative', transition: 'all 0.3s',
        boxShadow: checked ? `0 0 8px ${color}25` : 'none',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: s.dot, height: s.dot, borderRadius: s.dot / 2, background: checked ? color : T.text3,
        position: 'absolute', top: (s.h - s.dot) / 2,
        insetInlineEnd: checked ? (s.h - s.dot) / 2 : 'auto', insetInlineStart: checked ? 'auto' : (s.h - s.dot) / 2,
        transition: 'all 0.3s',
        boxShadow: checked ? `0 0 6px ${color}50` : 'none',
      }} />
    </button>
  )
}

/* ─── Select Box ─── */
function SelectBox({ value, onChange, options, small }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; small?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 8, padding: small ? '4px 8px' : '6px 12px',
        color: T.text, fontSize: small ? 11 : 12,
        fontFamily: "'Cairo', sans-serif", fontWeight: 600,
        outline: 'none', cursor: 'pointer', direction: 'rtl',
        appearance: 'none',
        minWidth: small ? 80 : 120,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/* ─── Section Card ─── */
function SectionCard({ icon, iconColor, iconBg, title, subtitle, children, badge }: {
  icon: React.ReactNode; iconColor: string; iconBg: string; title: string; subtitle: string;
  children: React.ReactNode; badge?: string
}) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, overflow: 'hidden',
      transition: 'border-color 0.3s',
    }}>
      {/* Section Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 20px', borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: iconBg, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            {title}
            {badge && (
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', color: T.text3,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
              }}>{badge}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      {/* Section Body */}
      <div style={{ padding: '4px 20px 18px' }}>
        {children}
      </div>
    </div>
  )
}

/* ─── Setting Row ─── */
function SettingRow({ icon, label, description, children, indent }: {
  icon?: React.ReactNode; label: string; description?: string; children: React.ReactNode; indent?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', minHeight: 40,
      borderBottom: `1px solid ${T.border}`,
      paddingInlineEnd: indent ? 20 : 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {icon && <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</div>
          {description && <div style={{ fontSize: 10, color: T.text4, marginTop: 1 }}>{description}</div>}
        </div>
      </div>
      <div style={{ flexShrink: 0, marginInlineStart: 8 }}>{children}</div>
    </div>
  )
}

/* ─── Permission Tag ─── */
function PermissionTag({ label, active, color }: { label: string; active: boolean; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6,
      background: active ? `${color}12` : T.surface,
      color: active ? color : T.text4,
      fontSize: 10, fontWeight: 600,
      fontFamily: "'Cairo', sans-serif",
      border: `1px solid ${active ? `${color}20` : T.border}`,
      transition: 'all 0.2s',
    }}>
      {active && <CheckCircle2 size={9} />}
      {label}
    </span>
  )
}

/* ══════════════════════════════════════════════════════
   Main Settings Page
══════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const router = useRouter()
  const user = useAuthStore(state => state.user)
  const authLogout = useAuthStore(state => state.logout)
  const { settings, updateSettings } = useNotificationStore()
  const mode = useDashboardStore(state => state.mode)
  const setMode = useDashboardStore(state => state.setMode)
  const [isDark, setIsDark] = useState(true)
  const [activeTab, setActiveTab] = useState('account')

  // Trading preferences
  const [defaultLeverage, setDefaultLeverage] = useState('10')
  const [orderSize, setOrderSize] = useState('5')
  const [riskLevel, setRiskLevel] = useState('medium')
  const [chartType, setChartType] = useState('candlestick')
  const [timeframe, setTimeframe] = useState('15m')
  const [confirmTrades, setConfirmTrades] = useState(true)
  const [showPositions, setShowPositions] = useState(true)
  const [autoStopLoss, setAutoStopLoss] = useState(false)
  const [trailingStop, setTrailingStop] = useState(false)

  // AI preferences
  const [aiConfidence, setAiConfidence] = useState('70')
  const [aiAutoTrade, setAiAutoTrade] = useState(false)
  const [aiModel, setAiModel] = useState('balanced')

  // Data & privacy
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)
  const [crashReports, setCrashReports] = useState(true)
  const [dataExportLoading, setDataExportLoading] = useState(false)

  // Sessions
  const [sessions, setSessions] = useState<Array<{ id: string; device: string; lastActive: string; current: boolean }>>([])

  // ─── Settings persistence: Load from API on mount ───
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data?.settings && typeof data.settings === 'object') {
          const s = data.settings
          if (s.defaultLeverage) setDefaultLeverage(s.defaultLeverage)
          if (s.orderSize) setOrderSize(s.orderSize)
          if (s.riskLevel) setRiskLevel(s.riskLevel)
          if (s.chartType) setChartType(s.chartType)
          if (s.timeframe) setTimeframe(s.timeframe)
          if (s.confirmTrades !== undefined) setConfirmTrades(s.confirmTrades)
          if (s.showPositions !== undefined) setShowPositions(s.showPositions)
          if (s.autoStopLoss !== undefined) setAutoStopLoss(s.autoStopLoss)
          if (s.trailingStop !== undefined) setTrailingStop(s.trailingStop)
          if (s.aiConfidence) setAiConfidence(s.aiConfidence)
          if (s.aiAutoTrade !== undefined) setAiAutoTrade(s.aiAutoTrade)
          if (s.aiModel) setAiModel(s.aiModel)
          if (s.analyticsEnabled !== undefined) setAnalyticsEnabled(s.analyticsEnabled)
          if (s.crashReports !== undefined) setCrashReports(s.crashReports)
        }
        setSettingsLoaded(true)
      })
      .catch(() => setSettingsLoaded(true))
  }, [])

  // ─── Settings persistence: Save to API on change (debounced) ───
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSettings = useCallback(() => {
    if (!settingsLoaded) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            defaultLeverage, orderSize, riskLevel, chartType, timeframe,
            confirmTrades, showPositions, autoStopLoss, trailingStop,
            aiConfidence, aiAutoTrade, aiModel,
            analyticsEnabled, crashReports,
          },
        }),
      }).catch(() => {})
    }, 2000) // Debounce: save 2s after last change
  }, [settingsLoaded, defaultLeverage, orderSize, riskLevel, chartType, timeframe, confirmTrades, showPositions, autoStopLoss, trailingStop, aiConfidence, aiAutoTrade, aiModel, analyticsEnabled, crashReports])

  // Auto-save on any settings change
  useEffect(() => {
    saveSettings()
  }, [saveSettings])

  const userTier = (user?.tier || 'FREE') as Role
  const roleInfo = ROLE_INFO[userTier] || ROLE_INFO.FREE
  const userPermissions = getPermissions(userTier)

  // Fetch active sessions
  useEffect(() => {
    if (activeTab === 'security') {
      fetch('/api/auth/me')
        .then(r => r.json())
        .then(() => {
          // Show current session as active
          setSessions([{
            id: 'current',
            device: 'هذا الجهاز',
            lastActive: 'الآن',
            current: true,
          }])
        })
        .catch(() => {})
    }
  }, [activeTab])

  const handleDataExport = async () => {
    setDataExportLoading(true)
    try {
      // Simulate export — in production this would generate a real file
      await new Promise(resolve => setTimeout(resolve, 2000))
      const data = {
        user: { id: user?.id, email: user?.email, displayName: user?.displayName, tier: user?.tier },
        exportDate: new Date().toISOString(),
        platform: 'ROUA Trading',
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roua-data-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Handle error
    } finally {
      setDataExportLoading(false)
    }
  }

  const handleKillOtherSessions = async () => {
    try {
      // In production, this would call an API to delete all sessions except current
      await fetch('/api/auth/me')
    } catch {}
  }

  const tabs = [
    { id: 'account', label: 'الحساب', icon: <User size={14} /> },
    { id: 'subscription', label: 'الاشتراك', icon: <Crown size={14} /> },
    { id: 'trading', label: 'ربط الحسابات', icon: <BarChart3 size={14} /> },
    { id: 'notifications', label: 'الإشعارات', icon: <Bell size={14} /> },
    { id: 'ai', label: 'الذكاء الاصطناعي', icon: <Brain size={14} /> },
    { id: 'appearance', label: 'المظهر', icon: <Palette size={14} /> },
    { id: 'security', label: 'الأمان', icon: <Shield size={14} /> },
    { id: 'data', label: 'البيانات', icon: <Database size={14} /> },
  ]

  // Permission categories for display
  const permissionCategories = [
    { name: 'ربط الحسابات', perms: [
      { perm: 'trade:view' as Permission, label: 'عرض التداول' },
      { perm: 'trade:execute' as Permission, label: 'تنفيذ الصفقات' },
      { perm: 'trade:paper' as Permission, label: 'عرض تجريبي' },
      { perm: 'trade:leverage:high' as Permission, label: 'رافعة عالية' },
    ]},
    { name: 'الذكاء الاصطناعي', perms: [
      { perm: 'ai:insights' as Permission, label: 'رؤى AI' },
      { perm: 'ai:auto_trade' as Permission, label: 'متابعة تلقائية' },
      { perm: 'ai:scanner' as Permission, label: 'ماسح ذكي' },
      { perm: 'ai:advanced_models' as Permission, label: 'نماذج متقدمة' },
    ]},
    { name: 'المحفظة والاجتماعي', perms: [
      { perm: 'portfolio:view' as Permission, label: 'عرض المحفظة' },
      { perm: 'portfolio:advanced' as Permission, label: 'تحليل متقدم' },
      { perm: 'social:view' as Permission, label: 'متابعة الحسابات' },
      { perm: 'social:follow_accounts' as Permission, label: 'متابعة الحسابات' },
    ]},
    { name: 'API والبيانات', perms: [
      { perm: 'api:access' as Permission, label: 'وصول API' },
      { perm: 'api:webhooks' as Permission, label: 'Webhooks' },
      { perm: 'data:real_time' as Permission, label: 'بيانات حية' },
      { perm: 'data:historical' as Permission, label: 'بيانات تاريخية' },
      { perm: 'data:export' as Permission, label: 'تصدير البيانات' },
    ]},
  ]

  return (
    <div className="custom-scrollbar" style={{ direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto', background: T.bg }}>
      <style>{`
        @media (max-width: 767px) {
          .settings-tabs { flex-wrap: wrap !important; gap: 4px !important; }
          .settings-tabs button { padding: 6px 10px !important; font-size: 10px !important; }
          .settings-content { padding: 12px !important; }
          .settings-profile-row { flex-direction: column !important; text-align: center !important; }
          .perm-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '24px 24px 0', borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg2}, ${T.bg})`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #00d4ff, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Settings size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text }}>الإعدادات</h1>
            <p style={{ margin: 0, fontSize: 11, color: T.text3 }}>إدارة حسابك وتخصيص منصة رؤى</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="settings-tabs" style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 0 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: activeTab === tab.id ? 'rgba(0,212,255,0.08)' : 'transparent',
                color: activeTab === tab.id ? T.cyan : T.text3,
                fontSize: 12, fontWeight: activeTab === tab.id ? 800 : 500,
                fontFamily: "'Cairo', sans-serif",
                borderBottom: activeTab === tab.id ? `2px solid ${T.cyan}` : '2px solid transparent',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
                borderRadius: '8px 8px 0 0',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="settings-content" style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 800 }}>

        {/* ═══ Account Tab ═══ */}
        {activeTab === 'account' && (
          <>
            {/* Profile Card */}
            <div className="settings-profile-row" style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 20,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: `linear-gradient(135deg, ${roleInfo.color}, ${roleInfo.color}88)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 900, color: '#fff',
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: `0 0 20px ${roleInfo.color}30`,
                flexShrink: 0,
              }}>
                {user?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || 'R'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: T.text, marginBottom: 4 }}>
                  {user?.displayName || 'مستخدم رؤى'}
                </div>
                <div style={{ fontSize: 12, color: T.text2, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Mail size={12} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{user?.email || 'user@roua.io'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 10,
                    background: `${roleInfo.color}15`, color: roleInfo.color,
                    fontSize: 10, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    border: `1px solid ${roleInfo.color}25`,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {['PREMIUM', 'INSTITUTIONAL', 'PLUS'].includes(userTier) ? <Sparkles size={10} /> : userTier === 'PRO' ? <Star size={10} /> : <Crown size={10} />}
                    {roleInfo.label}
                  </span>
                  <span style={{ fontSize: 10, color: T.text4 }}>{roleInfo.description}</span>
                </div>
              </div>
              <button
                onClick={() => router.push('/dashboard/portfolio')}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: `1px solid ${T.border2}`,
                  background: 'rgba(0,212,255,0.06)', color: T.cyan,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.2s', flexShrink: 0,
                }}
              >
                <UserCircle size={14} />
                معلومات الحساب
              </button>
            </div>

            {/* Exchange API Keys */}
            <SectionCard
              icon={<Key size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title="مفاتيح API للبورصات"
              subtitle="ربط منصات التداول وإدارة المفاتيح المشفرة"
            >
              <div style={{ padding: '8px 0' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(0,212,255,0.04)', border: `1px solid rgba(0,212,255,0.10)`,
                  marginBottom: 12,
                }}>
                  <Shield size={16} color={T.cyan} />
                  <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
                    رؤى لا تلمس أموالك أبداً. المفاتيح مشفرة بـ AES-256-GCM وتُستخدم فقط للقراءة ومتابعة حساباتك المربوطة.
                    <span style={{ color: T.red, fontWeight: 600 }}> المفاتيح ذات صلاحيات السحب تُرفض فوراً.</span>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/dashboard/settings/exchange')}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    border: `1px dashed ${T.border2}`, background: 'transparent',
                    color: T.cyan, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.04)'; e.currentTarget.style.borderColor = T.cyan }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T.border2 }}
                >
                  <Key size={16} />
                  إدارة مفاتيح API
                  <ChevronLeft size={14} style={{ transform: 'scaleX(-1)' }} />
                </button>
              </div>
            </SectionCard>

            {/* Account Info */}
            <SectionCard
              icon={<Database size={18} color={T.blue} />}
              iconColor={T.blue}
              iconBg={`${T.blue}14`}
              title="معلومات الحساب"
              subtitle="بيانات الاشتراك والجلسة"
            >
              <SettingRow
                icon={<User size={13} color={T.text3} />}
                label="معرّف المستخدم"
                description={user?.id || '—'}
              >
                <span style={{ fontSize: 10, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                  {user?.id?.slice(0, 12) || '—'}...
                </span>
              </SettingRow>
              <SettingRow
                icon={<TrendingUp size={13} color={T.text3} />}
                label="مستوى الاشتراك"
              >
                <span style={{
                  padding: '2px 8px', borderRadius: 6,
                  background: `${roleInfo.color}15`, color: roleInfo.color,
                  fontSize: 10, fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {user?.tier?.toUpperCase() || 'FREE'}
                </span>
              </SettingRow>
              <SettingRow
                icon={<Clock size={13} color={T.text3} />}
                label="حالة الجلسة"
              >
                <span style={{ fontSize: 11, color: T.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green, boxShadow: `0 0 6px ${T.green}60` }} />
                  نشطة — تجديد تلقائي
                </span>
              </SettingRow>
              <SettingRow
                icon={<RefreshCw size={13} color={T.text3} />}
                label="تجديد الجلسة التلقائي"
                description="يتم تجديد جلستك تلقائياً كل 15 دقيقة"
              >
                <Toggle checked={true} onChange={() => {}} color={T.green} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Danger Zone */}
            <div style={{
              border: `1px solid rgba(255,71,87,0.15)`, borderRadius: 16,
              background: 'rgba(255,71,87,0.02)', overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid rgba(255,71,87,0.10)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle size={16} color={T.red} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.red }}>منطقة الخطر</span>
                </div>
              </div>
              <div style={{ padding: '8px 20px 16px' }}>
                <SettingRow
                  icon={<LogOut size={13} color={T.red} />}
                  label="تسجيل الخروج"
                  description="إنهاء الجلسة الحالية من جميع الأجهزة"
                >
                  <button
                    onClick={authLogout}
                    style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: 'rgba(255,71,87,0.10)', border: `1px solid rgba(255,71,87,0.20)`,
                      color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                    }}
                  >
                    خروج
                  </button>
                </SettingRow>
                <SettingRow
                  icon={<Trash2 size={13} color={T.red} />}
                  label="حذف الحساب"
                  description="حذف حسابك نهائياً مع جميع البيانات"
                >
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', color: T.text3,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>قريباً</span>
                </SettingRow>
              </div>
            </div>
          </>
        )}

        {/* ═══ Subscription & Permissions Tab ═══ */}
        {activeTab === 'subscription' && (
          <>
            {/* Current Plan */}
            <div style={{
              background: T.card, border: `1px solid ${roleInfo.color}25`,
              borderRadius: 16, overflow: 'hidden',
            }}>
              <div style={{
                padding: '20px 20px 0', position: 'relative', overflow: 'hidden',
              }}>
                {/* Background glow */}
                <div style={{
                  position: 'absolute', top: -40, right: -40,
                  width: 120, height: 120, borderRadius: '50%',
                  background: `${roleInfo.color}10`, filter: 'blur(40px)',
                  pointerEvents: 'none',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: `linear-gradient(135deg, ${roleInfo.color}, ${roleInfo.color}88)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 24px ${roleInfo.color}30`,
                    flexShrink: 0,
                  }}>
                    {['PREMIUM', 'INSTITUTIONAL', 'PLUS'].includes(userTier) ? <Sparkles size={24} color="#fff" /> : 
                     userTier === 'PRO' ? <Star size={24} color="#fff" /> : 
                     <Crown size={24} color="#fff" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                      خطة {roleInfo.label}
                      {userTier === 'FREE' && (
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 10,
                          background: `${T.cyan}12`, color: T.cyan,
                          fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                        }}>ترقية</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{roleInfo.description}</div>
                  </div>
                </div>

                {/* Plan comparison */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingBottom: 16 }}>
                  {Object.entries(ROLE_INFO).filter(([key]) => key !== 'ADMIN').map(([key, info]) => {
                    const isActive = key === userTier
                    return (
                      <div key={key} style={{
                        flex: 1, padding: '12px 8px', borderRadius: 10, textAlign: 'center',
                        background: isActive ? `${info.color}10` : T.surface,
                        border: isActive ? `1px solid ${info.color}30` : `1px solid ${T.border}`,
                        transition: 'all 0.3s',
                        boxShadow: isActive ? `0 0 16px ${info.color}10` : 'none',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: isActive ? info.color : T.text3, fontFamily: "'Cairo', sans-serif" }}>
                          {info.label}
                        </div>
                        <div style={{ fontSize: 9, color: T.text4, marginTop: 2 }}>{info.description}</div>
                        {isActive && (
                          <div style={{
                            marginTop: 6, fontSize: 8, fontWeight: 700,
                            color: info.color, fontFamily: "'JetBrains Mono', monospace",
                          }}>الحالية</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Permissions Grid */}
            <SectionCard
              icon={<Shield size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title="صلاحياتك الحالية"
              subtitle={`لدى خطة ${roleInfo.label} ${userPermissions.length} صلاحية نشطة`}
              badge={`${userPermissions.length}`}
            >
              <div style={{ padding: '8px 0' }}>
                {permissionCategories.map((cat, ci) => (
                  <div key={ci} style={{ marginBottom: ci < permissionCategories.length - 1 ? 12 : 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text4, marginBottom: 6, letterSpacing: '0.05em' }}>{cat.name}</div>
                    <div className="perm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {cat.perms.map((p, pi) => (
                        <PermissionTag key={pi} label={p.label} active={hasPermission(userTier, p.perm)} color={roleInfo.color} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Upgrade Prompt for FREE users */}
            {userTier === 'FREE' && (
              <div style={{
                background: `linear-gradient(135deg, ${T.cyan}08, ${T.purple}08)`,
                border: `1px solid ${T.cyan}20`, borderRadius: 16,
                padding: 20, textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: T.text, marginBottom: 8 }}>
                  أطلق العنان للإمكانيات الكاملة
                </div>
                <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.8, marginBottom: 16 }}>
                  ترقية إلى خطة احترافية للحصول على متابعة حقيقية، ذكاء اصطناعي متقدم، ومتابعة الحسابات
                </div>
                <button style={{
                  padding: '10px 28px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${T.cyan}, #0A84FF)`,
                  border: 'none', color: '#000', fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                  boxShadow: `0 0 20px ${T.cyan}30`,
                }}>
                  ترقية الآن
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══ Trading Tab ═══ */}
        {activeTab === 'trading' && (
          <>
            {/* Mode Selection */}
            <SectionCard
              icon={<Zap size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title="وضع المتابعة"
              subtitle="اختر أسلوب المتابعة المناسب لك"
            >
              <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
                {([
                  { id: 'trader' as TradingMode, label: 'تاجر', desc: 'تنفيذ سريع', color: T.cyan, icon: <BarChart3 size={14} /> },
                  { id: 'investor' as TradingMode, label: 'مستثمر', desc: 'استثمار طويل', color: T.green, icon: <TrendingUp size={14} /> },
                  { id: 'ai' as TradingMode, label: 'AI', desc: 'ذكاء اصطناعي', color: T.purple, icon: <Brain size={14} /> },
                ]).map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    style={{
                      flex: 1, padding: '14px 12px', borderRadius: 12, cursor: 'pointer',
                      background: mode === m.id ? `${m.color}12` : T.surface,
                      border: mode === m.id ? `1px solid ${m.color}30` : `1px solid ${T.border}`,
                      transition: 'all 0.3s', textAlign: 'center',
                      boxShadow: mode === m.id ? `0 0 16px ${m.color}15` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: mode === m.id ? m.color : T.text3 }}>
                      {m.icon}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: mode === m.id ? m.color : T.text2, fontFamily: "'Cairo', sans-serif" }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: 9, color: T.text4, marginTop: 2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* Trading Preferences */}
            <SectionCard
              icon={<Sliders size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title="تفضيلات المتابعة"
              subtitle="إعدادات الأوامر والتنفيذ"
            >
              <SettingRow
                icon={<Target size={13} color={T.text3} />}
                label="الرافعة الافتراضية"
                description="الرافعة المطبقة على حسابك المربوط عند فتح صفقة"
              >
                <SelectBox
                  value={defaultLeverage}
                  onChange={setDefaultLeverage}
                  options={[
                    { value: '1', label: '1x' }, { value: '2', label: '2x' },
                    { value: '5', label: '5x' }, { value: '10', label: '10x' },
                    { value: '25', label: '25x' }, { value: '50', label: '50x' },
                    { value: '100', label: '100x' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<LineChart size={13} color={T.text3} />}
                label="حجم الأمر الافتراضي"
                description="نسبة رأس المال المستخدمة في كل صفقة"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="range" min={1} max={100} step={1}
                    value={orderSize}
                    onChange={e => setOrderSize(e.target.value)}
                    style={{ width: 80, accentColor: T.cyan, height: 3 }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.cyan, fontFamily: "'JetBrains Mono', monospace", minWidth: 30, textAlign: 'center' }}>
                    {orderSize}%
                  </span>
                </div>
              </SettingRow>
              <SettingRow
                icon={<AlertTriangle size={13} color={T.text3} />}
                label="مستوى المخاطرة"
                description="الحد الأقصى للخسارة المسموح بها في الصفقة"
              >
                <SelectBox
                  value={riskLevel}
                  onChange={setRiskLevel}
                  options={[
                    { value: 'conservative', label: 'محافظ' },
                    { value: 'medium', label: 'متوسط' },
                    { value: 'aggressive', label: 'جريء' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<CheckCircle2 size={13} color={T.text3} />}
                label="تأكيد قبل التنفيذ"
                description="عرض نافذة تأكيد قبل تنفيذ أي أمر على حسابك المربوط"
              >
                <Toggle checked={confirmTrades} onChange={() => setConfirmTrades(!confirmTrades)} color={T.cyan} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Eye size={13} color={T.text3} />}
                label="عرض المراكز المفتوحة"
                description="إظهار لوحة المراكز أسفل الشارت"
              >
                <Toggle checked={showPositions} onChange={() => setShowPositions(!showPositions)} color={T.green} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Stop Loss & Risk Management */}
            <SectionCard
              icon={<Shield size={18} color={T.green} />}
              iconColor={T.green}
              iconBg={`${T.green}14`}
              title="إدارة المخاطر"
              subtitle="أدوات الحماية التلقائية"
            >
              <SettingRow
                icon={<Lock size={13} color={T.text3} />}
                label="وقف خسارة تلقائي"
                description="تعيين وقف خسارة تلقائياً عند فتح صفقة على حسابك المربوط"
              >
                <Toggle checked={autoStopLoss} onChange={() => setAutoStopLoss(!autoStopLoss)} color={T.green} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Activity size={13} color={T.text3} />}
                label="وقف متحرك (Trailing Stop)"
                description="تعديل وقف الخسارة تلقائياً مع حركة السعر"
              >
                <Toggle checked={trailingStop} onChange={() => setTrailingStop(!trailingStop)} color={T.amber} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Chart Settings */}
            <SectionCard
              icon={<LineChart size={18} color={T.purple} />}
              iconColor={T.purple}
              iconBg={`${T.purple}14`}
              title="إعدادات الشارت"
              subtitle="نوع الرسم البياني والإطار الزمني"
            >
              <SettingRow
                icon={<BarChart3 size={13} color={T.text3} />}
                label="نوع الشارت الافتراضي"
              >
                <SelectBox
                  value={chartType}
                  onChange={setChartType}
                  options={[
                    { value: 'candlestick', label: 'شموع يابانية' },
                    { value: 'line', label: 'خطي' },
                    { value: 'area', label: 'مساحي' },
                    { value: 'bar', label: 'أعمدة' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Clock size={13} color={T.text3} />}
                label="الإطار الزمني الافتراضي"
              >
                <SelectBox
                  value={timeframe}
                  onChange={setTimeframe}
                  options={[
                    { value: '1m', label: '1 دقيقة' }, { value: '5m', label: '5 دقائق' },
                    { value: '15m', label: '15 دقيقة' }, { value: '1h', label: 'ساعة' },
                    { value: '4h', label: '4 ساعات' }, { value: '1d', label: 'يومي' },
                  ]}
                  small
                />
              </SettingRow>
            </SectionCard>
          </>
        )}

        {/* ═══ Notifications Tab ═══ */}
        {activeTab === 'notifications' && (
          <>
            <SectionCard
              icon={<Bell size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title="الإشعارات والتنبيهات"
              subtitle="تخصيص طريقة استلامك للتنبيهات والتحذيرات"
            >
              <SettingRow
                icon={<Bell size={13} color={T.cyan} />}
                label="تفعيل الإشعارات"
                description="استقبال تنبيهات المنصة"
              >
                <Toggle checked={settings.enabled} onChange={() => updateSettings({ enabled: !settings.enabled })} color={T.cyan} />
              </SettingRow>
              <SettingRow
                icon={<Volume2 size={13} color={T.green} />}
                label="الأصوات"
                description="تشغيل أصوات تنبيه عند الصفقات والإشارات"
              >
                <Toggle checked={settings.soundEnabled} onChange={() => updateSettings({ soundEnabled: !settings.soundEnabled })} color={T.green} />
              </SettingRow>


              <div style={{ height: 1, background: T.border, margin: '8px 0' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text4, padding: '4px 0 0', letterSpacing: '0.05em' }}>مصادر الإشعارات</div>

              <SettingRow icon={<Bot size={13} color={T.purple} />} label="تنبيهات البوت">
                <Toggle checked={settings.botAlerts} onChange={() => updateSettings({ botAlerts: !settings.botAlerts })} color={T.purple} size="sm" />
              </SettingRow>
              <SettingRow icon={<Brain size={13} color={T.cyan} />} label="تنبيهات الذكاء الاصطناعي">
                <Toggle checked={settings.aiAlerts} onChange={() => updateSettings({ aiAlerts: !settings.aiAlerts })} color={T.cyan} size="sm" />
              </SettingRow>
              <SettingRow icon={<Radar size={13} color={T.amber} />} label="تنبيهات الماسح">
                <Toggle checked={settings.scannerAlerts} onChange={() => updateSettings({ scannerAlerts: !settings.scannerAlerts })} color={T.amber} size="sm" />
              </SettingRow>
              <SettingRow icon={<BarChart3 size={13} color={T.green} />} label="تنبيهات التداول">
                <Toggle checked={settings.tradeAlerts} onChange={() => updateSettings({ tradeAlerts: !settings.tradeAlerts })} color={T.green} size="sm" />
              </SettingRow>


              {/* Confidence Slider */}
              <div style={{ marginTop: 8, padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: T.text2, fontWeight: 600 }}>
                    <Target size={13} style={{ display: 'inline', verticalAlign: -2, marginLeft: 4 }} />
                    الحد الأدنى لمستوى الثقة
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 800, color: T.cyan,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: `${T.cyan}12`, padding: '2px 8px', borderRadius: 6,
                  }}>
                    {settings.minConfidence}%
                  </span>
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={settings.minConfidence}
                  onChange={e => updateSettings({ minConfidence: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: T.cyan, height: 4 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: T.text4 }}>جميع الإشارات</span>
                  <span style={{ fontSize: 9, color: T.text4 }}>إشارات عالية الثقة فقط</span>
                </div>
              </div>
            </SectionCard>

            {/* Notification Schedule */}
            <SectionCard
              icon={<Clock size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title="جدول الإشعارات"
              subtitle="تحديد أوقات استلام التنبيهات"
            >
              <SettingRow
                icon={<Bell size={13} color={T.text3} />}
                label="وضع عدم الإزعاج"
                description="كتم الإشعارات خارج ساعات التداول"
              >
                <Toggle checked={false} onChange={() => {}} color={T.amber} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Activity size={13} color={T.text3} />}
                label="إشعارات الطوارئ فقط"
                description="استقبال تنبيهات المخاطر العالية فقط أثناء وضع عدم الإزعاج"
              >
                <Toggle checked={true} onChange={() => {}} color={T.red} size="sm" />
              </SettingRow>
            </SectionCard>
          </>
        )}

        {/* ═══ AI Tab ═══ */}
        {activeTab === 'ai' && (
          <>
            <SectionCard
              icon={<Brain size={18} color={T.purple} />}
              iconColor={T.purple}
              iconBg={`${T.purple}14`}
              title="إعدادات الذكاء الاصطناعي"
              subtitle="تخصيص سلوك محرك AI والتوصيات"
            >
              <SettingRow
                icon={<Cpu size={13} color={T.purple} />}
                label="نموذج AI"
                description="اختر أسلوب التحليل والتنفيذ"
              >
                <SelectBox
                  value={aiModel}
                  onChange={setAiModel}
                  options={[
                    { value: 'conservative', label: 'محافظ' },
                    { value: 'balanced', label: 'متوازن' },
                    { value: 'aggressive', label: 'جريء' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Target size={13} color={T.cyan} />}
                label="حد الثقة للتنفيذ التلقائي"
                description="الحد الأدنى من الثقة لتنفيذ توصيات AI تلقائياً"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="range" min={50} max={99} step={5}
                    value={aiConfidence}
                    onChange={e => setAiConfidence(e.target.value)}
                    style={{ width: 80, accentColor: T.purple, height: 3 }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.purple, fontFamily: "'JetBrains Mono', monospace", minWidth: 30, textAlign: 'center' }}>
                    {aiConfidence}%
                  </span>
                </div>
              </SettingRow>
              <SettingRow
                icon={<Zap size={13} color={T.amber} />}
                label="المتابعة التلقائية بالـ AI"
                description="السماح للذكاء الاصطناعي بتنفيذ الصفقات تلقائياً"
              >
                <Toggle checked={aiAutoTrade} onChange={() => setAiAutoTrade(!aiAutoTrade)} color={T.amber} />
              </SettingRow>
            </SectionCard>

            <SectionCard
              icon={<MessageSquare size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title="الرصد والتوصيات"
              subtitle="كيف يتواصل AI معك"
            >
              <SettingRow
                icon={<Radar size={13} color={T.cyan} />}
                label="مراقبة الأسواق المستمرة"
                description="تحليل 24/7 للأنماط والفرص"
              >
                <Toggle checked={true} onChange={() => {}} color={T.cyan} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Activity size={13} color={T.green} />}
                label="إشارات الدخول والخروج"
                description="تنبيهات فورية عند اكتشاف فرصة"
              >
                <Toggle checked={true} onChange={() => {}} color={T.green} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<AlertTriangle size={13} color={T.amber} />}
                label="تنبيهات المخاطر"
                description="تحذيرات عند ارتفاع تقلبات السوق"
              >
                <Toggle checked={true} onChange={() => {}} color={T.amber} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<BarChart3 size={13} color={T.purple} />}
                label="تحليل المشاعر"
                description="تحليل مشاعر السوق من الأخبار ووسائل التواصل"
              >
                <Toggle checked={true} onChange={() => {}} color={T.purple} size="sm" />
              </SettingRow>
            </SectionCard>
          </>
        )}

        {/* ═══ Appearance Tab ═══ */}
        {activeTab === 'appearance' && (
          <>
            <SectionCard
              icon={<Palette size={18} color={T.blue} />}
              iconColor={T.blue}
              iconBg={`${T.blue}14`}
              title="المظهر واللغة"
              subtitle="تخصيص شكل المنصة واتجاه العرض"
            >
              <SettingRow
                icon={isDark ? <Moon size={13} color={T.blue} /> : <Sun size={13} color={T.amber} />}
                label="الوضع الداكن"
                description="مريح للعيون في البيئات المنخفضة الإضاءة"
              >
                <Toggle checked={isDark} onChange={() => setIsDark(!isDark)} color={T.blue} />
              </SettingRow>
              <SettingRow
                icon={<Globe size={13} color={T.text3} />}
                label="اللغة"
                description="لغة واجهة المستخدم"
              >
                <SelectBox
                  value="ar"
                  onChange={() => {}}
                  options={[
                    { value: 'ar', label: 'العربية' },
                    { value: 'en', label: 'English' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Fingerprint size={13} color={T.text3} />}
                label="اتجاه النص"
                description="RTL — من اليمين لليسار"
              >
                <span style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 6,
                  background: T.surface, color: T.text3,
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                  border: `1px solid ${T.border}`,
                }}>RTL</span>
              </SettingRow>
              <SettingRow
                icon={<Eye size={13} color={T.text3} />}
                label="حجم الخط"
                description="تغيير حجم النصوص في الواجهة"
              >
                <SelectBox
                  value="default"
                  onChange={() => {}}
                  options={[
                    { value: 'small', label: 'صغير' },
                    { value: 'default', label: 'افتراضي' },
                    { value: 'large', label: 'كبير' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Monitor size={13} color={T.text3} />}
                label="حركات الرسوم المتحركة"
                description="تقليل الحركات لتحسين الأداء"
              >
                <Toggle checked={true} onChange={() => {}} color={T.cyan} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Chart Appearance */}
            <SectionCard
              icon={<LineChart size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title="مظهر الشارت"
              subtitle="تخصيص ألوان وأسلوب الرسم البياني"
            >
              <SettingRow
                icon={<BarChart3 size={13} color={T.text3} />}
                label="لون الشموع الصاعدة"
              >
                <div style={{ width: 24, height: 16, borderRadius: 4, background: T.green, border: `1px solid ${T.border}` }} />
              </SettingRow>
              <SettingRow
                icon={<BarChart3 size={13} color={T.text3} />}
                label="لون الشموع الهابطة"
              >
                <div style={{ width: 24, height: 16, borderRadius: 4, background: T.red, border: `1px solid ${T.border}` }} />
              </SettingRow>
              <SettingRow
                icon={<Eye size={13} color={T.text3} />}
                label="خطوط الشبكة"
                description="عرض خطوط الشبكة على الشارت"
              >
                <Toggle checked={true} onChange={() => {}} color={T.blue} size="sm" />
              </SettingRow>
            </SectionCard>
          </>
        )}

        {/* ═══ Security Tab ═══ */}
        {activeTab === 'security' && (
          <>
            <SectionCard
              icon={<Shield size={18} color={T.green} />}
              iconColor={T.green}
              iconBg={`${T.green}14`}
              title="المصادقة الثنائية"
              subtitle="حماية إضافية لحسابك"
            >
              <SettingRow
                icon={<Smartphone size={13} color={T.text3} />}
                label="مصادقة التطبيق (TOTP)"
                description="استخدم تطبيق مصادقة مثل Google Authenticator"
              >
                <button style={{
                  padding: '5px 12px', borderRadius: 8,
                  background: `${T.green}12`, border: `1px solid ${T.green}25`,
                  color: T.green, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                }}>تفعيل</button>
              </SettingRow>
              <SettingRow
                icon={<Fingerprint size={13} color={T.text3} />}
                label="مفاتيح المرور (Passkeys)"
                description="مصادقة بيومترية بدون كلمة مرور — WebAuthn"
              >
                <span style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', color: T.text3,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>قريباً</span>
              </SettingRow>
            </SectionCard>

            <SectionCard
              icon={<Lock size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title="أمان الجلسة"
              subtitle="إدارة جلساتك النشطة"
            >
              <SettingRow
                icon={<Clock size={13} color={T.text3} />}
                label="مدة الجلسة"
                description="الفترة قبل طلب إعادة تسجيل الدخول"
              >
                <SelectBox
                  value="30d"
                  onChange={() => {}}
                  options={[
                    { value: '1h', label: 'ساعة واحدة' },
                    { value: '24h', label: '24 ساعة' },
                    { value: '7d', label: '7 أيام' },
                    { value: '30d', label: '30 يوم' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<RefreshCw size={13} color={T.green} />}
                label="تجديد تلقائي للجلسة"
                description="تمديد الجلسة تلقائياً أثناء النشاط"
              >
                <Toggle checked={true} onChange={() => {}} color={T.green} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Wifi size={13} color={T.text3} />}
                label="إنهاء جميع الجلسات الأخرى"
                description="تسجيل الخروج من جميع الأجهزة باستثناء هذا"
              >
                <button
                  onClick={handleKillOtherSessions}
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.20)',
                    color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                  }}
                >إنهاء</button>
              </SettingRow>
            </SectionCard>

            {/* Active Sessions */}
            <SectionCard
              icon={<Monitor size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title="الجلسات النشطة"
              subtitle="الأجهزة المتصلة بحسابك حالياً"
            >
              <div style={{ padding: '8px 0' }}>
                {sessions.map(session => (
                  <div key={session.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    background: session.current ? 'rgba(0,212,255,0.04)' : 'transparent',
                    border: `1px solid ${session.current ? 'rgba(0,212,255,0.10)' : T.border}`,
                    marginBottom: 8,
                  }}>
                    <Monitor size={16} color={session.current ? T.cyan : T.text3} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {session.device}
                        {session.current && (
                          <span style={{
                            fontSize: 8, padding: '1px 6px', borderRadius: 6,
                            background: `${T.cyan}12`, color: T.cyan,
                            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                          }}>الحالية</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: T.text4 }}>آخر نشاط: {session.lastActive}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              icon={<AlertTriangle size={18} color={T.red} />}
              iconColor={T.red}
              iconBg={`${T.red}10`}
              title="رمز الحماية من التصيد"
              subtitle="كلمة سر تظهر في كل إشعار من رؤى للتأكد من أنه حقيقي"
            >
              <SettingRow
                icon={<Shield size={13} color={T.amber} />}
                label="تفعيل رمز مكافحة التصيد"
                description="يظهر رمزك السري في كل رسالة من المنصة"
              >
                <span style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', color: T.text3,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>قريباً</span>
              </SettingRow>
            </SectionCard>
          </>
        )}

        {/* ═══ Data & Privacy Tab ═══ */}
        {activeTab === 'data' && (
          <>
            <SectionCard
              icon={<Database size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title="بياناتك"
              subtitle="إدارة بياناتك الشخصية وتنزيلها"
            >
              <SettingRow
                icon={<Download size={13} color={T.cyan} />}
                label="تنزيل بياناتك"
                description="احصل على نسخة من جميع بياناتك بصيغة JSON"
              >
                <button
                  onClick={handleDataExport}
                  disabled={dataExportLoading}
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    background: `${T.cyan}12`, border: `1px solid ${T.cyan}25`,
                    color: T.cyan, fontSize: 11, fontWeight: 700, cursor: dataExportLoading ? 'wait' : 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                    display: 'flex', alignItems: 'center', gap: 4,
                    opacity: dataExportLoading ? 0.6 : 1,
                  }}
                >
                  {dataExportLoading ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                  {dataExportLoading ? 'جارٍ التحضير...' : 'تنزيل'}
                </button>
              </SettingRow>
              <SettingRow
                icon={<Upload size={13} color={T.text3} />}
                label="استيراد الإعدادات"
                description="استعادة إعداداتك من ملف تصدير سابق"
              >
                <span style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', color: T.text3,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>قريباً</span>
              </SettingRow>
            </SectionCard>

            <SectionCard
              icon={<Eye size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title="الخصوصية"
              subtitle="تحكم في كيفية استخدام بياناتك"
            >
              <SettingRow
                icon={<Activity size={13} color={T.text3} />}
                label="التحليلات والاستخدام"
                description="مساعدتنا في تحسين المنصة من خلال مشاركة بيانات الاستخدام المجهولة"
              >
                <Toggle checked={analyticsEnabled} onChange={() => setAnalyticsEnabled(!analyticsEnabled)} color={T.cyan} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<AlertTriangle size={13} color={T.text3} />}
                label="تقارير الأعطال"
                description="إرسال تقارير الأعطال تلقائياً لمساعدتنا في إصلاح المشاكل"
              >
                <Toggle checked={crashReports} onChange={() => setCrashReports(!crashReports)} color={T.green} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Shield size={13} color={T.text3} />}
                label="وضع التخفي"
                description="إخفاء أرصدة ومبالغ المحفظة في الواجهة"
              >
                <Toggle checked={false} onChange={() => {}} color={T.purple} size="sm" />
              </SettingRow>
            </SectionCard>

            <SectionCard
              icon={<CreditCard size={18} color={T.purple} />}
              iconColor={T.purple}
              iconBg={`${T.purple}14`}
              title="التخزين المؤقت"
              subtitle="إدارة البيانات المخزنة محلياً"
            >
              <SettingRow
                icon={<Database size={13} color={T.text3} />}
                label="مسح التخزين المؤقت"
                description="حذف البيانات المؤقتة المحفوظة في المتصفح"
              >
                <button
                  onClick={() => {
                    localStorage.removeItem('roua_auth_cache')
                    localStorage.removeItem('roua_auth_cache_time')
                  }}
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.20)',
                    color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                  }}
                >مسح</button>
              </SettingRow>
              <SettingRow
                icon={<Clock size={13} color={T.text3} />}
                label="مدة التخزين المؤقت"
                description="المدة قبل إعادة جلب البيانات من الخادم"
              >
                <SelectBox
                  value="5m"
                  onChange={() => {}}
                  options={[
                    { value: '1m', label: 'دقيقة' },
                    { value: '5m', label: '5 دقائق' },
                    { value: '15m', label: '15 دقيقة' },
                    { value: '1h', label: 'ساعة' },
                  ]}
                  small
                />
              </SettingRow>
            </SectionCard>
          </>
        )}

      </div>
    </div>
  )
}
