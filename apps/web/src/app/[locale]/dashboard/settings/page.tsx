'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from '@/i18n/navigation'
import {
  Settings, Shield, Key, Bell, User, Palette, Moon, Sun,
  Mail, Eye, Volume2, Bot, Brain, Radar, BarChart3,
  ChevronLeft, Globe, Zap, Clock, Target, LineChart,
  AlertTriangle, Fingerprint, Lock, Smartphone, Database,
  TrendingUp, Cpu, MessageSquare, Activity, Sliders,
  CheckCircle2, ExternalLink, LogOut, UserCircle, Monitor,
  Wifi, Trash2, Download, Upload, RefreshCw, CreditCard,
  Crown, Star, Sparkles, Send, Filter, Zap, Bot
} from 'lucide-react'
import { SmartExecutorTab } from './tabs/SmartExecutorTab'
import { AutonomousAgentTab } from './tabs/AutonomousAgentTab'
import { AICouncilTab } from './tabs/AICouncilTab'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAuthStore } from '@/lib/auth-store'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { hasPermission, getPermissions, ROLE_INFO, type Role, type Permission } from '@/lib/permissions'
import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'

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
        outline: 'none', cursor: 'pointer',
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
   V126: Active Trading Account Selector
   The user chooses which account the executor and agent trade on.
   This is saved to user settings (key: activeCredentialId).
