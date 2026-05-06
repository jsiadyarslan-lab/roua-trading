'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, ChevronDown, Link2, Key, Bell, Shield, Globe,
  Moon, FileText, HelpCircle, LogOut, Crown, RefreshCw, Check,
  AlertTriangle, Bot, CreditCard, Info, User,
  Smartphone, Eye, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'
import { useBotStore } from '@/hooks/useBotStore'
import { ScopedStyle } from '@/components/ScopedStyle'

// ── Design Tokens (as specified) ──
const T = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
  bgApp: '#000000',
  font: "'Cairo', sans-serif",
  mono: "'JetBrains Mono', monospace",
}

// ── Glass Card ──
function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(28,28,30,0.6)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      border: `1px solid ${T.border}`,
      borderRadius: 28,
      padding: '18px 20px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Section Title ──
function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingInlineEnd: 4 }}>
      {Icon && <Icon size={14} color={T.accent} />}
      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>{children}</span>
    </div>
  )
}

// ── Toggle Switch ──
function Toggle({ on, onToggle, disabled = false }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      style={{
        width: 50, height: 30, borderRadius: 15,
        background: on ? T.accent : 'rgba(255,255,255,0.12)',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.25s ease',
        padding: 0, flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: 26, height: 26, borderRadius: 13,
          background: '#fff',
          position: 'absolute', top: 2,
          insetInlineEnd: on ? 2 : 'auto',
          insetInlineStart: on ? 'auto' : 2,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}

// ── Settings Row ──
function SettingsRow({
  icon: Icon, iconColor = T.accent, label, sub, onClick,
  right, showChevron = true,
}: {
  icon: LucideIcon
  iconColor?: string
  label: string
  sub?: string
  onClick?: () => void
  right?: React.ReactNode
  showChevron?: boolean
}) {
  const content = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, width: '100%',
      padding: '14px 16px',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${iconColor}12`, border: `1px solid ${iconColor}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} color={iconColor} />
      </div>
      <div style={{ flex: 1, textAlign: 'start' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font }}>{label}</p>
        {sub && (
          <p style={{ fontSize: 11, color: T.text2, fontFamily: T.font, marginTop: 1 }}>{sub}</p>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      {showChevron && !right && (
        <ChevronLeft size={14} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
      )}
    </div>
  )

  if (onClick) {
    return (
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={onClick}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'start', padding: 0,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {content}
      </motion.button>
    )
  }

  return (
    <div style={{ width: '100%', borderBottom: `1px solid ${T.border}` }}>
      {content}
    </div>
  )
}

// ── Skeleton ──
function Skeleton({ w = '100%', h = 16, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  )
}

// ── Adapter Type ──
interface AdapterInfo {
  name: string
  connected: boolean
  label: string
  icon: string
}

// ── Notification Config Type ──
interface NotifConfig {
  id?: string
  type: string
  enabled: boolean
  description?: string
}

// ── Bot Settings Type ──
interface BotSettings {
  maxDailyLoss: number
  maxDrawdown: number
  maxOpenPositions: number
  stopLossDefault: number
  takeProfitDefault: number
  leverageLimit: number
  riskPerTrade: number
  strategy: string
  autoTrading: boolean
  maxPositionSize: number
}

// ── Language Option ──
type Language = 'ar' | 'en'

// ── Main Component ──
export default function MobileSettingsPage() {
  const router = useRouter()
  const authUser = useAuthStore(state => state.user)
  const authLoading = useAuthStore(state => state.loading)
  const refreshUser = useAuthStore(state => state.refreshUser)
  const logout = useAuthStore(state => state.logout)
  const botSettings = useBotStore(state => state.settings)

  // State
  const [user, setUser] = useState<AuthUser | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [adaptersLoading, setAdaptersLoading] = useState(true)
  const [botSettingsData, setBotSettingsData] = useState<BotSettings | null>(null)
  const [botSettingsLoading, setBotSettingsLoading] = useState(true)
  const [notifConfigs, setNotifConfigs] = useState<NotifConfig[]>([])
  const [notifLoading, setNotifLoading] = useState(true)
  const [language, setLanguage] = useState<Language>('ar')
  const [darkMode, setDarkMode] = useState(true)
  const [showLanguageSheet, setShowLanguageSheet] = useState(false)
  const [showBotSettings, setShowBotSettings] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // ── Fetch User ──
  const fetchUser = useCallback(async () => {
    setUserLoading(true)
    try {
      await refreshUser()
      const currentUser = useAuthStore.getState().user
      setUser(currentUser)
    } catch {
      setUser(null)
    } finally {
      setUserLoading(false)
    }
  }, [refreshUser])

  // ── Fetch Adapters with real connection status from credentials ──
  const fetchAdapters = useCallback(async () => {
    setAdaptersLoading(true)
    try {
      // Fetch real user credentials to determine which exchanges are connected
      const credRes = await fetch('/api/portfolio/credentials')
      const linkedExchanges = new Set<string>()
      if (credRes.ok) {
        const credData = await credRes.json()
        if (credData.success && Array.isArray(credData.data)) {
          credData.data.forEach((c: any) => {
            if (c.isValid) linkedExchanges.add(c.exchange.toLowerCase())
          })
        }
      }

      // Fetch available adapters
      const res = await fetch('/api/exchange/adapters')
      if (res.ok) {
        const data = await res.json()
        const adapterNames: string[] = data.data || data.adapters || []
        const mapped: AdapterInfo[] = adapterNames.map(name => ({
          name,
          connected: linkedExchanges.has(name.toLowerCase()),
          label: name === 'Binance' ? 'بينانس' : name === 'Alpaca' ? 'ألباكا' : name === 'TwelveData' ? 'Twelve Data' : name === 'CoinGecko' ? 'CoinGecko' : name,
          icon: name === 'Binance' ? '🟡' : name === 'Alpaca' ? '🔵' : '📊',
        }))
        setAdapters(mapped)
      } else {
        // Fallback default adapters with real connection status
        setAdapters([
          { name: 'Binance', connected: linkedExchanges.has('binance'), label: 'بينانس', icon: '🟡' },
          { name: 'Alpaca', connected: linkedExchanges.has('alpaca'), label: 'ألباكا', icon: '🔵' },
        ])
      }
    } catch {
      setAdapters([
        { name: 'Binance', connected: false, label: 'بينانس', icon: '🟡' },
        { name: 'Alpaca', connected: false, label: 'ألباكا', icon: '🔵' },
      ])
    } finally {
      setAdaptersLoading(false)
    }
  }, [])

  // ── Fetch Bot Settings ──
  const fetchBotSettings = useCallback(async () => {
    setBotSettingsLoading(true)
    try {
      const res = await fetch('/api/bot/settings')
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setBotSettingsData(data.settings as BotSettings)
        }
      }
    } catch {
      // Use bot store defaults
    } finally {
      setBotSettingsLoading(false)
    }
  }, [])

  // ── Fetch Notification Configs ──
  const fetchNotifConfigs = useCallback(async () => {
    setNotifLoading(true)
    try {
      const res = await fetch('/api/admin/notifications/config')
      if (res.ok) {
        const data = await res.json()
        if (data.configs) {
          setNotifConfigs(data.configs.map((c: any) => ({
            id: c.id,
            type: c.type,
            enabled: c.enabled,
            description: c.description,
          })))
        }
      }
    } catch {
      // Use defaults
    } finally {
      setNotifLoading(false)
    }
  }, [])

  // ── Toggle Notification ──
  const toggleNotification = async (type: string, enabled: boolean) => {
    // Optimistic update
    setNotifConfigs(prev => prev.map(c => c.type === type ? { ...c, enabled } : c))
    try {
      await fetch('/api/admin/notifications/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, enabled }),
      })
    } catch {
      // Revert on failure
      setNotifConfigs(prev => prev.map(c => c.type === type ? { ...c, enabled: !enabled } : c))
    }
  }

  // ── Logout Handler ──
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // Force redirect
      document.cookie = 'roua_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
      localStorage.clear()
      sessionStorage.clear()
      window.location.href = '/login'
    }
  }

  // ── Effects ──
  useEffect(() => {
    fetchUser()
    fetchAdapters()
    fetchBotSettings()
    fetchNotifConfigs()
  }, [fetchUser, fetchAdapters, fetchBotSettings, fetchNotifConfigs])

  // ── Tier Display ──
  const tierLabel = user?.tier === 'pro' ? 'Pro' : user?.tier === 'premium' ? 'Premium' : 'مجاني'
  const tierColor = user?.tier === 'pro' ? T.amber : user?.tier === 'premium' ? T.accent : T.text2

  // ── Bot settings values ──
  const effectiveBotSettings = botSettingsData || {
    maxDailyLoss: botSettings.maxDailyLoss,
    maxDrawdown: botSettings.maxDrawdown,
    maxOpenPositions: botSettings.maxOpenPositions,
    stopLossDefault: botSettings.stopLossDefault,
    takeProfitDefault: botSettings.takeProfitDefault,
    leverageLimit: botSettings.leverageLimit,
    riskPerTrade: botSettings.riskPct,
    strategy: botSettings.strategy,
    autoTrading: false,
    maxPositionSize: 10000,
  }

  return (
    <div style={{ minHeight: '100%', background: T.bgApp, direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
      {/* ── Global Keyframe ── */}
      <ScopedStyle>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</ScopedStyle>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 12px) 16px 16px',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.06) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.text2,
          }}
        >
          <ChevronRight size={18} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.font }}>الإعدادات</h1>
      </div>

      {/* ── Profile Card ── */}
      <div style={{ margin: '4px 16px 16px' }}>
        <GlassCard style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Gradient accent */}
          <div style={{
            position: 'absolute', top: -40, left: -40,
            width: 140, height: 140, borderRadius: '50%',
            background: `radial-gradient(circle, ${T.accent}10, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          {userLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Skeleton w={56} h={56} r={28} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton w="60%" h={16} r={6} />
                <Skeleton w="40%" h={12} r={6} />
              </div>
            </div>
          ) : user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${T.accent}, ${T.success})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 800, color: '#fff',
                  boxShadow: `0 4px 20px ${T.accent}30`,
                  flexShrink: 0,
                }}>
                  {(user.displayName || user.email || 'ر')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 17, fontWeight: 800, color: T.text, fontFamily: T.font }}>
                    {user.displayName || 'مستخدم رؤى'}
                  </p>
                  <p style={{ fontSize: 12, color: T.text2, fontFamily: T.font, marginTop: 2 }}>
                    {user.email}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <Crown size={16} color={tierColor} />
                  <span style={{ fontSize: 9, color: tierColor, fontFamily: T.font, fontWeight: 700 }}>{tierLabel}</span>
                </div>
              </div>

              {/* Subscription Row */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/mobile/billing')}
                style={{
                  marginTop: 16, padding: '12px 16px', borderRadius: 16,
                  background: `${tierColor}10`, border: `1px solid ${tierColor}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12, color: tierColor, fontFamily: T.font, fontWeight: 700 }}>
                  {user.tier === 'pro' || user.tier === 'premium' ? `🌟 خطة ${tierLabel} — نشط` : '🔥 ترقية إلى Pro'}
                </span>
                <span style={{
                  padding: '4px 14px', borderRadius: 10,
                  background: tierColor, color: '#000',
                  fontSize: 11, fontWeight: 700, fontFamily: T.font,
                }}>
                  {user.tier === 'pro' || user.tier === 'premium' ? 'إدارة' : 'ترقية'}
                </span>
              </motion.button>
            </>
          ) : (
            // Not authenticated state
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <User size={28} color={T.text2} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <p style={{ fontSize: 12, color: T.text2, fontFamily: T.font }}>غير مسجل الدخول</p>
              <button
                onClick={() => router.push('/login')}
                style={{
                  marginTop: 8, padding: '8px 20px', borderRadius: 12,
                  background: T.accent, border: 'none',
                  color: '#000', fontSize: 12, fontWeight: 700,
                  fontFamily: T.font, cursor: 'pointer',
                }}
              >
                تسجيل الدخول
              </button>
            </div>
          )}
        </GlassCard>
      </div>

      {/* ── Linked Accounts ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionTitle icon={Link2}>الحسابات المربوطة</SectionTitle>
        <GlassCard style={{ padding: '6px 0' }}>
          {adaptersLoading ? (
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Skeleton w={36} h={36} r={10} />
                  <div style={{ flex: 1 }}>
                    <Skeleton w="50%" h={12} r={6} />
                  </div>
                </div>
              ))}
            </div>
          ) : adapters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Link2 size={24} color={T.text2} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <p style={{ fontSize: 12, color: T.text2, fontFamily: T.font }}>لا توجد محولات متاحة</p>
            </div>
          ) : (
            adapters.map((adapter, i) => (
              <SettingsRow
                key={adapter.name}
                icon={Link2}
                iconColor={adapter.connected ? T.success : T.amber}
                label={`${adapter.icon} ${adapter.label}`}
                sub={adapter.connected ? 'مربوط ✓' : 'غير مربوط'}
                onClick={() => router.push('/mobile/kyc')}
              />
            ))
          )}
          {/* API Keys Row */}
          <SettingsRow
            icon={Key}
            iconColor="#B388FF"
            label="إدارة مفاتيح API"
            sub="مفاتيح التداول"
            onClick={() => router.push('/mobile/security')}
          />
        </GlassCard>
      </div>

      {/* ── Bot Settings ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionTitle icon={Bot}>إعدادات البوت</SectionTitle>
        <GlassCard style={{ padding: 0 }}>
          <SettingsRow
            icon={Bot}
            iconColor={T.accent}
            label="إعدادات التداول الآلي"
            sub={effectiveBotSettings.autoTrading ? 'مفعّل' : 'معطّل'}
            onClick={() => setShowBotSettings(!showBotSettings)}
            right={
              <ChevronDown
                size={16}
                color={T.text2}
                style={{
                  transform: showBotSettings ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            }
            showChevron={false}
          />

          <AnimatePresence>
            {showBotSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '4px 16px 16px' }}>
                  {botSettingsLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[1, 2, 3, 4].map(i => <Skeleton key={i} h={14} r={6} />)}
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                    }}>
                      {[
                        { label: 'الاستراتيجية', value: effectiveBotSettings.strategy, color: T.accent },
                        { label: 'الخسارة اليومية', value: `$${Math.abs(effectiveBotSettings.maxDailyLoss).toLocaleString()}`, color: T.danger },
                        { label: 'أقصى تراجع', value: `${effectiveBotSettings.maxDrawdown}%`, color: T.amber },
                        { label: 'مراكز مفتوحة', value: String(effectiveBotSettings.maxOpenPositions), color: T.text },
                        { label: 'وقف خسارة', value: `${effectiveBotSettings.stopLossDefault}%`, color: T.danger },
                        { label: 'جني أرباح', value: `${effectiveBotSettings.takeProfitDefault}%`, color: T.success },
                        { label: 'مخاطرة/صفقة', value: `${effectiveBotSettings.riskPerTrade}%`, color: T.amber },
                        { label: 'أقصى رافعة', value: `${effectiveBotSettings.leverageLimit}x`, color: T.accent },
                      ].map((item, i) => (
                        <div key={i} style={{
                          padding: '10px 12px', borderRadius: 12,
                          background: 'rgba(255,255,255,0.03)',
                          border: `1px solid ${T.border}`,
                        }}>
                          <div style={{ fontSize: 9, color: T.text2, fontFamily: T.font, marginBottom: 3 }}>{item.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: item.color, fontFamily: T.mono }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <SettingsRow
            icon={CreditCard}
            iconColor={T.amber}
            label="حجم المركز الأقصى"
            sub={`$${effectiveBotSettings.maxPositionSize?.toLocaleString() || '10,000'}`}
            onClick={() => router.push('/mobile/trading')}
          />
        </GlassCard>
      </div>

      {/* ── Notification Preferences ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionTitle icon={Bell}>الإشعارات</SectionTitle>
        <GlassCard style={{ padding: '6px 0' }}>
          {notifLoading ? (
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Skeleton w="50%" h={12} r={6} />
                  <Skeleton w={50} h={30} r={15} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Default notification channels if no configs from API */}
              {(notifConfigs.length > 0 ? notifConfigs : [
                { type: 'telegram', enabled: false, description: 'إشعارات تيليجرام' },
                { type: 'browser', enabled: true, description: 'إشعارات المتصفح' },
                { type: 'email', enabled: false, description: 'إشعارات البريد' },
                { type: 'events', enabled: true, description: 'تنبيهات الأحداث' },
              ]).map((config, i) => {
                const iconMap: Record<string, LucideIcon> = {
                  telegram: Smartphone,
                  browser: Bell,
                  email: Globe,
                  events: AlertTriangle,
                }
                const colorMap: Record<string, string> = {
                  telegram: '#0088cc',
                  browser: T.accent,
                  email: T.amber,
                  events: T.success,
                }
                const labelMap: Record<string, string> = {
                  telegram: 'تيليجرام',
                  browser: 'المتصفح',
                  email: 'البريد الإلكتروني',
                  events: 'الأحداث',
                }
                const Icon = iconMap[config.type] || Bell
                const color = colorMap[config.type] || T.accent
                const label = labelMap[config.type] || config.type

                return (
                  <div
                    key={config.type}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 16px',
                      borderBottom: i < (notifConfigs.length || 4) - 1 ? `1px solid ${T.border}` : 'none',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: `${color}12`, border: `1px solid ${color}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icon size={15} color={color} />
                    </div>
                    <div style={{ flex: 1, textAlign: 'start' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font }}>{label}</p>
                      {config.description && (
                        <p style={{ fontSize: 10, color: T.text2, fontFamily: T.font, marginTop: 1 }}>{config.description}</p>
                      )}
                    </div>
                    <Toggle
                      on={config.enabled}
                      onToggle={() => toggleNotification(config.type, !config.enabled)}
                    />
                  </div>
                )
              })}
            </>
          )}
        </GlassCard>
      </div>

      {/* ── Security ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionTitle icon={Shield}>الأمان</SectionTitle>
        <GlassCard style={{ padding: '6px 0' }}>
          <SettingsRow
            icon={Shield}
            iconColor={T.success}
            label="الأمان والتحقق"
            sub="Passkeys والتحقق بخطوتين"
            onClick={() => router.push('/mobile/security')}
          />
          <SettingsRow
            icon={Eye}
            iconColor="#B388FF"
            label="الخصوصية"
            sub="إعدادات الخصوصية والبيانات"
            onClick={() => router.push('/mobile/security')}
          />
        </GlassCard>
      </div>

      {/* ── Preferences ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionTitle icon={Globe}>التفضيلات</SectionTitle>
        <GlassCard style={{ padding: '6px 0' }}>
          {/* Language */}
          <SettingsRow
            icon={Globe}
            iconColor={T.accent}
            label="اللغة"
            sub={language === 'ar' ? 'العربية' : 'English'}
            onClick={() => setShowLanguageSheet(true)}
          />

          {/* Dark Mode Toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${T.amber}12`, border: `1px solid ${T.amber}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Moon size={16} color={T.amber} />
            </div>
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font }}>المظهر الداكن</p>
              <p style={{ fontSize: 11, color: T.text2, fontFamily: T.font, marginTop: 1 }}>مفعّل دائماً</p>
            </div>
            <Toggle on={darkMode} onToggle={() => setDarkMode(!darkMode)} disabled />
          </div>
        </GlassCard>
      </div>

      {/* ── About ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionTitle icon={Info}>عن التطبيق</SectionTitle>
        <GlassCard style={{ padding: '6px 0' }}>
          <SettingsRow
            icon={Info}
            iconColor={T.text2}
            label="إصدار التطبيق"
            sub="v2.1.0"
            showChevron={false}
          />
          <SettingsRow
            icon={FileText}
            iconColor={T.text2}
            label="سياسة الخصوصية"
            onClick={() => {/* Could open external link */}}
          />
          <SettingsRow
            icon={FileText}
            iconColor={T.text2}
            label="شروط الاستخدام"
            onClick={() => {/* Could open external link */}}
          />
          <SettingsRow
            icon={HelpCircle}
            iconColor={T.amber}
            label="المساعدة والدعم"
            onClick={() => router.push('/mobile/help')}
          />
        </GlassCard>
      </div>

      {/* ── Logout Button ── */}
      <div style={{ margin: '8px 16px 24px' }}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: '100%', padding: '16px 0', borderRadius: 20,
            background: `${T.danger}10`, border: `1px solid ${T.danger}20`,
            color: T.danger, fontSize: 14, fontWeight: 700,
            fontFamily: T.font, cursor: loggingOut ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          {loggingOut ? (
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <LogOut size={16} />
          )}
          {loggingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
        </motion.button>

        <p style={{
          textAlign: 'center', fontSize: 10, color: 'rgba(235,235,245,0.2)',
          fontFamily: T.font, marginTop: 16,
        }}>
          رؤى للتداول v2.1.0 — جميع الحقوق محفوظة © 2026
        </p>
      </div>

      {/* ── Language Bottom Sheet ── */}
      <AnimatePresence>
        {showLanguageSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLanguageSheet(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              }}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
                background: 'rgba(28,28,30,0.95)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                borderRadius: '28px 28px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.12)',
                paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                maxWidth: 430, margin: '0 auto',
              }}
            >
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }} dir="rtl">
                <span style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.font }}>اختر اللغة</span>
                <button onClick={() => setShowLanguageSheet(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={20} color={T.text2} />
                </button>
              </div>

              {/* Language Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
                {[
                  { code: 'ar' as Language, label: 'العربية', sub: 'Arabic', flag: '🇸🇦' },
                  { code: 'en' as Language, label: 'English', sub: 'الإنجليزية', flag: '🇺🇸' },
                ].map(lang => (
                  <motion.button
                    key={lang.code}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setLanguage(lang.code)
                      setShowLanguageSheet(false)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px 18px', borderRadius: 18,
                      background: language === lang.code ? `${T.accent}12` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${language === lang.code ? `${T.accent}30` : T.border}`,
                      cursor: 'pointer', width: '100%', textAlign: 'start',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{lang.flag}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.font }}>{lang.label}</p>
                      <p style={{ fontSize: 11, color: T.text2, fontFamily: T.font, marginTop: 1 }}>{lang.sub}</p>
                    </div>
                    {language === lang.code && (
                      <div style={{
                        width: 28, height: 28, borderRadius: 14,
                        background: T.accent,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={14} color="#000" />
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Spin animation ── */}
      <ScopedStyle>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</ScopedStyle>
    </div>
  )
}