══════════════════════════════════════════════════════ */
function ActiveAccountSelector() {
  const t = useTranslations('dashboard.settings')
  const tc = useTranslations('common')
  const [credentials, setCredentials] = useState<any[]>([])
  const [activeCredentialId, setActiveCredentialId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load credentials and active selection
  useEffect(() => {
    Promise.all([
      fetch('/api/portfolio/credentials').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/settings').then(r => r.json()).catch(() => ({ settings: {} })),
    ]).then(([credData, settingsData]) => {
      if (credData?.success && Array.isArray(credData.data)) {
        // Show ALL valid credentials (real, testnet, paper)
        setCredentials(credData.data.filter((c: any) => c.isValid))
      }
      if (settingsData?.settings?.activeCredentialId) {
        setActiveCredentialId(settingsData.settings.activeCredentialId)
      }
      setLoading(false)
    })
  }, [])

  const saveActiveAccount = async (credentialId: string) => {
    setSaving(true)
    setActiveCredentialId(credentialId)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { activeCredentialId: credentialId } }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('[Settings] Failed to save activeCredentialId:', res.status, err)
        // إعادة المحاولة مرة واحدة
        await new Promise(r => setTimeout(r, 500))
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: { activeCredentialId: credentialId } }),
        })
      }
    } catch (e) {
      console.error('[Settings] saveActiveAccount error:', e)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ padding: '12px 0', textAlign: 'center', color: T.text3, fontSize: 11 }}>
        {t('loadingAccounts')}
      </div>
    )
  }

  if (credentials.length === 0) {
    return (
      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: T.text3, marginBottom: 8 }}>
          {t('noLinkedAccounts')}
        </div>
        <button
          onClick={() => window.location.href = '/dashboard/settings/exchange'}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: 'rgba(0,212,255,0.08)', border: `1px solid rgba(0,212,255,0.2)`,
            color: T.cyan, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          {t('linkExchange')}
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Info banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10,
        background: 'rgba(0,212,255,0.04)', border: `1px solid rgba(0,212,255,0.10)`,
        marginBottom: 12,
      }}>
        <Shield size={16} color={T.cyan} />
        <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
          {t('accountSelectorBanner')}
        </div>
      </div>

      {/* Account cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {credentials.map((cred: any) => {
          const isActive = activeCredentialId === cred.id
          const isTestnet = cred.testnet || cred.exchange?.includes('test') || cred.exchange?.includes('Testnet')
          const isPaper = cred.exchange === 'paper-trading'

          let typeLabel: string = t('real')
          let typeColor: string = T.green
          let typeIcon: string = '💰'
          if (isPaper) {
            typeLabel = t('paper')
            typeColor = T.cyan
            typeIcon = '📝'
          } else if (isTestnet) {
            typeLabel = t('testnet')
            typeColor = T.amber
            typeIcon = '🧪'
          }

          return (
            <button
              key={cred.id}
              onClick={() => saveActiveAccount(cred.id)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: isActive ? `1px solid ${typeColor}40` : `1px solid ${T.border}`,
                background: isActive ? `${typeColor}08` : T.surface,
                cursor: saving ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: isActive ? `0 0 12px ${typeColor}10` : 'none',
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {/* Account type indicator */}
              <span style={{ fontSize: 16 }}>{typeIcon}</span>

              {/* Account info */}
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? typeColor : T.text, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                  {cred.label || cred.exchange}
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 4,
                    background: `${typeColor}15`, color: typeColor,
                    fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {typeLabel}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: T.text4, marginTop: 2 }}>
                  {cred.exchange} {cred.lastValidatedAt ? `• ${t('lastVerified')}: ${new Date(cred.lastValidatedAt).toLocaleDateString()}` : ''}
                </div>
              </div>

              {/* Active indicator */}
              {isActive && (
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: typeColor,
                  boxShadow: `0 0 8px ${typeColor}60`,
                  animation: 'agentCtrlPulse 2s ease-in-out infinite',
                }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main Settings Page
══════════════════════════════════════════════════════ */
export default function SettingsPage() {
  useScopedStyle(`@media (max-width: 767px) {
          .settings-tabs { flex-wrap: wrap !important; gap: 4px !important; }
          .settings-tabs button { padding: 6px 10px !important; font-size: 10px !important; }
          .settings-content { padding: 12px !important; }
          .settings-profile-row { flex-direction: column !important; text-align: center !important; }
          .perm-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }`)

  const t = useTranslations('dashboard.settings')
  const tc = useTranslations('common')
  const router = useRouter()
  const user = useAuthStore(state => state.user)
  const authLogout = useAuthStore(state => state.logout)
  const { settings, updateSettings } = useNotificationStore()
  const mode = useDashboardStore(state => state.mode)
  const setMode = useDashboardStore(state => state.setMode)
  const [isDark, setIsDark] = useState(true)
  const [activeTab, setActiveTab] = useState('account')
  const currentLocale = useLocale()

  // Trading preferences
  const [orderSize, setOrderSize] = useState('5')
  const [riskLevel, setRiskLevel] = useState('medium')

  // Risk management settings (user-controlled)
  const [userStopLoss, setUserStopLoss] = useState('2')
  const [userTakeProfit, setUserTakeProfit] = useState('4')
  const [userRiskPerTrade, setUserRiskPerTrade] = useState('1')
  const [userMaxDailyLoss, setUserMaxDailyLoss] = useState('5')
  const [userMaxOpenPositions, setUserMaxOpenPositions] = useState('15')  // V143: Changed from '5' to '15'
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

  // AI Monitoring Features
  const [continuousMonitoringEnabled, setContinuousMonitoringEnabled] = useState(false)
  const [monitoringInterval, setMonitoringInterval] = useState('5m')
  const [monitoringPairs, setMonitoringPairs] = useState('BTC/USDT,ETH/USDT,SOL/USDT')
  const [entryExitSignalsEnabled, setEntryExitSignalsEnabled] = useState(false)
  const [signalMinConfidence, setSignalMinConfidence] = useState('75')
  const [signalAlertMethod, setSignalAlertMethod] = useState('both')
  const [riskAlertsEnabled, setRiskAlertsEnabled] = useState(true)
  const [volatilityThreshold, setVolatilityThreshold] = useState('3')
  const [riskAlertTypes, setRiskAlertTypes] = useState('all')
  const [sentimentEnabled, setSentimentEnabled] = useState(false)
  const [sentimentSources, setSentimentSources] = useState('all')
  const [sentimentSensitivity, setSentimentSensitivity] = useState('medium')

  // Feature 2: Advanced Strategy Settings
  const [scalpingTimeframe, setScalpingTimeframe] = useState('5m')
  const [scalpingTakeProfitPips, setScalpingTakeProfitPips] = useState('15')
  const [scalpingStopLossPips, setScalpingStopLossPips] = useState('10')
  const [scalpingMaxSpread, setScalpingMaxSpread] = useState('3')
  const [gridLevels, setGridLevels] = useState('5')

  // Feature 3: Telegram/Discord Notifications
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('')
  const [externalNotificationsEnabled, setExternalNotificationsEnabled] = useState(false)
  const [doNotDisturb, setDoNotDisturb] = useState(false)
  const [emergencyOnly, setEmergencyOnly] = useState(false)

  // Feature 4: Pair Whitelist/Blacklist
  const [pairFilterMode, setPairFilterMode] = useState('all')
  const [pairWhitelist, setPairWhitelist] = useState('')
  const [pairBlacklist, setPairBlacklist] = useState('')

  // Feature 5: Trading Schedule
  const [tradingScheduleEnabled, setTradingScheduleEnabled] = useState(false)
  const [tradingScheduleStart, setTradingScheduleStart] = useState('09:00')
  const [tradingScheduleEnd, setTradingScheduleEnd] = useState('17:00')
  const [tradingScheduleDays, setTradingScheduleDays] = useState('1,2,3,4,5')

  // Data & privacy
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)
  const [crashReports, setCrashReports] = useState(true)
  const [dataExportLoading, setDataExportLoading] = useState(false)

  // V189: Real appearance settings (persisted to localStorage)
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === 'undefined') return 'default'
    return localStorage.getItem('roua_font_size') || 'default'
  })
  const [animationsEnabled, setAnimationsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('roua_animations')
    return stored !== null ? stored === 'true' : true
  })
  const [gridLinesEnabled, setGridLinesEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('roua_grid_lines')
    return stored !== null ? stored === 'true' : true
  })
  const [stealthMode, setStealthMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('roua_stealth_mode') === 'true'
  })

  // Security features
  const [sessionDuration, setSessionDuration] = useState('24h')
  const [autoSessionRenewal, setAutoSessionRenewal] = useState(true)
  const [antiPhishingEnabled, setAntiPhishingEnabled] = useState(false)
  const [antiPhishingCode, setAntiPhishingCode] = useState('')
  const [passkeysEnabled, setPasskeysEnabled] = useState(false)

  // Data features
  const [cacheDuration, setCacheDuration] = useState('5m')
  const [importLoading, setImportLoading] = useState(false)

  // Delete account dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Sessions — V189: Real session data from API
  const [sessions, setSessions] = useState<Array<{ id: string; device: string; deviceInfo: any; lastActive: string; current: boolean; maskedIp: string | null; createdAt: string; expiresAt: string }>>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [killLoading, setKillLoading] = useState(false)

  // ─── V189: Persist appearance settings to localStorage ───
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('roua_font_size', fontSize)
    const scale = fontSize === 'small' ? '0.9' : fontSize === 'large' ? '1.1' : '1'
    document.documentElement.style.setProperty('--roua-font-scale', scale)
  }, [fontSize])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('roua_animations', String(animationsEnabled))
    if (animationsEnabled) {
      document.documentElement.classList.remove('roua-reduced-motion')
    } else {
      document.documentElement.classList.add('roua-reduced-motion')
    }
  }, [animationsEnabled])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('roua_grid_lines', String(gridLinesEnabled))
  }, [gridLinesEnabled])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('roua_stealth_mode', String(stealthMode))
    if (stealthMode) {
      document.documentElement.classList.add('roua-stealth')
    } else {
      document.documentElement.classList.remove('roua-stealth')
    }
  }, [stealthMode])

  // ─── V189: Dark mode persistence ───
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('roua_dark_mode', String(isDark))
    if (isDark) {
      document.documentElement.classList.add('dark')
      document.documentElement.style.colorScheme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.style.colorScheme = 'light'
    }
  }, [isDark])

  // Initialize dark mode from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('roua_dark_mode')
    if (stored !== null) {
      setIsDark(stored === 'true')
    }
  }, [])

  // ─── Settings persistence: Load from API on mount ───
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data?.settings && typeof data.settings === 'object') {
          const s = data.settings
          if (s.orderSize) setOrderSize(s.orderSize)
          if (s.riskLevel) setRiskLevel(s.riskLevel)
          if (s.userStopLoss) setUserStopLoss(s.userStopLoss)
          if (s.userTakeProfit) setUserTakeProfit(s.userTakeProfit)
          if (s.userRiskPerTrade) setUserRiskPerTrade(s.userRiskPerTrade)
          if (s.userMaxDailyLoss) setUserMaxDailyLoss(s.userMaxDailyLoss)
          if (s.userMaxOpenPositions) setUserMaxOpenPositions(s.userMaxOpenPositions)
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
          // Feature 2: Advanced Strategy Settings
          if (s.scalpingTimeframe) setScalpingTimeframe(s.scalpingTimeframe)
          if (s.scalpingTakeProfitPips) setScalpingTakeProfitPips(String(s.scalpingTakeProfitPips))
          if (s.scalpingStopLossPips) setScalpingStopLossPips(String(s.scalpingStopLossPips))
          if (s.scalpingMaxSpread) setScalpingMaxSpread(String(s.scalpingMaxSpread))
          if (s.gridLevels) setGridLevels(String(s.gridLevels))
          // Feature 3: Telegram/Discord
          if (s.telegramBotToken) setTelegramBotToken(s.telegramBotToken)
          if (s.telegramChatId) setTelegramChatId(s.telegramChatId)
          if (s.discordWebhookUrl) setDiscordWebhookUrl(s.discordWebhookUrl)
          if (s.externalNotificationsEnabled !== undefined) setExternalNotificationsEnabled(s.externalNotificationsEnabled)
          if (s.doNotDisturb !== undefined) setDoNotDisturb(s.doNotDisturb)
          if (s.emergencyOnly !== undefined) setEmergencyOnly(s.emergencyOnly)
          // Feature 4: Pair Filter
          if (s.pairFilterMode) setPairFilterMode(s.pairFilterMode)
          if (s.pairWhitelist) setPairWhitelist(s.pairWhitelist)
          if (s.pairBlacklist) setPairBlacklist(s.pairBlacklist)
          // Feature 5: Trading Schedule
          if (s.tradingScheduleEnabled !== undefined) setTradingScheduleEnabled(s.tradingScheduleEnabled)
          if (s.tradingScheduleStart) setTradingScheduleStart(s.tradingScheduleStart)
          if (s.tradingScheduleEnd) setTradingScheduleEnd(s.tradingScheduleEnd)
          if (s.tradingScheduleDays) setTradingScheduleDays(s.tradingScheduleDays)
          // AI Monitoring Features
          if (s.continuousMonitoringEnabled !== undefined) setContinuousMonitoringEnabled(s.continuousMonitoringEnabled)
          if (s.monitoringInterval) setMonitoringInterval(s.monitoringInterval)
          if (s.monitoringPairs) setMonitoringPairs(s.monitoringPairs)
          if (s.entryExitSignalsEnabled !== undefined) setEntryExitSignalsEnabled(s.entryExitSignalsEnabled)
          if (s.signalMinConfidence) setSignalMinConfidence(String(s.signalMinConfidence))
          if (s.signalAlertMethod) setSignalAlertMethod(s.signalAlertMethod)
          if (s.riskAlertsEnabled !== undefined) setRiskAlertsEnabled(s.riskAlertsEnabled)
          if (s.volatilityThreshold) setVolatilityThreshold(String(s.volatilityThreshold))
          if (s.riskAlertTypes) setRiskAlertTypes(s.riskAlertTypes)
          if (s.sentimentEnabled !== undefined) setSentimentEnabled(s.sentimentEnabled)
          if (s.sentimentSources) setSentimentSources(s.sentimentSources)
          if (s.sentimentSensitivity) setSentimentSensitivity(s.sentimentSensitivity)
          // Security features
          if (s.sessionDuration) setSessionDuration(s.sessionDuration)
          if (s.autoSessionRenewal !== undefined) setAutoSessionRenewal(s.autoSessionRenewal)
          if (s.antiPhishingEnabled !== undefined) setAntiPhishingEnabled(s.antiPhishingEnabled)
          if (s.antiPhishingCode) setAntiPhishingCode(s.antiPhishingCode)
          if (s.passkeysEnabled !== undefined) setPasskeysEnabled(s.passkeysEnabled)
          // Data features
          if (s.cacheDuration) setCacheDuration(s.cacheDuration)
        }
        setSettingsLoaded(true)
      })
      .catch(() => {
        // V311: DON'T set settingsLoaded=true on failure.
        // Previously, this set settingsLoaded=true, which then triggered
        // the auto-save effect, which sent ALL default values to the API,
        // overwriting the user's saved settings with defaults.
        // Now: leave settingsLoaded=false so auto-save is blocked.
        // User will see default values but they won't be persisted.
        setSettingsLoaded(false)
      })
  }, [])

  // ─── Settings persistence: Save to API on change (debounced) ───
  // V311: Added save status indicator + error feedback
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSettings = useCallback(() => {
    if (!settingsLoaded) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: {
              orderSize, riskLevel, chartType, timeframe,
              confirmTrades, showPositions, autoStopLoss, trailingStop,
              aiConfidence, aiAutoTrade, aiModel,
              analyticsEnabled, crashReports,
              userStopLoss, userTakeProfit, userRiskPerTrade, userMaxDailyLoss, userMaxOpenPositions,
              // Feature 2: Advanced Strategy Settings
              scalpingTimeframe, scalpingTakeProfitPips, scalpingStopLossPips, scalpingMaxSpread, gridLevels,
              // Feature 3: Telegram/Discord
              telegramBotToken, telegramChatId, discordWebhookUrl, externalNotificationsEnabled, doNotDisturb, emergencyOnly,
              // Feature 4: Pair Filter
              pairFilterMode, pairWhitelist, pairBlacklist,
              // Feature 5: Trading Schedule
              tradingScheduleEnabled, tradingScheduleStart, tradingScheduleEnd, tradingScheduleDays,
              // AI Monitoring Features
              continuousMonitoringEnabled, monitoringInterval, monitoringPairs,
              entryExitSignalsEnabled, signalMinConfidence, signalAlertMethod,
              riskAlertsEnabled, volatilityThreshold, riskAlertTypes,
              sentimentEnabled, sentimentSources, sentimentSensitivity,
              // Security features
              sessionDuration, autoSessionRenewal, antiPhishingEnabled, antiPhishingCode, passkeysEnabled,
              // Data features
              cacheDuration,
            },
          }),
        })
        if (res.ok) {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } else {
          const errData = await res.json().catch(() => ({}))
          console.error('[Settings] Save failed:', res.status, errData?.error || errData?.details)
          setSaveStatus('error')
        }
      } catch (err) {
        console.error('[Settings] Save network error:', err)
        setSaveStatus('error')
      }
    }, 2000) // Debounce: save 2s after last change
  }, [settingsLoaded, orderSize, riskLevel, chartType, timeframe, confirmTrades, showPositions, autoStopLoss, trailingStop, aiConfidence, aiAutoTrade, aiModel, analyticsEnabled, crashReports, userStopLoss, userTakeProfit, userRiskPerTrade, userMaxDailyLoss, userMaxOpenPositions, scalpingTimeframe, scalpingTakeProfitPips, scalpingStopLossPips, scalpingMaxSpread, gridLevels, telegramBotToken, telegramChatId, discordWebhookUrl, externalNotificationsEnabled, doNotDisturb, emergencyOnly, pairFilterMode, pairWhitelist, pairBlacklist, tradingScheduleEnabled, tradingScheduleStart, tradingScheduleEnd, tradingScheduleDays, continuousMonitoringEnabled, monitoringInterval, monitoringPairs, entryExitSignalsEnabled, signalMinConfidence, signalAlertMethod, riskAlertsEnabled, volatilityThreshold, riskAlertTypes, sentimentEnabled, sentimentSources, sentimentSensitivity, sessionDuration, autoSessionRenewal, antiPhishingEnabled, antiPhishingCode, passkeysEnabled, cacheDuration])

  // Auto-save on any settings change
  useEffect(() => {
    saveSettings()
  }, [saveSettings])

  // V311: Save on beforeunload — prevent data loss if user closes tab during debounce
  useEffect(() => {
    const handler = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        // Fire-and-forget synchronous save attempt
        // (may not complete, but better than losing the setting entirely)
        navigator.sendBeacon('/api/settings', JSON.stringify({
          settings: { orderSize, riskLevel, chartType, timeframe }
        }))
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [orderSize, riskLevel, chartType, timeframe])

  const userTier = (user?.tier || 'FREE') as Role
  const roleInfo = ROLE_INFO[userTier] || ROLE_INFO.FREE
  const userPermissions = getPermissions(userTier)

  // V189: Fetch real active sessions from API
  useEffect(() => {
    if (activeTab === 'security') {
      setSessionsLoading(true)
      fetch('/api/auth/sessions')
        .then(r => r.json())
        .then(data => {
          if (data?.sessions && Array.isArray(data.sessions)) {
            setSessions(data.sessions.map((s: any) => ({
              id: s.id,
              device: s.isCurrent ? t('thisDevice') : (s.device?.browser || s.device?.os || s.userAgent?.split(' ').pop() || t('unknownDevice')),
              deviceInfo: s.device,
              lastActive: new Date(s.lastActive).toLocaleString(),
              current: s.isCurrent,
              maskedIp: s.maskedIp,
              createdAt: s.createdAt,
              expiresAt: s.expiresAt,
            })))
          } else {
            // Fallback for guest or error
            setSessions([])
          }
        })
        .catch(() => setSessions([]))
        .finally(() => setSessionsLoading(false))
    }
  }, [activeTab])

  // V189: Real data export — fetches actual trading data from API
  const handleDataExport = async () => {
    setDataExportLoading(true)
    try {
      const [settingsRes, positionsRes, tradesRes] = await Promise.allSettled([
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/trading/positions').then(r => r.json()).catch(() => ({})),
        fetch('/api/trading/account').then(r => r.json()).catch(() => ({})),
      ])
      const settingsData = settingsRes.status === 'fulfilled' ? settingsRes.value : {}
      const positionsData = positionsRes.status === 'fulfilled' ? positionsRes.value : {}
      const accountData = tradesRes.status === 'fulfilled' ? tradesRes.value : {}
      const data = {
        user: { id: user?.id, email: user?.email, displayName: user?.displayName, tier: user?.tier },
        exportDate: new Date().toISOString(),
        platform: 'ROUA Trading',
        version: 'V311',
        // V311: Filter out secrets from export — telegramBotToken, telegramChatId,
        // discordWebhookUrl are sensitive. If user shares export file with support,
        // these would leak. Replace with masked versions.
        settings: (() => {
          const s = { ...(settingsData?.settings || {}) }
          if (s.telegramBotToken) s.telegramBotToken = s.telegramBotToken.slice(0, 5) + '***'
          if (s.telegramChatId) s.telegramChatId = '***'
          if (s.discordWebhookUrl) s.discordWebhookUrl = '***'
          return s
        })(),
        positions: positionsData?.positions || [],
        account: accountData || {},
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roua-data-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[Settings] Data export failed:', err)
    } finally {
      setDataExportLoading(false)
    }
  }

  // V189: Real session termination — calls DELETE /api/auth/sessions
  const handleKillOtherSessions = async () => {
    setKillLoading(true)
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revokeOthers: true }), // V311: revokeOthers, not revokeAll
      })
      const data = await res.json()
      if (data.success) {
        // Refresh sessions list after killing
        setSessions(prev => prev.filter(s => s.current))
      }
    } catch (err) {
      console.error('[Settings] Failed to kill sessions:', err)
    } finally {
      setKillLoading(false)
    }
  }

  const tabs = [
    { id: 'account', label: t('tabAccount'), icon: <User size={14} /> },
    { id: 'subscription', label: t('tabSubscription'), icon: <Crown size={14} /> },
    { id: 'trading', label: t('tabTrading'), icon: <BarChart3 size={14} /> },
    // V312: New dedicated tabs for trading automation
    { id: 'smart-executor', label: 'Smart Executor', icon: <Zap size={14} /> },
    { id: 'autonomous-agent', label: 'Autonomous Agent', icon: <Bot size={14} /> },
    { id: 'ai-council', label: 'AI Council', icon: <Brain size={14} /> },
    { id: 'notifications', label: t('tabNotifications'), icon: <Bell size={14} /> },
    { id: 'ai', label: t('tabAI'), icon: <Brain size={14} /> },
    { id: 'appearance', label: t('tabAppearance'), icon: <Palette size={14} /> },
    { id: 'security', label: t('tabSecurity'), icon: <Shield size={14} /> },
    { id: 'data', label: t('tabData'), icon: <Database size={14} /> },
  ]

  // Permission categories for display
  const permissionCategories = [
    { name: t('tabLinking'), perms: [
      { perm: 'trade:view' as Permission, label: t('permViewTrading') },
      { perm: 'trade:execute' as Permission, label: t('permExecuteTrades') },
      { perm: 'trade:paper' as Permission, label: t('demoView') },
    ]},
    { name: t('tabAI'), perms: [
      { perm: 'ai:insights' as Permission, label: t('permAiInsights') },
      { perm: 'ai:auto_trade' as Permission, label: t('permAutoFollow') },
      { perm: 'ai:scanner' as Permission, label: t('permSmartScanner') },
      { perm: 'ai:advanced_models' as Permission, label: t('permAdvancedModels') },
    ]},
    { name: t('permPortfolioSocial'), perms: [
      { perm: 'portfolio:view' as Permission, label: t('permViewPortfolio') },
      { perm: 'portfolio:advanced' as Permission, label: t('permAdvancedAnalysis') },
      { perm: 'social:view' as Permission, label: t('permFollowAccounts') },
      { perm: 'social:follow_accounts' as Permission, label: t('permFollowAccounts') },
    ]},
    { name: t('permApiData'), perms: [
      { perm: 'api:access' as Permission, label: t('permApiAccess') },
      { perm: 'api:webhooks' as Permission, label: t('permWebhooks') },
      { perm: 'data:real_time' as Permission, label: t('liveData') },
      { perm: 'data:historical' as Permission, label: t('permHistoricalData') },
      { perm: 'data:export' as Permission, label: t('exportData') },
    ]},
  ]

  return (
    <div className="custom-scrollbar" style={{ fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto', background: T.bg }}>
      {/* Scoped styles via useScopedStyle */}{/* Header */}
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
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text }}>{t('title')}</h1>
            <p style={{ margin: 0, fontSize: 11, color: T.text3 }}>{t('subtitle')}</p>
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
                  {user?.displayName || t('defaultUserName')}
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
                    {tc(roleInfo.labelKey)}
                  </span>
                  <span style={{ fontSize: 10, color: T.text4 }}>{tc(roleInfo.descriptionKey)}</span>
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
                {tc('accountInfo')}
              </button>
            </div>

            {/* Exchange API Keys */}
            <SectionCard
              icon={<Key size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title={t("apiKeysTitle")}
              subtitle={t("apiKeysSubtitle")}
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
                    {t('apiKeysSecurityInfo')}
                    <span style={{ color: T.red, fontWeight: 600 }}> {t('withdrawKeysRejected')}</span>
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
                  {t('manageApiKeys')}
                  <ChevronLeft size={14} style={{ transform: 'scaleX(-1)' }} />
                </button>
                {/* V311: Link to EA Bridge page (was orphaned — no link existed) */}
                <button
                  onClick={() => router.push('/dashboard/settings/ea-bridge')}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    border: `1px dashed ${T.border2}`, background: 'transparent',
                    color: T.purple, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s', marginTop: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(179,136,255,0.04)'; e.currentTarget.style.borderColor = T.purple }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T.border2 }}
                >
                  <Cpu size={16} />
                  MT5 EA Bridge
                  <ChevronLeft size={14} style={{ transform: 'scaleX(-1)' }} />
                </button>
              </div>
            </SectionCard>

            {/* Account Info */}
            <SectionCard
              icon={<Database size={18} color={T.blue} />}
              iconColor={T.blue}
              iconBg={`${T.blue}14`}
              title={t("accountInfo")}
              subtitle={t("accountInfoSubtitle")}
            >
              <SettingRow
                icon={<User size={13} color={T.text3} />}
                label={t("userId")}
                description={user?.id || '—'}
              >
                <span style={{ fontSize: 10, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                  {user?.id?.slice(0, 12) || '—'}...
                </span>
              </SettingRow>
              <SettingRow
                icon={<TrendingUp size={13} color={T.text3} />}
                label={t("subscriptionLevel")}
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
                label={t("sessionStatus")}
              >
                <span style={{ fontSize: 11, color: T.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green, boxShadow: `0 0 6px ${T.green}60` }} />
                  {t('activeAutoRenew')}
                </span>
              </SettingRow>
              {/* V311: Removed duplicate autoSessionRenewal from Account tab.
                  It's already in the Security tab with a better description. */}
            </SectionCard>

            {/* Danger Zone */}
            <div style={{
              border: `1px solid rgba(255,71,87,0.15)`, borderRadius: 16,
              background: 'rgba(255,71,87,0.02)', overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid rgba(255,71,87,0.10)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle size={16} color={T.red} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.red }}>{t('dangerZone')}</span>
                </div>
              </div>
              <div style={{ padding: '8px 20px 16px' }}>
                <SettingRow
                  icon={<LogOut size={13} color={T.red} />}
                  label={t("logout")}
                  description={t("logoutDesc")}
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
                    {tc('logout')}
                  </button>
                </SettingRow>
                <SettingRow
                  icon={<Trash2 size={13} color={T.red} />}
                  label={t("deleteAccount")}
                  description={t("deleteAccountDesc")}
                >
                  <button
                    onClick={() => setShowDeleteDialog(true)}
                    style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: 'rgba(255,71,87,0.10)', border: '1px solid rgba(255,71,87,0.25)',
                      color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                    }}
                  >
                    {t('deleteAccount')}
                  </button>
                </SettingRow>
              </div>
              {/* Delete Account Confirmation Dialog */}
              {showDeleteDialog && (
                <div style={{
                  padding: '16px 20px', borderTop: `1px solid rgba(255,71,87,0.15)`,
                  background: 'rgba(255,71,87,0.03)',
                }}>
                  <div style={{ fontSize: 12, color: T.text2, marginBottom: 10, lineHeight: 1.6 }}>
                    {t('deleteAccountWarning')}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>
                      {t('typeToConfirm')} &quot;DELETE&quot;
                    </div>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="DELETE"
                      style={{
                        width: '100%', padding: '6px 10px', borderRadius: 8,
                        background: T.surface, border: `1px solid rgba(255,71,87,0.20)`,
                        color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                        outline: 'none', direction: 'ltr',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText('') }}
                      style={{
                        padding: '6px 14px', borderRadius: 8,
                        background: T.surface, border: `1px solid ${T.border}`,
                        color: T.text3, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'Cairo', sans-serif",
                      }}
                    >
                      {tc('cancel')}
                    </button>
                    <button
                      disabled={deleteConfirmText !== 'DELETE'}
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/auth/delete-account', { method: 'POST' })
                          if (res.ok) { authLogout() } else { alert(t('deleteAccountError')) }
                        } catch { alert(t('deleteAccountError')) }
                        setShowDeleteDialog(false); setDeleteConfirmText('')
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: 8,
                        background: deleteConfirmText === 'DELETE' ? 'rgba(255,71,87,0.15)' : T.surface,
                        border: '1px solid rgba(255,71,87,0.25)',
                        color: T.red, fontSize: 11, fontWeight: 700,
                        cursor: deleteConfirmText === 'DELETE' ? 'pointer' : 'not-allowed',
                        fontFamily: "'Cairo', sans-serif",
                        opacity: deleteConfirmText === 'DELETE' ? 1 : 0.5,
                      }}
                    >
                      {t('deleteAccount')}
                    </button>
                  </div>
                </div>
              )}
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
                      {t('planLabel', { plan: tc(roleInfo.labelKey) })}
                      {userTier === 'FREE' && (
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 10,
                          background: `${T.cyan}12`, color: T.cyan,
                          fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                        }}>{t('upgrade')}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{tc(roleInfo.descriptionKey)}</div>
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
                          {tc(info.labelKey)}
                        </div>
                        <div style={{ fontSize: 9, color: T.text4, marginTop: 2 }}>{tc(info.descriptionKey)}</div>
                        {isActive && (
                          <div style={{
                            marginTop: 6, fontSize: 8, fontWeight: 700,
                            color: info.color, fontFamily: "'JetBrains Mono', monospace",
                          }}>{t('current')}</div>
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
              title={t('yourPermissions')}
              subtitle={t('planPermissionsCount', { plan: tc(roleInfo.labelKey), count: userPermissions.length })}
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
                  {t('unlockFullPotential')}
                </div>
                <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.8, marginBottom: 16 }}>
                  {t('upgradeProDesc')}
                </div>
                <button
                  onClick={() => router.push('/dashboard/billing')}
                  style={{
                  padding: '10px 28px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${T.cyan}, #0A84FF)`,
                  border: 'none', color: '#000', fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                  boxShadow: `0 0 20px ${T.cyan}30`,
                }}>
                  {tc('upgrade')}
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══ Trading Tab ═══ */}
        {activeTab === 'trading' && (
          <>
            {/* V126: Active Trading Account Selector */}
            <SectionCard
              icon={<Key size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title={t('activeTradingAccount')}
              subtitle={t('activeTradingAccountSubtitle')}
            >
              <ActiveAccountSelector />
            </SectionCard>

            {/* Mode Selection */}
            <SectionCard
              icon={<Zap size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title={t('tradingMode')}
              subtitle={t('tradingModeSubtitle')}
            >
              <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
                {([
                  { id: 'trader' as TradingMode, label: t('traderMode'), desc: t('quickExecution'), color: T.cyan, icon: <BarChart3 size={14} /> },
                  { id: 'investor' as TradingMode, label: t('investorMode'), desc: t('longInvestment'), color: T.green, icon: <TrendingUp size={14} /> },
                  { id: 'ai' as TradingMode, label: 'AI', desc: t('aiIntelligence'), color: T.purple, icon: <Brain size={14} /> },
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
              title={t('tradingPrefs')}
              subtitle={t('orderExecSettings')}
            >
              <SettingRow
                icon={<LineChart size={13} color={T.text3} />}
                label={t('defaultOrderSize')}
                description={t('riskPerTradeDesc')}
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
                label={t('riskLevelLabel')}
                description={t('riskLevelLabelDesc')}
              >
                <SelectBox
                  value={riskLevel}
                  onChange={setRiskLevel}
                  options={[
                    { value: 'conservative', label: t('conservative') },
                    { value: 'medium', label: t('riskMedium') },
                    { value: 'aggressive', label: t('bold') },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<CheckCircle2 size={13} color={T.text3} />}
                label={t('confirmBeforeExec')}
                description={t('confirmBeforeExecDesc')}
              >
                <Toggle checked={confirmTrades} onChange={() => setConfirmTrades(!confirmTrades)} color={T.cyan} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Eye size={13} color={T.text3} />}
                label={t('showOpenPositions')}
                description={t('showOpenPositionsDesc')}
              >
                <Toggle checked={showPositions} onChange={() => setShowPositions(!showPositions)} color={T.green} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Risk Management — User-controlled limits */}
            <SectionCard
              icon={<Shield size={18} color={T.green} />}
              iconColor={T.green}
              iconBg={`${T.green}14`}
              title={t('riskManagement')}
              subtitle={t('riskManagementSubtitle')}
            >
              <SettingRow
                icon={<Target size={13} color={T.danger} />}
                label={t('defaultStopLoss')}
                description={t('defaultStopLossDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={0.1} max={50} step={0.1}
                    value={userStopLoss}
                    onChange={e => setUserStopLoss(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                  <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>%</span>
                </div>
              </SettingRow>
              <SettingRow
                icon={<TrendingUp size={13} color={T.success} />}
                label={t('defaultTakeProfit')}
                description={t('defaultTakeProfitDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={0.1} max={100} step={0.1}
                    value={userTakeProfit}
                    onChange={e => setUserTakeProfit(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                  <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>%</span>
                </div>
              </SettingRow>
              <SettingRow
                icon={<Activity size={13} color={T.amber} />}
                label={t('riskPerTrade')}
                description={t('riskPerTradeLabelDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={0.1} max={10} step={0.1}
                    value={userRiskPerTrade}
                    onChange={e => setUserRiskPerTrade(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                  <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>%</span>
                </div>
              </SettingRow>
              <SettingRow
                icon={<AlertTriangle size={13} color={T.danger} />}
                label={t('maxDailyLoss')}
                description={t('maxDailyLossDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={1} max={50} step={0.5}
                    value={userMaxDailyLoss}
                    onChange={e => setUserMaxDailyLoss(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                  <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>%</span>
                </div>
              </SettingRow>
              <SettingRow
                icon={<BarChart3 size={13} color={T.cyan} />}
                label={t('maxOpenPositions')}
                description={t('maxOpenPositionsDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={1} max={50} step={1}
                    value={userMaxOpenPositions}
                    onChange={e => setUserMaxOpenPositions(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                </div>
              </SettingRow>
              <SettingRow
                icon={<Lock size={13} color={T.text3} />}
                label={t('autoStopLoss')}
                description={t('autoStopLossDesc')}
              >
                <Toggle checked={autoStopLoss} onChange={() => setAutoStopLoss(!autoStopLoss)} color={T.green} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Activity size={13} color={T.text3} />}
                label={t('trailingStop')}
                description={t('trailingStopDesc')}
              >
                <Toggle checked={trailingStop} onChange={() => setTrailingStop(!trailingStop)} color={T.amber} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Chart Settings */}
            <SectionCard
              icon={<LineChart size={18} color={T.purple} />}
              iconColor={T.purple}
              iconBg={`${T.purple}14`}
              title={t('chartSettings')}
              subtitle={t('chartTypeTimeframe')}
            >
              <SettingRow
                icon={<BarChart3 size={13} color={T.text3} />}
                label={t('defaultChartType')}
              >
                <SelectBox
                  value={chartType}
                  onChange={setChartType}
                  options={[
                    { value: 'candlestick', label: t('candlestick') },
                    { value: 'line', label: t('line') },
                    { value: 'area', label: t('area') },
                    { value: 'bar', label: t('bars') },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Clock size={13} color={T.text3} />}
                label={t('defaultTimeframe')}
              >
                <SelectBox
                  value={timeframe}
                  onChange={setTimeframe}
                  options={[
                    { value: '1m', label: t('oneMinute') }, { value: '5m', label: t('fiveMinutes') },
                    { value: '15m', label: t('fifteenMinutes') }, { value: '1h', label: t('hour') },
                    { value: '4h', label: t('fourHours') }, { value: '1d', label: t('daily') },
                  ]}
                  small
                />
              </SettingRow>
            </SectionCard>

            {/* Feature 4: Trading Pair Filter */}
            <SectionCard
              icon={<Filter size={18} color={T.green} />}
              iconColor={T.green}
              iconBg={`${T.green}14`}
              title={t('pairFilterTitle')}
              subtitle={t('pairFilterSubtitle')}
            >
              <SettingRow
                icon={<Filter size={13} color={T.green} />}
                label={t('pairFilterMode')}
                description={t('pairFilterModeDesc')}
              >
                <SelectBox
                  value={pairFilterMode}
                  onChange={setPairFilterMode}
                  options={[
                    { value: 'all', label: t('pairFilterAll') },
                    { value: 'whitelist', label: t('pairFilterWhitelist') },
                    { value: 'blacklist', label: t('pairFilterBlacklist') },
                  ]}
                  small
                />
              </SettingRow>
              {pairFilterMode === 'whitelist' && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 6 }}>
                    {t('pairWhitelistLabel')}
                  </div>
                  <textarea
                    value={pairWhitelist}
                    onChange={e => setPairWhitelist(e.target.value)}
                    placeholder={'BTC/USDT\nETH/USDT\nSOL/USDT'}
                    rows={4}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none', direction: 'ltr', resize: 'vertical',
                      lineHeight: 1.6,
                    }}
                  />
                </div>
              )}
              {pairFilterMode === 'blacklist' && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 6 }}>
                    {t('pairBlacklistLabel')}
                  </div>
                  <textarea
                    value={pairBlacklist}
                    onChange={e => setPairBlacklist(e.target.value)}
                    placeholder={'DOGE/USDT\nXRP/USDT'}
                    rows={4}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none', direction: 'ltr', resize: 'vertical',
                      lineHeight: 1.6,
                    }}
                  />
                </div>
              )}
              {/* Info note */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(0,255,163,0.04)', border: `1px solid rgba(0,255,163,0.10)`,
                marginTop: 8,
              }}>
                <CheckCircle2 size={16} color={T.green} />
                <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.6 }}>
                  {t('pairFilterInfo')}
                </div>
              </div>
            </SectionCard>

            {/* Feature 5: Trading Schedule */}
            <SectionCard
              icon={<Clock size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title={t('tradingScheduleTitle')}
              subtitle={t('tradingScheduleSubtitle')}
            >
              <SettingRow
                icon={<Clock size={13} color={T.amber} />}
                label={t('tradingScheduleEnable')}
                description={t('tradingScheduleEnableDesc')}
              >
                <Toggle checked={tradingScheduleEnabled} onChange={() => setTradingScheduleEnabled(!tradingScheduleEnabled)} color={T.amber} size="sm" />
              </SettingRow>
              {tradingScheduleEnabled && (
                <>
                  <SettingRow
                    icon={<Zap size={13} color={T.green} />}
                    label={t('tradingScheduleStart')}
                    description={t('tradingScheduleStartDesc')}
                  >
                    <input
                      type="time"
                      value={tradingScheduleStart}
                      onChange={e => setTradingScheduleStart(e.target.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 8,
                        background: T.surface, border: `1px solid ${T.border}`,
                        color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                        outline: 'none', direction: 'ltr',
                      }}
                    />
                  </SettingRow>
                  <SettingRow
                    icon={<Target size={13} color={T.red} />}
                    label={t('tradingScheduleEnd')}
                    description={t('tradingScheduleEndDesc')}
                  >
                    <input
                      type="time"
                      value={tradingScheduleEnd}
                      onChange={e => setTradingScheduleEnd(e.target.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 8,
                        background: T.surface, border: `1px solid ${T.border}`,
                        color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                        outline: 'none', direction: 'ltr',
                      }}
                    />
                  </SettingRow>
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 8 }}>
                      {t('tradingDays')}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {([
                        { day: 1, label: t('dayMon') },
                        { day: 2, label: t('dayTue') },
                        { day: 3, label: t('dayWed') },
                        { day: 4, label: t('dayThu') },
                        { day: 5, label: t('dayFri') },
                        { day: 6, label: t('daySat') },
                        { day: 7, label: t('daySun') },
                      ]).map(d => {
                        const selectedDays = tradingScheduleDays.split(',').map(Number).filter(n => !isNaN(n))
                        const isSelected = selectedDays.includes(d.day)
                        return (
                          <button
                            key={d.day}
                            onClick={() => {
                              const newDays = isSelected
                                ? selectedDays.filter(x => x !== d.day)
                                : [...selectedDays, d.day].sort()
                              setTradingScheduleDays(newDays.length > 0 ? newDays.join(',') : '1,2,3,4,5')
                            }}
                            style={{
                              padding: '6px 10px', borderRadius: 8,
                              border: isSelected ? `1px solid ${T.amber}40` : `1px solid ${T.border}`,
                              background: isSelected ? `${T.amber}12` : T.surface,
                              color: isSelected ? T.amber : T.text3,
                              fontSize: 10, fontWeight: 700, cursor: 'pointer',
                              fontFamily: "'Cairo', sans-serif",
                              transition: 'all 0.2s',
                            }}
                          >
                            {d.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* Info note */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(255,184,0,0.04)', border: `1px solid rgba(255,184,0,0.10)`,
                    marginTop: 8,
                  }}>
                    <AlertTriangle size={16} color={T.amber} />
                    <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.6 }}>
                      {t('tradingScheduleInfo')}
                    </div>
                  </div>
                </>
              )}
            </SectionCard>
          </>
        )}

        {/* ═══ V312: Smart Executor Tab ═══ */}
        {activeTab === 'smart-executor' && (
          <SmartExecutorTab
            settings={(() => {
              // Build settings object from current state
              const s: Record<string, any> = {};
              s.smartExecutorEnabled = aiAutoTrade;
              s.userRiskPerTrade = userRiskPerTrade;
              s.userMaxOpenPositions = userMaxOpenPositions;
              s.minConfidence = minConfidence;
              s.userStopLoss = userStopLoss;
              s.userTakeProfit = userTakeProfit;
              s.userMaxDailyLoss = userMaxDailyLoss;
              return s;
            })()}
            update={(key, value) => {
              // Map settings keys to local state
              if (key === 'smartExecutorEnabled') setAiAutoTrade(value);
              else if (key === 'userRiskPerTrade') setUserRiskPerTrade(value);
              else if (key === 'userMaxOpenPositions') setUserMaxOpenPositions(value);
              else if (key === 'minConfidence') setAiConfidence(value);
              else if (key === 'userStopLoss') setUserStopLoss(value);
              else if (key === 'userTakeProfit') setUserTakeProfit(value);
              else if (key === 'userMaxDailyLoss') setUserMaxDailyLoss(value);
            }}
          />
        )}

        {/* ═══ V312: Autonomous Agent Tab ═══ */}
        {activeTab === 'autonomous-agent' && (
          <AutonomousAgentTab
            settings={{}}
            update={() => {}}
          />
        )}

        {/* ═══ V312: AI Council Tab ═══ */}
        {activeTab === 'ai-council' && (
          <AICouncilTab
            settings={{}}
            update={() => {}}
          />
        )}

        {activeTab === 'notifications' && (
          <>
            <SectionCard
              icon={<Bell size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title={t('notificationsAlerts')}
              subtitle={t('notificationsAlertsSubtitle')}
            >
              <SettingRow
                icon={<Bell size={13} color={T.cyan} />}
                label={t('enableNotifications')}
                description={t('receivePlatformAlerts')}
              >
                <Toggle checked={settings.enabled} onChange={() => updateSettings({ enabled: !settings.enabled })} color={T.cyan} />
              </SettingRow>
              <SettingRow
                icon={<Volume2 size={13} color={T.green} />}
                label={t('sounds')}
                description={t('soundsDesc')}
              >
                <Toggle checked={settings.soundEnabled} onChange={() => updateSettings({ soundEnabled: !settings.soundEnabled })} color={T.green} />
              </SettingRow>


              <div style={{ height: 1, background: T.border, margin: '8px 0' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text4, padding: '4px 0 0', letterSpacing: '0.05em' }}>{t('notificationSources')}</div>

              <SettingRow icon={<Bot size={13} color={T.purple} />} label={t('botAlerts')}>
                <Toggle checked={settings.botAlerts} onChange={() => updateSettings({ botAlerts: !settings.botAlerts })} color={T.purple} size="sm" />
              </SettingRow>
              <SettingRow icon={<Brain size={13} color={T.cyan} />} label={t('aiAlerts')}>
                <Toggle checked={settings.aiAlerts} onChange={() => updateSettings({ aiAlerts: !settings.aiAlerts })} color={T.cyan} size="sm" />
              </SettingRow>
              <SettingRow icon={<Radar size={13} color={T.amber} />} label={t('scannerAlerts')}>
                <Toggle checked={settings.scannerAlerts} onChange={() => updateSettings({ scannerAlerts: !settings.scannerAlerts })} color={T.amber} size="sm" />
              </SettingRow>
              <SettingRow icon={<BarChart3 size={13} color={T.green} />} label={t('tradeAlerts')}>
                <Toggle checked={settings.tradeAlerts} onChange={() => updateSettings({ tradeAlerts: !settings.tradeAlerts })} color={T.green} size="sm" />
              </SettingRow>


              {/* Confidence Slider */}
              <div style={{ marginTop: 8, padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: T.text2, fontWeight: 600 }}>
                    <Target size={13} style={{ display: 'inline', verticalAlign: -2, marginLeft: 4 }} />
                    {t('minConfidenceLevel')}
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
                  <span style={{ fontSize: 9, color: T.text4 }}>{t('allSignals')}</span>
                  <span style={{ fontSize: 9, color: T.text4 }}>{t('highConfidenceOnly')}</span>
                </div>
              </div>
            </SectionCard>

            {/* Notification Schedule */}
            <SectionCard
              icon={<Clock size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title={t('notificationSchedule')}
              subtitle={t('notificationScheduleDesc')}
            >
              <SettingRow
                icon={<Bell size={13} color={T.text3} />}
                label={t('doNotDisturb')}
                description={t('doNotDisturbDesc')}
              >
                <Toggle checked={doNotDisturb} onChange={() => setDoNotDisturb(!doNotDisturb)} color={T.amber} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Activity size={13} color={T.text3} />}
                label={t('emergencyOnly')}
                description={t('emergencyOnlyDesc')}
              >
                <Toggle checked={emergencyOnly} onChange={() => setEmergencyOnly(!emergencyOnly)} color={T.red} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Feature 3: External Notification Channels */}
            <SectionCard
              icon={<Send size={18} color={T.purple} />}
              iconColor={T.purple}
              iconBg={`${T.purple}14`}
              title={t('extNotifChannelsTitle')}
              subtitle={t('extNotifChannelsSubtitle')}
            >
              <SettingRow
                icon={<Smartphone size={13} color={T.purple} />}
                label="Telegram Bot Token"
                description={t('telegramBotTokenDesc')}
              >
                <input
                  type="password"
                  value={telegramBotToken || ''}
                  onChange={e => setTelegramBotToken(e.target.value)}
                  placeholder="123456:ABC-DEF..."
                  style={{
                    width: 180, padding: '4px 8px', borderRadius: 8,
                    background: T.surface, border: `1px solid ${T.border}`,
                    color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none', direction: 'ltr',
                  }}
                />
              </SettingRow>
              <SettingRow
                icon={<MessageSquare size={13} color={T.cyan} />}
                label="Telegram Chat ID"
                description={t('telegramChatIdDesc')}
              >
                <input
                  type="text"
                  value={telegramChatId || ''}
                  onChange={e => setTelegramChatId(e.target.value)}
                  placeholder="-1001234567890"
                  style={{
                    width: 180, padding: '4px 8px', borderRadius: 8,
                    background: T.surface, border: `1px solid ${T.border}`,
                    color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none', direction: 'ltr',
                  }}
                />
              </SettingRow>
              <SettingRow
                icon={<Wifi size={13} color={T.purple} />}
                label="Discord Webhook URL"
                description={t('discordWebhookDesc')}
              >
                <input
                  type="password"
                  value={discordWebhookUrl || ''}
                  onChange={e => setDiscordWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  style={{
                    width: 180, padding: '4px 8px', borderRadius: 8,
                    background: T.surface, border: `1px solid ${T.border}`,
                    color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none', direction: 'ltr',
                  }}
                />
              </SettingRow>
              <SettingRow
                icon={<Send size={13} color={T.green} />}
                label={t('extNotifEnable')}
                description={t('extNotifEnableDesc')}
              >
                <Toggle checked={externalNotificationsEnabled} onChange={() => setExternalNotificationsEnabled(!externalNotificationsEnabled)} color={T.green} size="sm" />
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
              title={t('aiSettings')}
              subtitle={t('aiSettingsSubtitle')}
            >
              <SettingRow
                icon={<Cpu size={13} color={T.purple} />}
                label={t('aiModel')}
                description={t('aiModelDesc')}
              >
                <SelectBox
                  value={aiModel}
                  onChange={setAiModel}
                  options={[
                    { value: 'conservative', label: t('conservative') },
                    { value: 'balanced', label: t('balanced') },
                    { value: 'aggressive', label: t('bold') },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Target size={13} color={T.cyan} />}
                label={t('autoExecConfidenceThreshold')}
                description={t('autoExecConfidenceThresholdDesc')}
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
                label={t('aiAutoFollow')}
                description={t('aiAutoFollowDesc')}
              >
                <Toggle checked={aiAutoTrade} onChange={() => setAiAutoTrade(!aiAutoTrade)} color={T.amber} />
              </SettingRow>
            </SectionCard>

            {/* ─── Continuous Market Monitoring ─── */}
            <SectionCard
              icon={<Radar size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title={t('continuousMarketMonitoring')}
              subtitle={t('analysis247')}
            >
              <SettingRow
                icon={<Radar size={13} color={T.cyan} />}
                label={t('enableMonitoring')}
                description={t('enableMonitoringDesc')}
              >
                <Toggle checked={continuousMonitoringEnabled} onChange={() => setContinuousMonitoringEnabled(!continuousMonitoringEnabled)} color={T.cyan} />
              </SettingRow>
              {continuousMonitoringEnabled && (
                <>
                  <SettingRow
                    icon={<Clock size={13} color={T.amber} />}
                    label={t('monitoringInterval')}
                    description={t('monitoringIntervalDesc')}
                  >
                    <SelectBox
                      value={monitoringInterval}
                      onChange={setMonitoringInterval}
                      options={[
                        { value: '1m', label: '1m' },
                        { value: '5m', label: '5m' },
                        { value: '15m', label: '15m' },
                        { value: '1h', label: '1h' },
                      ]}
                      small
                    />
                  </SettingRow>
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 6 }}>
                      {t('monitoringPairsLabel')}
                    </div>
                    <textarea
                      value={monitoringPairs}
                      onChange={e => setMonitoringPairs(e.target.value)}
                      placeholder={'BTC/USDT\nETH/USDT\nSOL/USDT'}
                      rows={3}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8,
                        background: T.surface, border: `1px solid ${T.border}`,
                        color: T.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                        outline: 'none', direction: 'ltr', resize: 'vertical',
                        lineHeight: 1.6,
                      }}
                    />
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(0,212,255,0.04)', border: `1px solid rgba(0,212,255,0.10)`,
                    marginTop: 8,
                  }}>
                    <Radar size={16} color={T.cyan} />
                    <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.6 }}>
                      {t('monitoringInfo')}
                    </div>
                  </div>
                </>
              )}
            </SectionCard>

            {/* ─── Entry & Exit Signals ─── */}
            <SectionCard
              icon={<Activity size={18} color={T.green} />}
              iconColor={T.green}
              iconBg={`${T.green}14`}
              title={t('entryExitSignals')}
              subtitle={t('instantOpportunityAlerts')}
            >
              <SettingRow
                icon={<Activity size={13} color={T.green} />}
                label={t('enableSignals')}
                description={t('enableSignalsDesc')}
              >
                <Toggle checked={entryExitSignalsEnabled} onChange={() => setEntryExitSignalsEnabled(!entryExitSignalsEnabled)} color={T.green} />
              </SettingRow>
              {entryExitSignalsEnabled && (
                <>
                  <SettingRow
                    icon={<Target size={13} color={T.cyan} />}
                    label={t('signalMinConfidence')}
                    description={t('signalMinConfidenceDesc')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="range" min={50} max={99} step={5}
                        value={signalMinConfidence}
                        onChange={e => setSignalMinConfidence(e.target.value)}
                        style={{ width: 80, accentColor: T.green, height: 3 }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.green, fontFamily: "'JetBrains Mono', monospace", minWidth: 30, textAlign: 'center' }}>
                        {signalMinConfidence}%
                      </span>
                    </div>
                  </SettingRow>
                  <SettingRow
                    icon={<Bell size={13} color={T.amber} />}
                    label={t('signalAlertMethod')}
                    description={t('signalAlertMethodDesc')}
                  >
                    <SelectBox
                      value={signalAlertMethod}
                      onChange={setSignalAlertMethod}
                      options={[
                        { value: 'platform', label: t('signalAlertPlatform') },
                        { value: 'external', label: t('signalAlertExternal') },
                        { value: 'both', label: t('signalAlertBoth') },
                      ]}
                      small
                    />
                  </SettingRow>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(0,255,163,0.04)', border: `1px solid rgba(0,255,163,0.10)`,
                    marginTop: 8,
                  }}>
                    <Activity size={16} color={T.green} />
                    <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.6 }}>
                      {t('signalsInfo')}
                    </div>
                  </div>
                </>
              )}
            </SectionCard>

            {/* ─── Risk Alerts ─── */}
            <SectionCard
              icon={<AlertTriangle size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title={t('riskAlerts')}
              subtitle={t('highVolatilityWarnings')}
            >
              <SettingRow
                icon={<AlertTriangle size={13} color={T.amber} />}
                label={t('enableRiskAlerts')}
                description={t('enableRiskAlertsDesc')}
              >
                <Toggle checked={riskAlertsEnabled} onChange={() => setRiskAlertsEnabled(!riskAlertsEnabled)} color={T.amber} />
              </SettingRow>
              {riskAlertsEnabled && (
                <>
                  <SettingRow
                    icon={<TrendingUp size={13} color={T.red} />}
                    label={t('volatilityThreshold')}
                    description={t('volatilityThresholdDesc')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="range" min={1} max={10} step={0.5}
                        value={volatilityThreshold}
                        onChange={e => setVolatilityThreshold(e.target.value)}
                        style={{ width: 80, accentColor: T.amber, height: 3 }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, fontFamily: "'JetBrains Mono', monospace", minWidth: 30, textAlign: 'center' }}>
                        {volatilityThreshold}%
                      </span>
                    </div>
                  </SettingRow>
                  <SettingRow
                    icon={<Shield size={13} color={T.cyan} />}
                    label={t('riskAlertTypes')}
                    description={t('riskAlertTypesDesc')}
                  >
                    <SelectBox
                      value={riskAlertTypes}
                      onChange={setRiskAlertTypes}
                      options={[
                        { value: 'all', label: t('riskTypeAll') },
                        { value: 'high', label: t('riskTypeHigh') },
                        { value: 'critical', label: t('riskTypeCritical') },
                      ]}
                      small
                    />
                  </SettingRow>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(255,184,0,0.04)', border: `1px solid rgba(255,184,0,0.10)`,
                    marginTop: 8,
                  }}>
                    <AlertTriangle size={16} color={T.amber} />
                    <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.6 }}>
                      {t('riskAlertsInfo')}
                    </div>
                  </div>
                </>
              )}
            </SectionCard>

            {/* ─── Sentiment Analysis ─── */}
            <SectionCard
              icon={<BarChart3 size={18} color={T.purple} />}
              iconColor={T.purple}
              iconBg={`${T.purple}14`}
              title={t('sentimentAnalysis')}
              subtitle={t('sentimentAnalysisDesc')}
            >
              <SettingRow
                icon={<BarChart3 size={13} color={T.purple} />}
                label={t('enableSentiment')}
                description={t('enableSentimentDesc')}
              >
                <Toggle checked={sentimentEnabled} onChange={() => setSentimentEnabled(!sentimentEnabled)} color={T.purple} />
              </SettingRow>
              {sentimentEnabled && (
                <>
                  <SettingRow
                    icon={<Globe size={13} color={T.cyan} />}
                    label={t('sentimentSources')}
                    description={t('sentimentSourcesDesc')}
                  >
                    <SelectBox
                      value={sentimentSources}
                      onChange={setSentimentSources}
                      options={[
                        { value: 'all', label: t('sentimentSourceAll') },
                        { value: 'news', label: t('sentimentSourceNews') },
                        { value: 'social', label: t('sentimentSourceSocial') },
                      ]}
                      small
                    />
                  </SettingRow>
                  <SettingRow
                    icon={<Sliders size={13} color={T.green} />}
                    label={t('sentimentSensitivity')}
                    description={t('sentimentSensitivityDesc')}
                  >
                    <SelectBox
                      value={sentimentSensitivity}
                      onChange={setSentimentSensitivity}
                      options={[
                        { value: 'low', label: t('sensitivityLow') },
                        { value: 'medium', label: t('sensitivityMedium') },
                        { value: 'high', label: t('sensitivityHigh') },
                      ]}
                      small
                    />
                  </SettingRow>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(139,92,246,0.04)', border: `1px solid rgba(139,92,246,0.10)`,
                    marginTop: 8,
                  }}>
                    <BarChart3 size={16} color={T.purple} />
                    <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.6 }}>
                      {t('sentimentInfo')}
                    </div>
                  </div>
                </>
              )}
            </SectionCard>

            {/* Feature 2: Advanced Strategy Settings */}
            <SectionCard
              icon={<Cpu size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title={t('advStrategyTitle')}
              subtitle={t('advStrategySubtitle')}
            >
              {/* Warning banner */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,184,0,0.06)', border: `1px solid rgba(255,184,0,0.15)`,
                marginBottom: 12,
              }}>
                <AlertTriangle size={16} color={T.amber} />
                <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
                  {t('advStrategyWarning')}
                </div>
              </div>
              <SettingRow
                icon={<Clock size={13} color={T.amber} />}
                label={t('scalpingTimeframe')}
                description={t('scalpingTimeframeDesc')}
              >
                <SelectBox
                  value={scalpingTimeframe}
                  onChange={setScalpingTimeframe}
                  options={[
                    { value: '1m', label: '1m' },
                    { value: '5m', label: '5m' },
                    { value: '15m', label: '15m' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Target size={13} color={T.green} />}
                label={t('scalpingTakeProfit')}
                description={t('scalpingTakeProfitDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={5} max={50} step={1}
                    value={scalpingTakeProfitPips}
                    onChange={e => setScalpingTakeProfitPips(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                </div>
              </SettingRow>
              <SettingRow
                icon={<AlertTriangle size={13} color={T.red} />}
                label={t('scalpingStopLoss')}
                description={t('scalpingStopLossDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={3} max={30} step={1}
                    value={scalpingStopLossPips}
                    onChange={e => setScalpingStopLossPips(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                </div>
              </SettingRow>
              <SettingRow
                icon={<Activity size={13} color={T.cyan} />}
                label={t('maxSpreadPips')}
                description={t('maxSpreadPipsDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={1} max={10} step={0.5}
                    value={scalpingMaxSpread}
                    onChange={e => setScalpingMaxSpread(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                </div>
              </SettingRow>
              <SettingRow
                icon={<Sliders size={13} color={T.purple} />}
                label={t('gridLevelsLabel')}
                description={t('gridLevelsDesc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number" min={3} max={15} step={1}
                    value={gridLevels}
                    onChange={e => setGridLevels(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: 'center', outline: 'none',
                    }}
                    dir="ltr"
                  />
                </div>
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
              title={t('appearanceLanguage')}
              subtitle={t('appearanceLanguageSubtitle')}
            >
              <SettingRow
                icon={isDark ? <Moon size={13} color={T.blue} /> : <Sun size={13} color={T.amber} />}
                label={t('darkMode')}
                description={t('darkModeDesc')}
              >
                <Toggle checked={isDark} onChange={() => setIsDark(!isDark)} color={T.blue} />
              </SettingRow>
              <SettingRow
                icon={<Globe size={13} color={T.text3} />}
                label={t('language')}
                description={t('languageDesc')}
              >
                <SelectBox
                  value={currentLocale}
                  onChange={(locale) => {
                    router.replace('/', { locale })
                  }}
                  options={[
                    { value: 'ar', label: 'العربية' },
                    { value: 'en', label: 'English' },
                    { value: 'fr', label: 'Français' },
                    { value: 'tr', label: 'Türkçe' },
                    { value: 'es', label: 'Español' },
                    { value: 'zh', label: '中文' },
                    { value: 'ru', label: 'Русский' },
                    { value: 'de', label: 'Deutsch' },
                    { value: 'ja', label: '日本語' },
                    { value: 'ko', label: '한국어' },
                    { value: 'hi', label: 'हिन्दी' },
                    { value: 'pt', label: 'Português' },
                    { value: 'it', label: 'Italiano' },
                    { value: 'id', label: 'Bahasa Indonesia' },
                    { value: 'vi', label: 'Tiếng Việt' },
                    { value: 'th', label: 'ภาษาไทย' },
                    { value: 'nl', label: 'Nederlands' },
                    { value: 'pl', label: 'Polski' },
                    { value: 'ms', label: 'Bahasa Melayu' },
                    { value: 'sv', label: 'Svenska' },
                    { value: 'uk', label: 'Українська' },
                    { value: 'he', label: 'עברית' },
                    { value: 'fa', label: 'فارسی' },
                    { value: 'ur', label: 'اردو' },
                    { value: 'fil', label: 'Filipino' },
                    { value: 'da', label: 'Dansk' },
                    { value: 'no', label: 'Norsk' },
                    { value: 'fi', label: 'Suomi' },
                    { value: 'cs', label: 'Čeština' },
                    { value: 'hu', label: 'Magyar' },
                    { value: 'ro', label: 'Română' },
                    { value: 'bn', label: 'বাংলা' },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Fingerprint size={13} color={T.text3} />}
                label={t('textDirection')}
                description={t('textDirectionRtl')}
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
                label={t('fontSize')}
                description={t('fontSizeDesc')}
              >
                <SelectBox
                  value={fontSize}
                  onChange={(v) => setFontSize(v)}
                  options={[
                    { value: 'small', label: t('fontSizeSmall') },
                    { value: 'default', label: t('default') },
                    { value: 'large', label: t('fontSizeLarge') },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<Monitor size={13} color={T.text3} />}
                label={t('animations')}
                description={t('animationsDesc')}
              >
                <Toggle checked={animationsEnabled} onChange={() => setAnimationsEnabled(!animationsEnabled)} color={T.cyan} size="sm" />
              </SettingRow>
            </SectionCard>

            {/* Chart Appearance */}
            <SectionCard
              icon={<LineChart size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title={t('chartAppearance')}
              subtitle={t('chartSettingsSubtitle')}
            >
              <SettingRow
                icon={<BarChart3 size={13} color={T.text3} />}
                label={t('bullishCandleColor')}
              >
                <div style={{ width: 24, height: 16, borderRadius: 4, background: T.green, border: `1px solid ${T.border}` }} />
              </SettingRow>
              <SettingRow
                icon={<BarChart3 size={13} color={T.text3} />}
                label={t('bearishCandleColor')}
              >
                <div style={{ width: 24, height: 16, borderRadius: 4, background: T.red, border: `1px solid ${T.border}` }} />
              </SettingRow>
              <SettingRow
                icon={<Eye size={13} color={T.text3} />}
                label={t('gridLines')}
                description={t('gridLinesDesc')}
              >
                <Toggle checked={gridLinesEnabled} onChange={() => setGridLinesEnabled(!gridLinesEnabled)} color={T.blue} size="sm" />
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
              title={t('twoFactorAuth')}
              subtitle={t('twoFactorSubtitle')}
            >
              <SettingRow
                icon={<Smartphone size={13} color={T.text3} />}
                label={t('totpAuth')}
                description={t('totpAuthDesc')}
              >
                <button
                  onClick={() => router.push('/dashboard/security/2fa')}
                  style={{
                  padding: '5px 12px', borderRadius: 8,
                  background: `${T.green}12`, border: `1px solid ${T.green}25`,
                  color: T.green, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                }}>{tc('activate')}</button>
              </SettingRow>
              <SettingRow
                icon={<Fingerprint size={13} color={T.text3} />}
                label={t('passkeys')}
                description={t('passkeysDesc')}
              >
                <Toggle checked={passkeysEnabled} onChange={() => setPasskeysEnabled(!passkeysEnabled)} color={T.purple} size="sm" />
              </SettingRow>
            </SectionCard>

            <SectionCard
              icon={<Lock size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title={t('sessionSecurity')}
              subtitle={t('sessionSecuritySubtitle')}
            >
              <SettingRow
                icon={<Clock size={13} color={T.text3} />}
                label={t('sessionDuration')}
                description={t('sessionDurationDesc')}
              >
                <SelectBox
                  value={sessionDuration}
                  onChange={setSessionDuration}
                  options={[
                    { value: '15m', label: t('fifteenMinutes') },
                    { value: '1h', label: t('oneHour') },
                    { value: '24h', label: t('twentyFourHours') },
                    { value: '7d', label: t('sevenDays') },
                    { value: '30d', label: t('thirtyDays') },
                  ]}
                  small
                />
              </SettingRow>
              <SettingRow
                icon={<RefreshCw size={13} color={T.green} />}
                label={t('autoSessionRenewal')}
                description={t('autoSessionRenewalDesc')}
              >
                <Toggle checked={autoSessionRenewal} onChange={() => setAutoSessionRenewal(!autoSessionRenewal)} color={T.green} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Wifi size={13} color={T.text3} />}
                label={t('killOtherSessions')}
                description={t('logoutOtherDevices')}
              >
                <button
                  onClick={handleKillOtherSessions}
                  disabled={killLoading}
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.20)',
                    color: T.red, fontSize: 11, fontWeight: 700, cursor: killLoading ? 'wait' : 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                    opacity: killLoading ? 0.6 : 1,
                  }}
                >{killLoading ? '...' : t('terminate')}</button>
              </SettingRow>
            </SectionCard>

            {/* Active Sessions — V189: Real session data */}
            <SectionCard
              icon={<Monitor size={18} color={T.cyan} />}
              iconColor={T.cyan}
              iconBg={`${T.cyan}14`}
              title={t('activeSessions')}
              subtitle={t('activeSessionsDesc')}
            >
              <div style={{ padding: '8px 0' }}>
                {sessionsLoading && (
                  <div style={{ padding: '12px 0', textAlign: 'center', color: T.text3, fontSize: 11 }}>
                    {t('loadingAccounts')}
                  </div>
                )}
                {!sessionsLoading && sessions.length === 0 && (
                  <div style={{ padding: '12px 0', textAlign: 'center', color: T.text3, fontSize: 11 }}>
                    {t('noActiveSessions')}
                  </div>
                )}
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
                          }}>{t('current')}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: T.text4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>{t('lastActivity')}: {session.lastActive}</span>
                        {session.maskedIp && <span>IP: {session.maskedIp}</span>}
                      </div>
                    </div>
                    {!session.current && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/auth/sessions', {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ sessionId: session.id }),
                            })
                            const data = await res.json()
                            if (data.success) {
                              setSessions(prev => prev.filter(s => s.id !== session.id))
                            }
                          } catch {}
                        }}
                        style={{
                          padding: '3px 8px', borderRadius: 6,
                          background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.15)',
                          color: T.red, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                          fontFamily: "'Cairo', sans-serif",
                        }}
                      >{t('terminate')}</button>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              icon={<AlertTriangle size={18} color={T.red} />}
              iconColor={T.red}
              iconBg={`${T.red}10`}
              title={t('antiPhishingCode')}
              subtitle={t('antiPhishingCodeDesc')}
            >
              <SettingRow
                icon={<Shield size={13} color={T.amber} />}
                label={t('enableAntiPhishing')}
                description={t('antiPhishingCodeEnabled')}
              >
                <Toggle checked={antiPhishingEnabled} onChange={() => setAntiPhishingEnabled(!antiPhishingEnabled)} color={T.amber} size="sm" />
              </SettingRow>
              {antiPhishingEnabled && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginBottom: 6 }}>
                    {t('antiPhishingSecretWord')}
                  </div>
                  <input
                    type="text"
                    value={antiPhishingCode}
                    onChange={e => setAntiPhishingCode(e.target.value)}
                    placeholder={t('antiPhishingPlaceholder')}
                    maxLength={20}
                    style={{
                      width: '100%', padding: '6px 10px', borderRadius: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none', direction: 'ltr',
                    }}
                  />
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 4, lineHeight: 1.5 }}>
                    {t('antiPhishingHint')}
                  </div>
                </div>
              )}
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
              title={t('yourData')}
              subtitle={t('exportDataSubtitle')}
            >
              <SettingRow
                icon={<Download size={13} color={T.cyan} />}
                label={t('downloadYourData')}
                description={t('downloadYourDataDesc')}
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
                  {dataExportLoading ? t('preparing') : t('download')}
                </button>
              </SettingRow>
              <SettingRow
                icon={<Upload size={13} color={T.text3} />}
                label={t('importSettings')}
                description={t('importSettingsDesc')}
              >
                <button
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.json'
                    input.onchange = async (e: any) => {
                      const file = e.target?.files?.[0]
                      if (!file) return
                      setImportLoading(true)
                      try {
                        const text = await file.text()
                        // V311: Validate file size (max 10KB)
                        if (text.length > 10240) {
                          alert(t('importSettingsInvalid'))
                          return
                        }
                        const data = JSON.parse(text)
                        if (data?.settings && typeof data.settings === 'object') {
                          // V311: Filter out masked secrets (*** values) before importing
                          const cleanSettings = { ...data.settings }
                          for (const [k, v] of Object.entries(cleanSettings)) {
                            if (typeof v === 'string' && v.endsWith('***')) {
                              delete cleanSettings[k]
                            }
                          }
                          const importRes = await fetch('/api/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ settings: cleanSettings }),
                          })
                          if (importRes.ok) {
                            window.location.reload()
                          } else {
                            alert(t('importSettingsInvalid'))
                          }
                        } else {
                          alert(t('importSettingsInvalid'))
                        }
                      } catch {
                        alert(t('importSettingsInvalid'))
                      }
                      setImportLoading(false)
                    }
                    input.click()
                  }}
                  disabled={importLoading}
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    background: `${T.purple}12`, border: `1px solid ${T.purple}25`,
                    color: T.purple, fontSize: 11, fontWeight: 700,
                    cursor: importLoading ? 'wait' : 'pointer',
                    fontFamily: "'Cairo', sans-serif",
                    display: 'flex', alignItems: 'center', gap: 4,
                    opacity: importLoading ? 0.6 : 1,
                  }}
                >
                  {importLoading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
                  {importLoading ? t('preparing') : t('importLabel')}
                </button>
              </SettingRow>
            </SectionCard>

            <SectionCard
              icon={<Eye size={18} color={T.amber} />}
              iconColor={T.amber}
              iconBg={`${T.amber}14`}
              title={t('privacy')}
              subtitle={t('privacySubtitle')}
            >
              <SettingRow
                icon={<Activity size={13} color={T.text3} />}
                label={t('analyticsUsage')}
                description={t('analyticsUsageDesc')}
              >
                <Toggle checked={analyticsEnabled} onChange={() => setAnalyticsEnabled(!analyticsEnabled)} color={T.cyan} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<AlertTriangle size={13} color={T.text3} />}
                label={t('crashReports')}
                description={t('crashReportsDesc')}
              >
                <Toggle checked={crashReports} onChange={() => setCrashReports(!crashReports)} color={T.green} size="sm" />
              </SettingRow>
              <SettingRow
                icon={<Shield size={13} color={T.text3} />}
                label={t('stealthMode')}
                description={t('hideBalances')}
              >
                <Toggle checked={stealthMode} onChange={() => setStealthMode(!stealthMode)} color={T.purple} size="sm" />
              </SettingRow>
            </SectionCard>

            <SectionCard
              icon={<CreditCard size={18} color={T.purple} />}
              iconColor={T.purple}
              iconBg={`${T.purple}14`}
              title={t('cacheStorage')}
              subtitle={t('cacheStorageSubtitle')}
            >
              <SettingRow
                icon={<Database size={13} color={T.text3} />}
                label={t('clearCache')}
                description={t('clearCacheDesc')}
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
                >{tc('reset')}</button>
              </SettingRow>
              <SettingRow
                icon={<Clock size={13} color={T.text3} />}
                label={t('cacheDuration')}
                description={t('cacheDurationDesc')}
              >
                <SelectBox
                  value={cacheDuration}
                  onChange={setCacheDuration}
                  options={[
                    { value: '1m', label: t('oneMinute') },
                    { value: '5m', label: t('fiveMinutes') },
                    { value: '15m', label: t('fifteenMinutes') },
                    { value: '1h', label: t('oneHour') },
                    { value: '24h', label: t('twentyFourHours') },
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
